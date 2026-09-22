import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { auditLogs, contentPosts, type ContentPost } from "../src/db/schema/index.js";
import type { MetaClient } from "../src/lib/meta.js";
import { ContentStateError, listDuePosts } from "../src/repositories/content.repository.js";
import { autoPostBlocker, prepareForMeta, publishDuePosts, publishPost, renderCaption, resolveImageUrl } from "../src/services/content-publisher.js";

/* ---------- pure parts: no database, no network ---------- */

describe("what the publisher sends", () => {
  it("joins caption and hashtags exactly like the Copy button", () => {
    expect(renderCaption({ caption: "Friday ka attar. ", hashtags: "#attar #oud" })).toBe("Friday ka attar.\n\n#attar #oud");
    expect(renderCaption({ caption: "No tags", hashtags: "  " })).toBe("No tags");
  });

  it("knows which posts must stay manual", () => {
    expect(autoPostBlocker({ platform: "instagram", kind: "post", imageUrl: "images/x.webp" })).toBeNull();
    expect(autoPostBlocker({ platform: "facebook", kind: "post", imageUrl: null })).toBeNull();
    expect(autoPostBlocker({ platform: "instagram", kind: "post", imageUrl: null })).toMatch(/needs a photo/);
    expect(autoPostBlocker({ platform: "instagram", kind: "reel", imageUrl: "x" })).toMatch(/by hand/);
    expect(autoPostBlocker({ platform: "youtube", kind: "post", imageUrl: null })).toMatch(/YouTube/);
    expect(autoPostBlocker({ platform: "whatsapp", kind: "story", imageUrl: null })).toMatch(/WhatsApp/);
  });

  it("passes absolute photo URLs through untouched", () => {
    expect(resolveImageUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });
});

async function testImage(width: number, height: number, format: "webp" | "png" | "jpeg"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 120, g: 80, b: 40, alpha: 1 } } })[format]().toBuffer();
}

describe("preparing a photo for Meta", () => {
  it("converts WebP to JPEG at the same size", async () => {
    const { jpeg, padded } = await prepareForMeta(await testImage(1000, 1000, "webp"), "facebook");
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([1000, 1000]);
    expect(padded).toBe(false);
  });

  it("adds side bars to a tall photo for Instagram, never crops", async () => {
    // 2:3 product render (0.67) → 4:5 (0.8): height untouched, width grows.
    const { jpeg, padded } = await prepareForMeta(await testImage(1024, 1536, "webp"), "instagram");
    const meta = await sharp(jpeg).metadata();
    expect(padded).toBe(true);
    expect(meta.height).toBe(1536);
    expect(meta.width).toBe(Math.ceil(1536 * 0.8));
    // The middle pixel is still the photo, the edge is the ivory bar.
    const raw = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(raw.data.subarray((y * raw.info.width + x) * 3, (y * raw.info.width + x) * 3 + 3));
    expect(px(Math.floor(raw.info.width / 2), 700)[0]).toBeGreaterThan(100);
    expect(px(2, 700)).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(px(2, 700)[0]).toBeGreaterThan(240); // ivory
  });

  it("adds top and bottom bars to a very wide photo", async () => {
    const { jpeg, padded } = await prepareForMeta(await testImage(2000, 800, "png"), "instagram");
    const meta = await sharp(jpeg).metadata();
    expect(padded).toBe(true);
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(Math.ceil(2000 / 1.91));
  });

  it("leaves a Facebook photo's shape alone", async () => {
    const { jpeg, padded } = await prepareForMeta(await testImage(715, 1600, "jpeg"), "facebook");
    const meta = await sharp(jpeg).metadata();
    expect(padded).toBe(false);
    expect([meta.width, meta.height]).toEqual([715, 1600]);
  });
});

/* ---------- with the database: publishing changes the row ---------- */

const describeWithDb = env.hasDatabase ? describe : describe.skip;

