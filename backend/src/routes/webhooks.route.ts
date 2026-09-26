import { Router } from "express";
import { isDatabaseConfigured } from "../db/client.js";
import { markOrderPaid, recordWebhookEvent } from "../repositories/payment.repository.js";
import { verifyRazorpayWebhookSignature } from "../lib/razorpay-webhook.js";
import { emailCustomer } from "../services/customer-emails.js";
import { notifyOrderPaid } from "../services/order-alerts.js";
import { ApiError } from "../utils/api-error.js";
import { logger } from "../utils/logger.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Razorpay calls this route directly — no `Authorization` header, no
 * signed-in user. The `X-Razorpay-Signature` header (an HMAC of the exact
 * request body, see lib/razorpay-webhook.ts) is the only authentication,
 * which is why this router is mounted in app.ts with its own raw-body
 * parser *before* the general JSON body parser: signature verification
 * needs Razorpay's exact bytes, not a re-serialized copy.
 *
 * This is the one place in the whole API allowed to move an order to
 * `paid` — the browser's own "payment succeeded" message is only ever a
 * UI hint, never trusted on its own (docs/ARCHITECTURE.md section 6).
 */
export const webhooksRouter: Router = Router();

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
  };
}

webhooksRouter.post("/razorpay", async (req, res, next) => {
  try {
    if (!isDatabaseConfigured()) {
      throw ApiError.serviceUnavailable("Webhook processing is not available right now.");
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      // Would only happen if this route were ever reached without the raw
      // body parser in front of it — treat as a bad request, not a crash.
      throw ApiError.badRequest("Expected a raw request body.");
    }

    const signature = req.header("x-razorpay-signature");
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      logger.warn({ hasSignatureHeader: Boolean(signature) }, "rejected webhook with invalid signature");
      throw ApiError.badRequest("Invalid webhook signature.");
    }

    const eventId = req.header("x-razorpay-event-id");
    if (!eventId) {
      throw ApiError.badRequest("Missing x-razorpay-event-id header.");
    }

    let event: RazorpayWebhookPayload;
    try {
      event = JSON.parse(rawBody.toString("utf8")) as RazorpayWebhookPayload;
    } catch {
      throw ApiError.badRequest("Webhook body is not valid JSON.");
    }

    if (!event.event) {
      throw ApiError.badRequest("Malformed webhook payload.");
    }

    const isNewDelivery = await recordWebhookEvent(eventId, event.event, event);
    if (!isNewDelivery) {
      // A retried delivery of an event we already processed — Razorpay
      // expects a 200 either way, so this is success, not an error.
      sendSuccess(res, { received: true, duplicate: true });
      return;
    }

    if (event.event === "payment.captured") {
      const paymentEntity = event.payload?.payment?.entity;
      if (paymentEntity?.order_id && paymentEntity?.id) {
        const paid = await markOrderPaid(paymentEntity.order_id, paymentEntity.id);
        // The order and its stock are already committed above; the emails
        // are best-effort and never fail the webhook (see services/order-alerts.ts).
        if (paid) {
          await notifyOrderPaid(paid.orderId);
          await emailCustomer(paid.orderId, "confirmed");
        }
      } else {
        logger.warn({ eventId }, "payment.captured webhook missing order_id/payment id");
      }
    }
    // Every other event type is accepted and ignored: Razorpay only needs
    // a 200 to stop retrying, and nothing in this phase reacts to them yet.

    sendSuccess(res, { received: true });
  } catch (error) {
    next(error);
  }
});
