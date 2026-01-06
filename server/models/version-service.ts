import { getDb } from "../db";
import { modelVersions, type ModelVersion, type InsertModelVersion } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Model Version Management Service
 * Handles versioning, changelogs, and version switching
 */

/**
 * Create a new model version
 */
export async function createModelVersion(data: InsertModelVersion): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  // If this is marked as latest, unmark all other versions for this model
  if (data.isLatest) {
    await db
      .update(modelVersions)
      .set({ isLatest: false })
      .where(eq(modelVersions.modelId, data.modelId));
  }

  const [result] = await db.insert(modelVersions).values(data);
  return result.insertId;
}

/**
 * Get all versions for a model
 */
export async function getModelVersions(modelId: number): Promise<ModelVersion[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.modelId, modelId))
    .orderBy(desc(modelVersions.releaseDate));
}

/**
 * Get a specific version
 */
export async function getModelVersion(versionId: number): Promise<ModelVersion | undefined> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [version] = await db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.id, versionId))
    .limit(1);
  
  return version;
}

/**
 * Get the latest version for a model
 */
export async function getLatestModelVersion(modelId: number): Promise<ModelVersion | undefined> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [version] = await db
    .select()
    .from(modelVersions)
    .where(
      and(
        eq(modelVersions.modelId, modelId),
        eq(modelVersions.isLatest, true)
      )
    )
    .limit(1);
  
  return version;
}

/**
 * Mark a version as latest
 */
export async function setLatestVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const version = await getModelVersion(versionId);
  if (!version) {
    throw new Error(`Version ${versionId} not found`);
  }

  // Unmark all other versions for this model
  await db
    .update(modelVersions)
    .set({ isLatest: false })
    .where(eq(modelVersions.modelId, version.modelId));

  // Mark this version as latest
  await db
    .update(modelVersions)
    .set({ isLatest: true })
    .where(eq(modelVersions.id, versionId));
}

/**
 * Mark a version as deprecated
 */
export async function deprecateVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(modelVersions)
    .set({ isDeprecated: true })
    .where(eq(modelVersions.id, versionId));
}

/**
 * Increment download count for a version
 */
export async function incrementVersionDownloadCount(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const version = await getModelVersion(versionId);
  if (!version) return;

  await db
    .update(modelVersions)
    .set({ downloadCount: (version.downloadCount || 0) + 1 })
    .where(eq(modelVersions.id, versionId));
}

/**
 * Update version changelog
 */
export async function updateVersionChangelog(versionId: number, changelog: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(modelVersions)
    .set({ changelog })
    .where(eq(modelVersions.id, versionId));
}

/**
 * Delete a version
 */
export async function deleteModelVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(modelVersions).where(eq(modelVersions.id, versionId));
}
