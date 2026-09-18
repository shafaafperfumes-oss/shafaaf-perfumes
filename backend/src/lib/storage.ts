import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Product photo storage, on Supabase Storage (an S3-style file store that
 * lives next to the database). Same shape as `email.ts`: plain `fetch`
 * against Supabase's Storage REST API, no SDK.
 *
 * Every write goes through the service-role key, which is read from
 * `SUPABASE_SERVICE_ROLE_KEY` — server only, never sent to a browser,
 * never logged. The bucket itself is *public for reading* (a product
 * photo is public by definition: it is on the shop page) and closed for
 * writing to anyone but this server, so the only way to put a file in it
 * is the admin-only upload route.
 *
 * Files are stored exactly as uploaded — the owner's rule is "don't lose
 * pixels", so nothing here resizes or recompresses.
 */

export const PRODUCT_IMAGES_BUCKET = "product-images";

/** Generous: the owner's full-resolution ChatGPT renders are 1–4 MB. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** The image types every browser renders; anything else is refused. */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const REQUEST_TIMEOUT_MS = 30_000;

export class StorageNotConfiguredError extends Error {}
export class StorageError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** True when both the project URL and the service-role key are set. */
export function isStorageConfigured(): boolean {
  return env.hasStorage;
}

function storageBase(): string {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new StorageNotConfiguredError("Photo uploads are not configured on this server.");
  }
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

/**
 * Creates the public bucket the first time it is needed and remembers
 * that it exists for the life of the process. Supabase answers 409 when
 * it is already there, which counts as success.
 */
let bucketReady: Promise<void> | null = null;

export function ensureProductImagesBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = createBucket().catch((error: unknown) => {
      bucketReady = null; // try again on the next upload
      throw error;
    });
  }
  return bucketReady;
}

async function createBucket(): Promise<void> {
  const response = await fetch(`${storageBase()}/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: PRODUCT_IMAGES_BUCKET,
      name: PRODUCT_IMAGES_BUCKET,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: Object.keys(IMAGE_CONTENT_TYPES),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.ok || response.status === 409) {
    if (response.ok) logger.info({ bucket: PRODUCT_IMAGES_BUCKET }, "Created the product images bucket");
    return;
  }
  const detail = await response.text().catch(() => "");
  logger.error({ status: response.status, detail }, "Could not create the product images bucket");
  throw new StorageError("Could not prepare photo storage.", response.status);
}

export interface UploadImageInput {
  bytes: Buffer;
  contentType: string;
  /** Folder inside the bucket, e.g. the product slug; keeps the bucket browsable. */
  folder: string;
}

export interface UploadedImage {
  /** Public, permanent URL — what goes into `hero_image_url` / `image_url`. */
  url: string;
  path: string;
  bytes: number;
  contentType: string;
}

/**
 * Stores one image under `<folder>/<random>.<ext>` and returns its public
 * URL. The random name means re-uploading a photo never overwrites the
 * previous one, so an old URL still cached by a browser keeps working.
 */
export async function uploadProductImage(input: UploadImageInput): Promise<UploadedImage> {
  const ext = IMAGE_CONTENT_TYPES[input.contentType];
  if (!ext) throw new StorageError("Only JPEG, PNG, WebP or AVIF images can be uploaded.", 415);
  if (input.bytes.length === 0) throw new StorageError("The uploaded file is empty.", 400);
  if (input.bytes.length > MAX_IMAGE_BYTES) {
    throw new StorageError(`Images must be ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB or smaller.`, 413);
  }

  await ensureProductImagesBucket();

  const folder = input.folder.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "misc";
  const path = `${folder}/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;

  const response = await fetch(`${storageBase()}/object/${PRODUCT_IMAGES_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": input.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: new Uint8Array(input.bytes),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error({ status: response.status, detail, path }, "Product image upload failed");
    throw new StorageError("The photo could not be stored. Please try again.", response.status);
  }

  return {
    url: `${storageBase()}/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`,
    path,
    bytes: input.bytes.length,
    contentType: input.contentType,
  };
}
