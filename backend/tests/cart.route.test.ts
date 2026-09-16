import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { productVariants, products } from "../src/db/schema/index.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("a signed-in customer's cart", () => {
  let user: TestUser;
  let variantId: string;
  let variantPriceRupees: number;

  beforeAll(async () => {
    [user, { id: variantId, pricePaise: variantPriceRupees }] = await Promise.all([
      createSignedInTestUser(),
      (async () => {
        const [row] = await getDb()
          .select({ id: productVariants.id, pricePaise: productVariants.pricePaise })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(eq(products.slug, "shanaya-gold"))
          .limit(1);
        if (!row) throw new Error("Seed data missing: run npm run db:seed first.");
        return row;
      })(),
    ]);
    variantPriceRupees = variantPriceRupees / 100;
  }, 30_000);

  afterAll(async () => {
    await user?.cleanup();
    await closeDatabase();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  it("starts empty", async () => {
    const res = await auth(request(app).get(`${API_PREFIX}/cart`));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], itemCount: 0, subtotal: 0 });
  });

  it("rejects an unknown variant", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/cart/items`)).send({
      variantId: "00000000-0000-0000-0000-000000000000",
      quantity: 1,
    });

    expect(res.status).toBe(404);
  });

  let itemId: string;

  it("adds an item", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/cart/items`)).send({
      variantId,
      quantity: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.items[0].unitPrice).toBe(variantPriceRupees);
    expect(res.body.data.subtotal).toBe(variantPriceRupees * 2);
    itemId = res.body.data.items[0].id;
  });

  it("adds to the existing line instead of duplicating it", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/cart/items`)).send({
      variantId,
      quantity: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });

  it("rejects a quantity above the per-line limit", async () => {
    const res = await auth(request(app).patch(`${API_PREFIX}/cart/items/${itemId}`)).send({
      quantity: 999,
    });

    expect(res.status).toBe(422);
  });

  it("updates the quantity directly", async () => {
    const res = await auth(request(app).patch(`${API_PREFIX}/cart/items/${itemId}`)).send({
      quantity: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(5);
  });

  it("will not touch a cart item that does not exist", async () => {
    const res = await auth(
      request(app).patch(`${API_PREFIX}/cart/items/00000000-0000-0000-0000-000000000000`),
    ).send({ quantity: 1 });

    expect(res.status).toBe(404);
  });

  it("removes an item", async () => {
    const res = await auth(request(app).delete(`${API_PREFIX}/cart/items/${itemId}`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it("clears the whole cart", async () => {
    await auth(request(app).post(`${API_PREFIX}/cart/items`)).send({ variantId, quantity: 1 });

    const cleared = await auth(request(app).delete(`${API_PREFIX}/cart`));
    expect(cleared.status).toBe(204);

    const after = await auth(request(app).get(`${API_PREFIX}/cart`));
    expect(after.body.data.items).toEqual([]);
  });
});
