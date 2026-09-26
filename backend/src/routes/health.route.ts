import { Router } from "express";
import { env } from "../config/env.js";
import { isDatabaseConfigured, pingDatabase } from "../db/client.js";
import { sendSuccess } from "../utils/respond.js";

export const healthRouter: Router = Router();

/**
 * Liveness: is the process up? Used by the host's health checks.
 * Intentionally exposes nothing about versions or infrastructure.
 */
healthRouter.get("/health", (_req, res) => {
  sendSuccess(res, {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness: can this instance serve traffic? Each dependency is checked and
 * the endpoint returns 503 while any of them is unavailable, so a host does
 * not send customers to an instance that cannot answer them.
 *
 * A database that is not configured yet is reported as "not-configured"
 * rather than failing, so the API still runs before Supabase is connected.
 */
healthRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, "ok" | "unavailable" | "not-configured"> = {};

  if (isDatabaseConfigured()) {
    checks.database = (await pingDatabase()) ? "ok" : "unavailable";
  } else {
    checks.database = "not-configured";
  }

  // Config-presence only, not a live call to Supabase — keeps /ready fast.
  checks.auth = env.hasAuth ? "ok" : "not-configured";
  // Presence of the Razorpay keys and webhook secret, nothing more — so
  // the owner can confirm a Railway variable landed without exposing it.
  checks.payments = env.hasPayments ? "ok" : "not-configured";
  checks.paymentWebhook = env.hasPaymentWebhook ? "ok" : "not-configured";
  // Same idea for email: is RESEND_API_KEY + ORDER_ALERT_EMAIL set?
  checks.orderAlerts = env.hasOrderAlerts ? "ok" : "not-configured";
  checks.uploads = env.hasStorage ? "ok" : "not-configured";
  // The two ways of being paid with no gateway behind them.
  checks.upi = env.upi ? "ok" : "not-configured";
  checks.cashOnDelivery = env.COD_ENABLED ? "ok" : "not-configured";

  const ready = Object.values(checks).every((status) => status !== "unavailable");

  // Readable detail next to the flags, for the one question the flags
  // cannot answer: *which* UPI id did the variable actually land as? It is
  // not a secret — every paying customer sees it — and showing it is the
  // only way to catch a typo before it sends someone's money to a stranger.
  const settings = {
    upiId: env.upi ? env.upi.vpa : null,
    upiPayeeName: env.upi ? env.upi.payeeName : null,
    codMaxRupees: env.COD_ENABLED ? env.COD_MAX_PAISE / 100 : null,
  };

  sendSuccess(res, { ready, checks, settings }, undefined, ready ? 200 : 503);
});
