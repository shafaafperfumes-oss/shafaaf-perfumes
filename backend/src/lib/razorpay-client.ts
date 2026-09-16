import Razorpay from "razorpay";
import { env } from "../config/env.js";

/**
 * Lazily-created Razorpay SDK client, same pattern as db/client.ts: nothing
 * tries to talk to Razorpay while the process is only starting up or being
 * type-checked, and a machine with no Razorpay keys configured yet can
 * still boot the API and run its non-payment tests.
 */

let client: Razorpay | null = null;

/** True when both Razorpay API keys are configured. */
export function isRazorpayConfigured(): boolean {
  return env.hasPayments;
}

export function getRazorpay(): Razorpay {
  if (client) return client;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. See docs/RAZORPAY-SETUP.md.",
    );
  }

  client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}
