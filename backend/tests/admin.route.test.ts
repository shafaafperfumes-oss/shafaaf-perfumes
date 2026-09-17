import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import {
  auditLogs,
  inventory,
  inventoryMovements,
  orderStatusHistory,
  orders,
  productVariants,
  products,
  profiles,
} from "../src/db/schema/index.js";
import { createAddress } from "../src/repositories/address.repository.js";
import { addToCart } from "../src/repositories/cart.repository.js";
import { placeOrder, type PlacedOrder } from "../src/repositories/order.repository.js";
import { createSignedInTestUser, type TestUser } from "./helpers/supabase-test-user.js";

const app = createApp();

const hasTestCredentials = env.hasAuth && Boolean(env.SUPABASE_SERVICE_ROLE_KEY) && env.hasDatabase;
const describeWithAuth = hasTestCredentials ? describe : describe.skip;

describeWithAuth("the admin API", () => {
  let admin: TestUser;
  let customer: TestUser;

  // A product this suite creates from scratch, so nothing it does can touch
  // the real catalogue.
  const testSlug = `admin-test-${Date.now()}`;
  let createdProductId: string;
  let createdVariantId: string;

  // A real order, placed by the customer user, for the cancellation test. It
  // uses a product no other test file touches — Vitest runs files in
  // parallel and sharing a variant would race their stock deltas.
  let order: PlacedOrder;
  let orderedVariantId: string;
  // A second order, marked paid directly in the database (only the Razorpay
  // webhook does that for real), for the ship -> deliver tests.
  let paidOrder: PlacedOrder;

  beforeAll(async () => {
    [admin, customer] = await Promise.all([createSignedInTestUser(), createSignedInTestUser()]);

    const db = getDb();
    // Roles are only ever granted in the database, never through an API
    // route — so that is how a test grants one too.
    await db.update(profiles).set({ role: "admin" }).where(eq(profiles.id, admin.id));

    const [variant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(products.slug, "yemberzal"))
      .limit(1);
    if (!variant) throw new Error("Seed data missing: run npm run db:seed first.");
    orderedVariantId = variant.id;

    const address = await createAddress(customer.id, {
      label: "Home",
      recipientName: "Test Customer",
      phone: "9999999999",
      line1: "1 Test Street",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
    });
    await addToCart(customer.id, orderedVariantId, 1);
    order = await placeOrder(customer.id, address.id);

    await addToCart(customer.id, orderedVariantId, 1);
    paidOrder = await placeOrder(customer.id, address.id);
    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, paidOrder.id));
  }, 40_000);

  afterAll(async () => {
    const db = getDb();

    if (order) {
      await db.delete(inventoryMovements).where(eq(inventoryMovements.orderId, order.id));
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
      // order_items cascades with the order itself.
      await db.delete(orders).where(eq(orders.id, order.id));
    }
    if (paidOrder) {
      // This order was never really paid, so its reservation was never
      // committed: hand the reserved unit back before deleting it.
      await db
        .update(inventory)
        .set({ reserved: sql`${inventory.reserved} - 1` })
        .where(eq(inventory.variantId, orderedVariantId));
      await db.delete(inventoryMovements).where(eq(inventoryMovements.orderId, paidOrder.id));
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, paidOrder.id));
      await db.delete(orders).where(eq(orders.id, paidOrder.id));
    }

    if (createdVariantId) {
      await db.delete(inventoryMovements).where(eq(inventoryMovements.variantId, createdVariantId));
      await db.delete(inventory).where(eq(inventory.variantId, createdVariantId));
      await db.delete(productVariants).where(eq(productVariants.id, createdVariantId));
    }
    if (createdProductId) {
      await db.delete(products).where(eq(products.id, createdProductId));
    }

    // Audit rows survive the actor on purpose (actor_id is "set null"), so
    // this suite removes its own rather than leaving them behind.
    const actorIds = [admin?.id, customer?.id].filter((id): id is string => Boolean(id));
    if (actorIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.actorId, actorIds));
    }

    await Promise.all([admin?.cleanup(), customer?.cleanup()]);
    await closeDatabase();
  });

  function asAdmin(req: request.Test): request.Test {
    return req.set("Authorization", `Bearer ${admin.accessToken}`);
  }

  it("refuses a customer account", async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/admin/products`)
      .set("Authorization", `Bearer ${customer.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("refuses a request with no token at all", async () => {
    const res = await request(app).get(`${API_PREFIX}/admin/products`);

    expect(res.status).toBe(401);
  });

  it("lists the catalogue with paging information", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/products?perPage=5`));

    expect(res.status).toBe(200);
    expect(res.body.data.products.length).toBeLessThanOrEqual(5);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.meta.perPage).toBe(5);
  });

  it("creates a product and a variant, and gives the variant a stock row", async () => {
    const created = await asAdmin(request(app).post(`${API_PREFIX}/admin/products`)).send({
      slug: testSlug,
      name: "Admin Test Fragrance",
      description: "Created by the admin API test suite.",
    });

    expect(created.status).toBe(201);
    expect(created.body.data.product.isActive).toBe(true);
    createdProductId = created.body.data.product.id;

    const variant = await asAdmin(
      request(app).post(`${API_PREFIX}/admin/products/${createdProductId}/variants`),
    ).send({
      sku: `ADMIN-TEST-${Date.now()}`,
      variantType: "perfume",
      sizeLabel: "50 ml",
      sizeMl: 50,
      pricePaise: 59_900,
      quantity: 4,
    });

    expect(variant.status).toBe(201);
    createdVariantId = variant.body.data.variant.id;

    const detail = await asAdmin(request(app).get(`${API_PREFIX}/admin/products/${createdProductId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.data.product.variants).toHaveLength(1);
    expect(detail.body.data.product.variants[0].quantity).toBe(4);
    // A product made through the API has no notes yet; the field is still there for the admin page.
    expect(detail.body.data.product.notes).toEqual([]);
  });

  it("refuses a second product with the same web address", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/products`)).send({
      slug: testSlug,
      name: "Duplicate",
    });

    expect(res.status).toBe(409);
  });

  it("hides a product from customers without deleting it", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/products/${createdProductId}`)).send({
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.product.isActive).toBe(false);

    const publicList = await request(app).get(`${API_PREFIX}/products`);
    expect(publicList.body.data.products.some((p: { id: string }) => p.id === testSlug)).toBe(false);

    const [stillThere] = await getDb().select().from(products).where(eq(products.id, createdProductId));
    expect(stillThere).toBeDefined();
  });

  it("adjusts stock and records why it changed", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/inventory/adjust`)).send({
      variantId: createdVariantId,
      delta: 6,
      note: "Stock count correction",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.stock.quantity).toBe(10);
    expect(res.body.data.stock.available).toBe(10);

    const movements = await getDb()
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, createdVariantId));
    expect(movements).toHaveLength(1);
    expect(movements[0]!.reason).toBe("admin_adjustment");
    expect(movements[0]!.quantityChange).toBe(6);
  });

  it("refuses an adjustment that would take stock below zero", async () => {
    const res = await asAdmin(request(app).post(`${API_PREFIX}/admin/inventory/adjust`)).send({
      variantId: createdVariantId,
      delta: -999,
      note: "Should be rejected",
    });

    expect(res.status).toBe(409);

    const [stock] = await getDb().select().from(inventory).where(eq(inventory.variantId, createdVariantId));
    expect(stock!.quantity).toBe(10);
  });

  it("shows every customer's orders, not just one account's", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/orders?status=pending_payment`));

    expect(res.status).toBe(200);
    expect(res.body.data.orders.some((row: { id: string }) => row.id === order.id)).toBe(true);
  });

  it("cancels an unpaid order and hands its reserved stock back", async () => {
    const [before] = await getDb()
      .select({ reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, orderedVariantId));

    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${order.id}`)).send({
      status: "cancelled",
      note: "Customer changed their mind",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe("cancelled");
    expect(res.body.data.order.statusHistory.at(-1).status).toBe("cancelled");

    const [after] = await getDb()
      .select({ reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, orderedVariantId));
    expect(after!.reserved).toBe(before!.reserved - 1);
  });

  it("will not cancel the same order twice", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${order.id}`)).send({
      status: "cancelled",
    });

    expect(res.status).toBe(409);
  });

  it("will not let an admin mark an order paid", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${order.id}`)).send({
      status: "paid",
    });

    expect(res.status).toBe(422);
  });

  it("will not ship an order that has not been paid for", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${order.id}`)).send({
      status: "shipped",
    });

    expect(res.status).toBe(409);
  });

  it("will not mark a paid order delivered before it is shipped", async () => {
    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${paidOrder.id}`)).send({
      status: "delivered",
    });

    expect(res.status).toBe(409);
  });

  it("marks a paid order shipped, with the note the customer will see", async () => {
    const [before] = await getDb()
      .select({ quantity: inventory.quantity, reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, orderedVariantId));

    const res = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${paidOrder.id}`)).send({
      status: "shipped",
      note: "Sent by Delhivery, tracking 123456",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe("shipped");
    expect(res.body.data.order.statusHistory.at(-1)).toMatchObject({
      status: "shipped",
      note: "Sent by Delhivery, tracking 123456",
    });

    // Dispatching touches no stock: it was committed when the payment arrived.
    const [after] = await getDb()
      .select({ quantity: inventory.quantity, reserved: inventory.reserved })
      .from(inventory)
      .where(eq(inventory.variantId, orderedVariantId));
    expect(after).toEqual(before);
  });

  it("then marks it delivered, and refuses to cancel it", async () => {
    const delivered = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${paidOrder.id}`)).send({
      status: "delivered",
    });

    expect(delivered.status).toBe(200);
    expect(delivered.body.data.order.status).toBe("delivered");
    expect(delivered.body.data.order.statusHistory.at(-1).note).toBe("Your order has been delivered.");

    const cancel = await asAdmin(request(app).patch(`${API_PREFIX}/admin/orders/${paidOrder.id}`)).send({
      status: "cancelled",
    });
    expect(cancel.status).toBe(409);
  });

  it("filters the order list by status", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/orders?status=delivered&perPage=100`));

    expect(res.status).toBe(200);
    expect(res.body.data.orders.every((row: { status: string }) => row.status === "delivered")).toBe(true);
    expect(res.body.data.orders.some((row: { id: string }) => row.id === paidOrder.id)).toBe(true);
  });

  it("finds a customer and their orders", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/customers/${customer.id}`));

    expect(res.status).toBe(200);
    expect(res.body.data.customer.id).toBe(customer.id);
    expect(res.body.data.customer.orders.some((row: { id: string }) => row.id === order.id)).toBe(true);
  });

  it("recorded every change in the audit log", async () => {
    const res = await asAdmin(request(app).get(`${API_PREFIX}/admin/audit-logs?perPage=50`));

    expect(res.status).toBe(200);
    const actions = res.body.data.logs
      .filter((log: { actorId: string }) => log.actorId === admin.id)
      .map((log: { action: string }) => log.action);

    expect(actions).toContain("product.create");
    expect(actions).toContain("variant.create");
    expect(actions).toContain("product.update");
    expect(actions).toContain("inventory.adjust");
    expect(actions).toContain("order.cancel");
    expect(actions).toContain("order.ship");
    expect(actions).toContain("order.deliver");
  });

  it("does not write an audit row for a change that was refused", async () => {
    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, admin.id));
    const adjustments = logs.filter((log) => log.action === "inventory.adjust");

    // Two adjustments were attempted; only the valid one may be recorded.
    expect(adjustments).toHaveLength(1);
  });
});
