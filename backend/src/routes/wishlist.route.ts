import { Router } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addToWishlist,
  listWishlist,
  removeFromWishlist,
  UnknownProductError,
} from "../repositories/wishlist.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * The signed-in customer's own wishlist. Same pattern as `cart.route.ts`:
 * mounted at its own prefix, `requireAuth` on every route, every query
 * scoped to the token's own user id.
 */
export const wishlistRouter: Router = Router();

wishlistRouter.use(requireAuth);

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("Your wishlist is not available right now.");
  }
}

const addSchema = z.object({ productId: z.string().uuid() }).strict();

wishlistRouter.get("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const items = await listWishlist(req.user!.id);
    sendSuccess(res, { items }, { total: items.length });
  } catch (error) {
    next(error);
  }
});

wishlistRouter.post("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = addSchema.parse(req.body);
    await addToWishlist(req.user!.id, input.productId);
    const items = await listWishlist(req.user!.id);
    sendSuccess(res, { items }, { total: items.length }, 201);
  } catch (error) {
    if (error instanceof UnknownProductError) {
      next(ApiError.notFound(error.message));
      return;
    }
    next(error);
  }
});

wishlistRouter.delete("/:productId", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const removed = await removeFromWishlist(req.user!.id, req.params.productId);
    if (!removed) {
      throw ApiError.notFound("That product is not on your wishlist.");
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
