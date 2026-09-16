import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like, sql } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import {
  inventory,
  inventoryMovements,
  orderStatusHistory,
  orders,
  paymentEvents,
  payments,
  productVariants,
  products,
} from "../src/db/schema/index.js";
import { createAddress } from "../src/repositories/address.repository.js";
import { addToCart } from "../src/repositories/cart.repository.js";
import { placeOrder, type PlacedOrder } from "../src/repositories/order.repository.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

// This suite never calls the real Razorpay API — it only needs the webhook
// secret to sign requests the same way Razorpay would, so it can run on any
// machine that has RAZORPAY_WEBHOOK_SECRET set, even without live API keys.
const hasTestCredentials =
  env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase && env.hasPaymentWebhook;
const describeWithWebhookSecret = hasTestCredentials ? describe : describe.skip;

describeWithWebhookSecret("the Razorpay webhook", () => {
  let user: TestUser;
  let variantId: string;
  let order: PlacedOrder;
  let razorpayOrderId: string;

  beforeAll(async () => {
    [user, { id: variantId }] = await Promise.all([
      createSignedInTestUser(),
      (async () => {
        // A product not used by checkout.route.test.ts or orders.route.test.ts —
        // Vitest runs test files in parallel, and sharing a variant would
        // make their stock deltas race against each other.
        const [row] = await getDb()
          .select({ id: productVariants.id })
          .from(productVariants)
          .innerJoin(products, eq(productVariants.productId, products.id))
          .where(eq(products.slug, "khamra-qahwa"))
          .limit(1);
        if (!row) throw new Error("Seed data missing: run npm run db:seed first.");
        return row;
      })(),
    ]);

    const address = await createAddress(user.id, {
      label: "Home",
      recipientName: "Test Customer",
      phone: "9999999999",
      line1: "1 Test Street",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
    });

    await addToCart(user.id, variantId, 1);
    order = await placeOrder(user.id, address.id);

    // Stand in for what createPaymentForOrder would have inserted after a
    // real call to Razorpay — this suite only exercises what happens once a
    // signed webhook arrives, not the order-creation call itself.
    razorpayOrderId = `order_test_${order.id.slice(0, 8)}`;
    await getDb().insert(payments).values({
      orderId: order.id,
      razorpayOrderId,
      amountPaise: Math.round(order.total * 100),
      status: "created",
    });
  }, 30_000);

  afterAll(async () => {
    const db = getDb();
    await db.delete(paymentEvents).where(like(paymentEvents.razorpayEventId, `test-evt-${order.id}-%`));
    await db.delete(payments).where(eq(payments.orderId, order.id));
    await db.delete(inventoryMovements).where(eq(inventoryMovements.orderId, order.id));
    await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
    // order_items cascades with the order itself.
    await db.delete(orders).where(eq(orders.id, order.id));

    // markOrderPaid decrements quantity permanently (a real "sale"); put the
    // one unit this test consumed back so the seed data is unaffected.
    await db
      .update(inventory)
      .set({ quantity: sql`${inventory.quantity} + 1` })
      .where(eq(inventory.variantId, variantId));

    await user?.cleanup();
    await closeDatabase();
  });

  function auth(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${user.accessToken}`);
  }

  function postWebhook(eventBody: unknown, eventId: string, signature?: string) {
    const raw = Buffer.from(JSON.stringify(eventBody), "utf8");
    const validSignature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
    return request(app)
      .post(`${API_PREFIX}/webhooks/razorpay`)
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature ?? validSignature)
      .set("x-razorpay-event-id", eventId)
      .send(raw);
  }

  it("rejects a webhook whose signature does not match", async () => {
    const res = await postWebhook(
      { event: "payment.captured", payload: { payment: { entity: { id: "pay_bad", order_id: razorpayOrderId } } } },
      `test-evt-${order.id}-bad-signature`,
      "0".repeat(64),
    );

    expect(res.status).toBe(400);
  });

  it("captures the payment, marks the order paid, and commits the reserved stock", async () => {
    const [before] = await getDb()
      .select({ quantity: inventory.quantity, reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));

    const res = await postWebhook(
      {
        entity: "event",
        event: "payment.captured",
        payload: {
          payment: {
            entity: { id: `pay_test_${order.id.slice(0, 8)}`, order_id: razorpayOrderId, status: "captured" },
          },
        },
      },
      `test-evt-${order.id}-captured`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);

    const orderRes = await auth(request(app).get(`${API_PREFIX}/orders/${order.id}`));
    expect(orderRes.body.data.order.status).toBe("paid");
    expect(orderRes.body.data.order.statusHistory.at(-1).status).toBe("paid");

    const [after] = await getDb()
      .select({ quantity: inventory.quantity, reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));
    expect(after!.quantity).toBe(before!.quantity - 1);
    expect(after!.reserved).toBe(before!.reserved - 1);
  });

  it("ignores a retried delivery of the same event without double-committing stock", async () => {
    const [before] = await getDb()
      .select({ quantity: inventory.quantity })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));

    const res = await postWebhook(
      {
        event: "payment.captured",
        payload: { payment: { entity: { id: `pay_test_${order.id.slice(0, 8)}`, order_id: razorpayOrderId } } },
      },
      `test-evt-${order.id}-captured`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);

    const [after] = await getDb()
      .select({ quantity: inventory.quantity })
      .from(inventory)
      .where(eq(inventory.variantId, variantId));
    expect(after!.quantity).toBe(before!.quantity);
  });

  it("accepts but ignores an event type it does not act on", async () => {
    const res = await postWebhook(
      { event: "refund.processed", payload: {} },
      `test-evt-${order.id}-ignored-event`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
  });
});
