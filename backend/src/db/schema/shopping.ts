import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./auth.js";
import { products, productVariants } from "./catalog.js";

/**
 * SHOPPING SCHEMA — server-side cart and wishlist
 * ---------------------------------------------------------------
 * A cart lives entirely on the server, one per signed-in customer, so it
 * survives a lost phone or a new device instead of disappearing with the
 * browser's localStorage. Each line remembers the price at the moment it
 * was added (`unitPricePaise`) — a later catalog price change must never
 * silently change what a customer already sees in their own cart.
 */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("carts_user_id_key").on(t.userId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    /** Paise, captured when the line was added — see file-level note. */
    unitPricePaise: integer("unit_price_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_variant_key").on(t.cartId, t.variantId),
    index("cart_items_cart_id_idx").on(t.cartId),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
    check("cart_items_unit_price_positive", sql`${t.unitPricePaise} > 0`),
  ],
);

export const wishlists = pgTable(
  "wishlists",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productId] }),
    index("wishlists_product_id_idx").on(t.productId),
  ],
);

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type WishlistItem = typeof wishlists.$inferSelect;
