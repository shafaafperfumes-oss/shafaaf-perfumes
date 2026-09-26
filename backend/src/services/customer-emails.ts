import { and, eq, sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { getDb } from "../db/client.js";
import { orderStatusHistory } from "../db/schema/index.js";
import { sendEmail } from "../lib/email.js";
import { getAdminOrderDetail, type AdminOrderDetail } from "../repositories/admin-order.repository.js";
import { logger } from "../utils/logger.js";
import { addressLines, escapeHtml, rupees } from "./order-alerts.js";

/**
 * CUSTOMER EMAILS
 * ---------------------------------------------------------------
 * The two moments a customer wants to hear from a shop: "your order is
 * confirmed", and "your parcel has left". Nothing else is sent, because
 * everything else is noise in someone's inbox.
 *
 * Same contract as the owner's alert next door: the order is already
 * saved and its stock already settled before any of this runs, so a mail
 * failure is logged and swallowed rather than allowed to fail the thing
 * that triggered it. A customer who never gets the email can still see
 * every one of these steps on their own order page.
 *
 * The address comes from Supabase's `auth.users`, which is where a
 * customer's email actually lives — `profiles` holds only the name and
 * the phone. It is read one row at a time, by id, for the customer whose
 * order this is and nobody else.
 */

export type CustomerEmailMoment = "confirmed" | "shipped" | "delivered";

/**
 * The shop's Google listing. Asking for a review is the one thing that
 * actually moves a shop up the local results — the shop shares 4.9 stars
 * with the perfumer up the road who has ten times the reviews, and that
 * count is most of the difference between them.
 *
 * The CID form addresses the listing directly and opens the Maps app on a
 * phone, where leaving a review is one tap. If the owner ever fetches the
 * short g.page/r/…/review link from his Business Profile, swap it in here
 * — it lands straight on the review box and saves that tap.
 */
const GOOGLE_REVIEW_URL = "https://www.google.com/maps?cid=14106381703851512644";

/** The customer's own email address, or null when we have none for them. */
async function emailFor(userId: string): Promise<string | null> {
  const result = await getDb().execute(
    sql`select email from auth.users where id = ${userId}::uuid and email is not null limit 1`,
  );
  const rows = (result as unknown as { rows?: Array<{ email: string }> }).rows ?? (result as unknown as Array<{ email: string }>);
  return rows[0]?.email ?? null;
}

/** The customer's own order page, or null when no public site URL is known. */
function orderLink(orderId: string): string | null {
  if (!env.siteUrl) return null;
  return `${env.siteUrl}/orders?id=${encodeURIComponent(orderId)}`;
}

/** What "confirmed" means to the customer depends on how they chose to pay. */
function paidLine(order: AdminOrderDetail): string {
  if (order.paymentMethod === "cod") {
    return `You will pay ${rupees.format(order.total)} in cash when the parcel reaches you — nothing is due now.`;
  }
  if (order.paymentMethod === "upi") {
    return `We have received your UPI transfer of ${rupees.format(order.total)}, thank you.`;
  }
  return `We have received your payment of ${rupees.format(order.total)}, thank you.`;
}

/**
 * Pure: the words of one email. Kept free of I/O so the wording can be
 * read and tested without a database or Resend.
 */
export function buildCustomerEmail(
  order: AdminOrderDetail,
  moment: CustomerEmailMoment,
  courierNote?: string | null,
): { subject: string; text: string; html: string } {
  const name = (order.customerName || "there").trim().split(" ")[0] || "there";
  const link = orderLink(order.id);
  const confirmed = moment === "confirmed";
  const delivered = moment === "delivered";

  const heading = confirmed
    ? `Order ${order.orderNumber} is confirmed`
    : delivered
      ? `How is your fragrance?`
      : `Order ${order.orderNumber} is on its way`;

  const opening = confirmed
    ? `${paidLine(order)} We are packing your order now, and will write again the moment it leaves us.`
    : delivered
      ? `Your order reached you, and we hope it was worth the wait. If you have a minute, a few words on Google would mean a great deal to a small shop in Srinagar — it is how other people find us.`
      : `Your parcel has left us and is on its way to you.${courierNote ? ` ${courierNote}` : ""}`;

  const text = [
    `Hello ${name},`,
    "",
    heading,
    "",
    opening,
    "",
    ...(delivered
      ? []
      : [
          "Your order:",
          ...order.items.map(
            (item) => `  - ${item.quantity} x ${item.productName} (${item.variantLabel}) — ${rupees.format(item.lineTotal)}`,
          ),
          "",
          `Total: ${rupees.format(order.total)}`,
          "",
          "Delivering to:",
          ...addressLines(order.shippingAddress).map((line) => `  ${line}`),
          "",
        ]),
    ...(delivered
      ? [`Leave a review: ${GOOGLE_REVIEW_URL}`, ""]
      : link
        ? [`See your order: ${link}`, ""]
        : []),
    "Any question at all, reply to this email or message us on WhatsApp: +91 97969 06804.",
    "",
    "Shafaaf Perfumes — The Fragrance of Kashmir",
  ].join("\n");

  const html = [
    `<div style="font-family:Georgia,serif;color:#3d2a1f;max-width:520px;margin:0 auto;padding:24px">`,
    `<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7a6a60;margin:0 0 4px">Shafaaf Perfumes</p>`,
    `<h1 style="font-size:22px;font-weight:normal;margin:0 0 12px">${escapeHtml(heading)}</h1>`,
    `<p style="margin:0 0 16px;line-height:1.6">Hello ${escapeHtml(name)}, ${escapeHtml(opening)}</p>`,
    ...(delivered
      ? []
      : [
          `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 4px">`,
          ...order.items.map(
            (item) =>
              `<tr><td style="padding:6px 0">${escapeHtml(`${item.quantity} x ${item.productName}`)}` +
              `<br><span style="color:#7a6a60;font-size:12px">${escapeHtml(item.variantLabel)}</span></td>` +
              `<td style="padding:6px 0;text-align:right;white-space:nowrap">${escapeHtml(rupees.format(item.lineTotal))}</td></tr>`,
          ),
          `<tr><td style="padding:8px 0 0;border-top:1px solid #e6ddcf;font-weight:600">Total</td>`,
          `<td style="padding:8px 0 0;border-top:1px solid #e6ddcf;text-align:right;font-weight:600">${escapeHtml(rupees.format(order.total))}</td></tr>`,
          `</table>`,
          `<p style="margin:16px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6a60">Delivering to</p>`,
          `<p style="margin:0 0 16px;line-height:1.6;font-size:14px">${addressLines(order.shippingAddress).map(escapeHtml).join("<br>")}</p>`,
        ]),
    delivered
      ? `<p style="margin:0 0 16px"><a href="${escapeHtml(GOOGLE_REVIEW_URL)}" style="display:inline-block;background:#3d2a1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px">Write a review on Google</a></p>`
      : link
        ? `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#3d2a1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px">See your order</a></p>`
        : "",
    `<p style="margin:0;font-size:13px;color:#7a6a60;line-height:1.6">Any question at all, reply to this email or message us on WhatsApp <a href="https://wa.me/919796906804" style="color:#ad8a54">+91 97969 06804</a>.</p>`,
    `</div>`,
  ].join("");

  return { subject: heading, text, html };
}

/**
 * Sends one of the two customer emails. Never throws.
 *
 * Called from the one place each moment actually happens — the webhook
 * that captures a payment, and the admin action that moves an order —
 * so the email follows the real event rather than anyone's intention.
 */
export async function emailCustomer(orderId: string, moment: CustomerEmailMoment): Promise<void> {
  if (!env.hasEmail) {
    logger.debug({ orderId, moment }, "customer email skipped: RESEND_API_KEY not set");
    return;
  }

  try {
    const order = await getAdminOrderDetail(orderId);
    if (!order) {
      logger.warn({ orderId, moment }, "customer email skipped: order not found");
      return;
    }

    const to = await emailFor(order.customerId);
    if (!to) {
      logger.info({ orderId, moment }, "customer email skipped: no address on file");
      return;
    }

    // The note an admin typed when dispatching — courier and tracking
    // number — is the one genuinely useful thing in a "shipped" email.
    let courierNote: string | null = null;
    if (moment === "shipped") {
      const [entry] = await getDb()
        .select({ note: orderStatusHistory.note })
        .from(orderStatusHistory)
        .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.status, "shipped")))
        .orderBy(sql`${orderStatusHistory.createdAt} desc`)
        .limit(1);
      courierNote = entry?.note ?? null;
    }

    const message = buildCustomerEmail(order, moment, courierNote);
    await sendEmail({ to, ...message });
    logger.info({ orderId, orderNumber: order.orderNumber, moment }, "customer email sent");
  } catch (error) {
    logger.error({ err: error, orderId, moment }, "customer email failed");
  }
}
