import { boolean, index, integer, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * THE INSPIRED / CUSTOM FRAGRANCE LIST
 * ---------------------------------------------------------------
 * Besides the shop's own products, the owner stocks a few hundred imported
 * oils — each an "inspired by" version of an international fragrance — and
 * blends custom perfume on request. They are deliberately NOT products:
 * no photos, no cart, no stock. A customer types a name on the Custom page,
 * the site says whether it is in the list and which sizes are made, and the
 * conversation moves to WhatsApp where the owner quotes and sells.
 *
 * Only names and brands live here. The supplier's price list is never
 * imported; the selling price per size is the owner's own number in
 * `inspired_sizes`, and a size with no price simply reads "ask on WhatsApp".
 */
export const inspiredFragrances = pgTable(
  "inspired_fragrances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The fragrance as customers know it, e.g. "Sauvage". */
    name: varchar("name", { length: 160 }).notNull(),
    /** The house it is inspired by, e.g. "Dior" — shown as "inspired by Dior". */
    inspiredBy: varchar("inspired_by", { length: 120 }).notNull(),
    /** "Men" | "Women" | "Unisex", or null when the owner has not said. */
    gender: varchar("gender", { length: 24 }),
    /** Unticked in the admin when an oil runs out, so the site stops saying "yes, we have it". */
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inspired_fragrances_name_brand_key").on(t.name, t.inspiredBy),
    index("inspired_fragrances_available_idx").on(t.isAvailable),
  ],
);

/** The bottle sizes custom and inspired fragrances are made in, with the owner's price. */
export const inspiredSizes = pgTable(
  "inspired_sizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: varchar("label", { length: 24 }).notNull(),
    sizeMl: integer("size_ml").notNull(),
    /** Selling price in paise; null until the owner sets one ("ask on WhatsApp"). */
    pricePaise: integer("price_paise"),
    isActive: boolean("is_active").notNull().default(true),
    position: smallint("position").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inspired_sizes_label_key").on(t.label)],
);

/**
 * What visitors searched for on the Custom page — the text and how many
 * list entries matched, nothing about who typed it. This is how the owner
 * learns which fragrances people ask for that he does not list yet.
 */
export const fragranceQueries = pgTable(
  "fragrance_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: varchar("query", { length: 120 }).notNull(),
    matches: smallint("matches").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fragrance_queries_created_at_idx").on(t.createdAt)],
);

export type InspiredFragrance = typeof inspiredFragrances.$inferSelect;
export type InspiredSize = typeof inspiredSizes.$inferSelect;
