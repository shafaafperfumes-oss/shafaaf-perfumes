import { and, asc, desc, eq, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  type ContentKind,
  type ContentPlatform,
  type ContentPost,
  type ContentStatus,
  contentPosts,
} from "../db/schema/index.js";
import { type AuditContext, writeAuditLog } from "./audit.repository.js";

/**
 * Social content drafts — see `db/schema/content.ts`. Everything here is
 * admin-only and audited. The one rule the code enforces on top of the
 * schema: a post can only be marked `published` by the publisher (a later
 * step), never by an admin edit, and only from `approved`.
 */

export interface ContentPostInput {
  platform: ContentPlatform;
  kind?: ContentKind;
  title: string;
  caption: string;
  hashtags?: string;
  imageUrl?: string | null;
  productSlug?: string | null;
  agentNote?: string | null;
  scheduledFor?: Date | null;
}

export interface ContentPostChanges extends Partial<ContentPostInput> {
  /** Only draft / approved / rejected — `published` is not an admin choice. */
  status?: Exclude<ContentStatus, "published">;
  ownerNote?: string | null;
}

export interface ContentListOptions {
  status?: ContentStatus;
  platform?: ContentPlatform;
  page: number;
  perPage: number;
}

export class ContentNotFoundError extends Error {}
export class ContentStateError extends Error {}

export type StatusCounts = Record<ContentStatus, number>;

export async function listContent(options: ContentListOptions): Promise<{ items: ContentPost[]; total: number; counts: StatusCounts }> {
  const db = getDb();
  const filters = [
    options.status ? eq(contentPosts.status, options.status) : undefined,
    options.platform ? eq(contentPosts.platform, options.platform) : undefined,
  ].filter(Boolean);
  const where = filters.length ? and(...filters) : undefined;

  const [items, totals, perStatus] = await Promise.all([
    db
      .select()
      .from(contentPosts)
      .where(where)
      // Anything with a posting date first (soonest first), then the rest, newest first.
      .orderBy(asc(contentPosts.scheduledFor), desc(contentPosts.createdAt))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    db.select({ count: sql<number>`count(*)::int` }).from(contentPosts).where(where),
    db.select({ status: contentPosts.status, count: sql<number>`count(*)::int` }).from(contentPosts).groupBy(contentPosts.status),
  ]);

  const counts: StatusCounts = { draft: 0, approved: 0, rejected: 0, published: 0 };
  for (const row of perStatus) counts[row.status] = row.count;
  return { items, total: totals[0]?.count ?? 0, counts };
}

export async function getContentPost(id: string): Promise<ContentPost> {
  const [row] = await getDb().select().from(contentPosts).where(eq(contentPosts.id, id));
  if (!row) throw new ContentNotFoundError("No post has that id.");
  return row;
}

/** A post the owner writes by hand in the admin. */
export async function createContentPost(actor: AuditContext, input: ContentPostInput): Promise<ContentPost> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(contentPosts)
      .values({
        platform: input.platform,
        kind: input.kind ?? "post",
        title: input.title.trim(),
        caption: input.caption.trim(),
        hashtags: (input.hashtags ?? "").trim(),
        imageUrl: input.imageUrl ?? null,
        productSlug: input.productSlug ?? null,
        agentNote: input.agentNote ?? null,
        scheduledFor: input.scheduledFor ?? null,
        source: "admin",
      })
      .returning();
    if (!row) throw new Error("Insert returned no row.");
    await writeAuditLog(tx, actor, "content.create", "content_post", row.id, { platform: row.platform, title: row.title });
    return row;
  });
}

export async function updateContentPost(actor: AuditContext, id: string, changes: ContentPostChanges): Promise<ContentPost> {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(contentPosts).where(eq(contentPosts.id, id));
    if (!current) throw new ContentNotFoundError("No post has that id.");
    // What went out is history: the words can no longer change, only the owner's note.
    if (current.status === "published") {
      const touched = Object.keys(changes).filter((k) => k !== "ownerNote");
      if (touched.length) throw new ContentStateError("A published post cannot be edited.");
    }

    const [row] = await tx
      .update(contentPosts)
      .set({
        ...(changes.platform !== undefined ? { platform: changes.platform } : {}),
        ...(changes.kind !== undefined ? { kind: changes.kind } : {}),
        ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
        ...(changes.caption !== undefined ? { caption: changes.caption.trim() } : {}),
        ...(changes.hashtags !== undefined ? { hashtags: changes.hashtags.trim() } : {}),
        ...(changes.imageUrl !== undefined ? { imageUrl: changes.imageUrl } : {}),
        ...(changes.productSlug !== undefined ? { productSlug: changes.productSlug } : {}),
        ...(changes.agentNote !== undefined ? { agentNote: changes.agentNote } : {}),
        ...(changes.ownerNote !== undefined ? { ownerNote: changes.ownerNote } : {}),
        ...(changes.scheduledFor !== undefined ? { scheduledFor: changes.scheduledFor } : {}),
        ...(changes.status !== undefined ? { status: changes.status } : {}),
        // A fresh decision gets fresh attempts: moving a failed post back to
        // draft and approving it again lets the scheduler try once more.
        ...(changes.status !== undefined && changes.status !== current.status ? { publishAttempts: 0, lastError: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(contentPosts.id, id))
      .returning();
    if (!row) throw new ContentNotFoundError("No post has that id.");

    const action = changes.status && changes.status !== current.status ? `content.${changes.status}` : "content.update";
    await writeAuditLog(tx, actor, action, "content_post", id, { from: current.status, changes: Object.keys(changes) });
    return row;
  });
}

/** Removes a post that never went out. Published posts stay as the record of what was said. */
export async function deleteContentPost(actor: AuditContext, id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [current] = await tx.select({ status: contentPosts.status, title: contentPosts.title }).from(contentPosts).where(eq(contentPosts.id, id));
    if (!current) throw new ContentNotFoundError("No post has that id.");
    if (current.status === "published") throw new ContentStateError("A published post cannot be deleted.");
    await tx.delete(contentPosts).where(eq(contentPosts.id, id));
    await writeAuditLog(tx, actor, "content.delete", "content_post", id, { title: current.title, status: current.status });
  });
}

