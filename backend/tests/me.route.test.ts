import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { profiles } from "../src/db/schema/index.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

/**
 * `requireAuth` checks whether Supabase is configured at all before it
 * looks at any token — an honest "this feature isn't available" beats a
 * misleading "you're not logged in" when SUPABASE_URL is simply unset.
 * The two describe blocks below cover each of those states; exactly one
 * of them runs depending on this environment's own .env.
 */
const describeAuthNotConfigured = env.hasAuth ? describe.skip : describe;
const describeAuthConfigured = env.hasAuth ? describe : describe.skip;

describeAuthNotConfigured("when sign-in is not configured", () => {
  it("reports the account feature as unavailable, not as a login failure", async () => {
    const res = await request(app).get(`${API_PREFIX}/me`);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("applies the same check to admin routes", async () => {
    const res = await request(app).get(`${API_PREFIX}/admin/whoami`);

    expect(res.status).toBe(503);
  });
});

describeAuthConfigured("authentication is required", () => {
  it("rejects a request with no token", async () => {
    const res = await request(app).get(`${API_PREFIX}/me`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a header that is not a bearer token", async () => {
    const res = await request(app).get(`${API_PREFIX}/me`).set("Authorization", "Basic abc123");

    expect(res.status).toBe(401);
  });

  it("rejects a token that is not validly signed", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/me`)
      .set("Authorization", "Bearer this-is-not-a-real-jwt");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("never leaks internal detail on an invalid token", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/me`)
      .set("Authorization", "Bearer this-is-not-a-real-jwt");

    expect(JSON.stringify(res.body)).not.toMatch(/jose|jwks|postgres/i);
  });

  it("blocks admin routes the same way", async () => {
    const res = await request(app).get(`${API_PREFIX}/admin/whoami`);

    expect(res.status).toBe(401);
  });
});

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("a signed-in customer", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createSignedInTestUser();
  }, 30_000);

  afterAll(async () => {
    await user?.cleanup();
    await closeDatabase();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  it("gets a profile automatically, created by the sign-up trigger", async () => {
    const res = await auth(request(app).get(`${API_PREFIX}/me`));

    expect(res.status).toBe(200);
    expect(res.body.data.profile.id).toBe(user.id);
    expect(res.body.data.profile.role).toBe("customer");
    expect(res.body.data.profile.email).toBe(user.email);
  });

  it("updates its own name and phone", async () => {
    const res = await auth(request(app).patch(`${API_PREFIX}/me`)).send({
      fullName: "Test Customer",
      phone: "9999999999",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.profile.fullName).toBe("Test Customer");
    expect(res.body.data.profile.phone).toBe("9999999999");
  });

  it("rejects an update with an unknown field", async () => {
    const res = await auth(request(app).patch(`${API_PREFIX}/me`)).send({ role: "admin" });

    expect(res.status).toBe(422);
  });

  it("cannot reach an admin route", async () => {
    const res = await auth(request(app).get(`${API_PREFIX}/admin/whoami`));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  describe("saved addresses", () => {
    let addressId: string;

    it("starts with none", async () => {
      const res = await auth(request(app).get(`${API_PREFIX}/me/addresses`));

      expect(res.status).toBe(200);
      expect(res.body.data.addresses).toEqual([]);
    });

    it("adds one", async () => {
      const res = await auth(request(app).post(`${API_PREFIX}/me/addresses`)).send({
        label: "Home",
        recipientName: "Test Customer",
        phone: "9999999999",
        line1: "1 Test Lane",
        city: "Srinagar",
        state: "Jammu and Kashmir",
        postalCode: "190001",
        isDefault: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.address.isDefault).toBe(true);
      addressId = res.body.data.address.id;
    });

    it("only ever has one default address", async () => {
      const second = await auth(request(app).post(`${API_PREFIX}/me/addresses`)).send({
        label: "Office",
        recipientName: "Test Customer",
        phone: "9999999999",
        line1: "2 Test Road",
        city: "Srinagar",
        state: "Jammu and Kashmir",
        postalCode: "190002",
        isDefault: true,
      });
      expect(second.status).toBe(201);

      const list = await auth(request(app).get(`${API_PREFIX}/me/addresses`));
      const defaults = list.body.data.addresses.filter((a: { isDefault: boolean }) => a.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.body.data.address.id);
    });

    it("will not update an address that belongs to someone else", async () => {
      const res = await auth(
        request(app).patch(`${API_PREFIX}/me/addresses/00000000-0000-0000-0000-000000000000`),
      ).send({ city: "Nowhere" });

      expect(res.status).toBe(404);
    });

    it("deletes an address it owns", async () => {
      const res = await auth(request(app).delete(`${API_PREFIX}/me/addresses/${addressId}`));

      expect(res.status).toBe(204);
    });
  });

  describe("once promoted to admin", () => {
    beforeAll(async () => {
      await getDb().update(profiles).set({ role: "admin" }).where(eq(profiles.id, user.id));
    });

    it("can reach the admin route", async () => {
      const res = await auth(request(app).get(`${API_PREFIX}/admin/whoami`));

      expect(res.status).toBe(200);
      expect(res.body.data.profile.role).toBe("admin");
    });
  });
});
