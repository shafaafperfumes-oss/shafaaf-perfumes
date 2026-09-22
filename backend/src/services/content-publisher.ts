import sharp from "sharp";
import { env } from "../config/env.js";
import { isDatabaseConfigured } from "../db/client.js";
import type { ContentPost } from "../db/schema/index.js";
import { isMetaConfigured, MetaApiError, MetaNotConfiguredError, metaClient, type MetaClient } from "../lib/meta.js";
import { isStorageConfigured, uploadProductImage } from "../lib/storage.js";
import { type AuditContext, SYSTEM_ACTOR } from "../repositories/audit.repository.js";
import { ContentStateError, listDuePosts, markPublished, markPublishFailed } from "../repositories/content.repository.js";
import { logger } from "../utils/logger.js";

/**
 * CONTENT PUBLISHER
 * ---------------------------------------------------------------
 * Takes an *approved* post and puts it on Instagram / Facebook. Two ways
 * in: the owner's "Publish now" button (admin route) and the scheduler
 * below, which runs on the server every few minutes and publishes posts
 * whose "Post on" time has passed. Nothing here ever touches a draft.
 *
 * What can go out automatically: an Instagram post (photo + caption) and
 * a Facebook Page post (photo + caption, or text only). Reels, stories,
 * WhatsApp status and YouTube have no API road here, so those posts are
 * refused with a clear message and stay for the owner to copy by hand.
 *
 * Photos: Instagram accepts JPEG only, between 4:5 (tall) and 1.91:1
 * (wide), fetched from a public URL. Most product photos are WebP and
 * taller than 4:5, so the file is converted to JPEG at full resolution
 * and, when needed, given side bars in the site's ivory — never cropped,
 * never resized — then stored in the public photo bucket for Meta to
 * download. The site's own photo is left untouched.
 */

/** Same words the admin's "Copy caption" button copies. */
export function renderCaption(post: Pick<ContentPost, "caption" | "hashtags">): string {
  const hashtags = post.hashtags.trim();
  return hashtags ? `${post.caption.trim()}\n\n${hashtags}` : post.caption.trim();
}

/** Why a post cannot go out by itself, or null when it can. */
export function autoPostBlocker(post: Pick<ContentPost, "platform" | "kind" | "imageUrl">): string | null {
  if (post.platform === "youtube") return "YouTube Shorts are posted by hand: use the caption as the video plan.";
  if (post.platform === "whatsapp") return "WhatsApp Status has no posting API: copy the caption into WhatsApp.";
  if (post.kind !== "post") return `Instagram/Facebook ${post.kind}s are posted by hand: copy the caption.`;
  if (post.platform === "instagram" && !post.imageUrl) return "Instagram needs a photo: add one, or copy the caption.";
  return null;
}

const IG_MIN_RATIO = 0.8; // 4:5
const IG_MAX_RATIO = 1.91;
/** The site's page background (`--c-ivory`), used for the bars a tall photo gets. */
const PAD_COLOUR = { r: 0xfa, g: 0xf7, b: 0xf2 };
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export class PublishError extends Error {}

/** Turns "images/x.webp" into a public URL; absolute URLs pass through. */
export function resolveImageUrl(imageUrl: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (!env.publicSiteUrl) {
    throw new PublishError("The server does not know the site's public address yet (SITE_PUBLIC_URL), so it cannot fetch the photo.");
  }
  return `${env.publicSiteUrl}/${imageUrl.replace(/^\/+/, "")}`;
}

