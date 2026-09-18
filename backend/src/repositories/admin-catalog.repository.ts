import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  fragranceFamilies,
  fragranceNotes,
  inventory,
  productNotes,
  productVariants,
  products,
  type Product,
  type ProductVariant,
  type VariantType,
} from "../db/schema/index.js";
import { writeAuditLog, type AuditContext } from "./audit.repository.js";

/**
 * ADMIN CATALOG MANAGEMENT
 * ---------------------------------------------------------------
 * The write side of the catalog, reachable only through the admin router.
 * Two rules from the architecture hold everywhere in this file:
 *
 *  - **Products and variants are deactivated, never deleted.** Past orders
 *    keep pointing at them (`order_items.variantId` is `onDelete: restrict`),
 *    so "remove from the shop" means `isActive: false`, which simply stops
 *    them appearing in the public catalog.
 *  - **Every change writes an audit row in the same transaction**, so the
 *    log can never disagree with what actually happened.
 *
 * Prices arrive and leave here as integer paise, exactly as they are
 * stored — the rupee conversion belongs to the public read model, not to
 * an admin screen that is editing the real stored value.
 */

export class SlugTakenError extends Error {}
export class SkuTakenError extends Error {}
export class ProductNotFoundError extends Error {}
export class UnknownCategoryError extends Error {}

export interface AdminProductSummary {
  id: string;
  slug: string;
  name: string;
  family: string | null;
  gender: string;
  isActive: boolean;
  isBestseller: boolean;
  isNew: boolean;
  variantCount: number;
  stockOnHand: number;
  createdAt: Date;
}

export interface AdminProductPage {
  products: AdminProductSummary[];
  total: number;
}

/**
 * Unlike the public catalog, this lists inactive products too — hiding
 * something from customers must not hide it from the person who hid it.
 */
export async function listAdminProducts(options: {
  page: number;
  perPage: number;
  search?: string;
  isActive?: boolean;
}): Promise<AdminProductPage> {
  const db = getDb();

  const filters = [
    options.search ? ilike(products.name, `%${options.search}%`) : undefined,
    options.isActive === undefined ? undefined : eq(products.isActive, options.isActive),
  ].filter((filter): filter is Exclude<typeof filter, undefined> => filter !== undefined);

  let rowsQuery = db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      family: fragranceFamilies.name,
      gender: products.gender,
      isActive: products.isActive,
      isBestseller: products.isBestseller,
      isNew: products.isNew,
      createdAt: products.createdAt,
    })
    .from(products)
    .leftJoin(fragranceFamilies, eq(products.familyId, fragranceFamilies.id))
    .$dynamic();

  let countQuery = db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(products).$dynamic();

  if (filters.length > 0) {
    rowsQuery = rowsQuery.where(and(...filters));
    countQuery = countQuery.where(and(...filters));
  }

  const [rows, [totals]] = await Promise.all([
    rowsQuery
      .orderBy(asc(products.sortOrder), asc(products.name))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    countQuery,
  ]);

  if (rows.length === 0) return { products: [], total: totals?.count ?? 0 };

  const stockRows = await db
    .select({
      productId: productVariants.productId,
      variantCount: sql<number>`count(*)`.mapWith(Number),
      stockOnHand: sql<number>`coalesce(sum(${inventory.quantity}), 0)`.mapWith(Number),
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(
      inArray(
        productVariants.productId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(productVariants.productId);
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row]));

  return {
    products: rows.map((row) => ({
      ...row,
      variantCount: stockByProduct.get(row.id)?.variantCount ?? 0,
      stockOnHand: stockByProduct.get(row.id)?.stockOnHand ?? 0,
    })),
    total: totals?.count ?? 0,
  };
}

