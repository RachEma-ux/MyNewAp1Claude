/**
 * PS Module — Repository Layer
 *
 * All DB access for PS domain. No business logic.
 */

import { eq, and, desc, asc, count } from "drizzle-orm";
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
  psScopeMatrixProfile,
  psScopeMatrixHeaders,
  psDimensions,
  psDimensionValues,
  psMatrixQuestionPresentations,
  psEvalCases,
  psEvalRuns,
  psMatrixSimulations,
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
  type PsScopeMatrixProfile,
  type InsertPsScopeMatrixProfile,
  type PsScopeMatrixHeader,
  type InsertPsScopeMatrixHeader,
  type PsDimension,
  type InsertPsDimension,
  type PsDimensionValue,
  type InsertPsDimensionValue,
  type PsMatrixQuestionPresentation,
  type InsertPsMatrixQuestionPresentation,
  type PsEvalCase,
  type InsertPsEvalCase,
  type PsEvalRun,
  type InsertPsEvalRun,
  type PsMatrixSimulation,
  type InsertPsMatrixSimulation,
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

export async function getSystemById(id: number): Promise<PsSystem | null> {
  const db = getDb();
  if (!db) return null;
  const [system] = await db.select().from(psSystems)
    .where(eq(psSystems.id, id))
    .limit(1);
  return system ?? null;
}

export async function listSystems(status?: string): Promise<PsSystem[]> {
  const db = getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(psSystems)
      .where(eq(psSystems.status, status))
      .orderBy(desc(psSystems.createdAt));
  }
  return db.select().from(psSystems)
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

export async function getWizardRunById(id: number): Promise<PsWizardRun | null> {
  const db = getDb();
  if (!db) return null;
  const [run] = await db.select().from(psWizardRuns)
    .where(eq(psWizardRuns.id, id))
    .limit(1);
  return run ?? null;
}

export async function listWizardRuns(): Promise<PsWizardRun[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psWizardRuns)
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
  status?: string,
): Promise<PsResourceRequest[]> {
  const db = getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(psResourceRequests)
      .where(eq(psResourceRequests.status, status))
      .orderBy(desc(psResourceRequests.createdAt));
  }
  return db.select().from(psResourceRequests)
    .orderBy(desc(psResourceRequests.createdAt));
}

export async function listResourceRequestsBySystem(
  psSystemId: number,
): Promise<PsResourceRequest[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceRequests)
    .where(eq(psResourceRequests.psSystemId, psSystemId))
    .orderBy(desc(psResourceRequests.createdAt));
}

export async function updateResourceRequestStatus(
  id: number,
  status: string,
): Promise<PsResourceRequest | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(psResourceRequests.id, id))
    .returning();
  return updated ?? null;
}

export async function getResourceRequestById(
  id: number,
): Promise<PsResourceRequest | null> {
  const db = getDb();
  if (!db) return null;
  const [request] = await db.select().from(psResourceRequests)
    .where(eq(psResourceRequests.id, id))
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
  id: number,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [assignment] = await db.select().from(psResourceAssignments)
    .where(eq(psResourceAssignments.id, id))
    .limit(1);
  return assignment ?? null;
}

export async function listResourceAssignments(
  status?: string,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(psResourceAssignments)
      .where(eq(psResourceAssignments.status, status))
      .orderBy(desc(psResourceAssignments.createdAt));
  }
  return db.select().from(psResourceAssignments)
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function listResourceAssignmentsByRequest(
  resourceRequestId: number,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceAssignments)
    .where(eq(psResourceAssignments.resourceRequestId, resourceRequestId))
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function listResourceAssignmentsBySystem(
  psSystemId: number,
): Promise<PsResourceAssignment[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psResourceAssignments)
    .where(eq(psResourceAssignments.psSystemId, psSystemId))
    .orderBy(desc(psResourceAssignments.createdAt));
}

export async function updateResourceAssignment(
  id: number,
  data: Partial<InsertPsResourceAssignment>,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceAssignments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(psResourceAssignments.id, id))
    .returning();
  return updated ?? null;
}

