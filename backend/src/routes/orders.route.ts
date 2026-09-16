import { Router } from "express";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { getOrderDetail, listOrders } from "../repositories/order.repository.js";
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
    sendSuccess(res, { order });
  } catch (error) {
    next(error);
  }
});