describeWithDb("publishing an approved post", () => {
  const stamp = `zz-test-${Date.now()}`;
  const created: string[] = [];

  async function makePost(over: Partial<typeof contentPosts.$inferInsert>): Promise<ContentPost> {
    const [row] = await getDb()
      .insert(contentPosts)
      .values({
        platform: "instagram",
        kind: "post",
        title: `${stamp} ${over.platform ?? "instagram"}`,
        caption: "Friday ka attar.",
        hashtags: "#attar",
        imageUrl: "https://photos.example/oud.webp",
        status: "approved",
        scheduledFor: new Date(Date.now() - 60_000),
        ...over,
      })
      .returning();
    created.push(row!.id);
    return row!;
  }

  const photoFetch = (async () =>
    new Response(await testImage(1024, 1536, "webp"), { status: 200, headers: { "Content-Type": "image/webp" } })) as unknown as typeof fetch;
  const store = async (jpeg: Buffer, postId: string) => {
    expect((await sharp(jpeg).metadata()).format).toBe("jpeg");
    return `https://public.example/social/${postId}.jpg`;
  };
  const sent: Array<{ platform: string; imageUrl?: string; caption: string }> = [];
  const fakeMeta = {
    publishInstagramImage: async (i: { imageUrl: string; caption: string }) => {
      sent.push({ platform: "instagram", ...i });
      return { id: "ig-m1", permalink: "https://www.instagram.com/p/x/" };
    },
    publishFacebookPhoto: async (i: { imageUrl: string; message: string }) => {
      sent.push({ platform: "facebook", imageUrl: i.imageUrl, caption: i.message });
      return { id: "fb-1", permalink: "https://www.facebook.com/1" };
    },
    publishFacebookText: async (i: { message: string }) => {
      sent.push({ platform: "facebook-text", caption: i.message });
      return { id: "fb-2", permalink: "https://www.facebook.com/2" };
    },
  } as unknown as MetaClient;
  const failingMeta = {
    publishInstagramImage: async () => {
      throw new Error("boom");
    },
  } as unknown as MetaClient;

  beforeAll(async () => {
    await getDb().delete(contentPosts).where(like(contentPosts.title, "zz-test-%"));
  });

  afterAll(async () => {
    if (created.length) await getDb().delete(auditLogs).where(inArray(auditLogs.entityId, created));
    await getDb().delete(contentPosts).where(like(contentPosts.title, `${stamp}%`));
    await closeDatabase();
  });

  it("puts an Instagram post out with the prepared photo and records the link", async () => {
    const post = await makePost({});
    const done = await publishPost(post, { actorId: null, ipAddress: null }, { meta: fakeMeta, fetchImpl: photoFetch, store });
    expect(done.status).toBe("published");
    expect(done.externalRef).toBe("https://www.instagram.com/p/x/");
    expect(done.publishedAt).toBeInstanceOf(Date);
    expect(done.publishAttempts).toBe(1);
    expect(done.lastError).toBeNull();
    expect(sent.at(-1)).toEqual({
      platform: "instagram",
      imageUrl: `https://public.example/social/${post.id}.jpg`,
      caption: "Friday ka attar.\n\n#attar",
    });
  });

  it("posts a Facebook draft without a photo as text", async () => {
    const post = await makePost({ platform: "facebook", imageUrl: null });
    const done = await publishPost(post, { actorId: null, ipAddress: null }, { meta: fakeMeta, fetchImpl: photoFetch, store });
    expect(done.status).toBe("published");
    expect(sent.at(-1)).toEqual({ platform: "facebook-text", caption: "Friday ka attar.\n\n#attar" });
  });

  it("refuses a draft, and a post that must stay manual", async () => {
    const draft = await makePost({ status: "draft" });
    await expect(publishPost(draft, undefined, { meta: fakeMeta })).rejects.toBeInstanceOf(ContentStateError);
    const yt = await makePost({ platform: "youtube" });
    await expect(publishPost(yt, undefined, { meta: fakeMeta })).rejects.toThrow(/YouTube/);
    const [row] = await getDb().select().from(contentPosts).where(eq(contentPosts.id, yt.id));
    expect(row!.status).toBe("approved");
    expect(row!.publishAttempts).toBe(0);
  });

  it("records a failure on the row and leaves the post approved", async () => {
    const post = await makePost({});
    await expect(publishPost(post, undefined, { meta: failingMeta, fetchImpl: photoFetch, store })).rejects.toThrow("boom");
    const [row] = await getDb().select().from(contentPosts).where(eq(contentPosts.id, post.id));
    expect(row!.status).toBe("approved");
    expect(row!.publishAttempts).toBe(1);
    expect(row!.lastError).toMatch(/boom/);
    expect(row!.lastAttemptAt).toBeInstanceOf(Date);
  });

  it("the scheduler publishes what is due and skips the rest", async () => {
    const due = await makePost({ platform: "facebook" });
    const later = await makePost({ platform: "facebook", scheduledFor: new Date(Date.now() + 3_600_000) });
    const noDate = await makePost({ platform: "facebook", scheduledFor: null });
    const wornOut = await makePost({ platform: "facebook", publishAttempts: 3, lastError: "old" });

    // Never let the fake Meta "publish" one of the owner's real approved posts.
    const strangers = (await listDuePosts(new Date(), 100)).filter((p) => !p.title.startsWith("zz-test-"));
    expect(strangers, "real approved posts are due — run this test when none are waiting").toEqual([]);

    const tally = await publishDuePosts({ meta: fakeMeta, fetchImpl: photoFetch, store });
    expect(tally.published).toBeGreaterThanOrEqual(1);

    const rows = await getDb().select().from(contentPosts).where(like(contentPosts.title, `${stamp}%`));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(due.id)!.status).toBe("published");
    expect(byId.get(later.id)!.status).toBe("approved");
    expect(byId.get(noDate.id)!.status).toBe("approved");
    expect(byId.get(wornOut.id)!.status).toBe("approved");
  });
});
