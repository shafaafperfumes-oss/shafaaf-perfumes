import { Router } from "express";
import { z } from "zod";
import { getCustomerDetail, listCustomers } from "../repositories/admin-customer.repository.js";
import { listAuditLogs } from "../repositories/audit.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { assertAdminDatabaseReady, pageQuerySchema } from "./admin-shared.js";

/**
 * Customer lookup and the admin audit trail — both read-only. See
 * admin.route.ts for where the role check is applied.
 */
export const adminCustomersRouter: Router = Router();
export const adminAuditLogsRouter: Router = Router();

const customerQuerySchema = pageQuerySchema.extend({ search: z.string().max(120).optional() });
const auditQuerySchema = pageQuerySchema.extend({ entityType: z.string().max(40).optional() });

adminCustomersRouter.get("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = customerQuerySchema.parse(req.query);
    const { customers, total } = await listCustomers(query);
    sendSuccess(res, { customers }, { page: query.page, perPage: query.perPage, total });
  } catch (error) {
    next(error);
  }
});

adminCustomersRouter.get("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const customer = await getCustomerDetail(req.params.id);
    if (!customer) throw ApiError.notFound("No customer matches that id.");
    sendSuccess(res, { customer });
  } catch (error) {
    next(error);
  }
});

adminAuditLogsRouter.get("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = auditQuerySchema.parse(req.query);
    const { logs, total } = await listAuditLogs(query);
    sendSuccess(res, { logs }, { page: query.page, perPage: query.perPage, total });
  } catch (error) {
    next(error);
  }
});
