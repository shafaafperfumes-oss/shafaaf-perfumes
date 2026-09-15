import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * AUTH-RELATED SCHEMA
 * ---------------------------------------------------------------
 * Sign-in itself is handled entirely by Supabase Auth — this backend
 * never sees a password. Supabase keeps signed-up users in its own
 * `auth.users` table (a different Postgres schema, not managed here).
 *
 * `profiles` is OUR table, one row per Supabase user, holding the
 * things Supabase's auth table does not: a role, a display name, a
 * phone number. A database trigger (added in the matching migration)
 * creates a profile automatically the moment someone signs up, so the
 * app never has to remember to do it.
 *
 * The `id` column is not declared as a foreign key here because
 * Drizzle only manages the `public` schema — the actual
 * `references auth.users(id) on delete cascade` constraint is added by
 * raw SQL in the migration, right next to the trigger that needs it.
 */

export const userRoleEnum = pgEnum("user_role", ["customer", "admin"]);

export const profiles = pgTable("profiles", {
  /** Same value as the matching row's id in Supabase's auth.users. */
  id: uuid("id").primaryKey(),
  fullName: varchar("full_name", { length: 160 }),
  phone: varchar("phone", { length: 20 }),
  /**
   * The one place a user's role is read from. Never trusted from a JWT
   * claim or anything the browser sends — only this column, read by the
   * backend's own database connection, decides who can reach an admin
   * route. See src/middleware/auth.ts.
   */
  role: userRoleEnum("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** A short name the customer gives it, e.g. "Home", "Office". */
    label: varchar("label", { length: 40 }).notNull().default("Home"),
    recipientName: varchar("recipient_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),
    postalCode: varchar("postal_code", { length: 12 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("IN"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("addresses_user_id_idx").on(t.userId),
    check("addresses_postal_code_not_blank", sql`length(${t.postalCode}) > 0`),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