export interface AdminVariantDetail {
  id: string;
  sku: string;
  variantType: VariantType;
  sizeLabel: string;
  sizeMl: number;
  pricePaise: number;
  compareAtPricePaise: number | null;
  isActive: boolean;
  position: number;
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface AdminProductDetail extends Omit<AdminProductSummary, "variantCount" | "stockOnHand"> {
  familyId: string | null;
  description: string;
  /** Fragrance notes in display order, read-only here (the shop shows them). */
  notes: string[];
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  sortOrder: number;
  variants: AdminVariantDetail[];
}

/** Returns null when no product has that id. */
export async function getAdminProduct(productId: string): Promise<AdminProductDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      familyId: products.familyId,
      family: fragranceFamilies.name,
      gender: products.gender,
      description: products.description,
      heroImageUrl: products.heroImageUrl,
      heroImageAlt: products.heroImageAlt,
      isActive: products.isActive,
      isBestseller: products.isBestseller,
      isNew: products.isNew,
      sortOrder: products.sortOrder,
      createdAt: products.createdAt,
    })
    .from(products)
    .leftJoin(fragranceFamilies, eq(products.familyId, fragranceFamilies.id))
    .where(eq(products.id, productId));

  if (!row) return null;

  const noteRows = await db
    .select({ name: fragranceNotes.name })
    .from(productNotes)
    .innerJoin(fragranceNotes, eq(productNotes.noteId, fragranceNotes.id))
    .where(eq(productNotes.productId, productId))
    .orderBy(asc(productNotes.position));

  const variants = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      variantType: productVariants.variantType,
      sizeLabel: productVariants.sizeLabel,
      sizeMl: productVariants.sizeMl,
      pricePaise: productVariants.pricePaise,
      compareAtPricePaise: productVariants.compareAtPricePaise,
      isActive: productVariants.isActive,
      position: productVariants.position,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      lowStockThreshold: inventory.lowStockThreshold,
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.position), asc(productVariants.sku));

  return {
    ...row,
    notes: noteRows.map((note) => note.name),
    variants: variants.map((variant) => ({
      ...variant,
      quantity: variant.quantity ?? 0,
      reserved: variant.reserved ?? 0,
      lowStockThreshold: variant.lowStockThreshold ?? 0,
    })),
  };
}

export interface ProductInput {
  slug: string;
  name: string;
  familyId?: string | null;
  gender?: string;
  description?: string;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  isBestseller?: boolean;
  isNew?: boolean;
  sortOrder?: number;
}

async function assertCategoryExists(familyId: string): Promise<void> {
  const [family] = await getDb()
    .select({ id: fragranceFamilies.id })
    .from(fragranceFamilies)
    .where(eq(fragranceFamilies.id, familyId));
  if (!family) throw new UnknownCategoryError("No category matches that id.");
}

export async function createProduct(actor: AuditContext, input: ProductInput): Promise<Product> {
  const db = getDb();

  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, input.slug));
  if (existing) throw new SlugTakenError("Another product already uses that web address (slug).");
  if (input.familyId) await assertCategoryExists(input.familyId);

  return db.transaction(async (tx) => {
    const [product] = await tx.insert(products).values(input).returning();
    if (!product) throw new Error("Could not create the product.");

    await writeAuditLog(tx, actor, "product.create", "product", product.id, {
      slug: product.slug,
      name: product.name,
    });
    return product;
  });
}

export type ProductChanges = Partial<ProductInput> & { isActive?: boolean };

/** Returns null when no product has that id. */
export async function updateProduct(
  actor: AuditContext,
  productId: string,
  changes: ProductChanges,
): Promise<Product | null> {
  const db = getDb();

  if (changes.slug) {
    const [clash] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.slug, changes.slug), sql`${products.id} <> ${productId}`));
    if (clash) throw new SlugTakenError("Another product already uses that web address (slug).");
  }
  if (changes.familyId) await assertCategoryExists(changes.familyId);

  return db.transaction(async (tx) => {
    const [product] = await tx
      .update(products)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();

    if (!product) return null;

    await writeAuditLog(tx, actor, "product.update", "product", product.id, { changes });
    return product;
  });
}

export interface VariantInput {
  sku: string;
  variantType: VariantType;
  sizeLabel: string;
  sizeMl: number;
  pricePaise: number;
  compareAtPricePaise?: number | null;
  position?: number;
  /** Stock to start the new variant with; its inventory row is created either way. */
  quantity?: number;
}

