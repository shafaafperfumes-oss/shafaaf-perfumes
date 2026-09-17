import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp, API_PREFIX } from "../src/app/app.js";

const app = createApp();

describe("health endpoints", () => {
  it("reports liveness in the success envelope", async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(typeof res.body.data.uptimeSeconds).toBe("number");
  });

  it("reports readiness", async () => {
    const res = await request(app).get(`${API_PREFIX}/ready`);

    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(true);
  });

  it("reports the database in its readiness checks", async () => {
    const res = await request(app).get(`${API_PREFIX}/ready`);

    expect(["ok", "not-configured", "unavailable"]).toContain(res.body.data.checks.database);
  });

  it("reports whether payments are configured, without any key material", async () => {
    const res = await request(app).get(`${API_PREFIX}/ready`);

    expect(["ok", "not-configured"]).toContain(res.body.data.checks.payments);
    expect(["ok", "not-configured"]).toContain(res.body.data.checks.paymentWebhook);
    expect(JSON.stringify(res.body)).not.toMatch(/rzp_(test|live)_/);
  });

  it("never reveals the database host or password in the readiness body", async () => {
    const res = await request(app).get(`${API_PREFIX}/ready`);

    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|password/i);
  });

  it("returns a request id header that clients can quote in support", async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.headers["x-request-id"]).toMatch(/[\w-]{8,}/);
  });
});

describe("security posture", () => {
  it("sets hardening headers", async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("does not advertise the server technology", async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects a browser origin that is not allow-listed", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/health`)
      .set("Origin", "https://attacker.example");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("error handling", () => {
  it("returns a safe 404 envelope for unknown routes", async () => {
    const res = await request(app).get(`${API_PREFIX}/does-not-exist`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("never leaks a stack trace to the client", async () => {
    const res = await request(app).get(`${API_PREFIX}/does-not-exist`);

    expect(JSON.stringify(res.body)).not.toMatch(/at .+:\d+:\d+/);
    expect(res.body.error).not.toHaveProperty("stack");
  });

  it("rejects malformed JSON without exposing parser internals", async () => {
    const res = await request(app)
      .post(`${API_PREFIX}/health`)
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|body-parser/);
  });
});
