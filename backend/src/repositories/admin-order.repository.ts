import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  profiles,
} from "../db/schema/index.js";
import { writeAuditLog, type AuditContext } from "./audit.repository.js";

/**
 * ADMIN ORDER MANAGEMENT
 * ---------------------------------------------------------------
 * The customer-facing `order.repository.ts` scopes every query to the
 * caller's own user id. This one deliberately does not — that is the whole
 * point of it — which is exactly why nothing here is reachable except
 * through the admin router's server-verified role check.
 *
 * Only one status change is allowed from here: cancelling an order that
 * has not been paid for, which hands its reserved stock back. Moving an
 * order to `paid` stays the signature-verified Razorpay webhook's job
 * alone, and cancelling an order that *was* paid would need a real refund
 * against Razorpay — neither belongs in an admin button.
 */

export class OrderNotFoundError extends Error {}

export class OrderNotCancellableError extends Error {
  readonly status: string;
  constructor(message: string, status: string) {
    super(message);
    this.status = status;
  }
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  customerId: string;
  customerName: string | null;
  itemCount: number;
  total: number;
  createdAt: Date;
}

export interface AdminOrderPage {
  orders: AdminOrderSummary[];
  total: number;
}

export async function listAllOrders(options: {
  page: number;
  perPage: number;
  status?: "pending_payment" | "paid" | "cancelled";
}): Promise<AdminOrderPage> {
  const db = getDb();

  let rowsQuery = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      customerId: orders.userId,
      customerName: profiles.fullName,
      totalPaise: orders.totalPaise,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(profiles, eq(orders.userId, profiles.id))
    .$dynamic();

  let countQuery = db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(orders).$dynamic();

  if (options.status) {
    rowsQuery = rowsQuery.where(eq(orders.status, options.status));
    countQuery = countQuery.where(eq(orders.status, options.status));
  }

  const [rows, [totals]] = await Promise.all([
    rowsQuery
      .orderBy(desc(orders.createdAt))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    countQuery,
  ]);

  if (rows.length === 0) return { orders: [], total: totals?.count ?? 0 };

  const counts = await db
    .select({
      orderId: orderItems.orderId,
      quantity: sql<number>`sum(${orderItems.quantity})`.mapWith(Number),
    })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(orderItems.orderId);
  const countByOrder = new Map(counts.map((row) => [row.orderId, row.quantity]));

  return {
    orders: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      customerId: row.customerId,
      customerName: row.customerName,
      itemCount: countByOrder.get(row.id) ?? 0,
      total: row.totalPaise / 100,
      createdAt: row.createdAt,
    })),
    total: totals?.count ?? 0,
  };
}

export interface AdminOrderDetail extends AdminOrderSummary {
  customerPhone: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  shippingAddress: unknown;
  items: Array<{
    id: string;
    variantId: string;
    productName: string;
    variantLabel: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  statusHistory: Array<{ status: string; note: string | null; createdAt: Date }>;
}

/** Returns null when no order has that id. Any customer's order, by design. */
export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      order: orders,
      customerName: profiles.fullName,
      customerPhone: profiles.phone,
    })
    .from(orders)
    .leftJoin(profiles, eq(orders.userId, profiles.id))
    .where(eq(orders.id, orderId));

  if (!row) return null;
  const { order } = row;

  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt)),
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
  ]);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerId: order.userId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: order.subtotalPaise / 100,
    discount: order.discountPaise / 100,
    shipping: order.shippingPaise / 100,
    tax: order.taxPaise / 100,
    total: order.totalPaise / 100,
    shippingAddress: order.shippingAddress,
    createdAt: order.createdAt,
    items: items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productName: item.productName,
      variantLabel: item.variantLabel,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPricePaise / 100,
      lineTotal: item.lineTotalPaise / 100,
    })),
    statusHistory: history.map((entry) => ({
      status: entry.status,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
  };
}

/**
 * Cancels an unpaid order and releases the stock it was holding, inside
 * one transaction — the exact mirror of the reservation `placeOrder` made.
 * Refuses anything that is not still `pending_payment`, so a paid order
 * can never be "cancelled" without a real refund happening first.
 */
export async function cancelOrder(
  actor: AuditContext,
  orderId: string,
  note: string | null,
): Promise<AdminOrderDetail> {
  const db = getDb();

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");

    if (!order) throw new OrderNotFoundError("No order matches that id.");
    if (order.status !== "pending_payment") {
      throw new OrderNotCancellableError(
        `This order is already ${order.status} and cannot be cancelled here.`,
        order.status,
      );
    }

    await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId));

    await tx.insert(orderStatusHistory).values({
      orderId,
      status: "cancelled",
      note: note ?? "Cancelled by an administrator.",
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    for (const item of items) {
      await tx
        .update(inventory)
        .set({ reserved: sql`${inventory.reserved} - ${item.quantity}`, updatedAt: new Date() })
        .where(eq(inventory.variantId, item.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: item.variantId,
        orderId,
        reason: "order_released",
        reservedChange: -item.quantity,
      });
    }

    await writeAuditLog(tx, actor, "order.cancel", "order", orderId, {
      orderNumber: order.orderNumber,
      note,
    });
  });

  const detail = await getAdminOrderDetail(orderId);
  if (!detail) throw new OrderNotFoundError("No order matches that id.");
  return detail;
}
