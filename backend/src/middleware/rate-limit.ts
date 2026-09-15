import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

/**
 * Rate limiting is deliberately tiered: browsing the catalogue is cheap and
 * gets a generous budget, while login and payment endpoints get a tight one
 * because those are what attackers hammer.
 */
function buildLimiter(windowMs: number, max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Never rate-limit the test suite; it would make tests order-dependent.
    skip: () => env.isTest,
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests());
    },
  });
}

/** Applied to every API request. */
export const generalLimiter = buildLimiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX);

/** For authentication, password reset, checkout and payment routes. */
export const strictLimiter = buildLimiter(15 * 60_000, 20);
