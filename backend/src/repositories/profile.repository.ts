import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { profiles, type Profile } from "../db/schema/index.js";

export async function getProfileById(userId: string): Promise<Profile | null> {
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return profile ?? null;
}

export interface ProfileUpdate {
  fullName?: string | null;
  phone?: string | null;
}

/**
 * Updates a profile the sign-up trigger already created. Never inserts —
 * a profile with no matching row means something is wrong with the
 * trigger, not something this endpoint should paper over.
 */
export async function updateProfile(userId: string, changes: ProfileUpdate): Promise<Profile | null> {
  const db = getDb();
  const [profile] = await db
    .update(profiles)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning();
  return profile ?? null;
}
