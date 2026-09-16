import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { profiles } from "./auth.js";

/**
 * AUDIT LOG
 * ---------------------------------------------------------------
 * Append-only record of every admin action, per the architecture's own
 * non-negotiable: "audit_logs records every admin and money-moving action
 * with actor, entity, IP and timestamp." Nothing ever updates or deletes a
 * row here — same append-only shape as `inventory_movements`.
 *
 * `actorId` uses `onDelete: "set null"`, not `cascade` or `restrict`: the
 * log entry is evidence of what happened and must outlive the admin
 * account that did it, the same reasoning `orders.userId` uses "restrict"
 * for a different kind of permanence.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    /** Short machine-readable verb, e.g. "product.update", "order.cancel". */
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 80 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_id_idx").on(t.actorId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
