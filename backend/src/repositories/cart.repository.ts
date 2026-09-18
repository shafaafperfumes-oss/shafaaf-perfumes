import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { cartItems, carts, products, productVariants, type VariantType } from "../db/schema/index.js";

/**
 * SERVER-SIDE CART
 * ---------------------------------------------------------------
 * One cart row per signed-in customer, created the first time they add
 * something — a customer who never adds anything never gets an empty row.
 *
 * Each line remembers the price at the moment it was added
 * (`unitPricePaise`), so a catalog price change never silently changes
 * what a customer already sees sitting in their own cart. Checkout, in a
 * later phase, is what actually re-checks the live price before charging
 * anyone — this snapshot is only for what the cart itself displays.
 */

const MAX_QUANTITY_PER_LINE = 20;

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantType: VariantType;
  sizeLabel: string;
  sizeMl: number;
  quantity: number;
  /** Whole rupees — the one conversion point for anything leaving the database. */
  unitPrice: number;
  lineTotal: number;
}

export interface CartSummary {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
}

function summarize(
  rows: Array<{
    id: string;
    variantId: string;
    productId: string;
    productSlug: string;
    productName: string;
    variantType: VariantType;
    sizeLabel: string;
    sizeMl: number;
    quantity: number;
    unitPricePaise: number;
  }>,
): CartSummary {
  const items = rows.map((row) => ({
    id: row.id,
    variantId: row.variantId,
    productId: row.productId,
    productSlug: row.productSlug,
    productName: row.productName,
    variantType: row.variantType,
    sizeLabel: row.sizeLabel,
    sizeMl: row.sizeMl,
    quantity: row.quantity,
    unitPrice: row.unitPricePaise / 100,
    lineTotal: (row.unitPricePaise * row.quantity) / 100,
  }));

  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

async function selectCartRows(cartId: string) {
  const db = getDb();
  return db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      variantType: productVariants.variantType,
      sizeLabel: productVariants.sizeLabel,
      sizeMl: productVariants.sizeMl,
      quantity: cartItems.quantity,
      unitPricePaise: cartItems.unitPricePaise,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(cartItems.createdAt);
}

async function findCart(userId: string) {
  const db = getDb();
  const [cart] = await db.select().from(carts).where(eq(carts.userId, userId));
  return cart ?? null;
}

async function getOrCreateCart(userId: string) {
  const existing = await findCart(userId);
  if (existing) return existing;

  const db = getDb();
  const [cart] = await db.insert(carts).values({ userId }).onConflictDoNothing().returning();
  return cart ?? (await findCart(userId))!;
}

/** An active product variant, or null if it does not exist / is hidden from sale. */
async function findSellableVariant(variantId: string) {
  const db = getDb();
  const [variant] = await db
    .select({
      id: productVariants.id,
      pricePaise: productVariants.pricePaise,
      productId: products.id,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(eq(productVariants.id, variantId), eq(productVariants.isActive, true), eq(products.isActive, true)),
    );
  return variant ?? null;
}

export async function getCart(userId: string): Promise<CartSummary> {
  const cart = await findCart(userId);
  if (!cart) return { items: [], itemCount: 0, subtotal: 0 };
  return summarize(await selectCartRows(cart.id));
}

export class UnsellableVariantError extends Error {}

export async function addToCart(userId: string, variantId: string, quantity: number): Promise<CartSummary> {
  const variant = await findSellableVariant(variantId);
  if (!variant) {
    throw new UnsellableVariantError("That item is no longer available.");
  }

  const db = getDb();
  const cart = await getOrCreateCart(userId);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));

    if (existing) {
      const newQuantity = Math.min(existing.quantity + quantity, MAX_QUANTITY_PER_LINE);
      await tx
        .update(cartItems)
        .set({ quantity: newQuantity, updatedAt: new Date() })
        .where(eq(cartItems.id, existing.id));
    } else {
      await tx.insert(cartItems).values({
        cartId: cart.id,
        variantId,
        quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE),
        unitPricePaise: variant.pricePaise,
      });
    }
  });

  return summarize(await selectCartRows(cart.id));
}

/** Returns null if the item does not exist or belongs to someone else's cart. */
export async function updateCartItemQuantity(
  userId: string,
  itemId: string,
  quantity: number,
): Promise<CartSummary | null> {
  const cart = await findCart(userId);
  if (!cart) return null;

  const db = getDb();
  const updated = await db
    .update(cartItems)
    .set({ quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE), updatedAt: new Date() })
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
    .returning({ id: cartItems.id });

  if (updated.length === 0) return null;
  return summarize(await selectCartRows(cart.id));
}

/** Returns null if the item does not exist or belongs to someone else's cart. */
export async function removeCartItem(userId: string, itemId: string): Promise<CartSummary | null> {
  const cart = await findCart(userId);
  if (!cart) return null;

  const db = getDb();
  const deleted = await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
    .returning({ id: cartItems.id });

  if (deleted.length === 0) return null;
  return summarize(await selectCartRows(cart.id));
}

export async function clearCart(userId: string): Promise<void> {
  const cart = await findCart(userId);
  if (!cart) return;

  const db = getDb();
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
}
