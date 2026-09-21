import { Router } from "express";
import { z } from "zod";
import {
  InspiredDuplicateError,
  InspiredNotFoundError,
  SizeNotFoundError,
  createInspired,
  importInspired,
  listAllSizes,
  listInspired,
  topFragranceQueries,
  updateInspired,
  updateSize,
} from "../repositories/inspired.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { assertAdminDatabaseReady, auditContext, pageQuerySchema } from "./admin-shared.js";

/**
 * Admin side of the inspired / custom fragrance list. Mounted inside
 * `admin.route.ts`, so every route here already sits behind the
 * server-verified admin role check.
 */
export const adminInspiredRouter: Router = Router();

const gender = z.enum(["Men", "Women", "Unisex"]).nullable();

const entrySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    inspiredBy: z.string().trim().min(1).max(120),
    gender: gender.optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

const entryChangesSchema = entrySchema.partial().strict();

const importSchema = z.object({ rows: z.array(entrySchema.omit({ isAvailable: true })).min(1).max(2000) }).strict();

const sizeChangesSchema = z
  .object({
    // Paise, like every price in this API; null clears the price ("ask on WhatsApp").
    pricePaise: z.number().int().positive().max(100_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const listQuerySchema = pageQuerySchema.extend({ search: z.string().trim().max(80).optional() });

adminInspiredRouter.get("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = listQuerySchema.parse(req.query);
    const { items, total } = await listInspired(query);
    sendSuccess(res, { fragrances: items }, { total, page: query.page, perPage: query.perPage });
  } catch (error) {
    next(error);
  }
});

adminInspiredRouter.post("/", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const fragrance = await createInspired(auditContext(req), entrySchema.parse(req.body));
    sendSuccess(res, { fragrance }, undefined, 201);
  } catch (error) {
    next(error instanceof InspiredDuplicateError ? ApiError.conflict(error.message) : error);
  }
});

adminInspiredRouter.post("/import", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const { rows } = importSchema.parse(req.body);
    sendSuccess(res, await importInspired(auditContext(req), rows));
  } catch (error) {
    next(error);
  }
});

adminInspiredRouter.patch("/sizes/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const id = z.string().uuid().parse(req.params.id);
    const size = await updateSize(auditContext(req), id, sizeChangesSchema.parse(req.body));
    sendSuccess(res, { size });
  } catch (error) {
    next(error instanceof SizeNotFoundError ? ApiError.notFound(error.message) : error);
  }
});

adminInspiredRouter.get("/sizes", async (_req, res, next) => {
  try {
    assertAdminDatabaseReady();
    sendSuccess(res, { sizes: await listAllSizes() });
  } catch (error) {
    next(error);
  }
});

adminInspiredRouter.get("/queries", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    sendSuccess(res, { queries: await topFragranceQueries(days) }, { days });
  } catch (error) {
    next(error);
  }
});

adminInspiredRouter.patch("/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const id = z.string().uuid().parse(req.params.id);
    const fragrance = await updateInspired(auditContext(req), id, entryChangesSchema.parse(req.body));
    sendSuccess(res, { fragrance });
  } catch (error) {
    next(
      error instanceof InspiredNotFoundError
        ? ApiError.notFound(error.message)
        : error instanceof InspiredDuplicateError
          ? ApiError.conflict(error.message)
          : error,
    );
  }
});
