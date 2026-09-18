import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  fragranceFamilies,
  fragranceNotes,
  productNotes,
  products,
  productVariants,
  VARIANT_TYPE_LABEL,
} from "../db/schema/index.js";

/**
 * PUBLIC CATALOG READ MODEL
 * ---------------------------------------------------------------
 * Shapes database rows into exactly the `Product` shape the website
 * already knows how to render (see js/data/products.js) — same field
 * names, same nesting, prices back in whole rupees. A future frontend
 * that fetches this can drop the shape straight into its existing
 * rendering code with no translation layer of its own.
 *
 * Only active products/variants are ever returned here — a product
 * hidden by the (future) admin panel simply stops appearing, its
 * history in past orders untouched.
 */

export interface CatalogSize {
  /** The variant's id — what the cart API takes in `POST /cart/items`.
   *  Not secret: it identifies a size the way the slug identifies a product. */
  variantId: string;
  label: string;
  ml: number;
  /** Whole rupees, e.g. 599 — never paise. This is the one place the stored
   *  integer paise value is converted back for anything outside the database. */
  price: number;
  /** Regular price in whole rupees when `price` is an offer, else null. */
  compareAt: number | null;
}

export interface CatalogVariant {
  type: string; // "Perfume" | "Attar" | "Bakhoor" — see VARIANT_TYPE_LABEL
  sizes: CatalogSize[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  family: string;
  gender: string;
  notes: string[];
  description: string;
  image: string | null;
  imageAlt: string | null;
  bestseller: boolean;
  isNew: boolean;
  rating: number;
  reviewCount: number;
  variants: CatalogVariant[];
}

interface ProductRow {
  productId: string;
  slug: string;
  name: string;
  familyName: string | null;
  gender: string;
  description: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  isBestseller: boolean;
  isNew: boolean;
  ratingAverage: string;
  reviewCount: number;
}

type Db = ReturnType<typeof getDb>;

async function selectActiveProductRows(db: Db, slug?: string): Promise<ProductRow[]> {
  const where = slug
    ? and(eq(products.isActive, true), eq(products.slug, slug))
    : eq(products.isActive, true);

  return db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      familyName: fragranceFamilies.name,
      gender: products.gender,
      description: products.description,
      heroImageUrl: products.heroImageUrl,
      heroImageAlt: products.heroImageAlt,
      isBestseller: products.isBestseller,
      isNew: products.isNew,
      ratingAverage: products.ratingAverage,
      reviewCount: products.reviewCount,
    })
    .from(products)
    .leftJoin(fragranceFamilies, eq(products.familyId, fragranceFamilies.id))
    .where(where)
    .orderBy(asc(products.sortOrder));
}

async function attachNotesAndVariants(db: Db, rows: ProductRow[]): Promise<CatalogProduct[]> {
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.productId);

  const [noteRows, variantRows] = await Promise.all([
    db
      .select({
        productId: productNotes.productId,
        name: fragranceNotes.name,
        position: productNotes.position,
      })
      .from(productNotes)
      .innerJoin(fragranceNotes, eq(productNotes.noteId, fragranceNotes.id))
      .where(inArray(productNotes.productId, productIds))
      .orderBy(asc(productNotes.position)),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        variantType: productVariants.variantType,
        sizeLabel: productVariants.sizeLabel,
        sizeMl: productVariants.sizeMl,
        pricePaise: productVariants.pricePaise,
        compareAtPricePaise: productVariants.compareAtPricePaise,
        position: productVariants.position,
      })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.position)),
  ]);

  const notesByProduct = new Map<string, string[]>();
  noteRows.forEach((note) => {
    const list = notesByProduct.get(note.productId) ?? [];
    list.push(note.name);
    notesByProduct.set(note.productId, list);
  });

  const variantsByProduct = new Map<string, CatalogVariant[]>();
  variantRows.forEach((variant) => {
    const list = variantsByProduct.get(variant.productId) ?? [];
    const typeLabel = VARIANT_TYPE_LABEL[variant.variantType];
    let group = list.find((v) => v.type === typeLabel);
    if (!group) {
      group = { type: typeLabel, sizes: [] };
      list.push(group);
    }
    group.sizes.push({
      variantId: variant.id,
      label: variant.sizeLabel,
      ml: variant.sizeMl,
      // Paise -> rupees, the one conversion point for anything leaving the DB.
      price: variant.pricePaise / 100,
      compareAt: variant.compareAtPricePaise === null ? null : variant.compareAtPricePaise / 100,
    });
    variantsByProduct.set(variant.productId, list);
  });

  return rows.map((row) => ({
    id: row.slug,
    name: row.name,
    family: row.familyName ?? "",
    gender: row.gender,
    notes: notesByProduct.get(row.productId) ?? [],
    description: row.description,
    image: row.heroImageUrl,
    imageAlt: row.heroImageAlt,
    bestseller: row.isBestseller,
    isNew: row.isNew,
    rating: Number(row.ratingAverage),
    reviewCount: row.reviewCount,
    variants: variantsByProduct.get(row.productId) ?? [],
  }));
}

/** Every product the shop currently sells, in the site's display order. */
export async function listActiveProducts(): Promise<CatalogProduct[]> {
  const db = getDb();
  const rows = await selectActiveProductRows(db);
  return attachNotesAndVariants(db, rows);
}

/** One product by its url slug, or null if it does not exist or is hidden. */
export async function getActiveProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const db = getDb();
  const rows = await selectActiveProductRows(db, slug);
  const [product] = await attachNotesAndVariants(db, rows);
  return product ?? null;
}
