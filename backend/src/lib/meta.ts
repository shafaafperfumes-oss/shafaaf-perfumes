import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Meta Graph API: publishing to a Facebook Page and to the Instagram
 * professional account linked to it. Same shape as `email.ts`: plain
 * `fetch`, no SDK, one small client bound to one Page token.
 *
 * The token is read from `META_PAGE_ACCESS_TOKEN` (server only, never sent
 * to a browser, never logged — every error message here is scrubbed of it
 * before it can reach a log line or an admin card). With no token set the
 * API boots and `isMetaConfigured()` lets callers skip publishing.
 *
 * What it can post: one photo + caption to the Page, one photo + caption
 * to Instagram. Reels, stories, WhatsApp status and YouTube are not
 * available this way, so those posts stay "copy and post by hand".
 * See docs/META-SETUP.md for the one-time setup.
 */

const GRAPH_HOST = "https://graph.facebook.com";
/** Meta answers in a few seconds; a container that takes longer is polled below. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Instagram prepares a photo container asynchronously; it is normally ready at once. */
const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_DELAY_MS = 2_000;

export interface MetaClientOptions {
  accessToken: string | undefined;
  pageId: string | undefined;
  /** Optional; looked up from the Page (and remembered) when blank. */
  igUserId?: string;
  graphVersion?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to a real delay. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PublishedMedia {
  /** The platform's id for the post. */
  id: string;
  /** Public link to the post, when Meta reports one. */
  permalink: string | null;
}

export interface MetaAccountSummary {
  page: { id: string; name: string };
  instagram: { id: string; username: string } | null;
}

export class MetaNotConfiguredError extends Error {}
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

/** True when a Page token and Page id are set, i.e. auto-posting can run. */
export function isMetaConfigured(): boolean {
  return env.hasMeta;
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string };
}

/** Meta echoes request parameters in some errors; the token must never survive into a log or a card. */
function scrub(text: string, token: string): string {
  return token ? text.split(token).join("[token]") : text;
}

/**
 * Builds a client bound to one Page token. Exported so tests can drive the
 * exact request sequence against a fake `fetch` with no token in the
 * environment; everything else should use `metaClient` below.
 */
