import { Router } from "express";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { upiPaymentFor } from "../lib/upi.js";
import { getOrderDetail, listOrders } from "../repositories/order.repository.js";
import {
  OrderNotFoundError,
  OrderNotPayableError,
  PaymentsNotConfiguredError,
  createPaymentForOrder,
} from "../repositories/payment.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * The signed-in customer's own past orders — never anyone else's,
 * regardless of what id is requested. Same auth/prefix pattern as every
 * other customer router in this API.
 */
export const ordersRouter: Router = Router();

ordersRouter.use(requireAuth);

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("Your orders are not available right now.");
  }
}

ordersRouter.get("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const orders = await listOrders(req.user!.id);
    sendSuccess(res, { orders }, { total: orders.length });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const order = await getOrderDetail(req.user!.id, req.params.id);
    if (!order) {
      throw ApiError.notFound("No order matches that id.");
    }
    // A UPI order still waiting for its transfer is shown the shop's UPI
    // id and a pay link every time it is opened, so the customer can come
    // back to it later — from a laptop, or after closing the tab.
    const upi =
      order.paymentMethod === "upi" && order.status === "pending_payment" ? upiPaymentFor(order) : null;
    sendSuccess(res, { order, upi });
  } catch (error) {
    next(error);
  }
});

/**
 * (Re-)issues a Razorpay payment intent for one of your own still-pending
 * orders. Exists for retries — a closed checkout popup, an expired widget,
 * or the transient failure `POST /checkout/place` already logs and shrugs
 * off — not for creating new orders, which only `/checkout/place` can do.
 */
ordersRouter.post("/:id/pay", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const payment = await createPaymentForOrder(req.user!.id, req.params.id);
    sendSuccess(res, { payment });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      next(ApiError.notFound(error.message));
      return;
    }
    if (error instanceof OrderNotPayableError) {
      next(ApiError.conflict(error.message));
      return;
    }
    if (error instanceof PaymentsNotConfiguredError) {
      next(ApiError.serviceUnavailable(error.message));
      return;
    }
    next(error);
  }
});