/**
 * Bulk import of agent drafts. Rows whose `agentKey` already exists are
 * skipped untouched, so the owner's edits and decisions survive a re-import
 * of the same file. Not audited per row: the importer is a CLI on the
 * owner's machine, and the file itself is the record.
 */
export async function importAgentDrafts(rows: Array<ContentPostInput & { agentKey: string }>): Promise<{ inserted: number; skipped: number }> {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const inserted = (
    await getDb()
      .insert(contentPosts)
      .values(
        rows.map((r) => ({
          agentKey: r.agentKey,
          platform: r.platform,
          kind: r.kind ?? "post",
          title: r.title.trim(),
          caption: r.caption.trim(),
          hashtags: (r.hashtags ?? "").trim(),
          imageUrl: r.imageUrl ?? null,
          productSlug: r.productSlug ?? null,
          agentNote: r.agentNote ?? null,
          scheduledFor: r.scheduledFor ?? null,
          source: "agent",
        })),
      )
      .onConflictDoNothing({ target: contentPosts.agentKey })
      .returning({ id: contentPosts.id })
  ).length;
  return { inserted, skipped: rows.length - inserted };
}

/* ------------------------------------------------------------------ */
/* The publisher's side: only these functions may ever set `published`. */
/* ------------------------------------------------------------------ */

/** How many failed attempts before the scheduler stops retrying a post and leaves it for the owner. */
export const MAX_PUBLISH_ATTEMPTS = 3;

/**
 * Approved posts whose time has come and that have not failed too often,
 * soonest first. The scheduler works through these a few at a time.
 */
export async function listDuePosts(now: Date, limit = 5): Promise<ContentPost[]> {
  return getDb()
    .select()
    .from(contentPosts)
    .where(
      and(
        eq(contentPosts.status, "approved"),
        lte(contentPosts.scheduledFor, now),
        lt(contentPosts.publishAttempts, MAX_PUBLISH_ATTEMPTS),
      ),
    )
    .orderBy(asc(contentPosts.scheduledFor))
    .limit(limit);
}

/**
 * Marks a post published — the only path to that status. Guarded on
 * `status = approved` so two runs racing on the same post can only win
 * once: the loser sees no row and reports a state error.
 */
export async function markPublished(
  actor: AuditContext,
  id: string,
  result: { externalRef: string | null; publishedAt: Date },
): Promise<ContentPost> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(contentPosts)
      .set({
        status: "published",
        publishedAt: result.publishedAt,
        externalRef: result.externalRef,
        lastError: null,
        lastAttemptAt: result.publishedAt,
        publishAttempts: sql`${contentPosts.publishAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(contentPosts.id, id), eq(contentPosts.status, "approved")))
      .returning();
    if (!row) throw new ContentStateError("Only an approved post can be published.");
    await writeAuditLog(tx, actor, "content.published", "content_post", id, {
      platform: row.platform,
      externalRef: row.externalRef,
      by: actor.actorId ? "admin" : "scheduler",
    });
    return row;
  });
}

/** Records a failed attempt and what went wrong, for the admin card and the retry limit. */
export async function markPublishFailed(actor: AuditContext, id: string, error: string): Promise<ContentPost | null> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(contentPosts)
      .set({
        lastError: error.slice(0, 1000),
        lastAttemptAt: new Date(),
        publishAttempts: sql`${contentPosts.publishAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(contentPosts.id, id), eq(contentPosts.status, "approved")))
      .returning();
    if (!row) return null;
    await writeAuditLog(tx, actor, "content.publish_failed", "content_post", id, {
      platform: row.platform,
      attempt: row.publishAttempts,
      error: row.lastError,
    });
    return row;
  });
}
