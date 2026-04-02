/**
 * PSM Repository — Direct database queries against PSMDB
 */

import { sql, eq, desc, and, ilike, or } from "drizzle-orm";
import { getPsmDb } from "./connection";
import * as schema from "../../drizzle/tables/psmdb";

// ── Health ──────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ connected: boolean; tableCount?: number }> {
  const db = getPsmDb();
  if (!db) return { connected: false };
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int as cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'psm_%'`,
    );
    const rows = (result as any).rows ?? result;
    const first = Array.isArray(rows) ? rows[0] : rows;
    return { connected: true, tableCount: Number(first?.cnt) || 0 };
  } catch (err) {
    console.error("[PSMDB Health] Error:", err);
    return { connected: false };
  }
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function listCategories() {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCategories).orderBy(schema.psmCategories.sortOrder);
}

export async function getCategoryBySlug(slug: string) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmCategories).where(eq(schema.psmCategories.slug, slug)).limit(1);
  return rows[0] || null;
}

// ── Methods ─────────────────────────────────────────────────────────────────

export async function listMethods(opts?: { categoryId?: number; status?: string; search?: string; limit?: number; offset?: number }) {
  const db = getPsmDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.categoryId) conditions.push(eq(schema.psmMethods.categoryId, opts.categoryId));
  if (opts?.status) conditions.push(eq(schema.psmMethods.status, opts.status));
  if (opts?.search) {
    const q = `%${opts.search}%`;
    conditions.push(or(ilike(schema.psmMethods.name, q), ilike(schema.psmMethods.description, q)));
  }

  let query = db.select().from(schema.psmMethods);
  if (conditions.length === 1) query = query.where(conditions[0]) as any;
  else if (conditions.length > 1) query = query.where(and(...conditions)) as any;
  query = query.orderBy(schema.psmMethods.name) as any;
  if (opts?.limit) query = query.limit(opts.limit) as any;
  if (opts?.offset) query = query.offset(opts.offset) as any;
  return query;
}

export async function getMethodById(id: number) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmMethods).where(eq(schema.psmMethods.id, id)).limit(1);
  return rows[0] || null;
}

export async function getMethodBySlug(slug: string) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmMethods).where(eq(schema.psmMethods.slug, slug)).limit(1);
  return rows[0] || null;
}

export async function getMethodDefinition(methodId: number) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmMethodDefinitions)
    .where(and(eq(schema.psmMethodDefinitions.methodId, methodId), eq(schema.psmMethodDefinitions.contentStatus, "published")))
    .orderBy(desc(schema.psmMethodDefinitions.version))
    .limit(1);
  return rows[0] || null;
}

export async function getMethodWorkflow(methodId: number) {
  const db = getPsmDb();
  if (!db) return null;
  const workflows = await db.select().from(schema.psmMethodWorkflows)
    .where(eq(schema.psmMethodWorkflows.methodId, methodId))
    .orderBy(desc(schema.psmMethodWorkflows.version))
    .limit(1);
  if (!workflows[0]) return null;
  const steps = await db.select().from(schema.psmMethodWorkflowSteps)
    .where(eq(schema.psmMethodWorkflowSteps.workflowId, workflows[0].id))
    .orderBy(schema.psmMethodWorkflowSteps.stepNumber);
  return { ...workflows[0], steps };
}

export async function getMethodAliases(methodId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmMethodAliases).where(eq(schema.psmMethodAliases.methodId, methodId));
}

export async function getMethodTags(methodId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmMethodTags).where(eq(schema.psmMethodTags.methodId, methodId));
}

export async function getMethodRelations(methodId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmMethodRelations).where(eq(schema.psmMethodRelations.methodId, methodId));
}

export async function searchMethods(query: string, categoryId?: number, limit = 20) {
  const db = getPsmDb();
  if (!db) return [];
  const q = `%${query}%`;
  const conditions: any[] = [or(ilike(schema.psmMethods.name, q), ilike(schema.psmMethods.description, q))];
  if (categoryId) conditions.push(eq(schema.psmMethods.categoryId, categoryId));
  return db.select().from(schema.psmMethods).where(and(...conditions)).orderBy(schema.psmMethods.name).limit(limit);
}

// ── Cases ───────────────────────────────────────────────────────────────────

export async function listCases(opts?: { status?: string; limit?: number; offset?: number }) {
  const db = getPsmDb();
  if (!db) return [];
  let query = db.select().from(schema.psmCases);
  if (opts?.status) query = query.where(eq(schema.psmCases.status, opts.status)) as any;
  query = query.orderBy(desc(schema.psmCases.createdAt)) as any;
  if (opts?.limit) query = query.limit(opts.limit) as any;
  if (opts?.offset) query = query.offset(opts.offset) as any;
  return query;
}

export async function getCaseById(id: number) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmCases).where(eq(schema.psmCases.id, id)).limit(1);
  return rows[0] || null;
}

export async function createCase(data: { title: string; description?: string; problemTypeId?: number; ownerUserId?: number }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmCases).values(data as any).returning();
  return created;
}

export async function updateCase(id: number, data: Record<string, any>) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [updated] = await db.update(schema.psmCases).set({ ...data, updatedAt: new Date() }).where(eq(schema.psmCases.id, id)).returning();
  return updated;
}

export async function deleteCase(id: number) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  // Delete child rows first (no FK cascade in raw-created tables)
  const runs = await db.select({ id: schema.psmCaseRuns.id }).from(schema.psmCaseRuns).where(eq(schema.psmCaseRuns.caseId, id));
  for (const r of runs) {
    await db.delete(schema.psmCaseStepRuns).where(eq(schema.psmCaseStepRuns.runId, r.id));
  }
  await db.delete(schema.psmCaseRuns).where(eq(schema.psmCaseRuns.caseId, id));
  await db.delete(schema.psmCaseDecisionLog).where(eq(schema.psmCaseDecisionLog.caseId, id));
  await db.delete(schema.psmCaseNotes).where(eq(schema.psmCaseNotes.caseId, id));
  await db.delete(schema.psmCaseSelectedMethods).where(eq(schema.psmCaseSelectedMethods.caseId, id));
  await db.delete(schema.psmCaseRecommendations).where(eq(schema.psmCaseRecommendations.caseId, id));
  await db.delete(schema.psmCaseInputs).where(eq(schema.psmCaseInputs.caseId, id));
  const [deleted] = await db.delete(schema.psmCases).where(eq(schema.psmCases.id, id)).returning();
  return deleted;
}

// ── Case Inputs ─────────────────────────────────────────────────────────────

export async function saveCaseInputs(caseId: number, inputs: { dimension: string; score: number; notes?: string }[]) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  // Delete old inputs for this case
  await db.delete(schema.psmCaseInputs).where(eq(schema.psmCaseInputs.caseId, caseId));
  if (inputs.length === 0) return [];
  const rows = await db.insert(schema.psmCaseInputs).values(inputs.map(i => ({ caseId, dimension: i.dimension, score: String(i.score), notes: i.notes }))).returning();
  return rows;
}

export async function getCaseInputs(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseInputs).where(eq(schema.psmCaseInputs.caseId, caseId));
}

// ── Case Recommendations ────────────────────────────────────────────────────

export async function saveCaseRecommendations(caseId: number, recs: { methodId: number; score: number; rank: number; explanation: string; aiContributed?: boolean }[]) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  await db.delete(schema.psmCaseRecommendations).where(eq(schema.psmCaseRecommendations.caseId, caseId));
  if (recs.length === 0) return [];
  return db.insert(schema.psmCaseRecommendations).values(recs.map(r => ({ caseId, methodId: r.methodId, score: String(r.score), rank: r.rank, explanation: r.explanation, aiContributed: r.aiContributed ?? false }))).returning();
}

export async function getCaseRecommendations(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseRecommendations).where(eq(schema.psmCaseRecommendations.caseId, caseId)).orderBy(schema.psmCaseRecommendations.rank);
}

// ── Case Selected Methods ───────────────────────────────────────────────────

export async function attachMethod(caseId: number, methodId: number, reason?: string) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmCaseSelectedMethods).values({ caseId, methodId, reason }).returning();
  return created;
}

export async function getCaseSelectedMethods(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseSelectedMethods).where(eq(schema.psmCaseSelectedMethods.caseId, caseId));
}

// ── Case Runs ───────────────────────────────────────────────────────────────

export async function createRun(data: { caseId: number; methodId: number; workflowId?: number }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmCaseRuns).values({ ...data, status: "active", startedAt: new Date() } as any).returning();
  return created;
}

export async function getRun(id: number) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmCaseRuns).where(eq(schema.psmCaseRuns.id, id)).limit(1);
  return rows[0] || null;
}

export async function listRunsByCaseId(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseRuns).where(eq(schema.psmCaseRuns.caseId, caseId)).orderBy(desc(schema.psmCaseRuns.createdAt));
}

export async function updateRun(id: number, data: Record<string, any>) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [updated] = await db.update(schema.psmCaseRuns).set({ ...data, updatedAt: new Date() }).where(eq(schema.psmCaseRuns.id, id)).returning();
  return updated;
}

// ── Step Runs ───────────────────────────────────────────────────────────────

export async function createStepRuns(runId: number, stepCount: number) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    runId,
    stepNumber: i + 1,
    status: i === 0 ? "in_progress" : "pending",
  }));
  return db.insert(schema.psmCaseStepRuns).values(steps as any).returning();
}

export async function getStepRuns(runId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseStepRuns).where(eq(schema.psmCaseStepRuns.runId, runId)).orderBy(schema.psmCaseStepRuns.stepNumber);
}

export async function saveStep(runId: number, stepNumber: number, data: { notes?: string; output?: any; status?: string }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const sets: any = {};
  if (data.notes !== undefined) sets.notes = data.notes;
  if (data.output !== undefined) sets.output = data.output;
  if (data.status) {
    sets.status = data.status;
    if (data.status === "in_progress") sets.startedAt = new Date();
    if (data.status === "completed" || data.status === "skipped") sets.completedAt = new Date();
  }
  const [updated] = await db.update(schema.psmCaseStepRuns)
    .set(sets)
    .where(and(eq(schema.psmCaseStepRuns.runId, runId), eq(schema.psmCaseStepRuns.stepNumber, stepNumber)))
    .returning();
  return updated;
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function listNotes(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseNotes).where(eq(schema.psmCaseNotes.caseId, caseId)).orderBy(desc(schema.psmCaseNotes.createdAt));
}

export async function addNote(data: { caseId: number; runId?: number; authorUserId?: number; content: string }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmCaseNotes).values(data as any).returning();
  return created;
}

// ── Decision Log ────────────────────────────────────────────────────────────

export async function listDecisions(caseId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmCaseDecisionLog).where(eq(schema.psmCaseDecisionLog.caseId, caseId)).orderBy(desc(schema.psmCaseDecisionLog.createdAt));
}

export async function addDecision(data: { caseId: number; title: string; decision?: string; rationale?: string; alternatives?: any }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmCaseDecisionLog).values(data as any).returning();
  return created;
}

// ── Content Packs ───────────────────────────────────────────────────────────

export async function listContentPacks() {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmContentPacks).orderBy(desc(schema.psmContentPacks.createdAt));
}

export async function getContentPack(id: number) {
  const db = getPsmDb();
  if (!db) return null;
  const rows = await db.select().from(schema.psmContentPacks).where(eq(schema.psmContentPacks.id, id)).limit(1);
  return rows[0] || null;
}

export async function createContentPack(data: { name: string; description?: string; createdBy?: number }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmContentPacks).values(data as any).returning();
  return created;
}

export async function updateContentPack(id: number, data: Record<string, any>) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [updated] = await db.update(schema.psmContentPacks).set(data).where(eq(schema.psmContentPacks.id, id)).returning();
  return updated;
}

// ── Publish Log ─────────────────────────────────────────────────────────────

export async function addPublishLog(data: { packId: number; action: string; actorUserId?: number; reason?: string }) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB unavailable");
  const [created] = await db.insert(schema.psmPublishLog).values(data as any).returning();
  return created;
}

export async function listPublishLogs(packId?: number) {
  const db = getPsmDb();
  if (!db) return [];
  let query = db.select().from(schema.psmPublishLog);
  if (packId) query = query.where(eq(schema.psmPublishLog.packId, packId)) as any;
  return query.orderBy(desc(schema.psmPublishLog.createdAt));
}

// ── Audit ───────────────────────────────────────────────────────────────────

export async function createAuditEvent(data: { eventType: string; entityType?: string; entityId?: number; actorUserId?: number; metadata?: any }) {
  const db = getPsmDb();
  if (!db) return null;
  try {
    const [created] = await db.insert(schema.psmAuditEvents).values(data as any).returning();
    return created;
  } catch {
    return null;
  }
}

export async function listAuditEvents(opts?: { eventType?: string; entityType?: string; limit?: number; offset?: number }) {
  const db = getPsmDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.eventType) conditions.push(eq(schema.psmAuditEvents.eventType, opts.eventType));
  if (opts?.entityType) conditions.push(eq(schema.psmAuditEvents.entityType, opts.entityType));
  let query = db.select().from(schema.psmAuditEvents);
  if (conditions.length === 1) query = query.where(conditions[0]) as any;
  else if (conditions.length > 1) query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(schema.psmAuditEvents.createdAt)) as any;
  if (opts?.limit) query = query.limit(opts.limit) as any;
  if (opts?.offset) query = query.offset(opts.offset) as any;
  return query;
}

// ── Problem Types ───────────────────────────────────────────────────────────

export async function listProblemTypes() {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmProblemTypes).orderBy(schema.psmProblemTypes.name);
}

// ── Fit Rules ───────────────────────────────────────────────────────────────

export async function getFitRulesForMethod(methodId: number) {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmMethodFitRules).where(eq(schema.psmMethodFitRules.methodId, methodId));
}

export async function getAllFitRules() {
  const db = getPsmDb();
  if (!db) return [];
  return db.select().from(schema.psmMethodFitRules);
}

// ── Analytics helpers ───────────────────────────────────────────────────────

export async function getAnalyticsSummary() {
  const db = getPsmDb();
  if (!db) return { methodCount: 0, caseCount: 0, activeRunCount: 0, completedCaseCount: 0 };
  try {
    const methods = await db.select().from(schema.psmMethods);
    const cases = await db.select().from(schema.psmCases);
    const runs = await db.select().from(schema.psmCaseRuns).where(eq(schema.psmCaseRuns.status, "active"));
    const completed = await db.select().from(schema.psmCases).where(eq(schema.psmCases.status, "completed"));
    return {
      methodCount: methods.length,
      caseCount: cases.length,
      activeRunCount: runs.length,
      completedCaseCount: completed.length,
    };
  } catch {
    return { methodCount: 0, caseCount: 0, activeRunCount: 0, completedCaseCount: 0 };
  }
}

export async function getMethodUsageCounts() {
  const db = getPsmDb();
  if (!db) return [];
  try {
    const result = await db.execute(
      sql`SELECT m.id, m.name, m.slug, count(r.id)::int as usage_count
          FROM psm_methods m LEFT JOIN psm_case_runs r ON r.method_id = m.id
          GROUP BY m.id, m.name, m.slug ORDER BY usage_count DESC LIMIT 20`,
    );
    return (result as any).rows ?? [];
  } catch {
    return [];
  }
}

// ── AI Catalog Imports ─────────────────────────────────────────────────────

export async function listCatalogImports() {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB not connected");
  return db
    .select()
    .from(schema.psmCatalogImports)
    .where(eq(schema.psmCatalogImports.status, "active"))
    .orderBy(schema.psmCatalogImports.id);
}

export async function importCatalogEntry(data: {
  catalogEntryId: number;
  entryType: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  config?: Record<string, any>;
}) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB not connected");
  const existing = await db
    .select()
    .from(schema.psmCatalogImports)
    .where(
      and(
        eq(schema.psmCatalogImports.catalogEntryId, data.catalogEntryId),
        eq(schema.psmCatalogImports.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [imported] = await db
    .insert(schema.psmCatalogImports)
    .values({
      catalogEntryId: data.catalogEntryId,
      entryType: data.entryType,
      name: data.name,
      description: data.description || "",
      category: data.category || "",
      tags: data.tags || [],
      config: data.config || {},
    })
    .returning();
  return imported;
}

export async function removeCatalogImport(id: number) {
  const db = getPsmDb();
  if (!db) throw new Error("PSMDB not connected");
  await db
    .update(schema.psmCatalogImports)
    .set({ status: "removed" })
    .where(eq(schema.psmCatalogImports.id, id));
  return { success: true };
}
