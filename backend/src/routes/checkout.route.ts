import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { isDatabaseConfigured } from "../db/client.js";
import { paymentOptionsFor } from "../lib/payment-methods.js";
import { upiPaymentWithQrFor } from "../lib/upi.js";
import { emailCustomer } from "../services/customer-emails.js";
import { notifyOrderPlaced } from "../services/order-alerts.js";
import { requireAuth } from "../middleware/auth.js";
import {
  EmptyCartError,
  InvalidAddressError,
  OutOfStockError,
  PaymentMethodNotAllowedError,
  getCheckoutQuote,
  placeOrder,
} from "../repositories/order.repository.js";
import { createPaymentForOrder, type PaymentIntent } from "../repositories/payment.repository.js";
import { ApiError } from "../utils/api-error.js";
import { logger } from "../utils/logger.js";
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
  if (error instanceof PaymentMethodNotAllowedError) {
    next(ApiError.badRequest(error.message));
    return;
  }
  next(error);
}

const placeOrderSchema = z
  .object({
    addressId: z.string().uuid(),
    /**
     * How the shopper chose to pay. Absent means `online`, so a browser
     * running the previous version of the page keeps working unchanged.
     * `upi` is only offered when the shop has published a UPI id.
     */
    paymentMethod: z.enum(["online", "upi", "cod"]).optional(),
  })
  .strict();

checkoutRouter.post("/quote", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const quote = await getCheckoutQuote(req.user!.id);
    sendSuccess(res, {
      ...quote,
      paymentOptions: paymentOptionsFor(Math.round(quote.total * 100)),
      codMax: env.COD_MAX_PAISE / 100,
    });
  } catch (error) {
    handleCheckoutError(error, next);
  }
});

checkoutRouter.post("/place", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = placeOrderSchema.parse(req.body);
    const method = input.paymentMethod ?? "online";
    // placeOrder checks the method against the total it prices itself,
    // after the address and the cart — so the errors still reach the
    // shopper in the order they can act on.
    const order = await placeOrder(req.user!.id, input.addressId, method);

    // The order itself is already safely committed at this point (stock
    // reserved, cart emptied). Asking Razorpay for a payment intent is a
    // separate network call to a third party and can fail on its own —
    // that must not make the customer think their order was never placed.
    // The frontend can retry via POST /orders/:id/pay if this comes back null.
    // A UPI or cash-on-delivery order never goes near the gateway at all.
    let payment: PaymentIntent | null = null;
    if (method === "online") {
      try {
        payment = await createPaymentForOrder(req.user!.id, order.id);
      } catch (paymentError) {
        logger.error({ err: paymentError, orderId: order.id }, "could not create a Razorpay order for a placed order");
      }
    }

    // A gateway order tells the owner once the webhook confirms the money.
    // These two have no webhook, so tell him now, while the order is new.
    // Deliberately not awaited: the alert must never delay or fail the reply.
    if (method !== "online") void notifyOrderPlaced(order.id);

    // Cash on delivery is confirmed the moment it is placed — there is
    // nothing to wait for and no money to verify, so the customer should
    // not be left wondering. A UPI order stays quiet until the owner has
    // actually seen the transfer and says so in the admin.
    if (method === "cod") void emailCustomer(order.id, "confirmed");

    sendSuccess(
      res,
      { order, payment, upi: method === "upi" ? await upiPaymentWithQrFor(order) : null },
      undefined,
      201,
    );
  } catch (error) {
    handleCheckoutError(error, next);
  }
});
