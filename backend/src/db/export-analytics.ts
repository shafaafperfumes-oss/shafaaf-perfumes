import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { closeDatabase } from "./client.js";
import { buildWeeklyAnalytics } from "../services/analytics-export.js";

/**
 * Writes the week's numbers for the Analytics agent:
 *
 *   npm run analytics:export                # → ../.claude/team/data/<today>-analytics.json
 *   npm run analytics:export -- some/file.json
 *
 * Read-only: nothing in the database changes. The file holds counts,
 * rupee totals, product names and the owner's own content notes — never a
 * customer's name, phone, email or address, and never a supplier rate.
 * See `services/analytics-export.ts` for exactly what goes in.
 */

const today = new Date().toISOString().slice(0, 10);
const target = process.argv[2] ?? path.resolve("..", ".claude", "team", "data", `${today}-analytics.json`);

const report = await buildWeeklyAnalytics();
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

const w = report.orders.thisWeek;
console.log(`Analytics written to ${target}`);
console.log(
  `Last 7 days: ${w.placed} orders placed, ${w.paid + w.shipped + w.delivered} paid, ₹${w.revenueRupees} revenue; ` +
    `${report.stock.lowStock.length} low-stock and ${report.stock.outOfStock.length} out-of-stock variants; ` +
    `${report.content.byStatus.draft} content drafts waiting.`,
);
await closeDatabase();
