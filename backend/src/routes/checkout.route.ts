import { Router } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  EmptyCartError,
  InvalidAddressError,
  OutOfStockError,
  getCheckoutQuote,
  placeOrder,
} from "../repositories/order.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Turns the signed-in customer's own cart into a real order. Same
 * auth/prefix pattern as `cart.route.ts`: mounted at its own `/checkout`
 * prefix so `requireAuth` never intercepts an unrelated unmatched path.
 *
 * `/quote` never changes anything — it is safe to call as often as the
 * frontend likes to show a live total. `/place` is the only route in the
 * whole API that reserves stock and writes an order.
 */
export const checkoutRouter: Router = Router();

checkoutRouter.use(requireAuth);

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("Checkout is not available right now.");
  }
}

function handleCheckoutError(error: unknown, next: (error: unknown) => void): void {
  if (error instanceof EmptyCartError) {
    next(ApiError.badRequest(error.message));
    return;
  }
  if (error instanceof OutOfStockError) {
    next(ApiError.conflict(error.message, { issues: error.issues }));
    return;
  }
  if (error instanceof InvalidAddressError) {
    next(ApiError.notFound(error.message));
    return;
  }
  next(error);
}

const placeOrderSchema = z.object({ addressId: z.string().uuid() }).strict();

checkoutRouter.post("/quote", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const quote = await getCheckoutQuote(req.user!.id);
    sendSuccess(res, quote);
  } catch (error) {
    handleCheckoutError(error, next);
  }
});

checkoutRouter.post("/place", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = placeOrderSchema.parse(req.body);
    const order = await placeOrder(req.user!.id, input.addressId);
    sendSuccess(res, { order }, undefined, 201);
  } catch (error) {
    handleCheckoutError(error, next);
  }
});
