import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { fragranceQueries, inspiredFragrances, inspiredSizes } from "../db/schema/index.js";
import { type AuditContext, writeAuditLog } from "./audit.repository.js";

/**
 * The inspired / custom fragrance list — see `db/schema/inspired.ts` for why
 * these are not products. Public reads return only what a customer may see
 * (available entries, active sizes); everything that changes a row is admin
 * only and audited, like the rest of the admin area.
 */

export interface InspiredMatch {
  id: string;
  name: string;
  inspiredBy: string;
  gender: string | null;
}

export interface SizeOffer {
  id: string;
  label: string;
  sizeMl: number;
  /** Paise, or null when the owner has not set a price yet. */
  pricePaise: number | null;
}

/** Turns "dior savage" into a pattern that also tolerates one missing/extra letter per word. */
function searchPattern(query: string): string {
  return `%${query.trim().replace(/[%_]/g, "").split(/\s+/).join("%")}%`;
}

/**
 * Case-insensitive match on the name or the brand, best matches first:
 * an exact name, then a name that starts with the query, then anything
 * containing it. `limit` keeps the response small on purpose — this backs
 * a search box, not a catalogue page.
 */
export async function searchInspired(query: string, limit = 10): Promise<InspiredMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = searchPattern(q);
  const haystack = sql`(${inspiredFragrances.name} || ' ' || ${inspiredFragrances.inspiredBy})`;
  return getDb()
    .select({
      id: inspiredFragrances.id,
      name: inspiredFragrances.name,
      inspiredBy: inspiredFragrances.inspiredBy,
      gender: inspiredFragrances.gender,
    })
    .from(inspiredFragrances)
    .where(
      and(
        eq(inspiredFragrances.isAvailable, true),
        or(ilike(inspiredFragrances.name, pattern), ilike(inspiredFragrances.inspiredBy, pattern), ilike(haystack, pattern)),
      ),
    )
    .orderBy(
      sql`case when lower(${inspiredFragrances.name}) = lower(${q}) then 0 when ${inspiredFragrances.name} ilike ${q + "%"} then 1 else 2 end`,
      asc(inspiredFragrances.name),
    )
    .limit(limit);
}

export async function listActiveSizes(): Promise<SizeOffer[]> {
  return getDb()
    .select({ id: inspiredSizes.id, label: inspiredSizes.label, sizeMl: inspiredSizes.sizeMl, pricePaise: inspiredSizes.pricePaise })
    .from(inspiredSizes)
    .where(eq(inspiredSizes.isActive, true))
    .orderBy(asc(inspiredSizes.position), asc(inspiredSizes.sizeMl));
}

