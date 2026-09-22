import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * SOCIAL CONTENT — DRAFTS THAT WAIT FOR THE OWNER
 * ---------------------------------------------------------------
 * The Content agent writes Instagram / Facebook / YouTube posts as drafts;
 * nothing here is public and nothing is posted by itself. A draft becomes
 * `approved` only when the owner presses the button in the admin's Content
 * tab, and only an approved post may ever be published (by the owner
 * copying it, or later by the auto-poster). `rejected` keeps the owner's
 * note so the agent learns what not to write next time.
 *
 * The agent never touches this table directly — it writes a JSON file and
 * the owner's machine imports it with `npm run content:import`. That is the
 * whole "AI gets no database access" rule in one line.
 */
export const CONTENT_PLATFORMS = ["instagram", "facebook", "youtube", "whatsapp"] as const;
export const CONTENT_KINDS = ["post", "reel", "story"] as const;
export const CONTENT_STATUSES = ["draft", "approved", "rejected", "published"] as const;

export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const contentPosts = pgTable(
  "content_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The agent's own id for a draft (e.g. "2026-09-21-ig-oud-kaaba"), unique
     * so importing the same file twice never makes a duplicate. Null for
     * posts the owner writes by hand in the admin.
     */
    agentKey: varchar("agent_key", { length: 120 }),
    platform: varchar("platform", { length: 24 }).notNull().$type<ContentPlatform>(),
    kind: varchar("kind", { length: 24 }).notNull().default("post").$type<ContentKind>(),
    /** Short label for the admin list, never posted: "Oud Kaaba — Friday attar post". */
    title: varchar("title", { length: 160 }).notNull(),
    caption: text("caption").notNull(),
    /** Space-separated, kept apart from the caption so the owner can edit either. */
    hashtags: text("hashtags").notNull().default(""),
    /** Site-relative path ("images/oud-kaaba.webp") or an absolute URL. */
    imageUrl: varchar("image_url", { length: 500 }),
    /** The product the post is about, by slug, so the admin can link to it. */
    productSlug: varchar("product_slug", { length: 120 }),
    status: varchar("status", { length: 24 }).notNull().default("draft").$type<ContentStatus>(),
    /** "agent" for imported drafts, "admin" for posts the owner writes. */
    source: varchar("source", { length: 24 }).notNull().default("agent"),
    /** Why the agent suggests this post / when to post it — shown to the owner only. */
    agentNote: text("agent_note"),
    /** The owner's note, mostly a rejection reason the agent reads next round. */
    ownerNote: text("owner_note"),
    /** When the owner wants it posted (used by the auto-poster in a later step). */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** The platform's own id / permalink once published. */
    externalRef: varchar("external_ref", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("content_posts_agent_key_key").on(t.agentKey),
    index("content_posts_status_idx").on(t.status, t.createdAt),
    index("content_posts_scheduled_idx").on(t.scheduledFor),
  ],
);

export type ContentPost = typeof contentPosts.$inferSelect;
export type NewContentPost = typeof contentPosts.$inferInsert;
