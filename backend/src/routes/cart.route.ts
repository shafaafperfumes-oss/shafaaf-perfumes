import { Router } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addToCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItemQuantity,
  UnsellableVariantError,
} from "../repositories/cart.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * The signed-in customer's own server-side cart. Every route requires a
 * verified Supabase token and every query is scoped to that token's own
 * user id, same pattern as `me.route.ts` — mounted at its own `/cart`
 * prefix so `requireAuth` only ever applies to requests meant for it.
 */
export const cartRouter: Router = Router();

cartRouter.use(requireAuth);

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("Your cart is not available right now.");
  }
}

const addItemSchema = z
  .object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20).default(1),
  })
  .strict();

const updateQuantitySchema = z
  .object({
    quantity: z.number().int().min(1).max(20),
  })
  .strict();

cartRouter.get("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const cart = await getCart(req.user!.id);
    sendSuccess(res, cart);
  } catch (error) {
    next(error);
  }
});

cartRouter.post("/items", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = addItemSchema.parse(req.body);
    const cart = await addToCart(req.user!.id, input.variantId, input.quantity);
    sendSuccess(res, cart, undefined, 201);
  } catch (error) {
    if (error instanceof UnsellableVariantError) {
      next(ApiError.notFound(error.message));
      return;
    }
    next(error);
  }
});

cartRouter.patch("/items/:itemId", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = updateQuantitySchema.parse(req.body);
    const cart = await updateCartItemQuantity(req.user!.id, req.params.itemId, input.quantity);
    if (!cart) {
      throw ApiError.notFound("No cart item matches that id.");
    }
    sendSuccess(res, cart);
  } catch (error) {
    next(error);
  }
});

cartRouter.delete("/items/:itemId", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const cart = await removeCartItem(req.user!.id, req.params.itemId);
    if (!cart) {
      throw ApiError.notFound("No cart item matches that id.");
    }
    sendSuccess(res, cart);
  } catch (error) {
    next(error);
  }
});

cartRouter.delete("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    await clearCart(req.user!.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
