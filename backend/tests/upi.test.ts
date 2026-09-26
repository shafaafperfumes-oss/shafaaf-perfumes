import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The UPI link is the only thing standing between a customer and paying
 * the shop by hand, and it is built from an id the owner types into a
 * Railway variable. These check the two things that would silently cost a
 * sale: an amount the payment app reads differently from the order, and a
 * UPI option offered when no id has been published at all.
 *
 * `env` reads the environment once at import, so each case imports the
 * module fresh with the variables it wants.
 */

async function loadWith(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return import("../src/lib/upi.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the UPI pay link", () => {
  it("carries the shop's id, the exact amount and the order number", async () => {
    const { upiPaymentFor } = await loadWith({ UPI_VPA: "shafaaf@okaxis", UPI_PAYEE_NAME: "Shafaaf Perfumes" });
    const details = upiPaymentFor({ orderNumber: "SHF-100042", total: 2597 });

    expect(details).not.toBeNull();
    expect(details!.vpa).toBe("shafaaf@okaxis");
    expect(details!.amount).toBe("2597.00");
    expect(details!.note).toBe("Order SHF-100042");

    const url = new URL(details!.link);
    expect(url.protocol).toBe("upi:");
    expect(url.searchParams.get("pa")).toBe("shafaaf@okaxis");
    expect(url.searchParams.get("pn")).toBe("Shafaaf Perfumes");
    expect(url.searchParams.get("am")).toBe("2597.00");
    expect(url.searchParams.get("cu")).toBe("INR");
    expect(url.searchParams.get("tn")).toBe("Order SHF-100042");
  });

  it("writes paise the way a payment app expects, never rounded away", async () => {
    const { upiPaymentFor } = await loadWith({ UPI_VPA: "shafaaf@okaxis" });
    expect(upiPaymentFor({ orderNumber: "SHF-1", total: 1249.5 })!.amount).toBe("1249.50");
    expect(upiPaymentFor({ orderNumber: "SHF-2", total: 899 })!.amount).toBe("899.00");
  });

  it("offers nothing at all when no UPI id has been published", async () => {
    const { upiPaymentFor } = await loadWith({ UPI_VPA: undefined });
    expect(upiPaymentFor({ orderNumber: "SHF-100042", total: 2597 })).toBeNull();
  });
});
