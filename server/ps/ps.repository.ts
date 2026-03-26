/**
 * PS Module — Repository Layer
 *
 * All DB access for PS domain. No business logic.
 */

import { eq, and, desc, count } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psSystems,
  psWizardRuns,
  psCatalogSystemTypes,
  psResourceRequests,
  psResourceAssignments,
  psMatrixVersions,
  psScopeRegistry,
  psMatrixQuestions,
  psMatrixCells,
  psMatrixImports,
  type PsSystem,
  type InsertPsSystem,
  type PsWizardRun,
  type InsertPsWizardRun,
  type PsCatalogSystemType,
  type PsResourceRequest,
  type InsertPsResourceRequest,
  type PsResourceAssignment,
  type InsertPsResourceAssignment,
  type PsMatrixVersion,
  type InsertPsMatrixVersion,
  type PsScopeRegistry,
  type InsertPsScopeRegistry,
  type PsMatrixQuestion,
  type InsertPsMatrixQuestion,
  type PsMatrixCell,
  type InsertPsMatrixCell,
  type PsMatrixImport,
  type InsertPsMatrixImport,
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

// ── Matrix Versions ──────────────────────────────────────────────────

export async function getActiveMatrixVersion(workspaceId: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [version] = await db.select().from(psMatrixVersions)
    .where(and(
      eq(psMatrixVersions.workspaceId, workspaceId),
      eq(psMatrixVersions.status, "active"),
    ))
    .limit(1);
  return version ?? null;
}

export async function getMatrixVersionById(workspaceId: number, id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [version] = await db.select().from(psMatrixVersions)
    .where(and(
      eq(psMatrixVersions.id, id),
      eq(psMatrixVersions.workspaceId, workspaceId),
    ))
    .limit(1);
  return version ?? null;
}

export async function listMatrixVersions(workspaceId: number): Promise<PsMatrixVersion[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixVersions)
    .where(eq(psMatrixVersions.workspaceId, workspaceId))
    .orderBy(desc(psMatrixVersions.createdAt));
}

export async function createMatrixVersion(data: InsertPsMatrixVersion): Promise<PsMatrixVersion> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixVersions).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function activateMatrixVersion(workspaceId: number, id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  // Deactivate all existing active versions for this workspace
  await db.update(psMatrixVersions)
    .set({ status: "archived" })
    .where(and(
      eq(psMatrixVersions.workspaceId, workspaceId),
      eq(psMatrixVersions.status, "active"),
    ));
  // Activate the target version
  const [updated] = await db.update(psMatrixVersions)
    .set({ status: "active", activatedAt: new Date() })
    .where(and(
      eq(psMatrixVersions.id, id),
      eq(psMatrixVersions.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}

// ── Scope Registry ──────────────────────────────────────────────────

export async function listScopesByVersion(versionId: number): Promise<PsScopeRegistry[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeRegistry)
    .where(and(
      eq(psScopeRegistry.versionId, versionId),
      eq(psScopeRegistry.isActive, 1),
    ));
}

export async function createScope(data: InsertPsScopeRegistry): Promise<PsScopeRegistry> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psScopeRegistry).values(data).returning();
  return created;
}

export async function createScopesBatch(items: InsertPsScopeRegistry[]): Promise<PsScopeRegistry[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psScopeRegistry).values(items).returning();
}

// ── Matrix Questions ────────────────────────────────────────────────

export async function listQuestionsByVersion(versionId: number): Promise<PsMatrixQuestion[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixQuestions)
    .where(and(
      eq(psMatrixQuestions.versionId, versionId),
      eq(psMatrixQuestions.isActive, 1),
    ))
    .orderBy(psMatrixQuestions.sortOrder);
}

export async function createQuestion(data: InsertPsMatrixQuestion): Promise<PsMatrixQuestion> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixQuestions).values(data).returning();
  return created;
}

export async function createQuestionsBatch(items: InsertPsMatrixQuestion[]): Promise<PsMatrixQuestion[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psMatrixQuestions).values(items).returning();
}

// ── Matrix Cells ────────────────────────────────────────────────────

export async function listCellsByVersion(versionId: number): Promise<PsMatrixCell[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixCells)
    .where(eq(psMatrixCells.versionId, versionId));
}

export async function createCell(data: InsertPsMatrixCell): Promise<PsMatrixCell> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixCells).values(data).returning();
  return created;
}

export async function createCellsBatch(items: InsertPsMatrixCell[]): Promise<PsMatrixCell[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psMatrixCells).values(items).returning();
}

// ── Matrix Admin — Extended Operations ─────────────────────────────

export async function archiveMatrixVersion(workspaceId: number, id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psMatrixVersions)
    .set({ status: "archived" })
    .where(and(
      eq(psMatrixVersions.id, id),
      eq(psMatrixVersions.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}

export async function updateMatrixVersionStatus(
  workspaceId: number,
  id: number,
  status: string,
): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const setData: Record<string, unknown> = { status };
  if (status === "active") setData.activatedAt = new Date();
  const [updated] = await db.update(psMatrixVersions)
    .set(setData)
    .where(and(
      eq(psMatrixVersions.id, id),
      eq(psMatrixVersions.workspaceId, workspaceId),
    ))
    .returning();
  return updated ?? null;
}

export async function getAllScopesByVersion(versionId: number): Promise<PsScopeRegistry[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeRegistry)
    .where(eq(psScopeRegistry.versionId, versionId));
}

