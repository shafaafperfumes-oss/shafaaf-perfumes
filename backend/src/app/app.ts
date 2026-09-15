import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { requestId } from "../middleware/request-id.js";
import { corsPolicy, securityHeaders } from "../middleware/security.js";
import { generalLimiter, strictLimiter } from "../middleware/rate-limit.js";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import { adminRouter } from "../routes/admin.route.js";
import { catalogRouter } from "../routes/catalog.route.js";
import { healthRouter } from "../routes/health.route.js";
import { meRouter } from "../routes/me.route.js";

export const API_PREFIX = "/api/v1";

/**
 * Builds the Express app without starting a server, so tests can drive it
 * in-process and the entry point stays a thin wrapper.
 *
 * Middleware order matters: request id first (everything downstream logs
 * it), then security, then parsing, then routes, then the error handler
 * last so it can catch everything above it.
 */
export function createApp(): Express {
  const app = express();

  // Behind a load balancer / proxy, trust its forwarded headers so rate
  // limiting sees the real client IP rather than the proxy's.
  app.set("trust proxy", env.isProduction ? 1 : false);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? "unknown",
      autoLogging: { ignore: (req) => req.url === `${API_PREFIX}/health` },
    }),
  );

  app.use(securityHeaders());
  app.use(corsPolicy());

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  app.use(API_PREFIX, generalLimiter);
  app.use(API_PREFIX, healthRouter);
  app.use(API_PREFIX, catalogRouter);
  app.use(`${API_PREFIX}/me`, strictLimiter, meRouter);
  app.use(`${API_PREFIX}/admin`, strictLimiter, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
