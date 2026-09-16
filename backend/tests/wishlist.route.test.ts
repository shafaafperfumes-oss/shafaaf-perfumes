import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { products } from "../src/db/schema/index.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("a signed-in customer's wishlist", () => {
  let user: TestUser;
  let productId: string;

  beforeAll(async () => {
    [user, productId] = await Promise.all([
      createSignedInTestUser(),
      (async () => {
        const [row] = await getDb()
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, "shanaya-gold"))
          .limit(1);
        if (!row) throw new Error("Seed data missing: run npm run db:seed first.");
        return row.id;
      })(),
    ]);
  }, 30_000);

  afterAll(async () => {
    await user?.cleanup();
    await closeDatabase();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  it("starts empty", async () => {
    const res = await auth(request(app).get(`${API_PREFIX}/wishlist`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it("rejects an unknown product", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/wishlist`)).send({
      productId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("adds a product", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/wishlist`)).send({ productId });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productId).toBe(productId);
    expect(res.body.data.items[0].slug).toBe("shanaya-gold");
  });

  it("adding the same product twice does not duplicate it", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/wishlist`)).send({ productId });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
  });

  it("removes a product", async () => {
    const res = await auth(request(app).delete(`${API_PREFIX}/wishlist/${productId}`));

    expect(res.status).toBe(204);
  });

  it("removing it again reports it is already gone", async () => {
    const res = await auth(request(app).delete(`${API_PREFIX}/wishlist/${productId}`));

    expect(res.status).toBe(404);
  });
});
