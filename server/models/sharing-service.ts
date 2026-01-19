import { getDb } from "../db";
import {
  modelShares,
  modelShareReferences,
  type ModelShare,
  type InsertModelShare,
  type InsertModelShareReference,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Model Sharing Service
 * Handles model sharing with reference counting and automatic cleanup
 */

/**
 * Create a new shared model entry
 */
export async function createModelShare(data: InsertModelShare): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if this model already exists (by checksum for deduplication)
  if (data.checksum) {
    const [existing] = await db
      .select()
      .from(modelShares)
      .where(eq(modelShares.checksum, data.checksum))
      .limit(1);
    
    if (existing) {
      // Increment reference count
      await incrementReferenceCount(existing.id);
      return existing.id;
    }
  }
  
  const [result] = await db.insert(modelShares).values(data).returning();
  return result.id;
}

/**
 * Add a reference to a shared model
 */
export async function addShareReference(data: InsertModelShareReference): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(modelShareReferences).values(data);
  await incrementReferenceCount(data.shareId);
}

/**
 * Remove a reference from a shared model
 */
export async function removeShareReference(referenceId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [reference] = await db
    .select()
    .from(modelShareReferences)
    .where(eq(modelShareReferences.id, referenceId))
    .limit(1);
  
  if (!reference) return;
  
  await db.delete(modelShareReferences).where(eq(modelShareReferences.id, referenceId));
  await decrementReferenceCount(reference.shareId);
}

/**
 * Increment reference count for a share
 */
async function incrementReferenceCount(shareId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [share] = await db
    .select()
    .from(modelShares)
    .where(eq(modelShares.id, shareId))
    .limit(1);
  
  if (!share) return;
  
  await db
    .update(modelShares)
    .set({ referenceCount: (share.referenceCount || 0) + 1 })
    .where(eq(modelShares.id, shareId));
}

/**
 * Decrement reference count and cleanup if zero
 */
async function decrementReferenceCount(shareId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [share] = await db
    .select()
    .from(modelShares)
    .where(eq(modelShares.id, shareId))
    .limit(1);
  
  if (!share) return;
  
  const newCount = Math.max(0, (share.referenceCount || 1) - 1);
  
  if (newCount === 0) {
    // No more references, delete the share
    await db.delete(modelShares).where(eq(modelShares.id, shareId));
    // TODO: Also delete the actual file from S3/storage
  } else {
    await db
      .update(modelShares)
      .set({ referenceCount: newCount })
      .where(eq(modelShares.id, shareId));
  }
}

/**
 * Get all shares for a model
 */
export async function getModelShares(modelId: number): Promise<ModelShare[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(modelShares)
    .where(eq(modelShares.modelId, modelId));
}

/**
 * Get shares accessible by a user
 */
export async function getUserShares(userId: number): Promise<ModelShare[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(modelShares)
    .where(eq(modelShares.ownerId, userId));
}

/**
 * Get storage savings from sharing
 */
export async function getStorageSavings(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const shares = await getUserShares(userId);
  
  let totalSize = 0;
  let savedSize = 0;
  
  for (const share of shares) {
    const fileSize = parseFloat(share.fileSize || "0");
    totalSize += fileSize;
    
    // If reference count > 1, we saved storage
    if ((share.referenceCount || 1) > 1) {
      savedSize += fileSize * ((share.referenceCount || 1) - 1);
    }
  }
  
  return {
    totalSize: totalSize.toString(),
    savedSize: savedSize.toString(),
    savingsPercentage: totalSize > 0 ? ((savedSize / (totalSize + savedSize)) * 100).toFixed(2) : "0",
  };
}
