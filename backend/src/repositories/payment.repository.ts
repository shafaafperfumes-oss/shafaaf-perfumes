import { and, eq, sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { getDb } from "../db/client.js";
import {
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  paymentEvents,
  payments,
} from "../db/schema/index.js";
import { getRazorpay, isRazorpayConfigured } from "../lib/razorpay-client.js";
import { logger } from "../utils/logger.js";
import { findOrderRow } from "./order.repository.js";

/**
 * PAYMENTS
 * ---------------------------------------------------------------
 * Two halves, matching the architecture's payment flow (docs/ARCHITECTURE.md
 * section 6):
 *
 *  1. `createPaymentForOrder` — asks Razorpay for a payment intent against
 *     an already-placed `pending_payment` order. This never moves an order
 *     to `paid`; it only gives the browser something to open the Razorpay
 *     checkout widget with.
 *
 *  2. `markOrderPaid` — the *only* code path in the whole API allowed to
 *     move an order to `paid` and commit its reserved stock, and it is
 *     only ever called from the signature-verified webhook route. The
 *     browser's own "payment succeeded" message is never trusted for this.
 */

export class OrderNotFoundError extends Error {}
export class OrderNotPayableError extends Error {}
export class PaymentsNotConfiguredError extends Error {}

export interface PaymentIntent {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

/**
 * Creates (or, if one is already pending, reuses) a Razorpay order for an
 * existing order the caller owns. Safe to call more than once for the same
 * order — a customer whose checkout popup closed or timed out can retry
 * without the backend opening a second Razorpay order behind their back.
 */
export async function createPaymentForOrder(userId: string, orderId: string): Promise<PaymentIntent> {
  const order = await findOrderRow(userId, orderId);
  if (!order) throw new OrderNotFoundError("No order matches that id.");
  if (order.status !== "pending_payment") {
    throw new OrderNotPayableError(`This order is already ${order.status} and cannot be paid again.`);
  }
  if (!isRazorpayConfigured()) {
    throw new PaymentsNotConfiguredError("Payments are not available right now.");
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "created")))
    .limit(1);

  if (existing) {
    return {
      razorpayOrderId: existing.razorpayOrderId,
      amountPaise: existing.amountPaise,
      currency: existing.currency,
      keyId: env.RAZORPAY_KEY_ID!,
    };
  }

  const razorpayOrder = await getRazorpay().orders.create({
    amount: order.totalPaise,
    currency: order.currency,
    receipt: order.orderNumber,
    notes: { orderId: order.id },
  });

  await db.insert(payments).values({
    orderId: order.id,
    razorpayOrderId: razorpayOrder.id,
    amountPaise: order.totalPaise,
    currency: order.currency,
    status: "created",
  });

  return {
    razorpayOrderId: razorpayOrder.id,
    amountPaise: order.totalPaise,
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID!,
  };
}

/**
 * Records one webhook delivery for idempotency. Razorpay retries a webhook
 * until it receives a 200, so the same event can arrive more than once —
 * `razorpayEventId` (from the `x-razorpay-event-id` header) has a unique
 * constraint, and `onConflictDoNothing` makes the *second* delivery a safe
 * no-op instead of double-processing anything.
 *
 * Returns true the first time this event id is seen, false on a repeat.
 */
export async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const inserted = await getDb()
    .insert(paymentEvents)
    .values({ razorpayEventId: eventId, eventType, payload })
    .onConflictDoNothing({ target: paymentEvents.razorpayEventId })
    .returning({ id: paymentEvents.id });

  return inserted.length > 0;
}

/**
 * The only place an order becomes `paid` and its stock reservation turns
 * into a real stock decrement. Runs inside one locked transaction, exactly
 * like `placeOrder`'s reservation step, so this can never race with itself.
 *
 * Silently does nothing (beyond logging) if `razorpayOrderId` matches no
 * payment we created, or if the order already moved past `pending_payment`
 * — both are expected under retried/duplicate webhook deliveries, not
 * errors the caller needs to react to.
 *
 * Resolves to the order's id only when this call is the one that moved it
 * to `paid`, so the caller can react (an owner alert) exactly once per
 * order, and null in every no-op case above.
 */
export async function markOrderPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<{ orderId: string } | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, razorpayOrderId))
      .for("update");

    if (!payment) {
      logger.warn({ razorpayOrderId }, "webhook referenced an unknown Razorpay order");
      return null;
    }
    if (payment.status === "captured") {
      return null;
    }

    await tx
      .update(payments)
      .set({ status: "captured", razorpayPaymentId, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    const updatedOrders = await tx
      .update(orders)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(orders.id, payment.orderId), eq(orders.status, "pending_payment")))
      .returning({ id: orders.id });

    if (updatedOrders.length === 0) {
      // The order already moved on (e.g. an earlier delivery of the same
      // conceptual event already committed stock) — the payment row above
      // is still updated, but nothing else here should run twice.
      return null;
    }

    await tx.insert(orderStatusHistory).values({
      orderId: payment.orderId,
      status: "paid",
      note: "Payment captured via Razorpay.",
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, payment.orderId));

    for (const item of items) {
      await tx
        .update(inventory)
        .set({
          quantity: sql`${inventory.quantity} - ${item.quantity}`,
          reserved: sql`${inventory.reserved} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(inventory.variantId, item.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: item.variantId,
        orderId: payment.orderId,
        reason: "order_committed",
        quantityChange: -item.quantity,
        reservedChange: -item.quantity,
      });
    }

    return { orderId: payment.orderId };
  });
}
