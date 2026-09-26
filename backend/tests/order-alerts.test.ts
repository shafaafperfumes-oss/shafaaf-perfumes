import { describe, expect, it, vi } from "vitest";
import { createEmailSender, EmailNotConfiguredError, EmailSendError } from "../src/lib/email.js";
import type { AdminOrderDetail } from "../src/repositories/admin-order.repository.js";
import { buildOrderPaidAlert } from "../src/services/order-alerts.js";

// Neither suite here touches the network or the database: the sender is
// exercised against a fake `fetch`, and the alert builder is a pure function.

function fakeFetch(status: number, body: unknown) {
  const impl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return impl as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("the email sender", () => {
  const message = { to: "owner@example.com", subject: "Hello", text: "Plain body", html: "<p>Plain body</p>" };

  it("posts the message to Resend with the key in the Authorization header", async () => {
    const fetchImpl = fakeFetch(200, { id: "email_123" });
    const send = createEmailSender({ apiKey: "re_test_key", from: "Shop <shop@example.com>", fetchImpl });

    await expect(send(message)).resolves.toEqual({ id: "email_123" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Shop <shop@example.com>",
      to: ["owner@example.com"],
      subject: "Hello",
      text: "Plain body",
      html: "<p>Plain body</p>",
    });
  });

  it("refuses to send without an API key, before touching the network", async () => {
    const fetchImpl = fakeFetch(200, { id: "never" });
    const send = createEmailSender({ apiKey: undefined, from: "Shop <shop@example.com>", fetchImpl });

    await expect(send(message)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces Resend's own error message when a send is rejected", async () => {
    const fetchImpl = fakeFetch(403, { statusCode: 403, message: "You can only send testing emails to your own email address" });
    const send = createEmailSender({ apiKey: "re_test_key", from: "Shop <shop@example.com>", fetchImpl });

    const error = await send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).statusCode).toBe(403);
    expect((error as EmailSendError).message).toMatch(/own email address/);
  });
});

describe("the new-paid-order alert", () => {
  const order: AdminOrderDetail = {
    id: "0f1b2c3d-0000-4000-8000-000000000001",
    orderNumber: "SHF-100042",
    status: "paid",
    paymentMethod: "online",
    customerId: "user-1",
    customerName: "Ayesha <Khan>",
    customerPhone: "9876543210",
    itemCount: 3,
    subtotal: 2597,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 2597,
    shippingAddress: {
      label: "Home",
      recipientName: "Ayesha Khan",
      phone: "9876543210",
      line1: "12 Rose Lane",
      line2: null,
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500001",
      country: "India",
    },
    createdAt: new Date("2026-09-17T06:30:00Z"),
    items: [
      { id: "i1", variantId: "v1", productName: "Khamra Qahwa", variantLabel: "50 ml", sku: "KQ-50", quantity: 2, unitPrice: 899, lineTotal: 1798 },
      { id: "i2", variantId: "v2", productName: "Oud Royale", variantLabel: "12 ml attar", sku: "OR-12", quantity: 1, unitPrice: 799, lineTotal: 799 },
    ],
    statusHistory: [],
  };

  it("names the order and the amount in the subject", () => {
    const { subject } = buildOrderPaidAlert(order);
    expect(subject).toBe("New paid order SHF-100042 — ₹2,597");
  });

  it("lists every item, the customer, the total and the delivery address in the plain-text body", () => {
    const { text } = buildOrderPaidAlert(order);
    expect(text).toContain("2 x Khamra Qahwa (50 ml) — ₹1,798");
    expect(text).toContain("1 x Oud Royale (12 ml attar) — ₹799");
    expect(text).toContain("Customer: Ayesha <Khan> · 9876543210");
    expect(text).toContain("Total paid: ₹2,597");
    expect(text).toContain("Shipping: Free");
    expect(text).toContain("12 Rose Lane");
    expect(text).toContain("Hyderabad Telangana 500001");
    // Shown in India's time zone, since that is where the owner reads it.
    expect(text).toContain("17 Sept 2026, 12:00 pm");
  });

  it("escapes customer-provided text in the HTML body", () => {
    const { html } = buildOrderPaidAlert(order);
    expect(html).toContain("Ayesha &lt;Khan&gt;");
    expect(html).not.toContain("<Khan>");
  });

  it("shows a discount line only when there is one", () => {
    expect(buildOrderPaidAlert(order).text).not.toContain("Discount:");
    const discounted = { ...order, discount: 200, total: 2397 };
    expect(buildOrderPaidAlert(discounted).text).toContain("Discount: -₹200");
  });

  // The two methods with no gateway behind them are alerted the moment the
  // order is placed, when no money has arrived yet. Saying "paid" there
  // would tell the owner something untrue about his own takings.
  it("does not claim a cash-on-delivery order has been paid", () => {
    const cod = { ...order, status: "pending_payment", paymentMethod: "cod" as const };
    const { subject, text } = buildOrderPaidAlert(cod);
    expect(subject).toBe("New cash-on-delivery order SHF-100042 — ₹2,597");
    expect(text).not.toContain("Total paid");
    expect(text).toContain("Cash to collect on delivery: ₹2,597");
    expect(text).toContain("Cash on delivery");
  });

  it("tells the owner to check his bank app for a UPI order", () => {
    const upi = { ...order, status: "pending_payment", paymentMethod: "upi" as const };
    const { subject, text } = buildOrderPaidAlert(upi);
    expect(subject).toBe("New UPI order SHF-100042 — ₹2,597");
    expect(text).not.toContain("Total paid");
    expect(text).toContain("Total to collect: ₹2,597");
    expect(text).toContain("Check your bank app");
  });
});