export async function updateResourceAssignmentStatus(
  id: number,
  status: string,
  updatedBy: number,
): Promise<PsResourceAssignment | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psResourceAssignments)
    .set({ status, updatedBy, updatedAt: new Date() })
    .where(eq(psResourceAssignments.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteResourceAssignment(
  id: number,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(psResourceAssignments)
    .where(eq(psResourceAssignments.id, id))
    .returning();
  return result.length > 0;
}

// ── Matrix Versions ──────────────────────────────────────────────────

export async function getActiveMatrixVersion(): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [version] = await db.select().from(psMatrixVersions)
    .where(eq(psMatrixVersions.status, "active"))
    .limit(1);
  return version ?? null;
}

export async function getMatrixVersionById(id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [version] = await db.select().from(psMatrixVersions)
    .where(eq(psMatrixVersions.id, id))
    .limit(1);
  return version ?? null;
}

export async function listMatrixVersions(): Promise<PsMatrixVersion[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixVersions)
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

export async function activateMatrixVersion(id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  // Deactivate all existing active versions
  await db.update(psMatrixVersions)
    .set({ status: "archived" })
    .where(eq(psMatrixVersions.status, "active"));
  // Activate the target version
  const [updated] = await db.update(psMatrixVersions)
    .set({ status: "active", activatedAt: new Date() })
    .where(eq(psMatrixVersions.id, id))
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

export async function archiveMatrixVersion(id: number): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psMatrixVersions)
    .set({ status: "archived" })
    .where(eq(psMatrixVersions.id, id))
    .returning();
  return updated ?? null;
}

export async function updateMatrixVersionStatus(
  id: number,
  status: string,
): Promise<PsMatrixVersion | null> {
  const db = getDb();
  if (!db) return null;
  const setData: Record<string, unknown> = { status };
  if (status === "active") setData.activatedAt = new Date();
  const [updated] = await db.update(psMatrixVersions)
    .set(setData)
    .where(eq(psMatrixVersions.id, id))
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

export async function deleteScope(id: number, versionId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(psScopeRegistry)
    .where(and(eq(psScopeRegistry.id, id), eq(psScopeRegistry.versionId, versionId)))
    .returning();
  return result.length > 0;
}

export async function deleteQuestion(id: number, versionId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  // Delete any presentation for this question first
  await db.delete(psMatrixQuestionPresentations)
    .where(eq(psMatrixQuestionPresentations.questionId, id));
  const result = await db.delete(psMatrixQuestions)
    .where(and(eq(psMatrixQuestions.id, id), eq(psMatrixQuestions.versionId, versionId)))
    .returning();
  return result.length > 0;
}

export async function deleteDimension(id: number, versionId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  // Delete values first
  await db.delete(psDimensionValues).where(eq(psDimensionValues.dimensionId, id));
  const result = await db.delete(psDimensions)
    .where(and(eq(psDimensions.id, id), eq(psDimensions.versionId, versionId)))
    .returning();
  return result.length > 0;
}

export async function deleteDimensionValue(id: number, dimensionId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(psDimensionValues)
    .where(and(eq(psDimensionValues.id, id), eq(psDimensionValues.dimensionId, dimensionId)))
    .returning();
  return result.length > 0;
}

export async function deleteCell(id: number, versionId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db.delete(psMatrixCells)
    .where(and(eq(psMatrixCells.id, id), eq(psMatrixCells.versionId, versionId)))
    .returning();
  return result.length > 0;
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

export async function listMatrixImports(): Promise<PsMatrixImport[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixImports)
    .orderBy(desc(psMatrixImports.createdAt));
}

export async function getLastImportDate(): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [imp] = await db.select().from(psMatrixImports)
    .where(eq(psMatrixImports.importStatus, "committed"))
    .orderBy(desc(psMatrixImports.committedAt))
    .limit(1);
  return imp?.committedAt?.toISOString() ?? null;
}

// ── Scope Matrix Profile ──────────────────────────────────────────────

