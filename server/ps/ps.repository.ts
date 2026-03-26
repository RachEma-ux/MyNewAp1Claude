/**
 * PS Module — Repository Layer
 *
 * All DB access for PS domain. No business logic.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psSystems,
  psWizardRuns,
  psCatalogSystemTypes,
  psResourceRequests,
  type PsSystem,
  type InsertPsSystem,
  type PsWizardRun,
  type InsertPsWizardRun,
  type PsCatalogSystemType,
  type PsResourceRequest,
  type InsertPsResourceRequest,
} from "../../drizzle/tables/ps";

// ── Systems ──────────────────────────────────────────────────────────────

export async function createSystem(data: InsertPsSystem): Promise<PsSystem> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psSystems).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function getSystemById(workspaceId: number, id: number): Promise<PsSystem | null> {
  const db = getDb();
  if (!db) return null;
  const [system] = await db.select().from(psSystems)
    .where(and(eq(psSystems.id, id), eq(psSystems.workspaceId, workspaceId)))
    .limit(1);
  return system ?? null;
}

export async function listSystems(workspaceId: number, status?: string): Promise<PsSystem[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [eq(psSystems.workspaceId, workspaceId)];
  if (status) {
    conditions.push(eq(psSystems.status, status));
  }
  return db.select().from(psSystems)
    .where(and(...conditions))
    .orderBy(desc(psSystems.createdAt));
}

// ── Wizard Runs ──────────────────────────────────────────────────────────

export async function createWizardRun(data: InsertPsWizardRun): Promise<PsWizardRun> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psWizardRuns).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function getWizardRunById(workspaceId: number, id: number): Promise<PsWizardRun | null> {
  const db = getDb();
  if (!db) return null;
  const [run] = await db.select().from(psWizardRuns)
    .where(and(eq(psWizardRuns.id, id), eq(psWizardRuns.workspaceId, workspaceId)))
    .limit(1);
  return run ?? null;
}

export async function listWizardRuns(workspaceId: number): Promise<PsWizardRun[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psWizardRuns)
    .where(eq(psWizardRuns.workspaceId, workspaceId))
    .orderBy(desc(psWizardRuns.createdAt));
}

// ── Catalog ──────────────────────────────────────────────────────────────

export async function getCatalogSystemTypes(): Promise<PsCatalogSystemType[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psCatalogSystemTypes);
}

// ── Resource Requests (Demand) ──────────────────────────────────────

export async function createResourceRequest(data: InsertPsResourceRequest): Promise<PsResourceRequest> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psResourceRequests).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function createResourceRequestsBatch(
  items: InsertPsResourceRequest[],
): Promise<PsResourceRequest[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  const now = new Date();
  const rows = items.map((item) => ({
    ...item,
    createdAt: now,
    updatedAt: now,
  }));
  return db.insert(psResourceRequests).values(rows).returning();
}

export async function listResourceRequests(
  workspaceId: number,
  status?: string,
): Promise<PsResourceRequest[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [eq(psResourceRequests.workspaceId, workspaceId)];
  if (status) {
    conditions.push(eq(psResourceRequests.status, status));
  }
  return db.select().from(psResourceRequests)
    .where(and(...conditions))
    .orderBy(desc(psResourceRequests.createdAt));
}

export async function listResourceRequestsBySystem(
  workspaceId: number,
  psSystemId: number,
): Promise<PsResourceRequest[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceRequests)
    .where(and(
      eq(psResourceRequests.workspaceId, workspaceId),
      eq(psResourceRequests.psSystemId, psSystemId),
    ))
    .orderBy(desc(psResourceRequests.createdAt));
}

export async function updateResourceRequestStatus(
  workspaceId: number,
  id: number,
  status: string,
): Promise<PsResourceRequest | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceRequests)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(psResourceRequests.id, id),
      eq(psResourceRequests.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}
