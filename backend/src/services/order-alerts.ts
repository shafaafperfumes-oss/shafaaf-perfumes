import { env } from "../config/env.js";
import { sendEmail } from "../lib/email.js";
import { getAdminOrderDetail, type AdminOrderDetail } from "../repositories/admin-order.repository.js";
import { logger } from "../utils/logger.js";

/**
 * ORDER ALERTS
 * ---------------------------------------------------------------
 * Tells the shop owner about an order the moment it is paid — one email
 * per order, sent right after the Razorpay webhook commits the order (the
 * only place an order ever becomes `paid`).
 *
 * The alert is strictly a courtesy on top of the real record: the order
 * is already saved and its stock committed before this runs, so a mail
 * failure (Resend down, key revoked) is logged and swallowed rather than
 * allowed to fail the webhook — Razorpay would only retry, and the retry
 * would be a no-op duplicate anyway. The admin page remains the source of
 * truth; this just saves the owner from refreshing it all day.
 */

interface ShippingAddress {
  recipientName?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const whenInIndia = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressLines(address: unknown): string[] {
  if (!address || typeof address !== "object") return [];
  const a = address as ShippingAddress;
  return [
    a.recipientName,
    a.phone,
    a.line1,
    a.line2,
    [a.city, a.state, a.postalCode].filter(Boolean).join(" "),
    a.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/** The admin page for one order, or null when no public site URL is known. */
export function adminOrderLink(orderId: string): string | null {
  if (!env.siteUrl) return null;
  return `${env.siteUrl}/admin?view=order&id=${encodeURIComponent(orderId)}`;
}

/**
 * Pure: turns an order into the alert's subject and bodies. Kept free of
 * I/O so the wording can be tested without a database or Resend.
 */
export function buildOrderPaidAlert(order: AdminOrderDetail): { subject: string; text: string; html: string } {
  const total = rupees.format(order.total);
  const placedAt = whenInIndia.format(order.createdAt);
  const customer = order.customerName || "Customer";
  const link = adminOrderLink(order.id);
  const address = addressLines(order.shippingAddress);

  const itemLines = order.items.map(
    (item) => `${item.quantity} x ${item.productName} (${item.variantLabel}) — ${rupees.format(item.lineTotal)}`,
  );

  const text = [
    `New paid order ${order.orderNumber}`,
    `Placed ${placedAt} · Paid via Razorpay`,
    "",
    `Customer: ${customer}${order.customerPhone ? ` · ${order.customerPhone}` : ""}`,
    "",
    "Items:",
    ...itemLines.map((line) => `  - ${line}`),
    "",
    `Subtotal: ${rupees.format(order.subtotal)}`,
    ...(order.discount > 0 ? [`Discount: -${rupees.format(order.discount)}`] : []),
    `Shipping: ${order.shipping > 0 ? rupees.format(order.shipping) : "Free"}`,
    ...(order.tax > 0 ? [`Tax: ${rupees.format(order.tax)}`] : []),
    `Total paid: ${total}`,
    "",
    "Ship to:",
    ...address.map((line) => `  ${line}`),
    ...(link ? ["", `Open in store admin: ${link}`] : []),
  ].join("\n");

  const rows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:6px 0">${item.quantity} × ${escapeHtml(item.productName)} <span style="color:#7a6a60">(${escapeHtml(item.variantLabel)})</span></td>` +
        `<td style="padding:6px 0;text-align:right;white-space:nowrap">${escapeHtml(rupees.format(item.lineTotal))}</td></tr>`,
    )
    .join("");

  const summaryRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:3px 0;color:#7a6a60">${label}</td><td style="padding:3px 0;text-align:right;${strong ? "font-weight:600" : ""}">${escapeHtml(value)}</td></tr>`;

  const html = [
    `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2b1f18;line-height:1.5">`,
    `<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7a6a60;margin:0 0 4px">Shafaaf Perfumes</p>`,
    `<h1 style="font-size:22px;font-weight:normal;margin:0 0 4px">New paid order ${escapeHtml(order.orderNumber)}</h1>`,
    `<p style="margin:0 0 20px;color:#7a6a60">Placed ${escapeHtml(placedAt)} · Paid via Razorpay</p>`,
    `<p style="margin:0 0 20px"><strong>${escapeHtml(customer)}</strong>${order.customerPhone ? ` · ${escapeHtml(order.customerPhone)}` : ""}</p>`,
    `<table style="width:100%;border-collapse:collapse;border-top:1px solid #e6ddd5;border-bottom:1px solid #e6ddd5;margin:0 0 12px">${rows}</table>`,
    `<table style="width:100%;border-collapse:collapse;margin:0 0 20px">`,
    summaryRow("Subtotal", rupees.format(order.subtotal)),
    order.discount > 0 ? summaryRow("Discount", `-${rupees.format(order.discount)}`) : "",
    summaryRow("Shipping", order.shipping > 0 ? rupees.format(order.shipping) : "Free"),
    order.tax > 0 ? summaryRow("Tax", rupees.format(order.tax)) : "",
    summaryRow("Total paid", total, true),
    `</table>`,
    `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a6a60">Ship to</p>`,
    `<p style="margin:0 0 20px">${address.map(escapeHtml).join("<br>")}</p>`,
    link
      ? `<p style="margin:0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#3d2a1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px">Open in store admin</a></p>`
      : "",
    `</div>`,
  ].join("");

  return { subject: `New paid order ${order.orderNumber} — ${total}`, text, html };
}

/**
 * Sends the owner's alert for an order that has just become paid. Never
 * throws: every failure is logged and swallowed (see file header). Does
 * nothing when alerts are not configured.
 */
export async function notifyOrderPaid(orderId: string): Promise<void> {
  if (!env.hasOrderAlerts || !env.ORDER_ALERT_EMAIL) {
    logger.debug({ orderId }, "order alert skipped: RESEND_API_KEY / ORDER_ALERT_EMAIL not set");
    return;
  }

  try {
    const order = await getAdminOrderDetail(orderId);
    if (!order) {
      logger.warn({ orderId }, "order alert skipped: order not found");
      return;
    }
    const alert = buildOrderPaidAlert(order);
    await sendEmail({ to: env.ORDER_ALERT_EMAIL, ...alert });
    logger.info({ orderId, orderNumber: order.orderNumber }, "order alert sent");
  } catch (error) {
    logger.error({ err: error, orderId }, "order alert email failed");
  }
}