/** Remembers what was searched and how many entries matched — nothing about who. */
export async function logFragranceQuery(query: string, matches: number): Promise<void> {
  const text = query.trim().slice(0, 120);
  if (text.length < 2) return;
  await getDb().insert(fragranceQueries).values({ query: text, matches: Math.min(matches, 32_000) });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface InspiredEntry extends InspiredMatch {
  isAvailable: boolean;
  updatedAt: Date;
}

export interface InspiredInput {
  name: string;
  inspiredBy: string;
  gender?: string | null;
  isAvailable?: boolean;
}

export class InspiredNotFoundError extends Error {}
export class InspiredDuplicateError extends Error {}
export class SizeNotFoundError extends Error {}

export async function listInspired(options: { search?: string; page: number; perPage: number }): Promise<{ items: InspiredEntry[]; total: number }> {
  const db = getDb();
  const where = options.search
    ? or(ilike(inspiredFragrances.name, searchPattern(options.search)), ilike(inspiredFragrances.inspiredBy, searchPattern(options.search)))
    : undefined;
  const [items, counts] = await Promise.all([
    db
      .select({
        id: inspiredFragrances.id,
        name: inspiredFragrances.name,
        inspiredBy: inspiredFragrances.inspiredBy,
        gender: inspiredFragrances.gender,
        isAvailable: inspiredFragrances.isAvailable,
        updatedAt: inspiredFragrances.updatedAt,
      })
      .from(inspiredFragrances)
      .where(where)
      .orderBy(asc(inspiredFragrances.name))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(inspiredFragrances).where(where),
  ]);
  return { items, total: counts[0]?.count ?? 0 };
}

/** Postgres "unique_violation", which Drizzle hands back wrapped in its own query error. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function createInspired(actor: AuditContext, input: InspiredInput): Promise<InspiredEntry> {
  return getDb().transaction(async (tx) => {
    let row: InspiredEntry | undefined;
    try {
      [row] = await tx
        .insert(inspiredFragrances)
        .values({ name: input.name.trim(), inspiredBy: input.inspiredBy.trim(), gender: input.gender ?? null, isAvailable: input.isAvailable ?? true })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw new InspiredDuplicateError("That fragrance is already in the list.");
      throw error;
    }
    if (!row) throw new Error("Insert returned no row.");
    await writeAuditLog(tx, actor, "inspired.create", "inspired_fragrance", row.id, { name: row.name, inspiredBy: row.inspiredBy });
    return row;
  });
}

export async function updateInspired(actor: AuditContext, id: string, changes: Partial<InspiredInput>): Promise<InspiredEntry> {
  return getDb().transaction(async (tx) => {
    let row: InspiredEntry | undefined;
    try {
      [row] = await tx
        .update(inspiredFragrances)
        .set({
          ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
          ...(changes.inspiredBy !== undefined ? { inspiredBy: changes.inspiredBy.trim() } : {}),
          ...(changes.gender !== undefined ? { gender: changes.gender } : {}),
          ...(changes.isAvailable !== undefined ? { isAvailable: changes.isAvailable } : {}),
          updatedAt: new Date(),
        })
        .where(eq(inspiredFragrances.id, id))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw new InspiredDuplicateError("Another entry already has that name and brand.");
      throw error;
    }
    if (!row) throw new InspiredNotFoundError("No fragrance has that id.");
    await writeAuditLog(tx, actor, "inspired.update", "inspired_fragrance", id, changes as Record<string, unknown>);
    return row;
  });
}

/**
 * Bulk add from a cleaned list (name + brand [+ gender]). Existing entries
 * are left exactly as they are — an import never overwrites the owner's
 * edits or flips availability back on.
 */
export async function importInspired(actor: AuditContext, rows: InspiredInput[]): Promise<{ inserted: number; skipped: number }> {
  return getDb().transaction(async (tx) => {
    let inserted = 0;
    for (const row of rows) {
      const result = await tx
        .insert(inspiredFragrances)
        .values({ name: row.name.trim(), inspiredBy: row.inspiredBy.trim(), gender: row.gender ?? null })
        .onConflictDoNothing({ target: [inspiredFragrances.name, inspiredFragrances.inspiredBy] })
        .returning({ id: inspiredFragrances.id });
      if (result.length) inserted += 1;
    }
    await writeAuditLog(tx, actor, "inspired.import", "inspired_fragrance", null, { inserted, skipped: rows.length - inserted });
    return { inserted, skipped: rows.length - inserted };
  });
}

export async function listAllSizes(): Promise<Array<SizeOffer & { isActive: boolean }>> {
  return getDb()
    .select({
      id: inspiredSizes.id,
      label: inspiredSizes.label,
      sizeMl: inspiredSizes.sizeMl,
      pricePaise: inspiredSizes.pricePaise,
      isActive: inspiredSizes.isActive,
    })
    .from(inspiredSizes)
    .orderBy(asc(inspiredSizes.position), asc(inspiredSizes.sizeMl));
}

export async function updateSize(
  actor: AuditContext,
  id: string,
  changes: { pricePaise?: number | null; isActive?: boolean },
): Promise<SizeOffer & { isActive: boolean }> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(inspiredSizes)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(inspiredSizes.id, id))
      .returning({
        id: inspiredSizes.id,
        label: inspiredSizes.label,
        sizeMl: inspiredSizes.sizeMl,
        pricePaise: inspiredSizes.pricePaise,
        isActive: inspiredSizes.isActive,
      });
    if (!row) throw new SizeNotFoundError("No size has that id.");
    await writeAuditLog(tx, actor, "inspired.size.update", "inspired_size", id, changes);
    return row;
  });
}

export interface QuerySummary {
  query: string;
  times: number;
  /** How many list entries the latest search for it found — 0 means "asked for, not stocked". */
  matches: number;
}

/** The most-searched terms of the last `days` days, for the owner's report. */
export async function topFragranceQueries(days: number, limit = 30): Promise<QuerySummary[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return getDb()
    .select({
      query: sql<string>`lower(${fragranceQueries.query})`,
      times: sql<number>`count(*)::int`,
      matches: sql<number>`min(${fragranceQueries.matches})::int`,
    })
    .from(fragranceQueries)
    .where(gte(fragranceQueries.createdAt, since))
    .groupBy(sql`lower(${fragranceQueries.query})`)
    .orderBy(desc(sql`count(*)`), asc(sql`lower(${fragranceQueries.query})`))
    .limit(limit);
}