export async function getScopeProfileByScopeId(scopeId: number): Promise<PsScopeMatrixProfile | null> {
  const db = getDb();
  if (!db) return null;
  const [profile] = await db.select().from(psScopeMatrixProfile)
    .where(eq(psScopeMatrixProfile.scopeId, scopeId))
    .limit(1);
  return profile ?? null;
}

export async function listScopeProfilesByVersion(versionId: number): Promise<PsScopeMatrixProfile[]> {
  const db = getDb();
  if (!db) return [];
  // Join through scope_registry to get profiles for a specific version
  const scopes = await db.select().from(psScopeRegistry)
    .where(eq(psScopeRegistry.versionId, versionId));
  if (scopes.length === 0) return [];

  const scopeIds = scopes.map((s) => s.id);
  const profiles: PsScopeMatrixProfile[] = [];
  for (const sid of scopeIds) {
    const [p] = await db.select().from(psScopeMatrixProfile)
      .where(eq(psScopeMatrixProfile.scopeId, sid))
      .limit(1);
    if (p) profiles.push(p);
  }
  return profiles;
}

export async function createScopeProfile(data: InsertPsScopeMatrixProfile): Promise<PsScopeMatrixProfile> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psScopeMatrixProfile).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function updateScopeProfile(
  scopeId: number,
  data: Partial<InsertPsScopeMatrixProfile>,
): Promise<PsScopeMatrixProfile | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psScopeMatrixProfile)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(psScopeMatrixProfile.scopeId, scopeId))
    .returning();
  return updated ?? null;
}

// ── Scope Matrix Headers ──────────────────────────────────────────────

export async function listHeadersByVersion(versionId: number): Promise<PsScopeMatrixHeader[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeMatrixHeaders)
    .where(and(
      eq(psScopeMatrixHeaders.versionId, versionId),
      eq(psScopeMatrixHeaders.isActive, 1),
    ))
    .orderBy(psScopeMatrixHeaders.sortOrder);
}

export async function listAllHeadersByVersion(versionId: number): Promise<PsScopeMatrixHeader[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeMatrixHeaders)
    .where(eq(psScopeMatrixHeaders.versionId, versionId))
    .orderBy(psScopeMatrixHeaders.sortOrder);
}

export async function listHeadersByType(
  versionId: number,
  headerType: string,
): Promise<PsScopeMatrixHeader[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeMatrixHeaders)
    .where(and(
      eq(psScopeMatrixHeaders.versionId, versionId),
      eq(psScopeMatrixHeaders.headerType, headerType),
      eq(psScopeMatrixHeaders.isActive, 1),
    ))
    .orderBy(psScopeMatrixHeaders.sortOrder);
}

export async function createHeader(data: InsertPsScopeMatrixHeader): Promise<PsScopeMatrixHeader> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psScopeMatrixHeaders).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function createHeadersBatch(items: InsertPsScopeMatrixHeader[]): Promise<PsScopeMatrixHeader[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  const now = new Date();
  const rows = items.map((item) => ({ ...item, createdAt: now }));
  return db.insert(psScopeMatrixHeaders).values(rows).returning();
}

export async function deleteHeadersByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(psScopeMatrixHeaders).where(eq(psScopeMatrixHeaders.versionId, versionId));
}

// ── Dimensions ──────────────────────────────────────────────────────

export async function listDimensionsByVersion(versionId: number): Promise<PsDimension[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psDimensions)
    .where(and(
      eq(psDimensions.versionId, versionId),
      eq(psDimensions.isActive, 1),
    ))
    .orderBy(psDimensions.sortOrder);
}

export async function getAllDimensionsByVersion(versionId: number): Promise<PsDimension[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psDimensions)
    .where(eq(psDimensions.versionId, versionId))
    .orderBy(psDimensions.sortOrder);
}

export async function createDimension(data: InsertPsDimension): Promise<PsDimension> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psDimensions).values(data).returning();
  return created;
}

export async function createDimensionsBatch(items: InsertPsDimension[]): Promise<PsDimension[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psDimensions).values(items).returning();
}

