import { Router } from "express";
import { z } from "zod";
import { variantTypeEnum } from "../db/schema/index.js";
import {
  ProductNotFoundError,
  SkuTakenError,
  SlugTakenError,
  UnknownCategoryError,
  createCategory,
  createProduct,
  createVariant,
  getAdminProduct,
  listAdminProducts,
  listCategories,
  updateCategory,
  updateProduct,
  updateVariant,
} from "../repositories/admin-catalog.repository.js";
import {
  InvalidAdjustmentError,
  VariantNotFoundError,
  adjustStock,
  listLowStock,
} from "../repositories/admin-inventory.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { auditContext, pageQuerySchema, assertAdminDatabaseReady } from "./admin-shared.js";

/**
 * Catalog and stock management. Mounted inside `admin.route.ts`, which is
 * where `requireAuth` + `requireRole("admin")` are applied — every route
 * in this file is unreachable without a server-verified admin role.
 */
export const adminCatalogRouter: Router = Router();

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only.");

const productBodySchema = z
  .object({
    slug,
    name: z.string().min(1).max(160),
    familyId: z.string().uuid().nullish(),
    gender: z.string().min(1).max(24).optional(),
    description: z.string().max(5000).optional(),
    heroImageUrl: z.string().max(2000).nullish(),
    heroImageAlt: z.string().max(300).nullish(),
    isBestseller: z.boolean().optional(),
    isNew: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(32_000).optional(),
  })
  .strict();

const productChangesSchema = productBodySchema.partial().extend({ isActive: z.boolean().optional() }).strict();

const variantBodySchema = z
  .object({
    sku: z.string().min(1).max(64),
    variantType: z.enum(variantTypeEnum.enumValues),
    sizeLabel: z.string().min(1).max(24),
    sizeMl: z.number().int().positive().max(32_000),
    // Paise, not rupees: this is the number the database actually stores,
    // and a decimal rupee value here is exactly the rounding bug the
    // paise-only rule exists to prevent.
    pricePaise: z.number().int().positive(),
    compareAtPricePaise: z.number().int().positive().nullish(),
    position: z.number().int().min(0).max(32_000).optional(),
    quantity: z.number().int().min(0).optional(),
  })
  .strict();

const variantChangesSchema = z
  .object({
    sizeLabel: z.string().min(1).max(24).optional(),
    pricePaise: z.number().int().positive().optional(),
    compareAtPricePaise: z.number().int().positive().nullish(),
    isActive: z.boolean().optional(),
    position: z.number().int().min(0).max(32_000).optional(),
  })
  .strict();

const categoryBodySchema = z
  .object({
    slug: slug.max(80),
    name: z.string().min(1).max(80),
    description: z.string().max(2000).nullish(),
    sortOrder: z.number().int().min(0).max(32_000).optional(),
  })
  .strict();

const adjustStockSchema = z
  .object({
    variantId: z.string().uuid(),
    /** Relative change: +10 received a delivery, -1 broke a bottle. */
    delta: z.number().int().refine((value) => value !== 0, "Enter how much to add or remove."),
    note: z.string().min(1).max(300),
  })
  .strict();

const productListQuerySchema = pageQuerySchema.extend({
  search: z.string().max(120).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

function handleCatalogError(error: unknown, next: (error: unknown) => void): void {
  if (error instanceof SlugTakenError || error instanceof SkuTakenError) {
    next(ApiError.conflict(error.message));
    return;
  }
  if (error instanceof ProductNotFoundError || error instanceof VariantNotFoundError) {
    next(ApiError.notFound(error.message));
    return;
  }
  if (error instanceof UnknownCategoryError) {
    next(ApiError.badRequest(error.message));
    return;
  }
  if (error instanceof InvalidAdjustmentError) {
    next(ApiError.conflict(error.message, { quantity: error.quantity, reserved: error.reserved }));
    return;
  }
  next(error);
}

adminCatalogRouter.get("/products", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const query = productListQuerySchema.parse(req.query);
    const { products, total } = await listAdminProducts(query);
    sendSuccess(res, { products }, { page: query.page, perPage: query.perPage, total });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.get("/products/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const product = await getAdminProduct(req.params.id);
    if (!product) throw ApiError.notFound("No product matches that id.");
    sendSuccess(res, { product });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.post("/products", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const input = productBodySchema.parse(req.body);
    const product = await createProduct(auditContext(req), input);
    sendSuccess(res, { product }, undefined, 201);
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.patch("/products/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const changes = productChangesSchema.parse(req.body);
    const product = await updateProduct(auditContext(req), req.params.id, changes);
    if (!product) throw ApiError.notFound("No product matches that id.");
    sendSuccess(res, { product });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.post("/products/:id/variants", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const input = variantBodySchema.parse(req.body);
    const variant = await createVariant(auditContext(req), req.params.id, input);
    sendSuccess(res, { variant }, undefined, 201);
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.patch("/variants/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const changes = variantChangesSchema.parse(req.body);
    const variant = await updateVariant(auditContext(req), req.params.id, changes);
    if (!variant) throw ApiError.notFound("No variant matches that id.");
    sendSuccess(res, { variant });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.get("/categories", async (_req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const categories = await listCategories();
    sendSuccess(res, { categories }, { total: categories.length });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.post("/categories", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const input = categoryBodySchema.parse(req.body);
    const category = await createCategory(auditContext(req), input);
    sendSuccess(res, { category }, undefined, 201);
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.patch("/categories/:id", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const changes = categoryBodySchema.partial().strict().parse(req.body);
    const category = await updateCategory(auditContext(req), req.params.id, changes);
    if (!category) throw ApiError.notFound("No category matches that id.");
    sendSuccess(res, { category });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.get("/inventory/low-stock", async (_req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const variants = await listLowStock();
    sendSuccess(res, { variants }, { total: variants.length });
  } catch (error) {
    handleCatalogError(error, next);
  }
});

adminCatalogRouter.post("/inventory/adjust", async (req, res, next) => {
  try {
    assertAdminDatabaseReady();
    const input = adjustStockSchema.parse(req.body);
    const stock = await adjustStock(auditContext(req), input.variantId, input.delta, input.note);
    sendSuccess(res, { stock });
  } catch (error) {
    handleCatalogError(error, next);
  }
});
