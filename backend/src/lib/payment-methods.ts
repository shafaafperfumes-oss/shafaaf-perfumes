import { env } from "../config/env.js";

export type PaymentMethod = "online" | "upi" | "cod";

/**
 * Which ways of paying a basket of this value may use, in the order the
 * checkout page shows them.
 *
 * One function, used both to draw the choice and to enforce it when the
 * order is placed, so the page can never offer something the order will
 * refuse. The enforcement happens inside `placeOrder`, against the total
 * it has just priced itself — not against anything the browser sent.
 *
 * `online` is always offered, even with no gateway keys configured:
 * placing an order must never fail because Razorpay is unreachable or
 * half-set-up. The order is committed either way and the order page
 * offers Pay now until it works.
 *
 * Cash on delivery is capped — above `COD_MAX_PAISE` a parcel is worth
 * too much to send out unpaid — and UPI appears only once the shop has
 * published a UPI id, so it can never show an address it is not paid at.
 */
export function paymentOptionsFor(totalPaise: number): PaymentMethod[] {
  const options: PaymentMethod[] = ["online"];
  if (env.upi) options.push("upi");
  if (env.COD_ENABLED && totalPaise <= env.COD_MAX_PAISE) options.push("cod");
  return options;
}
