import { and, asc, eq } from "drizzle-orm";
import { getDb, type Database, type Tx } from "../db/client.js";
import { addresses, type Address } from "../db/schema/index.js";

export interface AddressInput {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
}

export async function listAddresses(userId: string): Promise<Address[]> {
  const db = getDb();
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(asc(addresses.createdAt));
}

/** Returns null if the address does not exist or belongs to someone else. */
export async function getAddress(userId: string, addressId: string): Promise<Address | null> {
  const db = getDb();
  const [address] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));
  return address ?? null;
}

/**
 * Making an address the default clears the flag on every other address
 * the same customer owns first, inside one transaction — never two
 * "default" addresses at once, and never a moment with zero if the
 * write fails partway.
 */
async function clearOtherDefaults(
  db: Database | Tx,
  userId: string,
  keepId?: string,
): Promise<void> {
  const rows = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId));
  const idsToClear = rows.map((row) => row.id).filter((id) => id !== keepId);
  if (idsToClear.length === 0) return;

  await Promise.all(
    idsToClear.map((id) => db.update(addresses).set({ isDefault: false }).where(eq(addresses.id, id))),
  );
}

export async function createAddress(userId: string, input: AddressInput): Promise<Address> {
  const db = getDb();

  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await clearOtherDefaults(tx, userId);
    }

    const [address] = await tx
      .insert(addresses)
      .values({ userId, ...input })
      .returning();

    if (!address) {
      throw new Error("Could not save the address.");
    }
    return address;
  });
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: Partial<AddressInput>,
): Promise<Address | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await clearOtherDefaults(tx, userId, addressId);
    }

    const [address] = await tx
      .update(addresses)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
      .returning();

    return address ?? null;
  });
}

/** Returns true only if a row the caller owns was actually deleted. */
export async function deleteAddress(userId: string, addressId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)))
    .returning({ id: addresses.id });
  return deleted.length > 0;
}
