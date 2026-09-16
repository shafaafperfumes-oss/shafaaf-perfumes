import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { orders } from "./orders.js";

/**
 * PAYMENTS SCHEMA
 * ---------------------------------------------------------------
 * A `payments` row is created the moment we ask Razorpay for an order to
 * pay against — before the customer has paid anything, status `created`.
 * Nothing here ever moves an order to `paid` by itself: only the verified
 * webhook (see repositories/payment.repository.ts) does that, per the
 * architecture's non-negotiable that the webhook, not the browser, is the
 * source of truth for whether money actually moved.
 *
 * `payment_events` exists purely so a webhook delivery can never be applied
 * twice: Razorpay retries a webhook until it gets a 200, and its own id for
 * that delivery (the `x-razorpay-event-id` header) is stored here with a
 * unique constraint before anything else happens.
 */

export const paymentStatusEnum = pgEnum("payment_status", ["created", "captured", "failed"]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    razorpayOrderId: varchar("razorpay_order_id", { length: 64 }).notNull(),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 64 }),
    status: paymentStatusEnum("status").notNull().default("created"),
    amountPaise: integer("amount_paise").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_razorpay_order_id_key").on(t.razorpayOrderId),
    uniqueIndex("payments_razorpay_payment_id_key").on(t.razorpayPaymentId),
    index("payments_order_id_idx").on(t.orderId),
    check("payments_amount_positive", sql`${t.amountPaise} > 0`),
  ],
);

/** Append-only: one row per Razorpay webhook delivery actually processed. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    razorpayEventId: varchar("razorpay_event_id", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_razorpay_event_id_key").on(t.razorpayEventId)],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
