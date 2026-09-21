import "dotenv/config";
import fs from "node:fs";
import { closeDatabase, getDb } from "./client.js";
import { inspiredFragrances } from "./schema/index.js";

/**
 * One-off import of the inspired / custom fragrance list from a CSV file:
 *
 *   npm run db:import:inspired -- path/to/list.csv
 *
 * Columns: Name, Inspired by, Gender (Men | Women | Unisex | empty). The
 * file itself is never committed — `backend/data/` is git-ignored — and
 * nothing but names, brands and gender is read from it. Rows already in
 * the table are left untouched, so running this twice is safe.
 */

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run db:import:inspired -- <list.csv>");
  process.exit(1);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const [header, ...lines] = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
const col = (name: string) => header!.findIndex((h) => h.trim().toLowerCase() === name);
const nameCol = col("name");
const brandCol = col("inspired by");
const genderCol = col("gender");
if (nameCol < 0 || brandCol < 0) throw new Error('The CSV needs "Name" and "Inspired by" columns.');

const rows = lines
  .map((cells) => ({
    name: (cells[nameCol] ?? "").trim(),
    inspiredBy: (cells[brandCol] ?? "").trim(),
    gender: genderCol >= 0 && /^(Men|Women|Unisex)$/.test((cells[genderCol] ?? "").trim()) ? (cells[genderCol] ?? "").trim() : null,
  }))
  .filter((r) => r.name && r.inspiredBy);

// One statement for the whole file: a few hundred rows in one round trip
// survives a flaky connection far better than one insert per row.
const inserted = rows.length
  ? (
      await getDb()
        .insert(inspiredFragrances)
        .values(rows)
        .onConflictDoNothing({ target: [inspiredFragrances.name, inspiredFragrances.inspiredBy] })
        .returning({ id: inspiredFragrances.id })
    ).length
  : 0;
console.log(`Inspired list: ${rows.length} rows read, ${inserted} added, ${rows.length - inserted} already present.`);
await closeDatabase();