export async function createVariant(
  actor: AuditContext,
  productId: string,
  input: VariantInput,
): Promise<ProductVariant> {
  const db = getDb();

  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!product) throw new ProductNotFoundError("No product matches that id.");

  const [clash] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, input.sku));
  if (clash) throw new SkuTakenError("Another variant already uses that SKU.");

  const { quantity = 0, ...variantColumns } = input;

  return db.transaction(async (tx) => {
    const [variant] = await tx
      .insert(productVariants)
      .values({ ...variantColumns, productId })
      .returning();
    if (!variant) throw new Error("Could not create the variant.");

    // Every variant needs an inventory row from the moment it exists —
    // checkout inner-joins inventory and would never see a variant without one.
    await tx.insert(inventory).values({ variantId: variant.id, quantity });

    await writeAuditLog(tx, actor, "variant.create", "variant", variant.id, {
      productId,
      sku: variant.sku,
      pricePaise: variant.pricePaise,
      quantity,
    });
    return variant;
  });
}

export interface VariantChanges {
  sizeLabel?: string;
  pricePaise?: number;
  compareAtPricePaise?: number | null;
  isActive?: boolean;
  position?: number;
}

/** Returns null when no variant has that id. */
export async function updateVariant(
  actor: AuditContext,
  variantId: string,
  changes: VariantChanges,
): Promise<ProductVariant | null> {
  return getDb().transaction(async (tx) => {
    const [variant] = await tx
      .update(productVariants)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId))
      .returning();

    if (!variant) return null;

    await writeAuditLog(tx, actor, "variant.update", "variant", variant.id, { changes });
    return variant;
  });
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  productCount: number;
}

export async function listCategories(): Promise<AdminCategory[]> {
  const db = getDb();
  return db
    .select({
      id: fragranceFamilies.id,
      slug: fragranceFamilies.slug,
      name: fragranceFamilies.name,
      description: fragranceFamilies.description,
      sortOrder: fragranceFamilies.sortOrder,
      productCount: sql<number>`count(${products.id})`.mapWith(Number),
    })
    .from(fragranceFamilies)
    .leftJoin(products, eq(products.familyId, fragranceFamilies.id))
    .groupBy(fragranceFamilies.id)
    .orderBy(asc(fragranceFamilies.sortOrder), asc(fragranceFamilies.name));
}

export interface CategoryInput {
  slug: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export async function createCategory(actor: AuditContext, input: CategoryInput) {
  const db = getDb();

  const [clash] = await db
    .select({ id: fragranceFamilies.id })
    .from(fragranceFamilies)
    .where(eq(fragranceFamilies.slug, input.slug));
  if (clash) throw new SlugTakenError("Another category already uses that web address (slug).");

  return db.transaction(async (tx) => {
    const [category] = await tx.insert(fragranceFamilies).values(input).returning();
    if (!category) throw new Error("Could not create the category.");

    await writeAuditLog(tx, actor, "category.create", "category", category.id, { slug: category.slug });
    return category;
  });
}

/** Returns null when no category has that id. */
export async function updateCategory(
  actor: AuditContext,
  categoryId: string,
  changes: Partial<CategoryInput>,
) {
  const db = getDb();

  if (changes.slug) {
    const [clash] = await db
      .select({ id: fragranceFamilies.id })
      .from(fragranceFamilies)
      .where(and(eq(fragranceFamilies.slug, changes.slug), sql`${fragranceFamilies.id} <> ${categoryId}`));
    if (clash) throw new SlugTakenError("Another category already uses that web address (slug).");
  }

  return db.transaction(async (tx) => {
    const [category] = await tx
      .update(fragranceFamilies)
      .set(changes)
      .where(eq(fragranceFamilies.id, categoryId))
      .returning();

    if (!category) return null;

    await writeAuditLog(tx, actor, "category.update", "category", category.id, { changes });
    return category;
  });
}
