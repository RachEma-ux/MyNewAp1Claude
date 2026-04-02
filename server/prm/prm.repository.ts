/**
 * PRM Repository — PRMDB queries for cases, events, actions, evidence, etc.
 *
 * All queries go through getPrmDb() — never touches the main DB.
 */

import { eq, desc, and, ilike, sql, asc } from "drizzle-orm";
import { getPrmDb } from "./connection";
import * as schema from "../../drizzle/tables/prmdb";

// ── Cases ───────────────────────────────────────────────────────────────────

export async function createCase(data: schema.InsertPrmCase) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmCases).values(data).returning();
  return row;
}

export async function getCaseById(id: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.select().from(schema.prmCases).where(eq(schema.prmCases.id, id));
  return row || null;
}

export async function updateCase(id: number, data: Partial<schema.InsertPrmCase>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmCases)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmCases.id, id))
    .returning();
  return row;
}

export async function deleteCase(id: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  // Delete child rows first (no FK cascade)
  await db.delete(schema.prmSyncEvents).where(eq(schema.prmSyncEvents.caseId, id));
  await db.delete(schema.prmExternalRefs).where(eq(schema.prmExternalRefs.caseId, id));
  await db.delete(schema.prmLessons).where(eq(schema.prmLessons.caseId, id));
  await db.delete(schema.prmPreventionPlans).where(eq(schema.prmPreventionPlans.caseId, id));
  await db.delete(schema.prmVerifications).where(eq(schema.prmVerifications.caseId, id));
  await db.delete(schema.prmEvidence).where(eq(schema.prmEvidence.caseId, id));
  await db.delete(schema.prmActions).where(eq(schema.prmActions.caseId, id));
  await db.delete(schema.prmDecisions).where(eq(schema.prmDecisions.caseId, id));
  await db.delete(schema.prmMethodRuns).where(eq(schema.prmMethodRuns.caseId, id));
  await db.delete(schema.prmCaseEvents).where(eq(schema.prmCaseEvents.caseId, id));
  const [deleted] = await db.delete(schema.prmCases).where(eq(schema.prmCases.id, id)).returning();
  return deleted;
}

