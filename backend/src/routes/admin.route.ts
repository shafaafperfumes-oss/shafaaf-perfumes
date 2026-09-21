import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getProfileById } from "../repositories/profile.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";
import { adminCatalogRouter } from "./admin-catalog.route.js";
import { adminAuditLogsRouter, adminCustomersRouter } from "./admin-customers.route.js";
import { adminInspiredRouter } from "./admin-inspired.route.js";
import { adminOrdersRouter } from "./admin-orders.route.js";
import { adminUploadsRouter } from "./admin-uploads.route.js";

/**
 * THE ADMIN DOOR
 * ---------------------------------------------------------------
 * The role check lives here, once, on the whole router — so a new admin
 * route added to any file below cannot accidentally be published without
 * it. `requireRole` reads the caller's role from our own `profiles` table
 * on every request, never from the token, so a customer cannot reach any
 * of this by editing what their browser sends.
 *
 * Every change made through these routes writes a row to `audit_logs`, in
 * the same database transaction as the change itself.
 */
export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireRole("admin"));

/** Proves, end to end, that a customer account cannot get through this door. */
adminRouter.get("/whoami", async (req, res, next) => {
  try {
    const profile = await getProfileById(req.user!.id);
    if (!profile) {
      throw ApiError.internal("Your profile could not be found.");
    }
    sendSuccess(res, { profile: { ...profile, email: req.user!.email } });
  } catch (error) {
    next(error);
  }
});

adminRouter.use("/", adminCatalogRouter);
adminRouter.use("/orders", adminOrdersRouter);
adminRouter.use("/customers", adminCustomersRouter);
adminRouter.use("/audit-logs", adminAuditLogsRouter);
adminRouter.use("/uploads", adminUploadsRouter);
adminRouter.use("/inspired", adminInspiredRouter);
