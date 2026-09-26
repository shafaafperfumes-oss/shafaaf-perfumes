import { env } from "../config/env.js";

/**
 * UPI: paying the shop directly, with nothing in between.
 *
 * There is no API and no account here. A UPI id is just an address money
 * can be sent to, so all this file does is describe that address and build
 * the `upi://pay` link every Indian payment app understands. Tapping it on
 * a phone opens PhonePe / Google Pay / Paytm with the amount and the order
 * number already filled in; on a laptop the same details are shown as text
 * to type by hand.
 *
 * Nothing here can tell whether money actually arrived — a link is only an
 * invitation to pay. The order stays `pending_payment` until the owner sees
 * the transfer in his own bank app and confirms it in the admin. That keeps
 * the rule the gateway path lives by: the browser never decides that a
 * payment happened.
 */

export interface UpiPaymentDetails {
  /** The shop's UPI id, e.g. "shafaaf@okaxis". */
  vpa: string;
  /** The name the customer's UPI app will show. */
  payeeName: string;
  /** Rupees, as a string with two decimals — what the app will prefill. */
  amount: string;
  /** Shown in the customer's statement, so the owner can match it to an order. */
  note: string;
  /** `upi://pay?...` — a link on a phone, details to copy on a laptop. */
  link: string;
}

/** The UPI details for one order, or null when the shop has published no UPI id. */
export function upiPaymentFor(order: { orderNumber: string; total: number }): UpiPaymentDetails | null {
  if (!env.upi) return null;

  const amount = order.total.toFixed(2);
  const note = `Order ${order.orderNumber}`;
  const query = new URLSearchParams({
    pa: env.upi.vpa,
    pn: env.upi.payeeName,
    am: amount,
    cu: "INR",
    tn: note,
  });

  return {
    vpa: env.upi.vpa,
    payeeName: env.upi.payeeName,
    amount,
    note,
    link: `upi://pay?${query.toString()}`,
  };
}