export async function listCases(filters: {
  status?: string;
  severity?: string;
  ownerUserId?: number;
  search?: string;
  limit: number;
  offset: number;
}) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");

  const conditions = [];
  if (filters.status) conditions.push(eq(schema.prmCases.status, filters.status));
  if (filters.severity) conditions.push(eq(schema.prmCases.severity, filters.severity));
  if (filters.ownerUserId) conditions.push(eq(schema.prmCases.ownerUserId, filters.ownerUserId));
  if (filters.search) conditions.push(ilike(schema.prmCases.title, `%${filters.search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(schema.prmCases)
    .where(where)
    .orderBy(desc(schema.prmCases.updatedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.prmCases)
    .where(where);

  return { rows, total: count };
}

// ── Case Events ─────────────────────────────────────────────────────────────

export async function createEvent(data: schema.InsertPrmCaseEvent) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmCaseEvents).values(data).returning();
  return row;
}

export async function listEvents(caseId: number, limit: number = 50) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmCaseEvents)
    .where(eq(schema.prmCaseEvents.caseId, caseId))
    .orderBy(desc(schema.prmCaseEvents.createdAt))
    .limit(limit);
}

// ── Method Templates ────────────────────────────────────────────────────────

export async function listMethodTemplates() {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db.select().from(schema.prmMethodTemplates).orderBy(asc(schema.prmMethodTemplates.name));
}

// ── Method Runs ─────────────────────────────────────────────────────────────

export async function createMethodRun(data: schema.InsertPrmMethodRun) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmMethodRuns).values(data).returning();
  return row;
}

export async function getMethodRun(id: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.select().from(schema.prmMethodRuns).where(eq(schema.prmMethodRuns.id, id));
  return row || null;
}

export async function updateMethodRun(id: number, data: Partial<schema.InsertPrmMethodRun>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmMethodRuns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmMethodRuns.id, id))
    .returning();
  return row;
}

export async function listMethodRunsByCaseId(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmMethodRuns)
    .where(eq(schema.prmMethodRuns.caseId, caseId))
    .orderBy(desc(schema.prmMethodRuns.createdAt));
}

// ── Decisions ───────────────────────────────────────────────────────────────

export async function addDecision(data: schema.InsertPrmDecision) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmDecisions).values(data).returning();
  return row;
}

export async function listDecisions(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmDecisions)
    .where(eq(schema.prmDecisions.caseId, caseId))
    .orderBy(desc(schema.prmDecisions.createdAt));
}

export async function updateDecision(id: number, data: Partial<schema.InsertPrmDecision>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmDecisions)
    .set(data)
    .where(eq(schema.prmDecisions.id, id))
    .returning();
  return row;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export async function addAction(data: schema.InsertPrmAction) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmActions).values(data).returning();
  return row;
}

export async function listActions(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmActions)
    .where(eq(schema.prmActions.caseId, caseId))
    .orderBy(asc(schema.prmActions.createdAt));
}

export async function updateAction(id: number, data: Partial<schema.InsertPrmAction>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmActions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmActions.id, id))
    .returning();
  return row;
}

// ── Evidence ────────────────────────────────────────────────────────────────

export async function addEvidence(data: schema.InsertPrmEvidence) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmEvidence).values(data).returning();
  return row;
}

export async function listEvidence(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmEvidence)
    .where(eq(schema.prmEvidence.caseId, caseId))
    .orderBy(desc(schema.prmEvidence.createdAt));
}

export async function updateEvidence(id: number, data: Partial<schema.InsertPrmEvidence>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmEvidence)
    .set(data)
    .where(eq(schema.prmEvidence.id, id))
    .returning();
  return row;
}

// ── Verifications ───────────────────────────────────────────────────────────

export async function addVerification(data: schema.InsertPrmVerification) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmVerifications).values(data).returning();
  return row;
}

export async function listVerifications(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmVerifications)
    .where(eq(schema.prmVerifications.caseId, caseId))
    .orderBy(desc(schema.prmVerifications.createdAt));
}

export async function updateVerification(id: number, data: Partial<schema.InsertPrmVerification>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmVerifications)
    .set(data)
    .where(eq(schema.prmVerifications.id, id))
    .returning();
  return row;
}

export async function countPassedVerifications(caseId: number): Promise<number> {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.prmVerifications)
    .where(and(eq(schema.prmVerifications.caseId, caseId), eq(schema.prmVerifications.passed, true)));
  return count;
}

// ── Prevention Plans ────────────────────────────────────────────────────────

export async function addPrevention(data: schema.InsertPrmPreventionPlan) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmPreventionPlans).values(data).returning();
  return row;
}

export async function listPreventionPlans(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmPreventionPlans)
    .where(eq(schema.prmPreventionPlans.caseId, caseId))
    .orderBy(desc(schema.prmPreventionPlans.createdAt));
}

export async function updatePrevention(id: number, data: Partial<schema.InsertPrmPreventionPlan>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmPreventionPlans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmPreventionPlans.id, id))
    .returning();
  return row;
}

// ── Lessons ─────────────────────────────────────────────────────────────────

export async function addLesson(data: schema.InsertPrmLesson) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmLessons).values(data).returning();
  return row;
}

export async function listLessons(caseId?: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const q = db.select().from(schema.prmLessons);
  if (caseId) return q.where(eq(schema.prmLessons.caseId, caseId)).orderBy(desc(schema.prmLessons.createdAt));
  return q.orderBy(desc(schema.prmLessons.createdAt));
}

export async function updateLesson(id: number, data: Partial<schema.InsertPrmLesson>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmLessons)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmLessons.id, id))
    .returning();
  return row;
}

// ── Playbooks ───────────────────────────────────────────────────────────────

export async function createPlaybook(data: schema.InsertPrmPlaybook) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmPlaybooks).values(data).returning();
  return row;
}

export async function getPlaybook(id: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.select().from(schema.prmPlaybooks).where(eq(schema.prmPlaybooks.id, id));
  return row || null;
}

export async function listPlaybooks(domain?: string) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const q = db.select().from(schema.prmPlaybooks);
  if (domain) return q.where(eq(schema.prmPlaybooks.domain, domain)).orderBy(asc(schema.prmPlaybooks.title));
  return q.orderBy(asc(schema.prmPlaybooks.title));
}

export async function updatePlaybook(id: number, data: Partial<schema.InsertPrmPlaybook>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmPlaybooks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmPlaybooks.id, id))
    .returning();
  return row;
}

// ── Catalog Items ───────────────────────────────────────────────────────────

export async function listCatalogItems(itemType?: string) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const q = db.select().from(schema.prmCatalogItems);
  if (itemType) return q.where(eq(schema.prmCatalogItems.itemType, itemType)).orderBy(desc(schema.prmCatalogItems.createdAt));
  return q.orderBy(desc(schema.prmCatalogItems.createdAt));
}

export async function createCatalogItem(data: schema.InsertPrmCatalogItem) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmCatalogItems).values(data).returning();
  return row;
}

export async function updateCatalogItem(id: number, data: Partial<schema.InsertPrmCatalogItem>) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db
    .update(schema.prmCatalogItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prmCatalogItems.id, id))
    .returning();
  return row;
}

// ── External Refs ───────────────────────────────────────────────────────────

export async function addExternalRef(data: schema.InsertPrmExternalRef) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmExternalRefs).values(data).returning();
  return row;
}

export async function listExternalRefs(caseId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmExternalRefs)
    .where(eq(schema.prmExternalRefs.caseId, caseId))
    .orderBy(desc(schema.prmExternalRefs.createdAt));
}

export async function removeExternalRef(id: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  await db.delete(schema.prmExternalRefs).where(eq(schema.prmExternalRefs.id, id));
}

// ── Maturity ────────────────────────────────────────────────────────────────

export async function createMaturityRun(data: schema.InsertPrmMaturityRun) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [row] = await db.insert(schema.prmMaturityRuns).values(data).returning();
  return row;
}

export async function listMaturityRuns() {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db.select().from(schema.prmMaturityRuns).orderBy(desc(schema.prmMaturityRuns.runDate));
}

// ── Analytics / KPIs ────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");

  const [caseStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status not in ('verified_closed', 'cancelled'))::int`,
      critical: sql<number>`count(*) filter (where severity = 'critical' and status not in ('verified_closed', 'cancelled'))::int`,
    })
    .from(schema.prmCases);

  const [actionStats] = await db
    .select({
      overdue: sql<number>`count(*) filter (where status in ('pending', 'in_progress') and due_date < now())::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    })
    .from(schema.prmActions);

  return { ...caseStats, ...actionStats };
}

// ── Catalog Imports ─────────────────────────────────────────────────────

export async function listCatalogImports() {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  return db
    .select()
    .from(schema.prmCatalogImports)
    .where(eq(schema.prmCatalogImports.status, "active"))
    .orderBy(schema.prmCatalogImports.id);
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
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const existing = await db
    .select()
    .from(schema.prmCatalogImports)
    .where(
      and(
        eq(schema.prmCatalogImports.catalogEntryId, data.catalogEntryId),
        eq(schema.prmCatalogImports.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [imported] = await db
    .insert(schema.prmCatalogImports)
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
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  await db
    .update(schema.prmCatalogImports)
    .set({ status: "removed" })
    .where(eq(schema.prmCatalogImports.id, id));
  return { success: true };
}

// ── Health ──────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ connected: boolean; tableCount?: number }> {
  const db = getPrmDb();
  if (!db) return { connected: false };
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int as cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'prm_%'`
    );
    const rows = (result as any).rows ?? result;
    const first = Array.isArray(rows) ? rows[0] : rows;
    return { connected: true, tableCount: Number(first?.cnt) || 0 };
  } catch (err) {
    console.error("[PRMDB Health] Error:", err);
    return { connected: false };
  }
}