export async function updateDimension(
  id: number,
  versionId: number,
  data: Partial<InsertPsDimension>,
): Promise<PsDimension | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psDimensions)
    .set(data)
    .where(and(eq(psDimensions.id, id), eq(psDimensions.versionId, versionId)))
    .returning();
  return updated ?? null;
}

export async function deleteDimensionsByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  // First delete all values for dimensions in this version
  const dims = await db.select({ id: psDimensions.id }).from(psDimensions)
    .where(eq(psDimensions.versionId, versionId));
  for (const d of dims) {
    await db.delete(psDimensionValues).where(eq(psDimensionValues.dimensionId, d.id));
  }
  await db.delete(psDimensions).where(eq(psDimensions.versionId, versionId));
}

export async function countDimensionsByVersion(versionId: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [result] = await db.select({ cnt: count() }).from(psDimensions)
    .where(eq(psDimensions.versionId, versionId));
  return result?.cnt ?? 0;
}

// ── Dimension Values ────────────────────────────────────────────────

export async function listDimensionValues(dimensionId: number): Promise<PsDimensionValue[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psDimensionValues)
    .where(and(
      eq(psDimensionValues.dimensionId, dimensionId),
      eq(psDimensionValues.isActive, 1),
    ))
    .orderBy(psDimensionValues.sortOrder);
}

export async function getAllDimensionValues(dimensionId: number): Promise<PsDimensionValue[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psDimensionValues)
    .where(eq(psDimensionValues.dimensionId, dimensionId))
    .orderBy(psDimensionValues.sortOrder);
}

export async function createDimensionValue(data: InsertPsDimensionValue): Promise<PsDimensionValue> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psDimensionValues).values(data).returning();
  return created;
}

export async function createDimensionValuesBatch(items: InsertPsDimensionValue[]): Promise<PsDimensionValue[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psDimensionValues).values(items).returning();
}

export async function updateDimensionValue(
  id: number,
  dimensionId: number,
  data: Partial<InsertPsDimensionValue>,
): Promise<PsDimensionValue | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psDimensionValues)
    .set(data)
    .where(and(eq(psDimensionValues.id, id), eq(psDimensionValues.dimensionId, dimensionId)))
    .returning();
  return updated ?? null;
}

export async function deleteDimensionValues(dimensionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.delete(psDimensionValues).where(eq(psDimensionValues.dimensionId, dimensionId));
}

// ── Question Presentations ──────────────────────────────────────────

export async function getQuestionPresentation(questionId: number): Promise<PsMatrixQuestionPresentation | null> {
  const db = getDb();
  if (!db) return null;
  const [pres] = await db.select().from(psMatrixQuestionPresentations)
    .where(eq(psMatrixQuestionPresentations.questionId, questionId))
    .limit(1);
  return pres ?? null;
}

export async function listQuestionPresentationsByVersion(versionId: number): Promise<PsMatrixQuestionPresentation[]> {
  const db = getDb();
  if (!db) return [];
  // Join through questions to get presentations for a specific version
  const questions = await db.select().from(psMatrixQuestions)
    .where(eq(psMatrixQuestions.versionId, versionId));
  if (questions.length === 0) return [];

  const results: PsMatrixQuestionPresentation[] = [];
  for (const q of questions) {
    const [p] = await db.select().from(psMatrixQuestionPresentations)
      .where(eq(psMatrixQuestionPresentations.questionId, q.id))
      .limit(1);
    if (p) results.push(p);
  }
  return results;
}

export async function createQuestionPresentation(
  data: InsertPsMatrixQuestionPresentation,
): Promise<PsMatrixQuestionPresentation> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixQuestionPresentations).values(data).returning();
  return created;
}

export async function createQuestionPresentationsBatch(
  items: InsertPsMatrixQuestionPresentation[],
): Promise<PsMatrixQuestionPresentation[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (items.length === 0) return [];
  return db.insert(psMatrixQuestionPresentations).values(items).returning();
}

export async function updateQuestionPresentation(
  questionId: number,
  data: Partial<InsertPsMatrixQuestionPresentation>,
): Promise<PsMatrixQuestionPresentation | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psMatrixQuestionPresentations)
    .set(data)
    .where(eq(psMatrixQuestionPresentations.questionId, questionId))
    .returning();
  return updated ?? null;
}

