import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * CATALOG SCHEMA
 * ---------------------------------------------------------------
 * Money rule: every amount is stored as an INTEGER number of paise
 * (1 rupee = 100 paise). Floating point is never used for money,
 * because 0.1 + 0.2 is not 0.3 in binary floating point and a cart
 * total that is a fraction of a paisa out is a real accounting bug.
 *
 * Naming rule: the website already identifies a product by its slug
 * ("shanaya-gold") in URLs and cart lines. The database keeps that
 * slug as a unique column so existing links keep working, while the
 * primary key stays an internal uuid that is never guessable.
 */

export const variantTypeEnum = pgEnum("variant_type", ["perfume", "attar"]);

/** Where a note sits in the fragrance pyramid. The current catalog lists
 *  accords without a pyramid position, so they seed as "accord". */
export const noteTypeEnum = pgEnum("note_type", ["top", "heart", "base", "accord"]);

export const fragranceFamilies = pgTable(
  "fragrance_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fragrance_families_slug_key").on(t.slug)],
);

export const fragranceNotes = pgTable(
  "fragrance_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fragrance_notes_slug_key").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable public identifier used in URLs — matches the frontend's product id. */
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    familyId: uuid("family_id").references(() => fragranceFamilies.id, {
      onDelete: "restrict",
    }),
    /** Audience tag used for filtering ("Unisex", "Men", "Women"). */
    gender: varchar("gender", { length: 24 }).notNull().default("Unisex"),
    description: text("description").notNull().default(""),
    heroImageUrl: text("hero_image_url"),
    heroImageAlt: text("hero_image_alt"),
    /** Editorial flags that drive the homepage rails. */
    isBestseller: boolean("is_bestseller").notNull().default(false),
    isNew: boolean("is_new").notNull().default(false),
    /** Soft switch — hiding a product must never delete its order history. */
    isActive: boolean("is_active").notNull().default(true),
    /** Denormalised review summary, recalculated when reviews land in a later phase. */
    ratingAverage: numeric("rating_average", { precision: 2, scale: 1 }).notNull().default("0.0"),
    reviewCount: integer("review_count").notNull().default(0),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_key").on(t.slug),
    index("products_family_id_idx").on(t.familyId),
    index("products_is_active_idx").on(t.isActive),
    check("products_review_count_non_negative", sql`${t.reviewCount} >= 0`),
    check(
      "products_rating_range",
      sql`${t.ratingAverage} >= 0 AND ${t.ratingAverage} <= 5`,
    ),
  ],
);

export const productNotes = pgTable(
  "product_notes",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    noteId: uuid("note_id")
      .notNull()
      .references(() => fragranceNotes.id, { onDelete: "restrict" }),
    noteType: noteTypeEnum("note_type").notNull().default("accord"),
    position: smallint("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.noteId] }),
    index("product_notes_note_id_idx").on(t.noteId),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_images_product_id_idx").on(t.productId),
    // Lets the seed re-run without creating duplicate image rows.
    uniqueIndex("product_images_product_url_key").on(t.productId, t.url),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Human-readable stock keeping unit, unique across the whole catalogue. */
    sku: varchar("sku", { length: 64 }).notNull(),
    variantType: variantTypeEnum("variant_type").notNull(),
    sizeLabel: varchar("size_label", { length: 24 }).notNull(),
    sizeMl: smallint("size_ml").notNull(),
    /** Selling price in paise. Never a float, never sent from the browser. */
    pricePaise: integer("price_paise").notNull(),
    /** Optional "was" price in paise, for showing a discount. */
    compareAtPricePaise: integer("compare_at_price_paise"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    isActive: boolean("is_active").notNull().default(true),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_variants_sku_key").on(t.sku),
    uniqueIndex("product_variants_product_type_size_key").on(
      t.productId,
      t.variantType,
      t.sizeMl,
    ),
    index("product_variants_product_id_idx").on(t.productId),
    check("product_variants_price_positive", sql`${t.pricePaise} > 0`),
    check("product_variants_size_positive", sql`${t.sizeMl} > 0`),
    check(
      "product_variants_compare_at_price_valid",
      sql`${t.compareAtPricePaise} IS NULL OR ${t.compareAtPricePaise} > ${t.pricePaise}`,
    ),
  ],
);

/**
 * Stock lives in its own table, one row per variant. Keeping it separate from
 * the variant keeps price edits and stock movements from fighting over the
 * same row, and later phases lock only this row while reserving stock.
 *
 * `quantity` is what physically exists; `reserved` is what is already promised
 * to unpaid orders. Sellable stock is `quantity - reserved`, and the check
 * constraint makes it impossible for the database to go oversold even if the
 * application code has a bug.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("inventory_quantity_non_negative", sql`${t.quantity} >= 0`),
    check("inventory_reserved_non_negative", sql`${t.reserved} >= 0`),
    check("inventory_reserved_within_quantity", sql`${t.reserved} <= ${t.quantity}`),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
