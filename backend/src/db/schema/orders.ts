import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { profiles } from "./auth.js";
import { productVariants } from "./catalog.js";

/**
 * ORDERS SCHEMA
 * ---------------------------------------------------------------
 * An order is created only by the server, only from the customer's own
 * cart, with every price re-read from `product_variants` at that exact
 * moment — never trusted from the browser and never left as a stale cart
 * snapshot. Once created, `order_items` and the address on the order
 * itself are frozen copies: a later catalog price edit or an address book
 * change must never rewrite what a customer already bought.
 *
 * An order's life: `pending_payment` (stock reserved) -> `paid` (set only
 * by the signature-verified Razorpay webhook, stock committed) -> `shipped`
 * -> `delivered`, each set by an administrator once the parcel actually
 * moves. `cancelled` is reachable only from `pending_payment` and hands
 * the reserved stock back; a paid order is never cancelled here because
 * that would need a real refund first.
 */

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short, human-readable id for support conversations, e.g. "SHF-100001". */
    orderNumber: varchar("order_number", { length: 20 }).notNull(),
    /**
     * Restrict, not cascade: an order is a financial record and must
     * outlive the customer's account row, unlike a cart or a wishlist.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    shippingPaise: integer("shipping_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    /** Frozen copy of the address chosen at checkout — never a live reference. */
    shippingAddress: jsonb("shipping_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_order_number_key").on(t.orderNumber),
    index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
    check("orders_subtotal_non_negative", sql`${t.subtotalPaise} >= 0`),
    check("orders_discount_non_negative", sql`${t.discountPaise} >= 0`),
    check("orders_shipping_non_negative", sql`${t.shippingPaise} >= 0`),
    check("orders_tax_non_negative", sql`${t.taxPaise} >= 0`),
    check("orders_total_positive", sql`${t.totalPaise} > 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /**
     * Restrict: variants are deactivated, never deleted, precisely so a
     * row like this always has something to point to.
     */
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    /** Snapshots below freeze what the customer bought — see file header. */
    productName: varchar("product_name", { length: 160 }).notNull(),
    variantLabel: varchar("variant_label", { length: 80 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    lineTotalPaise: integer("line_total_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_unit_price_positive", sql`${t.unitPricePaise} > 0`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_id_idx").on(t.orderId)],
);

export const inventoryMovementReasonEnum = pgEnum("inventory_movement_reason", [
  "order_reserved",
  "order_released",
  "order_committed",
  "admin_adjustment",
]);

/**
 * Append-only ledger: every change to `inventory.reserved` or
 * `inventory.quantity` writes one row here first, inside the same
 * transaction. Nothing ever updates or deletes a row in this table — it
 * exists so "why did stock change" always has an answer.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    reason: inventoryMovementReasonEnum("reason").notNull(),
    quantityChange: integer("quantity_change").notNull().default(0),
    reservedChange: integer("reserved_change").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_variant_id_idx").on(t.variantId),
    index("inventory_movements_order_id_idx").on(t.orderId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderStatusHistoryRow = typeof orderStatusHistory.$inferSelect;
