import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getProfileById } from "../repositories/profile.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Nothing administrative actually lives here yet (that starts in Phase 8) —
 * this one route exists to prove, end to end, that a customer account
 * cannot reach an admin route and an admin account can. Real admin
 * endpoints added later reuse the same `requireAuth, requireRole("admin")`
 * pair. Mounted at its own `/admin` prefix (see app.ts) for the same
 * reason meRouter is mounted at `/me`.
 */
export const adminRouter: Router = Router();

adminRouter.get("/whoami", requireAuth, requireRole("admin"), async (req, res, next) => {
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