export function createMetaClient(options: MetaClientOptions) {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const version = options.graphVersion ?? "v21.0";
  let igUserId = options.igUserId ?? null;

  function credentials(): { token: string; pageId: string } {
    if (!options.accessToken || !options.pageId) {
      throw new MetaNotConfiguredError("META_PAGE_ACCESS_TOKEN / META_PAGE_ID are not set. See docs/META-SETUP.md.");
    }
    return { token: options.accessToken, pageId: options.pageId };
  }

  /** One Graph call. Every parameter goes in the body / query, the token included, never in a log. */
  async function graph<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
    const { token } = credentials();
    const url = new URL(`${GRAPH_HOST}/${version}/${path.replace(/^\//, "")}`);
    const body = new URLSearchParams({ ...params, access_token: token });
    if (method === "GET") url.search = body.toString();

    const response = await doFetch(url.toString(), {
      method,
      ...(method === "POST" ? { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => null)) as (T & GraphError) | null;

    if (!response.ok || json?.error) {
      const e = json?.error;
      const message = scrub(e?.error_user_msg || e?.message || `Meta responded with HTTP ${response.status}.`, token);
      throw new MetaApiError(message, response.status, e?.code ?? null);
    }
    if (!json) throw new MetaApiError("Meta responded with an empty body.", response.status);
    return json;
  }

  /** The Page and the Instagram account behind the token — the admin's "Check connection". */
  async function whoAmI(): Promise<MetaAccountSummary> {
    const { pageId } = credentials();
    const page = await graph<{ id: string; name: string; instagram_business_account?: { id: string } }>(
      "GET",
      pageId,
      { fields: "id,name,instagram_business_account" },
    );
    const igId = igUserId ?? page.instagram_business_account?.id ?? null;
    let instagram: MetaAccountSummary["instagram"] = null;
    if (igId) {
      const ig = await graph<{ id: string; username: string }>("GET", igId, { fields: "id,username" });
      instagram = { id: ig.id, username: ig.username };
      igUserId = ig.id;
    }
    return { page: { id: page.id, name: page.name }, instagram };
  }

  async function resolveInstagramUserId(): Promise<string> {
    if (igUserId) return igUserId;
    const { pageId } = credentials();
    const page = await graph<{ instagram_business_account?: { id: string } }>("GET", pageId, {
      fields: "instagram_business_account",
    });
    const id = page.instagram_business_account?.id;
    if (!id) {
      throw new MetaApiError(
        "No Instagram professional account is linked to this Facebook Page. Link it in Instagram → Settings → Linked accounts.",
        400,
      );
    }
    igUserId = id;
    return id;
  }

  /**
   * Publishes one photo to the Page. `imageUrl` must be public — Meta
   * downloads it. Resolves to the Page post id and its permalink.
   */
  async function publishFacebookPhoto(input: { imageUrl: string; message: string }): Promise<PublishedMedia> {
    const { pageId } = credentials();
    const photo = await graph<{ id: string; post_id?: string }>("POST", `${pageId}/photos`, {
      url: input.imageUrl,
      message: input.message,
    });
    const postId = photo.post_id ?? photo.id;
    const post = await graph<{ permalink_url?: string }>("GET", postId, { fields: "permalink_url" }).catch(() => null);
    logger.info({ platform: "facebook", postId }, "post published");
    return { id: postId, permalink: post?.permalink_url ?? `https://www.facebook.com/${postId}` };
  }

  /** A text-only Page post, for a draft with no photo. */
  async function publishFacebookText(input: { message: string }): Promise<PublishedMedia> {
    const { pageId } = credentials();
    const post = await graph<{ id: string }>("POST", `${pageId}/feed`, { message: input.message });
    logger.info({ platform: "facebook", postId: post.id }, "post published");
    return { id: post.id, permalink: `https://www.facebook.com/${post.id}` };
  }

  /**
   * Publishes one photo to Instagram: create a container, wait until Meta
   * has fetched the photo, then publish it. Instagram accepts JPEG only,
   * between 4:5 and 1.91:1 — `content-publisher.ts` prepares the file.
   */
  async function publishInstagramImage(input: { imageUrl: string; caption: string }): Promise<PublishedMedia> {
    const user = await resolveInstagramUserId();
    const container = await graph<{ id: string }>("POST", `${user}/media`, {
      image_url: input.imageUrl,
      caption: input.caption,
    });

    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
      const status = await graph<{ status_code?: string; status?: string }>("GET", container.id, {
        fields: "status_code,status",
      });
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new MetaApiError(`Instagram could not prepare the photo (${status.status ?? status.status_code}).`, 400);
      }
      if (attempt === CONTAINER_POLL_ATTEMPTS - 1) {
        throw new MetaApiError("Instagram took too long to prepare the photo. Try again in a minute.", 504);
      }
      await sleep(CONTAINER_POLL_DELAY_MS);
    }

    const media = await graph<{ id: string }>("POST", `${user}/media_publish`, { creation_id: container.id });
    const detail = await graph<{ permalink?: string }>("GET", media.id, { fields: "permalink" }).catch(() => null);
    logger.info({ platform: "instagram", mediaId: media.id }, "post published");
    return { id: media.id, permalink: detail?.permalink ?? null };
  }

  return { whoAmI, resolveInstagramUserId, publishFacebookPhoto, publishFacebookText, publishInstagramImage };
}

export type MetaClient = ReturnType<typeof createMetaClient>;

export const metaClient: MetaClient = createMetaClient({
  accessToken: env.META_PAGE_ACCESS_TOKEN,
  pageId: env.META_PAGE_ID,
  igUserId: env.META_IG_USER_ID,
  graphVersion: env.META_GRAPH_VERSION,
});
