import { Router } from "express";
import { z } from "zod";
import { isDatabaseConfigured } from "../db/client.js";
import { listActiveSizes, logFragranceQuery, searchInspired } from "../repositories/inspired.repository.js";
import { ApiError } from "../utils/api-error.js";
import { sendSuccess } from "../utils/respond.js";

/**
 * Public side of the inspired / custom fragrance list, for the Custom page's
 * search box. Read-only and anonymous. Each search is remembered (the text
 * and the match count only) so the owner can see what people ask for.
 */
export const inspiredRouter: Router = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least two letters.").max(80),
});

inspiredRouter.get("/search", async (req, res, next) => {
  try {
    if (!isDatabaseConfigured()) throw ApiError.serviceUnavailable("Search is not available right now.");
    const { q } = searchQuerySchema.parse(req.query);
    const [matches, sizes] = await Promise.all([searchInspired(q), listActiveSizes()]);
    // Logging must never break the search: a failed insert is not the customer's problem.
    logFragranceQuery(q, matches.length).catch(() => undefined);
    sendSuccess(res, { matches, sizes }, { total: matches.length });
  } catch (error) {
    next(error);
  }
});

inspiredRouter.get("/sizes", async (_req, res, next) => {
  try {
    if (!isDatabaseConfigured()) throw ApiError.serviceUnavailable("Search is not available right now.");
    sendSuccess(res, { sizes: await listActiveSizes() });
  } catch (error) {
    next(error);
  }
});