async function fetchPhoto(url: string, doFetch: typeof fetch): Promise<Buffer> {
  const response = await doFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new PublishError(`Could not fetch the photo (${response.status}) from ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new PublishError(`The photo at ${url} is empty.`);
  if (bytes.length > MAX_PHOTO_BYTES) throw new PublishError("The photo is larger than 12 MB.");
  return bytes;
}

/**
 * Pure: a JPEG Meta will accept. Keeps every pixel — converts the format
 * and, for Instagram, adds ivory bars to bring a too-tall or too-wide
 * photo inside the allowed ratio. Exported for tests.
 */
export async function prepareForMeta(bytes: Buffer, platform: "instagram" | "facebook"): Promise<{ jpeg: Buffer; padded: boolean }> {
  const image = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new PublishError("The photo could not be read.");

  let padded = false;
  if (platform === "instagram") {
    const ratio = meta.width / meta.height;
    if (ratio < IG_MIN_RATIO) {
      const width = Math.ceil(meta.height * IG_MIN_RATIO);
      const extra = width - meta.width;
      image.extend({ left: Math.floor(extra / 2), right: Math.ceil(extra / 2), background: PAD_COLOUR });
      padded = true;
    } else if (ratio > IG_MAX_RATIO) {
      const height = Math.ceil(meta.width / IG_MAX_RATIO);
      const extra = height - meta.height;
      image.extend({ top: Math.floor(extra / 2), bottom: Math.ceil(extra / 2), background: PAD_COLOUR });
      padded = true;
    }
  }

  // Flatten drops any transparency onto ivory (JPEG has no alpha); quality
  // 92 with full chroma keeps the owner's renders visibly identical.
  const jpeg = await image.flatten({ background: PAD_COLOUR }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  return { jpeg, padded };
}

export interface PublisherDeps {
  meta?: MetaClient;
  fetchImpl?: typeof fetch;
  /** Stores the prepared JPEG somewhere public and returns its URL. */
  store?: (jpeg: Buffer, postId: string) => Promise<string>;
}

async function storeForMeta(jpeg: Buffer, postId: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new PublishError("Photo storage is not configured on this server (SUPABASE_SERVICE_ROLE_KEY), so the photo cannot be handed to Meta.");
  }
  const uploaded = await uploadProductImage({ bytes: jpeg, contentType: "image/jpeg", folder: "social" });
  logger.debug({ postId, path: uploaded.path }, "photo stored for Meta");
  return uploaded.url;
}

/**
 * Publishes one approved post and records the outcome. Resolves to the
 * updated row; throws `ContentStateError` for a post that is not
 * approved, `PublishError` / `MetaApiError` when Meta or the photo fails
 * (after recording the failure on the row).
 */
export async function publishPost(post: ContentPost, actor: AuditContext = SYSTEM_ACTOR, deps: PublisherDeps = {}): Promise<ContentPost> {
  if (post.status !== "approved") throw new ContentStateError("Only an approved post can be published.");
  const blocker = autoPostBlocker(post);
  if (blocker) throw new ContentStateError(blocker);

  const meta = deps.meta ?? metaClient;
  const doFetch = deps.fetchImpl ?? fetch;
  const store = deps.store ?? storeForMeta;
  const platform = post.platform as "instagram" | "facebook";
  const caption = renderCaption(post);

  try {
    let result: { id: string; permalink: string | null };
    if (post.imageUrl) {
      const source = resolveImageUrl(post.imageUrl);
      const { jpeg, padded } = await prepareForMeta(await fetchPhoto(source, doFetch), platform);
      const publicUrl = await store(jpeg, post.id);
      logger.info({ postId: post.id, platform, source, padded }, "photo prepared for Meta");
      result =
        platform === "instagram"
          ? await meta.publishInstagramImage({ imageUrl: publicUrl, caption })
          : await meta.publishFacebookPhoto({ imageUrl: publicUrl, message: caption });
    } else {
      result = await meta.publishFacebookText({ message: caption });
    }
    return await markPublished(actor, post.id, { externalRef: result.permalink ?? result.id, publishedAt: new Date() });
  } catch (error) {
    if (error instanceof ContentStateError) throw error;
    const message =
      error instanceof MetaNotConfiguredError || error instanceof MetaApiError || error instanceof PublishError
        ? error.message
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error.";
    logger.warn({ postId: post.id, platform, err: message }, "post could not be published");
    await markPublishFailed(actor, post.id, message).catch((recordError) => {
      logger.error({ err: recordError, postId: post.id }, "could not record the failed publish attempt");
    });
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* The scheduler                                                        */
/* ------------------------------------------------------------------ */

let running = false;

/** One pass: publish every approved post whose time has come. Safe to call often; overlapping calls are skipped. */
export async function publishDuePosts(deps: PublisherDeps = {}): Promise<{ published: number; failed: number }> {
  if (running) return { published: 0, failed: 0 };
  running = true;
  const tally = { published: 0, failed: 0 };
  try {
    const due = await listDuePosts(new Date());
    for (const post of due) {
      try {
        await publishPost(post, SYSTEM_ACTOR, deps);
        tally.published += 1;
      } catch {
        tally.failed += 1; // already logged and recorded on the row
      }
    }
  } finally {
    running = false;
  }
  return tally;
}

/**
 * Starts the timer from `server.ts`. Silent no-op (with one log line
 * saying why) when Meta or the database is not configured, or when the
 * interval is 0. Returns a stop function for shutdown.
 */
export function startContentPublisher(): () => void {
  if (!isDatabaseConfigured()) return () => {};
  if (!isMetaConfigured()) {
    logger.info("content publisher: off (META_PAGE_ACCESS_TOKEN / META_PAGE_ID not set) — approved posts wait for the owner");
    return () => {};
  }
  if (env.CONTENT_PUBLISHER_INTERVAL_MS === 0) {
    logger.info("content publisher: scheduler off (CONTENT_PUBLISHER_INTERVAL_MS=0); 'Publish now' still works");
    return () => {};
  }

  const tick = () => {
    publishDuePosts()
      .then((t) => {
        if (t.published || t.failed) logger.info(t, "content publisher: pass complete");
      })
      .catch((error) => logger.error({ err: error }, "content publisher: pass failed"));
  };
  // First look shortly after boot (the database is warm by then), then on the interval.
  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, env.CONTENT_PUBLISHER_INTERVAL_MS);
  first.unref();
  timer.unref();
  logger.info({ everyMs: env.CONTENT_PUBLISHER_INTERVAL_MS }, "content publisher: on");
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
