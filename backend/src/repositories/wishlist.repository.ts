import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { products, wishlists } from "../db/schema/index.js";

export interface WishlistEntry {
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  imageAlt: string | null;
  addedAt: Date;
}

export async function listWishlist(userId: string): Promise<WishlistEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      name: products.name,
      image: products.heroImageUrl,
      imageAlt: products.heroImageAlt,
      addedAt: wishlists.createdAt,
    })
    .from(wishlists)
    .innerJoin(products, eq(wishlists.productId, products.id))
    .where(and(eq(wishlists.userId, userId), eq(products.isActive, true)))
    .orderBy(asc(wishlists.createdAt));

  return rows;
}

/** True if the product exists and is currently sellable/visible. */
async function productIsActive(productId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.isActive, true)));
  return Boolean(row);
}

export class UnknownProductError extends Error {}

/** Idempotent — adding a product already on the wishlist changes nothing. */
export async function addToWishlist(userId: string, productId: string): Promise<void> {
  if (!(await productIsActive(productId))) {
    throw new UnknownProductError("That product could not be found.");
  }

  const db = getDb();
  await db.insert(wishlists).values({ userId, productId }).onConflictDoNothing();
}

/** Returns true only if a row the caller owned was actually removed. */
export async function removeFromWishlist(userId: string, productId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(wishlists)
    .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)))
    .returning({ productId: wishlists.productId });
  return deleted.length > 0;
}
