import express, { Router } from "express";
import { z } from "zod";
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  StorageError,
  StorageNotConfiguredError,
  isStorageConfigured,
  uploadProductImage,
} from "../lib/storage.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Photo uploads. Mounted inside `admin.route.ts`, behind the same
 * `requireAuth` + `requireRole("admin")` as every other admin route.
 *
 * The browser sends the file as the raw request body with its own
 * `Content-Type` (image/jpeg, image/png, …) — no multipart parsing, no
 * extra dependency. Anything that is not one of the accepted image types
 * never reaches the handler: `express.raw` only parses those, so `req.body`
 * stays empty and the route answers 415.
 */
export const adminUploadsRouter: Router = Router();

const uploadQuerySchema = z.object({
  /** Which product the photo belongs to; becomes the folder in the bucket. */
  folder: z.string().min(1).max(120).default("misc"),
});

adminUploadsRouter.post(
  "/product-image",
  express.raw({ type: Object.keys(IMAGE_CONTENT_TYPES), limit: MAX_IMAGE_BYTES }),
  async (req, res, next) => {
    try {
      if (!isStorageConfigured()) {
        throw ApiError.serviceUnavailable("Photo uploads are not configured on this server.");
      }
      const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (!IMAGE_CONTENT_TYPES[contentType] || !Buffer.isBuffer(req.body)) {
        throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Only JPEG, PNG, WebP or AVIF images can be uploaded.");
      }
      const { folder } = uploadQuerySchema.parse(req.query);
      const image = await uploadProductImage({ bytes: req.body, contentType, folder });
      sendSuccess(res, { image }, undefined, 201);
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) {
        next(ApiError.serviceUnavailable(error.message));
      } else if (error instanceof StorageError) {
        next(new ApiError(error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502, "UPLOAD_FAILED", error.message));
      } else {
        next(error);
      }
    }
  },
);
