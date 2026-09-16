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
import { addToCart } from "../src/repositories/cart.repository.js";
import { placeOrder, type PlacedOrder } from "../src/repositories/order.repository.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("a signed-in customer's orders", () => {
  let owner: TestUser;
  let otherUser: TestUser;
  let variantId: string;
  let order: PlacedOrder;

  beforeAll(async () => {
    [owner, otherUser, { id: variantId }] = await Promise.all([
      createSignedInTestUser(),
      createSignedInTestUser(),
      (async () => {
        // A different product from checkout.route.test.ts on purpose: that
        // file asserts an exact before/after stock delta on its own variant,
        // and Vitest runs test files in parallel — sharing one variant here
        // would make both files' reservations race on the same inventory row.
        const [row] = await getDb()
          .select({ id: productVariants.id })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(eq(products.slug, "khamrah-spl"))
          .limit(1);
        if (!row) throw new Error("Seed data missing: run npm run db:seed first.");
        return row;
      })(),
    ]);

    const address = await createAddress(owner.id, {
      label: "Home",
      recipientName: "Test Customer",
      phone: "9999999999",
      line1: "1 Test Street",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
    });

    // Setup only — the placing flow itself is covered by checkout.route.test.ts.
    await addToCart(owner.id, variantId, 1);
    order = await placeOrder(owner.id, address.id);
  }, 30_000);

  afterAll(async () => {
    // Undo exactly what this test created — see checkout.route.test.ts for why.
    const db = getDb();
    await db.delete(inventoryMovements).where(eq(inventoryMovements.orderId, order.id));
    await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
    await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
    await db.delete(orders).where(eq(orders.id, order.id));
    await db
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} - 1` })
      .where(eq(inventory.variantId, variantId));

    await Promise.all([owner?.cleanup(), otherUser?.cleanup()]);
    await closeDatabase();
  });

  function auth(user: TestUser, req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  it("lists the placed order", async () => {
    const res = await auth(owner, request(app).get(`${API_PREFIX}/orders`));

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].id).toBe(order.id);
    expect(res.body.data.orders[0].orderNumber).toBe(order.orderNumber);
    expect(res.body.data.orders[0].itemCount).toBe(1);
  });

  it("returns full detail for one order", async () => {
    const res = await auth(owner, request(app).get(`${API_PREFIX}/orders/${order.id}`));

    expect(res.status).toBe(200);
    expect(res.body.data.order.items).toHaveLength(1);
    expect(res.body.data.order.statusHistory).toHaveLength(1);
    expect(res.body.data.order.statusHistory[0].status).toBe("pending_payment");
    expect(res.body.data.order.shippingAddress.city).toBe("Mumbai");
  });

  it("404s for an order id that does not exist", async () => {
    const res = await auth(
      owner,
      request(app).get(`${API_PREFIX}/orders/00000000-0000-0000-0000-000000000000`),
    );

    expect(res.status).toBe(404);
  });

  it("never shows one customer's order to another", async () => {
    const list = await auth(otherUser, request(app).get(`${API_PREFIX}/orders`));
    expect(list.body.data.orders).toEqual([]);

    const detail = await auth(otherUser, request(app).get(`${API_PREFIX}/orders/${order.id}`));
    expect(detail.status).toBe(404);
  });
});
