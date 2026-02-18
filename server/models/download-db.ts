import { getDb } from "../db";
import {
  modelDownloads,
  type InsertModelDownload,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Model Download Database Operations
 * Handles model download tracking, progress, and history
 */

// ============================================================================
// Create & Update
// ============================================================================

export async function createModelDownload(data: Omit<InsertModelDownload, "id">) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const [download] = await db.insert(modelDownloads).values(data).returning();
  return download.id;
}

export async function updateDownloadProgress(
  downloadId: number,
  progress: number,
  downloadedBytes: string
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(modelDownloads)
    .set({
      progress,
      bytesDownloaded: downloadedBytes,
    })
    .where(eq(modelDownloads.id, downloadId));
}

export async function updateDownloadPriority(
  downloadId: number,
  priority: number
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(modelDownloads)
    .set({ priority })
    .where(eq(modelDownloads.id, downloadId));
}

export async function updateDownloadStatus(
  downloadId: number,
  status: "queued" | "downloading" | "completed" | "failed" | "paused",
  errorMessage?: string
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const updates: any = { status };
  
  if (status === "downloading" && !errorMessage) {
    updates.startedAt = new Date();
  } else if (status === "completed") {
    updates.completedAt = new Date();
    updates.progress = 100;
  } else if (status === "failed" && errorMessage) {
    updates.errorMessage = errorMessage;
  }
  
  await db
    .update(modelDownloads)
    .set(updates)
    .where(eq(modelDownloads.id, downloadId));
}

// ============================================================================
// Read
// ============================================================================

export async function getModelDownload(downloadId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(modelDownloads)
    .where(eq(modelDownloads.id, downloadId))
    .limit(1);
  
  return results[0] || null;
}

export async function getUserDownloads(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(modelDownloads)
    .where(eq(modelDownloads.userId, userId))
    .orderBy(desc(modelDownloads.createdAt));
}

export async function getActiveDownloads(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  // Return downloads that are queued, downloading, or paused (not completed/failed)
  return db
    .select()
    .from(modelDownloads)
    .where(eq(modelDownloads.userId, userId))
    .orderBy(desc(modelDownloads.createdAt))
    .then(downloads => 
      downloads.filter(d => 
        d.status === "queued" || 
        d.status === "downloading" || 
        d.status === "paused"
      )
    );
}

export async function getDownloadByModel(userId: number, modelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(modelDownloads)
    .where(
      and(
        eq(modelDownloads.userId, userId),
        eq(modelDownloads.modelId, modelId)
      )
    )
    .orderBy(desc(modelDownloads.createdAt))
    .limit(1);
  
  return results[0] || null;
}

// ============================================================================
// Delete
// ============================================================================

export async function deleteModelDownload(downloadId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(modelDownloads).where(eq(modelDownloads.id, downloadId));
}
