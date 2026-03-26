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
  psResourceAssignments,
  type PsSystem,
  type InsertPsSystem,
  type PsWizardRun,
  type InsertPsWizardRun,
  type PsCatalogSystemType,
  type PsResourceRequest,
  type InsertPsResourceRequest,
  type PsResourceAssignment,
  type InsertPsResourceAssignment,
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

export async function getResourceRequestById(
  workspaceId: number,
  id: number,
): Promise<PsResourceRequest | null> {
  const db = getDb();
  if (!db) return null;
  const [request] = await db.select().from(psResourceRequests)
    .where(and(
      eq(psResourceRequests.id, id),
      eq(psResourceRequests.workspaceId, workspaceId),
    ))
    .limit(1);
  return request ?? null;
}

// ── Resource Assignments ──────────────────────────────────────────

export async function createResourceAssignment(
  data: InsertPsResourceAssignment,
): Promise<PsResourceAssignment> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psResourceAssignments).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function getResourceAssignmentById(
  workspaceId: number,
  id: number,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [assignment] = await db.select().from(psResourceAssignments)
    .where(and(
      eq(psResourceAssignments.id, id),
      eq(psResourceAssignments.workspaceId, workspaceId),
    ))
    .limit(1);
  return assignment ?? null;
}

export async function listResourceAssignments(
  workspaceId: number,
  status?: string,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = [eq(psResourceAssignments.workspaceId, workspaceId)];
  if (status) {
    conditions.push(eq(psResourceAssignments.status, status));
  }
  return db.select().from(psResourceAssignments)
    .where(and(...conditions))
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function listResourceAssignmentsByRequest(
  workspaceId: number,
  resourceRequestId: number,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceAssignments)
    .where(and(
      eq(psResourceAssignments.workspaceId, workspaceId),
      eq(psResourceAssignments.resourceRequestId, resourceRequestId),
    ))
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function listResourceAssignmentsBySystem(
  workspaceId: number,
  psSystemId: number,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceAssignments)
    .where(and(
      eq(psResourceAssignments.workspaceId, workspaceId),
      eq(psResourceAssignments.psSystemId, psSystemId),
    ))
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function updateResourceAssignment(
  workspaceId: number,
  id: number,
  data: Partial<InsertPsResourceAssignment>,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceAssignments)
    .set({ ...data, updatedAt: new Date() })
    .where(and(
      eq(psResourceAssignments.id, id),
      eq(psResourceAssignments.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}

export async function updateResourceAssignmentStatus(
  workspaceId: number,
  id: number,
  status: string,
  updatedBy: number,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceAssignments)
    .set({ status, updatedBy, updatedAt: new Date() })
    .where(and(
      eq(psResourceAssignments.id, id),
      eq(psResourceAssignments.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}

export async function deleteResourceAssignment(
  workspaceId: number,
  id: number,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(psResourceAssignments)
    .where(and(
      eq(psResourceAssignments.id, id),
      eq(psResourceAssignments.workspaceId, workspaceId),
    ))
    .returning();
  return result.length > 0;
}
