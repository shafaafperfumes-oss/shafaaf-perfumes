import { describe, expect, it } from "vitest";
import request from "supertest";
import { API_PREFIX, createApp } from "../src/app/app.js";
import { env } from "../src/config/env.js";
import { loadSourceProducts } from "../src/db/catalog-source.js";

/**
 * These exercise the real seeded database, so they run only when
 * `DATABASE_URL` is configured — same rule as tests/database.test.ts.
 *
 * The core promise under test: whatever this API returns must be
 * byte-for-byte the same catalog the website already ships with —
 * same names, same notes, same prices — because the owner's one rule
 * for this project is that those three things never change.
 */
const describeWithDatabase = env.hasDatabase ? describe : describe.skip;
const app = createApp();
const source = loadSourceProducts();

describeWithDatabase("GET /products", () => {
  it("returns every fragrance the website lists", async () => {
    const res = await request(app).get(`${API_PREFIX}/products`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.products).toHaveLength(source.length);
    expect(res.body.meta.total).toBe(source.length);
  });

  it("matches the website's own catalog exactly: names, notes and prices", async () => {
    const res = await request(app).get(`${API_PREFIX}/products`);
    const byId = new Map(res.body.data.products.map((p: { id: string }) => [p.id, p]));

    source.forEach((expected) => {
      const actual = byId.get(expected.id) as
        | {
            name: string;
            notes: string[];
            variants: {
              type: string;
              sizes: { variantId: string; label: string; ml: number; price: number }[];
            }[];
          }
        | undefined;

      expect(actual, `missing product "${expected.id}"`).toBeDefined();
      expect(actual!.name).toBe(expected.name);
      expect(actual!.notes).toEqual(expected.notes);

      expected.variants.forEach((expectedVariant) => {
        const actualVariant = actual!.variants.find((v) => v.type === expectedVariant.type);
        expect(actualVariant, `missing "${expectedVariant.type}" for ${expected.id}`).toBeDefined();

        expectedVariant.sizes.forEach((expectedSize) => {
          const actualSize = actualVariant!.sizes.find((s) => s.ml === expectedSize.ml);
          expect(actualSize, `missing ${expectedSize.ml}ml for ${expected.id}`).toBeDefined();
          expect(actualSize!.label).toBe(expectedSize.label);
          // Whole rupees — the API converts paise back, this proves no drift.
          expect(actualSize!.price).toBe(expectedSize.price);
          // The cart API is keyed by variant, so every size must carry its id.
          expect(actualSize!.variantId).toMatch(/^[0-9a-f-]{36}$/);
        });
      });
    });
  });

  it("never returns a price as a fraction of a rupee", async () => {
    const res = await request(app).get(`${API_PREFIX}/products`);
    const products = res.body.data.products as {
      variants: { sizes: { price: number }[] }[];
    }[];

    products.forEach((product) => {
      product.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          expect(Number.isInteger(size.price)).toBe(true);
          expect(size.price).toBeGreaterThan(0);
        });
      });
    });
  });
});

describeWithDatabase("GET /products/:id", () => {
  it("returns a single fragrance with the exact shape the website expects", async () => {
    const res = await request(app).get(`${API_PREFIX}/products/shanaya-gold`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({
      id: "shanaya-gold",
      name: "Shanaya Gold",
      family: "Gourmand",
      gender: "Unisex",
    });
    expect(res.body.data.product.notes).toEqual([
      "Vanilla",
      "Sweet",
      "Tuberose",
      "Cinnamon",
      "Warm Spicy",
      "Citrus",
      "Powdery",
    ]);
  });

  it("returns a clean 404 for a fragrance that does not exist", async () => {
    const res = await request(app).get(`${API_PREFIX}/products/does-not-exist`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("never leaks a stack trace or database detail on a miss", async () => {
    const res = await request(app).get(`${API_PREFIX}/products/does-not-exist`);

    expect(JSON.stringify(res.body)).not.toMatch(/at .+:\d+:\d+|postgres|drizzle/i);
  });
});
