import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { closeDatabase } from "../src/db/client.js";
import { buildWeeklyAnalytics, type WeeklyAnalytics } from "../src/services/analytics-export.js";

/**
 * The weekly export the Analytics agent reads. Runs against the real
 * database when `DATABASE_URL` is set; checks the shape and, above all,
 * that nothing personal or secret can be in the file.
 */
const describeWithDb = env.hasDatabase ? describe : describe.skip;

describeWithDb("the weekly analytics export", () => {
  const now = new Date("2026-09-22T09:00:00Z");
  let report: WeeklyAnalytics;

  // One build for both tests: ~20 queries over a single pooled test
  // connection to Supabase take a while.
  beforeAll(async () => {
    report = await buildWeeklyAnalytics(now);
  }, 90_000);

  afterAll(async () => {
    await closeDatabase();
  });

  it("builds every section with consistent windows", () => {

    expect(report.generatedAt).toBe(now.toISOString());
    expect(report.windows.thisWeek).toEqual({ from: "2026-09-15T09:00:00.000Z", to: "2026-09-22T09:00:00.000Z" });
    expect(report.windows.lastWeek.to).toBe(report.windows.thisWeek.from);
    expect(report.windows.last30Days.from).toBe("2026-08-23T09:00:00.000Z");

    for (const key of ["thisWeek", "lastWeek", "last30Days"] as const) {
      const o = report.orders[key];
      expect(o.placed).toBe(o.pendingPayment + o.paid + o.shipped + o.delivered + o.cancelled);
      expect(o.revenueRupees).toBeGreaterThanOrEqual(0);
    }
    expect(report.orders.last30Days.placed).toBeGreaterThanOrEqual(report.orders.thisWeek.placed);
    expect(report.stock.totalVariants).toBeGreaterThan(0);
    for (const line of [...report.stock.lowStock, ...report.stock.outOfStock]) {
      expect(["Perfume", "Attar", "Bakhoor"]).toContain(line.form);
    }
    expect(report.customers.total).toBeGreaterThanOrEqual(report.customers.newThisWeek);
    expect(report.customPage.listedFragrances).toBeGreaterThanOrEqual(report.customPage.availableFragrances);
    expect(Object.keys(report.content.byStatus).sort()).toEqual(["approved", "draft", "published", "rejected"]);
    expect(report.catalog.activeProducts).toBeGreaterThan(0);
  });

  it("never carries a customer's details, an id or a secret", () => {
    const text = JSON.stringify(report);
    const keys = new Set<string>();
    JSON.parse(text, (key, value) => {
      if (key) keys.add(key);
      return value;
    });
    for (const banned of ["email", "phone", "fullName", "address", "shippingAddress", "userId", "orderNumber", "id", "token", "key", "password"]) {
      expect(keys.has(banned), `key "${banned}" must not be exported`).toBe(false);
    }
    // No uuids, no emails, no Indian phone numbers anywhere in the values.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/(\+91|\b0)?[6-9]\d{9}\b/);
  });
});