export async function deleteQuestionPresentationsByVersion(versionId: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const questions = await db.select({ id: psMatrixQuestions.id }).from(psMatrixQuestions)
    .where(eq(psMatrixQuestions.versionId, versionId));
  for (const q of questions) {
    await db.delete(psMatrixQuestionPresentations)
      .where(eq(psMatrixQuestionPresentations.questionId, q.id));
  }
}

// ── Eval Cases ─────────────────────────────────────────────────────────

export async function createEvalCase(data: InsertPsEvalCase): Promise<PsEvalCase> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psEvalCases).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function listEvalCases(): Promise<PsEvalCase[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psEvalCases)
    .where(eq(psEvalCases.isActive, 1))
    .orderBy(psEvalCases.name);
}

export async function getEvalCaseById(id: number): Promise<PsEvalCase | null> {
  const db = getDb();
  if (!db) return null;
  const [found] = await db.select().from(psEvalCases)
    .where(eq(psEvalCases.id, id))
    .limit(1);
  return found ?? null;
}

export async function updateEvalCase(
  id: number,
  data: Partial<InsertPsEvalCase>,
): Promise<PsEvalCase | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psEvalCases)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(psEvalCases.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteEvalCase(id: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [deleted] = await db.update(psEvalCases)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(eq(psEvalCases.id, id))
    .returning();
  return !!deleted;
}

// ── Eval Runs ──────────────────────────────────────────────────────────

export async function createEvalRun(data: InsertPsEvalRun): Promise<PsEvalRun> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psEvalRuns).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function listEvalRuns(): Promise<PsEvalRun[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psEvalRuns)
    .orderBy(desc(psEvalRuns.createdAt));
}

export async function getEvalRunById(id: number): Promise<PsEvalRun | null> {
  const db = getDb();
  if (!db) return null;
  const [found] = await db.select().from(psEvalRuns)
    .where(eq(psEvalRuns.id, id))
    .limit(1);
  return found ?? null;
}

// ── Matrix Simulations ─────────────────────────────────────────────────

export async function createMatrixSimulation(data: InsertPsMatrixSimulation): Promise<PsMatrixSimulation> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psMatrixSimulations).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function listMatrixSimulations(): Promise<PsMatrixSimulation[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psMatrixSimulations)
    .orderBy(desc(psMatrixSimulations.createdAt));
}

// ── Wizard Classification Queries ────────────────────────────────────

export async function listActiveQuestionsByVersion(versionId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: psMatrixQuestions.id,
      code: psMatrixQuestions.code,
      label: psMatrixQuestions.label,
      sortOrder: psMatrixQuestions.sortOrder,
    })
    .from(psMatrixQuestions)
    .where(
      and(
        eq(psMatrixQuestions.versionId, versionId),
        eq(psMatrixQuestions.isActive, 1),
      )
    )
    .orderBy(asc(psMatrixQuestions.sortOrder), asc(psMatrixQuestions.id));
}

export async function listCellsWithQuestionsByVersion(versionId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: psMatrixCells.id,
      scopeId: psMatrixCells.scopeId,
      questionId: psMatrixCells.questionId,
      weight: psMatrixCells.weight,
      questionCode: psMatrixQuestions.code,
      questionLabel: psMatrixQuestions.label,
    })
    .from(psMatrixCells)
    .innerJoin(
      psMatrixQuestions,
      eq(psMatrixCells.questionId, psMatrixQuestions.id),
    )
    .where(eq(psMatrixCells.versionId, versionId));
}

export async function listActiveScopesByVersion(versionId: number) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: psScopeRegistry.id,
      code: psScopeRegistry.code,
      label: psScopeRegistry.label,
    })
    .from(psScopeRegistry)
    .where(
      and(
        eq(psScopeRegistry.versionId, versionId),
        eq(psScopeRegistry.isActive, 1),
      )
    )
    .orderBy(asc(psScopeRegistry.id));
}
