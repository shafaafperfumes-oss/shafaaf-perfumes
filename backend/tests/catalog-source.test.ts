import { describe, expect, it } from "vitest";
import {
  buildCatalogRows,
  buildSku,
  loadSourceProducts,
  rupeesToPaise,
  slugify,
} from "../src/db/catalog-source.js";

/**
 * These tests guard the one rule the owner set for the catalog:
 * product names, prices and notes must never change. They read the
 * website's real data file, so if a price or a name is ever altered by
 * accident, the test suite fails before anything reaches the database.
 */

const source = loadSourceProducts();
const rows = buildCatalogRows(source);

describe("the website catalog is readable", () => {
  it("finds all 14 fragrances", () => {
    expect(source).toHaveLength(14);
  });

  it("gives every fragrance a unique url slug", () => {
    const slugs = rows.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every fragrance's notes", () => {
    rows.forEach((row) => {
      expect(row.notes.length).toBeGreaterThan(0);
      expect(row.notes.length).toBe(source.find((p) => p.id === row.slug)!.notes.length);
    });
  });
});

describe("prices convert to paise without losing a single paisa", () => {
  it("multiplies whole rupees by 100", () => {
    expect(rupeesToPaise(599)).toBe(59_900);
    expect(rupeesToPaise(349)).toBe(34_900);
    expect(rupeesToPaise(1.5)).toBe(150);
  });

  it("stores every price as a whole number of paise", () => {
    rows.forEach((row) => {
      row.variants.forEach((variant) => {
        expect(Number.isInteger(variant.pricePaise)).toBe(true);
        expect(variant.pricePaise).toBeGreaterThan(0);
      });
    });
  });

  it("matches the exact prices shown on the website", () => {
    source.forEach((product) => {
      const row = rows.find((candidate) => candidate.slug === product.id)!;
      product.variants.forEach((variant) => {
        variant.sizes.forEach((size) => {
          const saved = row.variants.find(
            (candidate) =>
              candidate.variantType === variant.type.toLowerCase() && candidate.sizeMl === size.ml,
          )!;
          expect(saved.pricePaise).toBe(size.price * 100);
          expect(saved.sizeLabel).toBe(size.label);
        });
      });
    });
  });
});

describe("variants and stock keeping units", () => {
  it("creates 56 sellable variants in total", () => {
    const total = rows.reduce((sum, row) => sum + row.variants.length, 0);
    expect(total).toBe(56);
  });

  it("gives every variant a unique sku", () => {
    const skus = rows.flatMap((row) => row.variants.map((variant) => variant.sku));
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("builds readable skus", () => {
    expect(buildSku("shanaya-gold", "perfume", 30)).toBe("SHF-SHANAYA-GOLD-PERFUME-30");
  });

  it("only uses the two variant types the shop sells", () => {
    rows.forEach((row) => {
      row.variants.forEach((variant) => {
        expect(["perfume", "attar"]).toContain(variant.variantType);
      });
    });
  });
});

describe("a known fragrance survives the conversion unchanged", () => {
  const shanaya = rows.find((row) => row.slug === "shanaya-gold")!;

  it("keeps the exact product name", () => {
    expect(shanaya.name).toBe("Shanaya Gold");
  });

  it("keeps the exact notes, in order", () => {
    expect(shanaya.notes.map((note) => note.name)).toEqual([
      "Vanilla",
      "Sweet",
      "Tuberose",
      "Cinnamon",
      "Warm Spicy",
      "Citrus",
      "Powdery",
    ]);
  });

  it("keeps all four sizes at their listed prices", () => {
    expect(
      shanaya.variants.map((variant) => [variant.variantType, variant.sizeLabel, variant.pricePaise]),
    ).toEqual([
      ["perfume", "30ml", 59_900],
      ["perfume", "50ml", 89_900],
      ["attar", "6ml", 34_900],
      ["attar", "12ml", 69_900],
    ]);
  });
});

describe("slugify", () => {
  it("turns display names into stable keys", () => {
    expect(slugify("Warm Spicy")).toBe("warm-spicy");
    expect(slugify("Oud")).toBe("oud");
    expect(slugify("  Fresh   Spicy  ")).toBe("fresh-spicy");
  });
});
