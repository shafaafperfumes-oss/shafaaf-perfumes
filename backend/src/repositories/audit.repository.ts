import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Database, type Tx } from "../db/client.js";
import { auditLogs, profiles } from "../db/schema/index.js";

/**
 * THE ADMIN PAPER TRAIL
 * ---------------------------------------------------------------
 * Every admin change writes one row here, and it is written inside the
 * same transaction as the change itself — so an audit entry can never go
 * missing for a change that did happen, and can never be left behind for
 * a change that was rolled back. Nothing in the API ever updates or
 * deletes one of these rows.
 */

/** Who is making a change, captured from the verified request — never from the body. */
export interface AuditContext {
  actorId: string;
  ipAddress: string | null;
}

export async function writeAuditLog(
  tx: Database | Tx,
  actor: AuditContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: actor.actorId,
    action,
    entityType,
    entityId,
    ipAddress: actor.ipAddress,
    metadata: metadata ?? null,
  });
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AuditLogPage {
  logs: AuditLogEntry[];
  total: number;
}

export async function listAuditLogs(options: {
  page: number;
  perPage: number;
  entityType?: string;
}): Promise<AuditLogPage> {
  const db = getDb();

  let rowsQuery = db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      actorName: profiles.fullName,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      ipAddress: auditLogs.ipAddress,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
    .$dynamic();

  let countQuery = db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLogs)
    .$dynamic();

  if (options.entityType) {
    rowsQuery = rowsQuery.where(eq(auditLogs.entityType, options.entityType));
    countQuery = countQuery.where(eq(auditLogs.entityType, options.entityType));
  }

  const [logs, [totals]] = await Promise.all([
    rowsQuery
      .orderBy(desc(auditLogs.createdAt))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    countQuery,
  ]);

  return { logs, total: totals?.count ?? 0 };
}