export async function getAllQuestionsByVersion(versionId: number): Promise<PsMatrixQuestion[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixQuestions)
    .where(eq(psMatrixQuestions.versionId, versionId))
    .orderBy(psMatrixQuestions.sortOrder);
}

export async function updateScope(
  id: number,
  versionId: number,
  data: Partial<InsertPsScopeRegistry>,
): Promise<PsScopeRegistry | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psScopeRegistry)
    .set(data)
    .where(and(
      eq(psScopeRegistry.id, id),
      eq(psScopeRegistry.versionId, versionId),
    ))
    .returning();
  return updated ?? null;
}

export async function updateQuestion(
  id: number,
  versionId: number,
  data: Partial<InsertPsMatrixQuestion>,
): Promise<PsMatrixQuestion | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psMatrixQuestions)
    .set(data)
    .where(and(
      eq(psMatrixQuestions.id, id),
      eq(psMatrixQuestions.versionId, versionId),
    ))
    .returning();
  return updated ?? null;
}

export async function updateQuestionSortOrders(
  versionId: number,
  orderedIds: number[],
): Promise<void> {
  const db = getDb();
  if (!db) return;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(psMatrixQuestions)
      .set({ sortOrder: i })
      .where(and(
        eq(psMatrixQuestions.id, orderedIds[i]),
        eq(psMatrixQuestions.versionId, versionId),
      ));
  }
}

export async function upsertCell(
  versionId: number,
  questionId: number,
  scopeId: number,
  weight: number,
): Promise<PsMatrixCell> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  // Try to find existing cell
  const [existing] = await db.select().from(psMatrixCells)
    .where(and(
      eq(psMatrixCells.versionId, versionId),
      eq(psMatrixCells.questionId, questionId),
      eq(psMatrixCells.scopeId, scopeId),
    ))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(psMatrixCells)
      .set({ weight })
      .where(eq(psMatrixCells.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(psMatrixCells)
    .values({ versionId, questionId, scopeId, weight })
    .returning();
  return created;
}

export async function upsertCellsBatch(
  versionId: number,
  items: Array<{ questionId: number; scopeId: number; weight: number }>,
): Promise<PsMatrixCell[]> {
  const results: PsMatrixCell[] = [];
  for (const item of items) {
    const cell = await upsertCell(versionId, item.questionId, item.scopeId, item.weight);
    results.push(cell);
  }
  return results;
}

export async function countScopesByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psScopeRegistry)
    .where(eq(psScopeRegistry.versionId, versionId));
  return result?.cnt ?? 0;
}

export async function countActiveScopesByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psScopeRegistry)
    .where(and(eq(psScopeRegistry.versionId, versionId), eq(psScopeRegistry.isActive, 1)));
  return result?.cnt ?? 0;
}

export async function countQuestionsByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psMatrixQuestions)
    .where(eq(psMatrixQuestions.versionId, versionId));
  return result?.cnt ?? 0;
}

export async function countActiveQuestionsByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psMatrixQuestions)
    .where(and(eq(psMatrixQuestions.versionId, versionId), eq(psMatrixQuestions.isActive, 1)));
  return result?.cnt ?? 0;
}

export async function countCellsByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psMatrixCells)
    .where(eq(psMatrixCells.versionId, versionId));
  return result?.cnt ?? 0;
}

export async function deleteCellsByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(psMatrixCells).where(eq(psMatrixCells.versionId, versionId));
}

export async function deleteScopesByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(psScopeRegistry).where(eq(psScopeRegistry.versionId, versionId));
}

export async function deleteQuestionsByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(psMatrixQuestions).where(eq(psMatrixQuestions.versionId, versionId));
}

// ── Matrix Imports ────────────────────────────────────────────────────

export async function createMatrixImport(data: InsertPsMatrixImport): Promise<PsMatrixImport> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixImports).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function getMatrixImportById(id: number): Promise<PsMatrixImport | null> {
  const db = getDb();
  if (!db) return null;
  const [imp] = await db.select().from(psMatrixImports)
    .where(eq(psMatrixImports.id, id))
    .limit(1);
  return imp ?? null;
}

export async function updateMatrixImport(
  id: number,
  data: Partial<InsertPsMatrixImport>,
): Promise<PsMatrixImport | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psMatrixImports)
    .set(data)
    .where(eq(psMatrixImports.id, id))
    .returning();
  return updated ?? null;
}

export async function listMatrixImports(workspaceId: number): Promise<PsMatrixImport[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixImports)
    .where(eq(psMatrixImports.workspaceId, workspaceId))
    .orderBy(desc(psMatrixImports.createdAt));
}

export async function getLastImportDate(workspaceId: number): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [imp] = await db.select().from(psMatrixImports)
    .where(and(
      eq(psMatrixImports.workspaceId, workspaceId),
      eq(psMatrixImports.importStatus, "committed"),
    ))
    .orderBy(desc(psMatrixImports.committedAt))
    .limit(1);
  return imp?.committedAt?.toISOString() ?? null;
}
