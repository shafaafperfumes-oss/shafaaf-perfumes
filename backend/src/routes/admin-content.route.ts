import { Router } from "express";
import { z } from "zod";
import { CONTENT_KINDS, CONTENT_PLATFORMS, CONTENT_STATUSES } from "../db/schema/index.js";
import {
  ContentNotFoundError,
  ContentStateError,
  createContentPost,
  deleteContentPost,
  getContentPost,
  listContent,
  updateContentPost,
} from "../repositories/content.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { assertAdminDatabaseReady, auditContext, pageQuerySchema } from "./admin-shared.js";

/**
 * The owner's Content tab: social post drafts to approve, edit or reject.
 * Mounted inside `admin.route.ts`, behind the server-verified admin check.
 * There is no public side to this at all.
 */
export const adminContentRouter: Router = Router();

const platform = z.enum(CONTENT_PLATFORMS);
const kind = z.enum(CONTENT_KINDS);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const postSchema = z
  .object({
    platform,
    kind: kind.optional(),
    title: z.string().trim().min(1).max(160),
    caption: z.string().trim().min(1).max(4000),
    hashtags: z.string().trim().max(1000).optional(),
    imageUrl: optionalText(500),
    productSlug: optionalText(120),
    agentNote: optionalText(2000),
    scheduledFor: z.coerce.date().nullable().optional(),
  })
  .strict();

// An admin may move a post between draft / approved / rejected. "published"
// is deliberately absent: only the publisher sets it, once it has gone out.
const changesSchema = postSchema
  .partial()
  .extend({
    status: z.enum(["draft", "approved", "rejected"]).optional(),
    ownerNote: optionalText(2000),
  })
  .strict();

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  platform: platform.optional(),
});

function mapError(error: unknown): unknown {
  if (error instanceof ContentNotFoundError) return ApiError.notFound(error.message);
  if (error instanceof ContentStateError) return ApiError.conflict(error.message);
  return error;
}

adminContentRouter.get("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = listQuerySchema.parse(req.query);
    const { items, total, counts } = await listContent(query);
    sendSuccess(res, { posts: items }, { total, page: query.page, perPage: query.perPage, counts });
  } catch (error) {
    next(error);
  }
});

adminContentRouter.post("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const post = await createContentPost(auditContext(req), postSchema.parse(req.body));
    sendSuccess(res, { post }, undefined, 201);
  } catch (error) {
    next(error);
  }
});

adminContentRouter.get("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const post = await getContentPost(z.string().uuid().parse(req.params.id));
    sendSuccess(res, { post });
  } catch (error) {
    next(mapError(error));
  }
});

adminContentRouter.patch("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const id = z.string().uuid().parse(req.params.id);
    const post = await updateContentPost(auditContext(req), id, changesSchema.parse(req.body));
    sendSuccess(res, { post });
  } catch (error) {
    next(mapError(error));
  }
});

adminContentRouter.delete("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    await deleteContentPost(auditContext(req), z.string().uuid().parse(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(mapError(error));
  }
});
