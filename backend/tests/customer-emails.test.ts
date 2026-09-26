import { describe, expect, it } from "vitest";
import type { AdminOrderDetail } from "../src/repositories/admin-order.repository.js";
import { buildCustomerEmail } from "../src/services/customer-emails.js";

/**
 * These emails go to a customer, in the shop's name, about their money.
 * What matters is that they never promise something that did not happen:
 * a cash order must not say the shop has been paid, and a shipped mail
 * must not go out reading like a confirmation.
 */

const order: AdminOrderDetail = {
  id: "0f1b2c3d-0000-4000-8000-000000000001",
  orderNumber: "SHF-100042",
  status: "paid",
  paymentMethod: "online",
  customerId: "user-1",
  customerName: "Ayesha <Khan>",
  customerPhone: "9876543210",
  itemCount: 2,
  subtotal: 1798,
  discount: 0,
  shipping: 0,
  tax: 0,
  total: 1798,
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
  ],
  statusHistory: [],
};

describe("the order-confirmed email", () => {
  it("greets the customer by first name and names the order", () => {
    const { subject, text } = buildCustomerEmail(order, "confirmed");
    expect(subject).toBe("Order SHF-100042 is confirmed");
    expect(text).toContain("Hello Ayesha,");
    expect(text).toContain("2 x Khamra Qahwa (50 ml) — ₹1,798");
    expect(text).toContain("Total: ₹1,798");
    expect(text).toContain("12 Rose Lane");
  });

  it("says the money has arrived for a paid order", () => {
    expect(buildCustomerEmail(order, "confirmed").text).toContain("We have received your payment of ₹1,798");
  });

  it("names UPI when that is how they paid", () => {
    const upi = { ...order, paymentMethod: "upi" as const };
    expect(buildCustomerEmail(upi, "confirmed").text).toContain("We have received your UPI transfer of ₹1,798");
  });

  // The one thing this email must never get wrong: telling someone their
  // money has arrived when they have not paid a paisa yet.
  it("never claims payment for a cash-on-delivery order", () => {
    const cod = { ...order, paymentMethod: "cod" as const, status: "pending_payment" };
    const { text } = buildCustomerEmail(cod, "confirmed");
    expect(text).toContain("You will pay ₹1,798 in cash when the parcel reaches you");
    expect(text).toContain("nothing is due now");
    expect(text).not.toContain("We have received your payment");
    expect(text).not.toContain("We have received your UPI transfer");
  });

  it("escapes customer-provided text in the HTML body", () => {
    const { html } = buildCustomerEmail(order, "confirmed");
    expect(html).toContain("Ayesha");
    expect(html).not.toContain("<Khan>");
  });
});

describe("the order-shipped email", () => {
  it("says the parcel has left, not that the order is confirmed", () => {
    const { subject, text } = buildCustomerEmail(order, "shipped");
    expect(subject).toBe("Order SHF-100042 is on its way");
    expect(text).toContain("on its way to you");
    expect(text).not.toContain("is confirmed");
    expect(text).not.toContain("We are packing");
  });

  it("passes on the courier and tracking number the owner typed", () => {
    const { text } = buildCustomerEmail(order, "shipped", "Delhivery, tracking 1234567890");
    expect(text).toContain("Delhivery, tracking 1234567890");
  });

  it("reads properly when the owner typed no note at all", () => {
    const { text } = buildCustomerEmail(order, "shipped", null);
    expect(text).toContain("Your parcel has left us and is on its way to you.");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});

describe("both emails", () => {
  it("give the customer a way to reach a human", () => {
    for (const moment of ["confirmed", "shipped"] as const) {
      expect(buildCustomerEmail(order, moment).text).toContain("+91 97969 06804");
    }
  });

  it("cope with a customer whose name we never captured", () => {
    const nameless = { ...order, customerName: null };
    expect(buildCustomerEmail(nameless, "confirmed").text).toContain("Hello there,");
  });
});
