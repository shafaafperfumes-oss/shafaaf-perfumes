import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { products, productVariants, inventory } from "../src/db/schema/index.js";

/**
 * Real-database checks. They run only when `DATABASE_URL` is set in
 * `backend/.env`, so the suite still passes on a machine with no database.
 *
 * Run them after:  npm run db:migrate  &&  npm run db:seed
 */
const describeWithDatabase = env.hasDatabase ? describe : describe.skip;

describeWithDatabase("the seeded catalog in Postgres", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("answers a simple query", async () => {
    const result = await getDb().execute(sql`select 1 as ok`);
    expect(result.length).toBeGreaterThan(0);
  });

  it("holds all 14 fragrances", async () => {
    const rows = await getDb().select({ slug: products.slug }).from(products);
    expect(rows).toHaveLength(14);
  });

  it("holds all 56 variants", async () => {
    const rows = await getDb().select({ sku: productVariants.sku }).from(productVariants);
    expect(rows).toHaveLength(56);
  });

  it("stores prices in whole paise", async () => {
    const rows = await getDb()
      .select({ price: productVariants.pricePaise, sku: productVariants.sku })
      .from(productVariants);

    rows.forEach((row) => {
      expect(Number.isInteger(row.price)).toBe(true);
      expect(row.price).toBeGreaterThan(0);
    });
  });

  it("kept a known product's exact name and price", async () => {
    const [product] = await getDb()
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.slug, "shanaya-gold"));

    expect(product?.name).toBe("Shanaya Gold");

    const [variant] = await getDb()
      .select({ price: productVariants.pricePaise })
      .from(productVariants)
      .where(eq(productVariants.sku, "SHF-SHANAYA-GOLD-PERFUME-30"));

    expect(variant?.price).toBe(59_900);
  });

  it("gives every variant a stock row", async () => {
    const [{ count }] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(inventory);

    expect(count).toBe(56);
  });

  it("refuses to let stock go negative", async () => {
    await expect(
      getDb().execute(sql`
        update inventory set quantity = -1
        where variant_id = (select variant_id from inventory limit 1)
      `),
    ).rejects.toThrow();
  });

  it("refuses a price of zero", async () => {
    await expect(
      getDb().execute(sql`
        update product_variants set price_paise = 0
        where sku = 'SHF-SHANAYA-GOLD-PERFUME-30'
      `),
    ).rejects.toThrow();
  });
});
