import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import {
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  productVariants,
  products,
} from "../src/db/schema/index.js";
import { createAddress } from "../src/repositories/address.repository.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("checkout", () => {
  let user: TestUser;
  let variantId: string;
  let variantPriceRupees: number;
  let addressId: string;

  // Set once an order is actually placed, so afterAll can undo exactly what
  // this test created: release the stock it reserved and remove the test
  // order — a real customer's order must never be deleted, but a live
  // Supabase project should not accumulate throwaway test orders either,
  // and this profile cannot be deleted (see orders.ts: `onDelete: "restrict"`)
  // while an order still references it.
  let placedOrderId: string | null = null;
  let reservedQuantity = 0;

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

    const address = await createAddress(user.id, {
      label: "Home",
      recipientName: "Test Customer",
      phone: "9999999999",
      line1: "1 Test Street",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
    });
    addressId = address.id;
  }, 30_000);

  afterAll(async () => {
    if (placedOrderId) {
      const db = getDb();
      await db.delete(inventoryMovements).where(eq(inventoryMovements.orderId, placedOrderId));
      await db.delete(orderItems).where(eq(orderItems.orderId, placedOrderId));
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, placedOrderId));
      await db.delete(orders).where(eq(orders.id, placedOrderId));
      if (reservedQuantity > 0) {
        await db
          .update(inventory)
          .set({ reserved: sql`${inventory.reserved} - ${reservedQuantity}` })
          .where(eq(inventory.variantId, variantId));
      }
    }
    await user?.cleanup();
    await closeDatabase();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  it("rejects an address that is not the caller's own", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/checkout/place`)).send({
      addressId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("will not quote an empty cart", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/checkout/quote`));

    expect(res.status).toBe(400);
  });

  it("will not place an order from an empty cart", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/checkout/place`)).send({ addressId });

    expect(res.status).toBe(400);
  });

  it("quotes the cart's current total", async () => {
    await auth(request(app).post(`${API_PREFIX}/cart/items`)).send({ variantId, quantity: 2 });

    const res = await auth(request(app).post(`${API_PREFIX}/checkout/quote`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.subtotal).toBe(variantPriceRupees * 2);
    expect(res.body.data.total).toBe(variantPriceRupees * 2);
  });

  it("places the order, reserves stock, and empties the cart", async () => {
    const [before] = await getDb()
      .select({ reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));

    const res = await auth(request(app).post(`${API_PREFIX}/checkout/place`)).send({ addressId });

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.orderNumber).toMatch(/^SHF-\d+$/);
    expect(order.status).toBe("pending_payment");
    expect(order.items).toHaveLength(1);
    expect(order.total).toBe(variantPriceRupees * 2);

    placedOrderId = order.id;
    reservedQuantity = 2;

    const cart = await auth(request(app).get(`${API_PREFIX}/cart`));
    expect(cart.body.data.items).toEqual([]);

    const [after] = await getDb()
      .select({ reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));
    expect(after!.reserved).toBe((before?.reserved ?? 0) + 2);
  });

  it("will not place a second order from the now-empty cart", async () => {
    const res = await auth(request(app).post(`${API_PREFIX}/checkout/place`)).send({ addressId });

    expect(res.status).toBe(400);
  });
});
