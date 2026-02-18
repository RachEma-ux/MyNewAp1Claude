/**
 * Import Session Service — CRUD, versioning, and expiry cleanup
 */
import { randomUUID } from "crypto";
import { eq, lt, and } from "drizzle-orm";
import { getDb } from "../db";
import { importSessions, importPreviewRows } from "../../drizzle/schema";
import type { ImportMethod, ImportSessionStatus, PreviewSummary, PreviewEntry } from "@shared/catalog-import-types";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Session CRUD
// ============================================================================

export async function createSession(
  userId: number,
  method: ImportMethod,
  sourceRef: string
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [session] = await db.insert(importSessions).values({
    id,
    userId,
    method,
    sourceRef,
    status: "pending",
    version: 1,
    expiresAt,
  }).returning();

  return session;
}

export async function getSession(sessionId: string) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [session] = await db
    .select()
    .from(importSessions)
    .where(eq(importSessions.id, sessionId));

  return session ?? null;
}

export async function updateSessionStatus(
  sessionId: string,
  status: ImportSessionStatus,
  summary?: PreviewSummary | null,
  error?: string | null
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const updates: Record<string, any> = {
    status,
    updatedAt: new Date(),
  };
  if (summary !== undefined) updates.summary = summary;
  if (error !== undefined) updates.error = error;

  await db
    .update(importSessions)
    .set(updates)
    .where(eq(importSessions.id, sessionId));
}

// ============================================================================
// Preview Rows
// ============================================================================

export async function addPreviewRows(sessionId: string, rows: PreviewEntry[]) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  if (rows.length === 0) return;

  await db.insert(importPreviewRows).values(
    rows.map((r) => ({
      sessionId,
      tempId: r.tempId,
      type: r.type,
      name: r.name,
      description: r.description,
      source: r.source,
      metadata: r.metadata,
      duplicateStatus: r.duplicateStatus,
      riskLevel: r.riskLevel,
      validationIssues: r.validationIssues,
    }))
  );
}

export async function getPreviewRows(sessionId: string): Promise<PreviewEntry[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(importPreviewRows)
    .where(eq(importPreviewRows.sessionId, sessionId));

  return rows.map((r) => ({
    tempId: r.tempId,
    type: r.type,
    name: r.name,
    description: r.description ?? null,
    source: r.source,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    duplicateStatus: r.duplicateStatus as any,
    riskLevel: r.riskLevel as any,
    validationIssues: (r.validationIssues as any[]) ?? [],
  }));
}

// ============================================================================
// Optimistic Locking
// ============================================================================

export async function incrementVersion(sessionId: string, expectedVersion: number): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(importSessions)
    .set({ version: expectedVersion + 1, updatedAt: new Date() })
    .where(
      and(
        eq(importSessions.id, sessionId),
        eq(importSessions.version, expectedVersion)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Version conflict — session was modified by another request");
  }

  return expectedVersion + 1;
}

// ============================================================================
// Expiry Cleanup
// ============================================================================

export async function cleanupExpiredSessions() {
  try {
    const db = getDb();
    if (!db) return;

    const expired = await db
      .delete(importSessions)
      .where(lt(importSessions.expiresAt, new Date()))
      .returning();

    if (expired.length > 0) {
      console.log(`[ImportCleanup] Removed ${expired.length} expired import session(s)`);
    }
  } catch (e: any) {
    console.warn(`[ImportCleanup] Error: ${e.message}`);
  }
}

export function startCleanupInterval() {
  if (cleanupTimer) return;
  // Run every hour
  cleanupTimer = setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
  console.log("[ImportCleanup] Scheduled hourly session cleanup");
}

export function stopCleanupInterval() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
