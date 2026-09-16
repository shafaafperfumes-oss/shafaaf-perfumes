import type { Request } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import type { AuditContext } from "../repositories/audit.repository.js";
import { ApiError } from "../utils/api-error.js";

/** Shared pieces of every admin route file, kept in one place rather than copied. */

export function assertAdminDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("The admin area is not available right now.");
  }
}

/**
 * Who to record against an audit row. Both values come from the verified
 * request — `req.user` is set by `requireAuth` from a signature-checked
 * token, and the IP from Express — never from the request body, which an
 * admin could otherwise use to write a misleading log entry.
 */
export function auditContext(req: Request): AuditContext {
  return { actorId: req.user!.id, ipAddress: req.ip ?? null };
}

/** `?page=2&perPage=50`, with sane defaults and a hard ceiling. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
