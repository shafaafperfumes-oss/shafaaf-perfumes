import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

/** Standard hardening headers (CSP, nosniff, frameguard, HSTS in production). */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: env.isProduction ? undefined : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
}

/**
 * Only the storefront's own origins may call this API from a browser.
 * Requests without an Origin header (server-to-server, health checks,
 * curl) are allowed through — CORS is a browser protection, not auth.
 */
export function corsPolicy(): RequestHandler {
  const options: CorsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.corsAllowedOrigins.includes(origin)) return callback(null, true);
      callback(ApiError.forbidden("Origin not allowed."));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  };
  return cors(options);
}
