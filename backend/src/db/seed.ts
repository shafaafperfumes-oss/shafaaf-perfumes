import { and, eq, notInArray, sql } from "drizzle-orm";
import { buildCatalogRows, type CatalogProductRow } from "./catalog-source.js";
import { closeDatabase, databaseHost, getDb, isDatabaseConfigured, type Database } from "./client.js";
import {
  fragranceFamilies,
  fragranceNotes,
  inventory,
  productImages,
  productNotes,
  products,
  productVariants,
} from "./schema/index.js";

/**
 * SEEDING THE CATALOG
 * ---------------------------------------------------------------
 * Run with:  npm run db:seed
 *
 * Safe to run more than once. Every write is an "upsert": if the row already
 * exists it is updated, otherwise it is inserted. Nothing outside the catalog
 * tables is touched, and existing stock counts are never reset — stock is
 * real-world data that a seed script must not overwrite.
 *
 * `excluded.<column>` below is Postgres' name for the row that could not be
 * inserted because of a conflict, i.e. "use the new value".
 */

const DEFAULT_STARTING_STOCK = 25;

export interface SeedCounters {
  families: number;
  notes: number;
  products: number;
  variants: number;
  images: number;
}

async function seedFamilies(db: Database, rows: CatalogProductRow[]) {
  const unique = new Map<string, string>();
  rows.forEach((row) => unique.set(row.familySlug, row.familyName));

  const saved = await db
    .insert(fragranceFamilies)
    .values([...unique.entries()].map(([slug, name], index) => ({ slug, name, sortOrder: index })))
    .onConflictDoUpdate({
      target: fragranceFamilies.slug,
      set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
    })
    .returning({ id: fragranceFamilies.id, slug: fragranceFamilies.slug });

  return new Map(saved.map((family) => [family.slug, family.id]));
}

async function seedNotes(db: Database, rows: CatalogProductRow[]) {
  const unique = new Map<string, string>();
  rows.forEach((row) => row.notes.forEach((note) => unique.set(note.slug, note.name)));

  const saved = await db
    .insert(fragranceNotes)
    .values([...unique.entries()].map(([slug, name]) => ({ slug, name })))
    .onConflictDoUpdate({
      target: fragranceNotes.slug,
      set: { name: sql`excluded.name` },
    })
    .returning({ id: fragranceNotes.id, slug: fragranceNotes.slug });

  return new Map(saved.map((note) => [note.slug, note.id]));
}

