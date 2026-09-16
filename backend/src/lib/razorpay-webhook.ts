import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Verifies that a webhook call actually came from Razorpay: it signs the
 * exact request body with the webhook secret (set in the Razorpay
 * dashboard, separate from the API keys) using HMAC-SHA256, and sends the
 * result in the `X-Razorpay-Signature` header. There is no Authorization
 * header on this route at all — this signature *is* the authentication.
 *
 * `rawBody` must be the untouched bytes Razorpay sent, not a re-serialized
 * copy — re-encoding JSON can change byte-for-byte formatting (key order,
 * spacing) even when the parsed value looks identical, which would make a
 * genuine call fail verification. See app.ts for where the raw bytes are
 * captured before the general JSON body parser would otherwise consume them.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  // Different lengths would throw inside timingSafeEqual; treat that as
  // simply "not a match" rather than an error.
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
