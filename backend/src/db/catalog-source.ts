import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { z } from "zod";

/**
 * READING THE REAL CATALOG
 * ---------------------------------------------------------------
 * The 14 fragrances, their prices and their notes already exist in the
 * website's own data file. Re-typing them here would create a second copy
 * that can silently drift, so instead this module *reads that file* and
 * converts it into database rows.
 *
 * The file is plain data plus helper functions with no browser APIs, so it
 * is evaluated in an empty sandbox (`node:vm`) with no access to the file
 * system, the network or this process's variables.
 *
 * Prices in the source file are whole rupees. The database stores paise, so
 * every price is multiplied by 100 here — once, in one place.
 */

const PAISE_PER_RUPEE = 100;

const sizeSchema = z.object({
  label: z.string().min(1),
  ml: z.number().int().positive(),
  price: z.number().positive(),
});

const variantSchema = z.object({
  type: z.enum(["Perfume", "Attar"]),
  sizes: z.array(sizeSchema).min(1),
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().min(1),
  gender: z.string().min(1),
  notes: z.array(z.string().min(1)).min(1),
  description: z.string(),
  image: z.string().nullable(),
  imageAlt: z.string().nullable(),
  bestseller: z.boolean(),
  isNew: z.boolean(),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  variants: z.array(variantSchema).min(1),
});

export type SourceProduct = z.infer<typeof productSchema>;

/** Turns "Warm Spicy" into "warm-spicy" so notes and families get stable keys. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "shanaya-gold" + perfume + 30ml -> "SHF-SHANAYA-GOLD-PERFUME-30". */
export function buildSku(productSlug: string, variantType: string, sizeMl: number): string {
  return `SHF-${productSlug.toUpperCase()}-${variantType.toUpperCase()}-${sizeMl}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

function locateCatalogFile(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.CATALOG_SOURCE_FILE,
    // src/db -> backend -> repo root
    resolve(here, "../../../js/data/products.js"),
    // dist/db -> backend -> repo root
    resolve(here, "../../../../js/data/products.js"),
    resolve(process.cwd(), "../js/data/products.js"),
    resolve(process.cwd(), "js/data/products.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // try the next candidate
    }
  }

  throw new Error(
    "Could not find the website catalog file (js/data/products.js). " +
      "Set CATALOG_SOURCE_FILE to its full path.",
  );
}

/** Evaluates the website's catalog file and returns its validated products. */
export function loadSourceProducts(): SourceProduct[] {
  const file = locateCatalogFile();
  const source = readFileSync(file, "utf8");

  // The file declares `const SHAFAAF_PRODUCTS`, which does not become a global.
  // Appending the name makes it the completion value of the script instead.
  const value = runInNewContext(`${source}\n;SHAFAAF_PRODUCTS;`, Object.create(null), {
    timeout: 5_000,
    filename: file,
  }) as unknown;

  const parsed = z.array(productSchema).min(1).safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`The website catalog file is not in the expected shape:\n${issues}`);
  }

  return parsed.data;
}

export interface CatalogVariantRow {
  sku: string;
  variantType: "perfume" | "attar";
  sizeLabel: string;
  sizeMl: number;
  pricePaise: number;
  position: number;
}

export interface CatalogProductRow {
  slug: string;
  name: string;
  familySlug: string;
  familyName: string;
  gender: string;
  description: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  isBestseller: boolean;
  isNew: boolean;
  ratingAverage: string;
  reviewCount: number;
  sortOrder: number;
  notes: { slug: string; name: string; position: number }[];
  variants: CatalogVariantRow[];
}

/** The catalog reshaped into exactly what the database tables expect. */
export function buildCatalogRows(products = loadSourceProducts()): CatalogProductRow[] {
  return products.map((product, productIndex) => {
    const variants: CatalogVariantRow[] = [];

    product.variants.forEach((variant) => {
      const variantType = variant.type.toLowerCase() as "perfume" | "attar";
      variant.sizes.forEach((size) => {
        variants.push({
          sku: buildSku(product.id, variantType, size.ml),
          variantType,
          sizeLabel: size.label,
          sizeMl: size.ml,
          pricePaise: rupeesToPaise(size.price),
          position: variants.length,
        });
      });
    });

    return {
      slug: product.id,
      name: product.name,
      familySlug: slugify(product.family),
      familyName: product.family,
      gender: product.gender,
      description: product.description,
      heroImageUrl: product.image,
      heroImageAlt: product.imageAlt,
      isBestseller: product.bestseller,
      isNew: product.isNew,
      // numeric columns are handed to Postgres as strings to avoid float drift
      ratingAverage: product.rating.toFixed(1),
      reviewCount: product.reviewCount,
      sortOrder: productIndex,
      notes: product.notes.map((note, index) => ({
        slug: slugify(note),
        name: note,
        position: index,
      })),
      variants,
    };
  });
}