async function seedProduct(
  db: Database,
  row: CatalogProductRow,
  familyId: string | null,
): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({
      slug: row.slug,
      name: row.name,
      familyId,
      gender: row.gender,
      description: row.description,
      heroImageUrl: row.heroImageUrl,
      heroImageAlt: row.heroImageAlt,
      isBestseller: row.isBestseller,
      isNew: row.isNew,
      ratingAverage: row.ratingAverage,
      reviewCount: row.reviewCount,
      sortOrder: row.sortOrder,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: products.slug,
      set: {
        name: sql`excluded.name`,
        familyId: sql`excluded.family_id`,
        gender: sql`excluded.gender`,
        description: sql`excluded.description`,
        heroImageUrl: sql`excluded.hero_image_url`,
        heroImageAlt: sql`excluded.hero_image_alt`,
        isBestseller: sql`excluded.is_bestseller`,
        isNew: sql`excluded.is_new`,
        ratingAverage: sql`excluded.rating_average`,
        reviewCount: sql`excluded.review_count`,
        sortOrder: sql`excluded.sort_order`,
        isActive: sql`true`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error(`Could not save product "${row.slug}".`);
  }

  return product.id;
}

async function seedProductNotes(
  db: Database,
  productId: string,
  row: CatalogProductRow,
  noteIds: Map<string, string>,
) {
  const noteRows = row.notes
    .map((note) => ({ productId, noteId: noteIds.get(note.slug), position: note.position }))
    .filter((note): note is { productId: string; noteId: string; position: number } =>
      Boolean(note.noteId),
    );

  if (noteRows.length === 0) return;

  await db
    .insert(productNotes)
    .values(noteRows)
    .onConflictDoUpdate({
      target: [productNotes.productId, productNotes.noteId],
      set: { position: sql`excluded.position` },
    });

  // Remove links to notes the website no longer lists for this fragrance.
  await db.delete(productNotes).where(
    and(
      eq(productNotes.productId, productId),
      notInArray(
        productNotes.noteId,
        noteRows.map((note) => note.noteId),
      ),
    ),
  );
}

async function seedImages(db: Database, productId: string, row: CatalogProductRow): Promise<number> {
  const imageRows = [row.heroImageUrl, row.heroImageAlt]
    .filter((url): url is string => Boolean(url))
    .map((url, index) => ({ productId, url, alt: row.name, position: index }));

  if (imageRows.length === 0) return 0;

  await db.insert(productImages).values(imageRows).onConflictDoNothing();
  return imageRows.length;
}

async function seedVariants(
  db: Database,
  productId: string,
  row: CatalogProductRow,
): Promise<number> {
  const saved = await db
    .insert(productVariants)
    .values(
      row.variants.map((variant) => ({
        productId,
        sku: variant.sku,
        variantType: variant.variantType,
        sizeLabel: variant.sizeLabel,
        sizeMl: variant.sizeMl,
        pricePaise: variant.pricePaise,
        compareAtPricePaise: variant.compareAtPricePaise,
        position: variant.position,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: productVariants.sku,
      set: {
        variantType: sql`excluded.variant_type`,
        sizeLabel: sql`excluded.size_label`,
        sizeMl: sql`excluded.size_ml`,
        pricePaise: sql`excluded.price_paise`,
        compareAtPricePaise: sql`excluded.compare_at_price_paise`,
        position: sql`excluded.position`,
        isActive: sql`true`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: productVariants.id });

  // Give brand-new variants an opening stock figure. `onConflictDoNothing`
  // means a re-run leaves real stock counts exactly as they are.
  await db
    .insert(inventory)
    .values(saved.map((variant) => ({ variantId: variant.id, quantity: DEFAULT_STARTING_STOCK })))
    .onConflictDoNothing();

  return saved.length;
}

export async function seedCatalog(): Promise<SeedCounters> {
  const db = getDb();
  const rows = buildCatalogRows();
  const counters: SeedCounters = { families: 0, notes: 0, products: 0, variants: 0, images: 0 };

  const familyIds = await seedFamilies(db, rows);
  const noteIds = await seedNotes(db, rows);
  counters.families = familyIds.size;
  counters.notes = noteIds.size;

  for (const row of rows) {
    const productId = await seedProduct(db, row, familyIds.get(row.familySlug) ?? null);
    counters.products += 1;

    await seedProductNotes(db, productId, row, noteIds);
    counters.images += await seedImages(db, productId, row);
    counters.variants += await seedVariants(db, productId, row);
  }

  return counters;
}

/**
 * Hides any product still in the database that the website no longer lists.
 * It is deactivated, never deleted, so past orders keep their history.
 */
export async function deactivateRemovedProducts(): Promise<number> {
  const db = getDb();
  const slugs = buildCatalogRows().map((row) => row.slug);

  const updated = await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(notInArray(products.slug, slugs), eq(products.isActive, true)))
    .returning({ slug: products.slug });

  return updated.length;
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "No DATABASE_URL found. Add the Supabase connection string to backend/.env first.",
    );
    process.exit(1);
  }

  console.log(`Seeding catalog into ${databaseHost() ?? "the database"} ...`);

  try {
    const counters = await seedCatalog();
    const deactivated = await deactivateRemovedProducts();

    console.log(
      [
        "Seed complete:",
        `  families : ${counters.families}`,
        `  notes    : ${counters.notes}`,
        `  products : ${counters.products}`,
        `  variants : ${counters.variants}`,
        `  images   : ${counters.images}`,
        deactivated > 0 ? `  deactivated (no longer on the site): ${deactivated}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (error) {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

// Runs only when this file is executed directly (`npm run db:seed`).
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  await main();
}
