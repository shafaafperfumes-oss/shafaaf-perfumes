import { Router } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "../repositories/address.repository.js";
import { getProfileById, updateProfile } from "../repositories/profile.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * The signed-in customer's own profile and saved addresses. Every route
 * here requires a verified Supabase token, and every query is scoped to
 * that token's own user id — a customer can only ever see or change
 * their own data, never another customer's, regardless of what id
 * appears anywhere in the request.
 *
 * Mounted at its own `/me` prefix (see app.ts) rather than sharing the
 * bare API prefix with other routers — that keeps `requireAuth` (applied
 * with `.use()` below) scoped to requests actually meant for this router,
 * instead of quietly intercepting an unrelated, unmatched path like
 * `/api/v1/does-not-exist` before it ever reaches the 404 handler.
 */
export const meRouter: Router = Router();

meRouter.use(requireAuth);

function assertDatabaseReady(): void {
  if (!isDatabaseConfigured()) {
    throw ApiError.serviceUnavailable("Your account is not available right now.");
  }
}

const profileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160).nullable().optional(),
    phone: z.string().trim().min(6).max(20).nullable().optional(),
  })
  .strict();

const addressInputSchema = z
  .object({
    label: z.string().trim().min(1).max(40).default("Home"),
    recipientName: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(6).max(20),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(12),
    country: z.string().trim().length(2).default("IN"),
    isDefault: z.boolean().default(false),
  })
  .strict();

const addressUpdateSchema = addressInputSchema.partial();

meRouter.get("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const profile = await getProfileById(req.user!.id);
    if (!profile) {
      // The sign-up trigger creates this row; missing means something is
      // wrong upstream, not that the customer did anything invalid.
      throw ApiError.internal("Your profile could not be found.");
    }
    sendSuccess(res, { profile: { ...profile, email: req.user!.email } });
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const changes = profileUpdateSchema.parse(req.body);
    const profile = await updateProfile(req.user!.id, changes);
    if (!profile) {
      throw ApiError.internal("Your profile could not be found.");
    }
    sendSuccess(res, { profile: { ...profile, email: req.user!.email } });
  } catch (error) {
    next(error);
  }
});

meRouter.get("/addresses", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const items = await listAddresses(req.user!.id);
    sendSuccess(res, { addresses: items }, { total: items.length });
  } catch (error) {
    next(error);
  }
});

meRouter.post("/addresses", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = addressInputSchema.parse(req.body);
    const address = await createAddress(req.user!.id, input);
    sendSuccess(res, { address }, undefined, 201);
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/addresses/:id", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const input = addressUpdateSchema.parse(req.body);
    const address = await updateAddress(req.user!.id, req.params.id, input);
    if (!address) {
      throw ApiError.notFound("No saved address matches that id.");
    }
    sendSuccess(res, { address });
  } catch (error) {
    next(error);
  }
});

meRouter.delete("/addresses/:id", async (req, res, next) => {
  try {
    assertDatabaseReady();
    const deleted = await deleteAddress(req.user!.id, req.params.id);
    if (!deleted) {
      throw ApiError.notFound("No saved address matches that id.");
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
