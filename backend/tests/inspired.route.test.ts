import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { auditLogs, fragranceQueries, inspiredFragrances, profiles } from "../src/db/schema/index.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("the inspired fragrance list", () => {
  let admin: TestUser;
  let customer: TestUser;
  // A name no supplier list will ever contain, so the suite only ever sees its own rows.
  const stamp = `zz-test-${Date.now()}`;
  let createdId: string;

  beforeAll(async () => {
    [admin, customer] = await Promise.all([createSignedInTestUser(), createSignedInTestUser()]);
    await getDb().update(profiles).set({ role: "admin" }).where(eq(profiles.id, admin.id));
  }, 40_000);

  afterAll(async () => {
    const db = getDb();
    await db.delete(inspiredFragrances).where(like(inspiredFragrances.name, `${stamp}%`));
    await db.delete(fragranceQueries).where(like(fragranceQueries.query, `${stamp}%`));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [admin.id, customer.id]));
    await Promise.all([admin.cleanup(), customer.cleanup()]);
    await closeDatabase();
  });

  function asAdmin(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${admin.accessToken}`);
  }

  it("refuses a customer account on the admin side", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/admin/inspired`)
      .set("Authorization", `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("lets an admin add a fragrance to the list", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/inspired`)).send({
      name: `${stamp} Sauvage`,
      inspiredBy: "Dior",
      gender: "Men",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.fragrance.isAvailable).toBe(true);
    createdId = res.body.data.fragrance.id;
  });

  it("refuses the same name and brand twice", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/inspired`)).send({
      name: `${stamp} Sauvage`,
      inspiredBy: "Dior",
    });
    expect(res.status).toBe(409);
  });

  it("finds it from the public search box, with the sizes it is made in", async () => {
    const res = await request(app).get(`${API_PREFIX}/inspired/search`).query({ q: `${stamp} sauv` });
    expect(res.status).toBe(200);
    expect(res.body.data.matches.map((m: { name: string }) => m.name)).toContain(`${stamp} Sauvage`);
    expect(res.body.data.sizes.length).toBeGreaterThan(0);
    expect(res.body.data.sizes[0]).toHaveProperty("label");
    // A public response never carries anything but name, brand and gender.
    expect(Object.keys(res.body.data.matches[0]).sort()).toEqual(["gender", "id", "inspiredBy", "name"]);
  });

  it("also matches on the brand name", async () => {
    const res = await request(app).get(`${API_PREFIX}/inspired/search`).query({ q: "dior" });
    expect(res.status).toBe(200);
    expect(res.body.data.matches.some((m: { id: string }) => m.id === createdId)).toBe(true);
  });

  it("remembers what was searched, without who searched", async () => {
    const rows = await getDb().select().from(fragranceQueries).where(like(fragranceQueries.query, `${stamp}%`));
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]!)).not.toContain("userId");
    const report = await asAdmin(request(app).get(`${API_PREFIX}/admin/inspired/queries`)).query({ days: 1 });
    expect(report.status).toBe(200);
    expect(report.body.data.queries.some((q: { query: string }) => q.query.startsWith(stamp))).toBe(true);
  });

  it("refuses a one-letter search", async () => {
    const res = await request(app).get(`${API_PREFIX}/inspired/search`).query({ q: "a" });
    expect(res.status).toBe(422);
  });

  it("hides an entry the admin marks unavailable", async () => {
    const patch = await asAdmin(request(app).patch(`${API_PREFIX}/admin/inspired/${createdId}`)).send({ isAvailable: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data.fragrance.isAvailable).toBe(false);

    const res = await request(app).get(`${API_PREFIX}/inspired/search`).query({ q: `${stamp} sauv` });
    expect(res.body.data.matches).toHaveLength(0);
  });

  it("lets an admin set a size's price in paise and clear it again", async () => {
    const sizes = await asAdmin(request(app).get(`${API_PREFIX}/admin/inspired/sizes`));
    expect(sizes.status).toBe(200);
    const size = sizes.body.data.sizes[0];
    const before = size.pricePaise;

    const set = await asAdmin(request(app).patch(`${API_PREFIX}/admin/inspired/sizes/${size.id}`)).send({ pricePaise: 49900 });
    expect(set.status).toBe(200);
    expect(set.body.data.size.pricePaise).toBe(49900);

    const restore = await asAdmin(request(app).patch(`${API_PREFIX}/admin/inspired/sizes/${size.id}`)).send({ pricePaise: before });
    expect(restore.body.data.size.pricePaise).toBe(before);
  });

  it("imports a list without touching existing entries", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/inspired/import`)).send({
      rows: [
        { name: `${stamp} Sauvage`, inspiredBy: "Dior" },
        { name: `${stamp} Aventus`, inspiredBy: "Creed" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ inserted: 1, skipped: 1 });

    const [existing] = await getDb().select().from(inspiredFragrances).where(eq(inspiredFragrances.id, createdId));
    expect(existing!.isAvailable).toBe(false); // the import did not flip it back on
  });
});
