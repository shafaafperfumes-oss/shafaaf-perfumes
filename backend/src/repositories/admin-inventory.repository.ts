import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { inventory, inventoryMovements, productVariants, products } from "../db/schema/index.js";
import { writeAuditLog, type AuditContext } from "./audit.repository.js";

/**
 * ADMIN STOCK ADJUSTMENTS
 * ---------------------------------------------------------------
 * The only way stock changes outside of checkout. It follows exactly the
 * same rules `placeOrder` and `markOrderPaid` follow, for the same reason:
 *
 *  - the inventory row is locked (`SELECT ... FOR UPDATE`) so an admin
 *    correction and a customer's checkout cannot interleave and lose one
 *    another's change,
 *  - the change and its `inventory_movements` ledger entry are written in
 *    one transaction, so "why did stock change" always has an answer,
 *  - stock already promised to unpaid orders (`reserved`) is never taken
 *    away by an adjustment — the database's own check constraint would
 *    reject it anyway, but this fails with a clear message first.
 */

export class VariantNotFoundError extends Error {}

export class InvalidAdjustmentError extends Error {
  readonly quantity: number;
  readonly reserved: number;
  constructor(message: string, quantity: number, reserved: number) {
    super(message);
    this.quantity = quantity;
    this.reserved = reserved;
  }
}

export interface StockLevel {
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  reserved: number;
  available: number;
}

/**
 * Applies a relative change (`delta` may be negative) to stock on hand.
 * Relative, not absolute: two people correcting stock at the same time
 * should both be counted, rather than the second silently overwriting
 * the first with a number that was already stale when they typed it.
 */
export async function adjustStock(
  actor: AuditContext,
  variantId: string,
  delta: number,
  note: string,
): Promise<StockLevel> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        variantId: inventory.variantId,
        quantity: inventory.quantity,
        reserved: inventory.reserved,
        sku: productVariants.sku,
        productName: products.name,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(inventory.variantId, variantId))
      .for("update", { of: inventory });

    if (!row) throw new VariantNotFoundError("No variant matches that id.");

    const newQuantity = row.quantity + delta;
    if (newQuantity < 0) {
      throw new InvalidAdjustmentError(
        `That would take stock below zero. There are ${row.quantity} in stock right now.`,
        row.quantity,
        row.reserved,
      );
    }
    if (newQuantity < row.reserved) {
      throw new InvalidAdjustmentError(
        `${row.reserved} of these are already promised to orders that have not been paid for yet, so stock cannot go below ${row.reserved}.`,
        row.quantity,
        row.reserved,
      );
    }

    await tx
      .update(inventory)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(inventory.variantId, variantId));

    await tx.insert(inventoryMovements).values({
      variantId,
      reason: "admin_adjustment",
      quantityChange: delta,
    });

    await writeAuditLog(tx, actor, "inventory.adjust", "variant", variantId, {
      delta,
      note,
      from: row.quantity,
      to: newQuantity,
    });

    return {
      variantId,
      sku: row.sku,
      productName: row.productName,
      quantity: newQuantity,
      reserved: row.reserved,
      available: newQuantity - row.reserved,
    };
  });
}

export interface LowStockRow extends StockLevel {
  lowStockThreshold: number;
}

/** Everything at or below its own low-stock threshold — the restock list. */
export async function listLowStock(): Promise<LowStockRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      variantId: inventory.variantId,
      sku: productVariants.sku,
      productName: products.name,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      lowStockThreshold: inventory.lowStockThreshold,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(sql`${inventory.quantity} - ${inventory.reserved} <= ${inventory.lowStockThreshold}`)
    .orderBy(inventory.quantity);

  return rows.map((row) => ({ ...row, available: row.quantity - row.reserved }));
}
