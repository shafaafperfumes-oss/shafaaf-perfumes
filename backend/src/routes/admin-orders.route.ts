import { Router } from "express";
import { z } from "zod";
import {
  OrderNotCancellableError,
  OrderNotFoundError,
  cancelOrder,
  getAdminOrderDetail,
  listAllOrders,
} from "../repositories/admin-order.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { assertAdminDatabaseReady, auditContext, pageQuerySchema } from "./admin-shared.js";

/** Every customer's orders, for the admin router only. See admin.route.ts. */
export const adminOrdersRouter: Router = Router();

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(["pending_payment", "paid", "cancelled"]).optional(),
});

/**
 * `cancelled` is the only status an admin may set. `paid` is reserved for
 * the Razorpay webhook, which is the one thing that can prove money
 * actually arrived.
 */
const updateOrderSchema = z
  .object({
    status: z.literal("cancelled"),
    note: z.string().max(300).optional(),
  })
  .strict();

adminOrdersRouter.get("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = listQuerySchema.parse(req.query);
    const { orders, total } = await listAllOrders(query);
    sendSuccess(res, { orders }, { page: query.page, perPage: query.perPage, total });
  } catch (error) {
    next(error);
  }
});

adminOrdersRouter.get("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const order = await getAdminOrderDetail(req.params.id);
    if (!order) throw ApiError.notFound("No order matches that id.");
    sendSuccess(res, { order });
  } catch (error) {
    next(error);
  }
});

adminOrdersRouter.patch("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const input = updateOrderSchema.parse(req.body);
    const order = await cancelOrder(auditContext(req), req.params.id, input.note ?? null);
    sendSuccess(res, { order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      next(ApiError.notFound(error.message));
      return;
    }
    if (error instanceof OrderNotCancellableError) {
      next(ApiError.conflict(error.message, { status: error.status }));
      return;
    }
    next(error);
  }
});
