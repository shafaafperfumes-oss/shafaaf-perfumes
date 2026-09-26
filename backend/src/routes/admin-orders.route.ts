import { Router } from "express";
import { z } from "zod";
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  getAdminOrderDetail,
  listAllOrders,
  updateOrderStatus,
} from "../repositories/admin-order.repository.js";
import { emailCustomer } from "../services/customer-emails.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { assertAdminDatabaseReady, auditContext, pageQuerySchema } from "./admin-shared.js";

/** Every customer's orders, for the admin router only. See admin.route.ts. */
export const adminOrdersRouter: Router = Router();

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(["pending_payment", "paid", "shipped", "delivered", "cancelled"]).optional(),
});

/**
 * The statuses an admin may set. `paid` is allowed only for the two
 * methods with no gateway behind them — a UPI transfer the owner sees in
 * his bank app, and cash collected at the door — and the repository
 * refuses it for a card order, which stays the webhook's alone to confirm.
 * The note is shown to the customer (courier and tracking number for a
 * dispatch, the UPI reference for a confirmed transfer, a reason for a
 * cancellation).
 */
const updateOrderSchema = z
  .object({
    status: z.enum(["cancelled", "paid", "shipped", "delivered"]),
    note: z.string().trim().max(300).optional(),
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
    const order = await updateOrderStatus(auditContext(req), req.params.id, input.status, input.note || null);

    // The customer hears about exactly two moments, and each is sent from
    // wherever it genuinely happens. Confirming reaches here only for a UPI
    // transfer the owner has just verified: a card order is confirmed by the
    // webhook and a cash order the moment it is placed, both elsewhere.
    if (input.status === "paid" && order.paymentMethod === "upi") {
      void emailCustomer(order.id, "confirmed");
    } else if (input.status === "shipped") {
      void emailCustomer(order.id, "shipped");
    }

    sendSuccess(res, { order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      next(ApiError.notFound(error.message));
      return;
    }
    if (error instanceof InvalidOrderTransitionError) {
      next(ApiError.conflict(error.message, { status: error.status }));
      return;
    }
    next(error);
  }
});
