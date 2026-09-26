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
 * Three status changes are allowed from here, each from exactly one
 * starting point:
 *   pending_payment -> cancelled   (hands the reserved stock back)
 *   paid            -> shipped     (the parcel has been dispatched)
 *   shipped         -> delivered
 * Moving an order to `paid` stays the signature-verified Razorpay
 * webhook's job alone, and cancelling an order that *was* paid would need
 * a real refund against Razorpay — neither belongs in an admin button.
 */

export class OrderNotFoundError extends Error {}

/** The order is not at the one status this change is allowed from. */
export class InvalidOrderTransitionError extends Error {
  readonly status: string;
  constructor(message: string, status: string) {
    super(message);
    this.status = status;
  }
}

export type AdminOrderStatus = "cancelled" | "paid" | "shipped" | "delivered";
export type OrderStatus = "pending_payment" | "paid" | "shipped" | "delivered" | "cancelled";
export type PaymentMethod = "online" | "upi" | "cod";

/**
 * For each change an admin may make: the statuses it may start from, and
 * the ways of paying it applies to.
 *
 * The rule the gateway path lives by is unchanged — a card payment is
 * marked paid by the signature-verified webhook and by nothing else, which
 * is why `online` is absent from `paid` below. The two new methods have no
 * webhook to wait for: a UPI transfer is something the owner sees in his own
 * bank app, and cash arrives in his hand at the door. Only he can say so.
 *
 * Cash on delivery also ships straight from `pending_payment`, because
 * with cash the parcel has to go out before the money comes in. It is
 * marked paid afterwards, once it has been delivered and collected.
 */
interface Transition {
  from: OrderStatus[];
  methods: PaymentMethod[];
}

const ALLOWED: Record<AdminOrderStatus, Transition> = {
  cancelled: { from: ["pending_payment"], methods: ["online", "upi", "cod"] },
  paid: { from: ["pending_payment", "delivered"], methods: ["upi", "cod"] },
  shipped: { from: ["paid", "pending_payment"], methods: ["online", "upi", "cod"] },
  delivered: { from: ["shipped"], methods: ["online", "upi", "cod"] },
};

/** Cash is collected at the door, so only a cod parcel may ship unpaid. */
function mayMove(status: AdminOrderStatus, from: OrderStatus, method: PaymentMethod): boolean {
  const rule = ALLOWED[status];
  if (!rule.from.includes(from) || !rule.methods.includes(method)) return false;
  if (status === "shipped" && from === "pending_payment") return method === "cod";
  if (status === "paid" && from === "delivered") return method === "cod";
  if (status === "paid" && from === "pending_payment") return method === "upi";
  return true;
}

const DEFAULT_NOTE: Record<AdminOrderStatus, string> = {
  cancelled: "Cancelled by an administrator.",
  paid: "Payment received and confirmed by the shop.",
  shipped: "Your order has been dispatched.",
  delivered: "Your order has been delivered.",
};

const AUDIT_ACTION: Record<AdminOrderStatus, string> = {
  cancelled: "order.cancel",
  paid: "order.mark_paid",
  shipped: "order.ship",
  delivered: "order.deliver",
};

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: PaymentMethod;
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
  status?: OrderStatus;
}): Promise<AdminOrderPage> {
  const db = getDb();

  let rowsQuery = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
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
      paymentMethod: row.paymentMethod,
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
    paymentMethod: order.paymentMethod,
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
 * Moves an order one step along its life (see the table at the top of
 * this file), inside one transaction, with the row locked so two admins
 * clicking at once cannot both succeed. Refuses any order that is not at
 * the one status the change is allowed from.
 *
 * Cancelling also releases the stock the order was holding — the exact
 * mirror of the reservation `placeOrder` made. Stock is committed the
 * moment the order first leaves `pending_payment`, whichever way that
 * happens: the webhook does it for a card payment, and here it is either
 * the owner confirming a UPI transfer or a cash parcel being dispatched.
 * Every later step touches no stock, because it has already been counted.
 *
 * The note is what the customer sees on their order page (courier name,
 * tracking number, reason for cancelling), so it gets a plain default.
 */
export async function updateOrderStatus(
  actor: AuditContext,
  orderId: string,
  status: AdminOrderStatus,
  note: string | null,
): Promise<AdminOrderDetail> {
  const db = getDb();

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");

    if (!order) throw new OrderNotFoundError("No order matches that id.");
    if (!mayMove(status, order.status, order.paymentMethod)) {
      throw new InvalidOrderTransitionError(
        `This order is ${order.status.replace("_", " ")} and is paid ${order.paymentMethod}, so it cannot be marked ${status} here.`,
        order.status,
      );
    }

    await tx.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId));

    await tx.insert(orderStatusHistory).values({
      orderId,
      status,
      note: note ?? DEFAULT_NOTE[status],
    });

    // Leaving pending_payment means the goods are really gone: turn the
    // reservation into a sale, exactly as the Razorpay webhook does.
    if (order.status === "pending_payment" && status !== "cancelled") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

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
          orderId,
          reason: "order_committed",
          quantityChange: -item.quantity,
          reservedChange: -item.quantity,
        });
      }
    }

    if (status === "cancelled") {
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
    }

    await writeAuditLog(tx, actor, AUDIT_ACTION[status], "order", orderId, {
      orderNumber: order.orderNumber,
      from: order.status,
      note,
    });
  });

  const detail = await getAdminOrderDetail(orderId);
  if (!detail) throw new OrderNotFoundError("No order matches that id.");
  return detail;
}
