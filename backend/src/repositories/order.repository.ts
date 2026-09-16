import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database, type Tx } from "../db/client.js";
import {
  cartItems,
  carts,
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  productVariants,
  products,
  type Address,
} from "../db/schema/index.js";
import { getAddress } from "./address.repository.js";

/**
 * CHECKOUT AND ORDERS
 * ---------------------------------------------------------------
 * Nothing here trusts the browser for a price or a stock count. Every
 * amount is re-read from `product_variants` at the moment of checkout —
 * never the cart's own price snapshot, which exists only for what the
 * cart *displays* — and stock is locked (`SELECT ... FOR UPDATE`) inside
 * one transaction so two customers racing for the last bottle cannot
 * both succeed.
 *
 * Placing an order does not charge anyone: it only reserves stock and
 * writes a `pending_payment` order. Phase 7 (Razorpay) is what moves an
 * order to `paid` — its webhook is the only thing allowed to do that.
 */

export class EmptyCartError extends Error {}
export class InvalidAddressError extends Error {}

export interface StockIssue {
  variantId: string;
  productName: string;
  variantLabel: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export class OutOfStockError extends Error {
  readonly issues: StockIssue[];
  constructor(message: string, issues: StockIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export interface CheckoutLine {
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  quantity: number;
  /** Whole rupees — the one conversion point for anything leaving the database. */
  unitPrice: number;
  lineTotal: number;
}

export interface CheckoutQuote {
  items: CheckoutLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

interface PricedCartRow {
  cartItemId: string;
  variantId: string;
  productName: string;
  variantType: "perfume" | "attar";
  sizeLabel: string;
  sku: string;
  quantity: number;
  unitPricePaise: number;
  isSellable: boolean;
  availableQuantity: number;
}

function variantLabel(row: Pick<PricedCartRow, "variantType" | "sizeLabel">): string {
  const type = row.variantType === "attar" ? "Attar" : "Perfume";
  return `${type} · ${row.sizeLabel}`;
}

/**
 * Reads every line of a cart together with its *current* price and stock
 * position. Pass a transaction and `lock: true` when the caller is about
 * to reserve stock, so nobody else can change these rows out from under
 * it until the transaction commits.
 *
 * Joins `inventory` with an inner join, not a left join: every variant
 * gets an inventory row the moment it is seeded (see db/seed.ts), and
 * `FOR UPDATE` cannot lock the nullable side of an outer join anyway.
 */
async function loadPricedCartRows(
  db: Database | Tx,
  cartId: string,
  lock: boolean,
): Promise<PricedCartRow[]> {
  let query = db
    .select({
      cartItemId: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productName: products.name,
      variantType: productVariants.variantType,
      sizeLabel: productVariants.sizeLabel,
      sku: productVariants.sku,
      unitPricePaise: productVariants.pricePaise,
      variantIsActive: productVariants.isActive,
      productIsActive: products.isActive,
      stockQuantity: inventory.quantity,
      stockReserved: inventory.reserved,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .$dynamic();

  if (lock) {
    query = query.for("update", { of: inventory });
  }

  const rows = await query;

  return rows.map((row) => {
    const available = Math.max(row.stockQuantity - row.stockReserved, 0);
    return {
      cartItemId: row.cartItemId,
      variantId: row.variantId,
      productName: row.productName,
      variantType: row.variantType,
      sizeLabel: row.sizeLabel,
      sku: row.sku,
      quantity: row.quantity,
      unitPricePaise: row.unitPricePaise,
      isSellable: row.variantIsActive && row.productIsActive,
      availableQuantity: available,
    };
  });
}

/** Throws OutOfStockError listing every line that cannot be fulfilled as-is. */
function assertFulfillable(rows: PricedCartRow[]): void {
  const issues: StockIssue[] = rows
    .filter((row) => !row.isSellable || row.availableQuantity < row.quantity)
    .map((row) => ({
      variantId: row.variantId,
      productName: row.productName,
      variantLabel: variantLabel(row),
      requestedQuantity: row.quantity,
      availableQuantity: row.isSellable ? row.availableQuantity : 0,
    }));

  if (issues.length > 0) {
    throw new OutOfStockError(
      "Some items in your cart are no longer available in the quantity you want.",
      issues,
    );
  }
}

function toQuote(rows: PricedCartRow[]): CheckoutQuote {
  const items: CheckoutLine[] = rows.map((row) => ({
    variantId: row.variantId,
    productName: row.productName,
    variantLabel: variantLabel(row),
    sku: row.sku,
    quantity: row.quantity,
    unitPrice: row.unitPricePaise / 100,
    lineTotal: (row.unitPricePaise * row.quantity) / 100,
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  // Discounts (coupons), shipping and tax are not computed yet — later
  // phases wire these up without changing this response's shape.
  const discount = 0;
  const shipping = 0;
  const tax = 0;

  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping + tax,
  };
}

async function findCartByUser(db: Database | Tx, userId: string) {
  const [cart] = await db.select().from(carts).where(eq(carts.userId, userId));
  return cart ?? null;
}

/** Read-only preview of what checkout would charge right now. Reserves nothing. */
export async function getCheckoutQuote(userId: string): Promise<CheckoutQuote> {
  const db = getDb();
  const cart = await findCartByUser(db, userId);
  if (!cart) throw new EmptyCartError("Your cart is empty.");

  const rows = await loadPricedCartRows(db, cart.id, false);
  if (rows.length === 0) throw new EmptyCartError("Your cart is empty.");

  assertFulfillable(rows);
  return toQuote(rows);
}

function addressSnapshot(address: Address) {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

async function nextOrderNumber(tx: Tx): Promise<string> {
  const result = await tx.execute<{ nextval: string }>(sql`select nextval('order_number_seq') as nextval`);
  const rows = Array.isArray(result) ? result : (result as unknown as { rows: Array<{ nextval: string }> }).rows;
  const value = rows[0]?.nextval;
  if (!value) throw new Error("Could not generate an order number.");
  return `SHF-${value}`;
}

export interface PlacedOrder extends CheckoutQuote {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
}

/**
 * Validates the cart and address, then in one locked transaction: creates
 * the order and its line-item snapshots, reserves stock, records the
 * ledger entries that explain the reservation, and empties the cart.
 * Throws (and reserves nothing) if the address is not the caller's own,
 * the cart is empty, or any line can no longer be fulfilled.
 */
export async function placeOrder(userId: string, addressId: string): Promise<PlacedOrder> {
  const address = await getAddress(userId, addressId);
  if (!address) {
    throw new InvalidAddressError("No saved address matches that id.");
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const cart = await findCartByUser(tx, userId);
    if (!cart) throw new EmptyCartError("Your cart is empty.");

    const rows = await loadPricedCartRows(tx, cart.id, true);
    if (rows.length === 0) throw new EmptyCartError("Your cart is empty.");

    assertFulfillable(rows);
    const quote = toQuote(rows);
    const orderNumber = await nextOrderNumber(tx);

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId,
        subtotalPaise: Math.round(quote.subtotal * 100),
        discountPaise: Math.round(quote.discount * 100),
        shippingPaise: Math.round(quote.shipping * 100),
        taxPaise: Math.round(quote.tax * 100),
        totalPaise: Math.round(quote.total * 100),
        shippingAddress: addressSnapshot(address),
      })
      .returning();

    if (!order) throw new Error("Could not create the order.");

    await tx.insert(orderItems).values(
      rows.map((row) => ({
        orderId: order.id,
        variantId: row.variantId,
        productName: row.productName,
        variantLabel: variantLabel(row),
        sku: row.sku,
        quantity: row.quantity,
        unitPricePaise: row.unitPricePaise,
        lineTotalPaise: row.unitPricePaise * row.quantity,
      })),
    );

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      status: "pending_payment",
      note: "Order placed; awaiting payment.",
    });

    for (const row of rows) {
      await tx
        .update(inventory)
        .set({ reserved: sql`${inventory.reserved} + ${row.quantity}`, updatedAt: new Date() })
        .where(eq(inventory.variantId, row.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: row.variantId,
        orderId: order.id,
        reason: "order_reserved",
        reservedChange: row.quantity,
      });
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    return { ...quote, id: order.id, orderNumber: order.orderNumber, status: order.status, createdAt: order.createdAt };
  });
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  itemCount: number;
  total: number;
  createdAt: Date;
}

export async function listOrders(userId: string): Promise<OrderSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalPaise: orders.totalPaise,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  if (rows.length === 0) return [];

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

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    itemCount: countByOrder.get(row.id) ?? 0,
    total: row.totalPaise / 100,
    createdAt: row.createdAt,
  }));
}

export interface OrderDetail extends OrderSummary {
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

/** Returns null if the order does not exist or belongs to someone else. */
export async function getOrderDetail(userId: string, orderId: string): Promise<OrderDetail | null> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) return null;

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
    statusHistory: history.map((row) => ({ status: row.status, note: row.note, createdAt: row.createdAt })),
  };
}
