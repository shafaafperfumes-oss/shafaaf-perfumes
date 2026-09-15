import { Router } from "express";
import { isDatabaseConfigured } from "../db/client.js";
import { getActiveProductBySlug, listActiveProducts } from "../repositories/catalog.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Public catalog endpoints — read-only, no login required, safe for any
 * visitor's browser to call directly. Nothing here accepts data that
 * changes the database; that starts in a later phase behind auth checks.
 */
export const catalogRouter: Router = Router();

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("The catalog is not available right now.");
  }
}

catalogRouter.get("/products", async (_req, res, next) => {
  try {
    assertDatabaseReady();
    const items = await listActiveProducts();
    sendSuccess(res, { products: items }, { total: items.length });
  } catch (error) {
    next(error);
  }
});

catalogRouter.get("/products/:id", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const product = await getActiveProductBySlug(req.params.id);
    if (!product) {
      throw ApiError.notFound(`No product matches "${req.params.id}".`);
    }
    sendSuccess(res, { product });
  } catch (error) {
    next(error);
  }
});
