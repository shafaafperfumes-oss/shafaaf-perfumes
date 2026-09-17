import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { requestId } from "../middleware/request-id.js";
import { corsPolicy, securityHeaders } from "../middleware/security.js";
import { generalLimiter, strictLimiter } from "../middleware/rate-limit.js";
import { errorHandler, notFoundHandler } from "../middleware/error-handler.js";
import { adminRouter } from "../routes/admin.route.js";
import { cartRouter } from "../routes/cart.route.js";
import { catalogRouter } from "../routes/catalog.route.js";
import { checkoutRouter } from "../routes/checkout.route.js";
import { healthRouter } from "../routes/health.route.js";
import { meRouter } from "../routes/me.route.js";
import { ordersRouter } from "../routes/orders.route.js";
import { webhooksRouter } from "../routes/webhooks.route.js";
import { wishlistRouter } from "../routes/wishlist.route.js";

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

  // Razorpay's webhook signature is computed over the exact request bytes,
  // so this route gets its own raw-body parser and must be mounted before
  // the general JSON parser below would otherwise consume the body first.
  app.use(
    `${API_PREFIX}/webhooks`,
    generalLimiter,
    express.raw({ type: "application/json", limit: "100kb" }),
    webhooksRouter,
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  app.use(API_PREFIX, generalLimiter);
  app.use(API_PREFIX, healthRouter);
  app.use(API_PREFIX, catalogRouter);
  // Signed-in routes ride on the general limiter above: a shopper nudging
  // quantities in their cart makes a request per tap, which the strict
  // budget (20 per 15 min) would exhaust in minutes. Only checkout, which
  // creates payment intents, keeps the tight limit.
  app.use(`${API_PREFIX}/me`, meRouter);
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/wishlist`, wishlistRouter);
  app.use(`${API_PREFIX}/checkout`, strictLimiter, checkoutRouter);
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
