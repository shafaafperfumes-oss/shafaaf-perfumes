import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { env } from "../src/config/env.js";
import { closeDatabase, getDb } from "../src/db/client.js";
import { products, productVariants, inventory } from "../src/db/schema/index.js";
import { buildCatalogRows } from "../src/db/catalog-source.js";

// The seed source is the floor, not the exact count: the owner can add
// products from the admin page, and those must not fail this test.
const seeded = buildCatalogRows();
const seededSkus = seeded.flatMap((product) => product.variants.map((variant) => variant.sku));

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

  it("holds every seeded fragrance", async () => {
    const rows = await getDb().select({ slug: products.slug }).from(products);
    const slugs = new Set(rows.map((row) => row.slug));
    for (const product of seeded) expect(slugs.has(product.slug), product.slug).toBe(true);
  });

  it("holds every seeded variant", async () => {
    const rows = await getDb().select({ sku: productVariants.sku }).from(productVariants);
    const skus = new Set(rows.map((row) => row.sku));
    for (const sku of seededSkus) expect(skus.has(sku), sku).toBe(true);
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

  it("prices everything in Indian Rupees", async () => {
    const rows = await getDb()
      .select({ currency: productVariants.currency })
      .from(productVariants);

    rows.forEach((row) => expect(row.currency).toBe("INR"));
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
    const [{ variants }] = await getDb().select({ variants: sql<number>`count(*)::int` }).from(productVariants);
    const [{ stockRows }] = await getDb().select({ stockRows: sql<number>`count(*)::int` }).from(inventory);

    expect(stockRows).toBe(variants);
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
