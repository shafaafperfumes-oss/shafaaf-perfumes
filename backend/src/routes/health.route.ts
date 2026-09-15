import { Router } from "express";
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
 * Readiness: can this instance serve traffic? Once the database and other
 * dependencies exist, their checks are added here and this returns 503
 * while any of them are unavailable.
 */
healthRouter.get("/ready", (_req, res) => {
  const checks: Record<string, "ok" | "unavailable"> = {};
  const ready = Object.values(checks).every((status) => status === "ok");

  sendSuccess(res, { ready, checks }, undefined, ready ? 200 : 503);
});
