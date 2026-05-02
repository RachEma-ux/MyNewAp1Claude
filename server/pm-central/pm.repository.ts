/**
 * PM Central Repository — PMDB queries
 *
 * All queries go through getPmDb() — never touches the main app DB
 * or any other module's DB. Pure data access; no business rules or
 * audit/event side effects.
 */

import { eq, and, desc, sql, lt } from "drizzle-orm";
import { getPmDb } from "./connection";
import * as schema from "../../drizzle/tables/pmdb";

function db() {
  const d = getPmDb();
  if (!d) throw new Error("PMDB not connected");
  return d;
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function createProject(
  data: schema.InsertPmProject,
): Promise<schema.PmProject> {
  const [row] = await db().insert(schema.pmProjects).values(data).returning();
  return row;
}

export async function getProjectById(
  id: number,
): Promise<schema.PmProject | null> {
  const [row] = await db()
    .select()
    .from(schema.pmProjects)
    .where(eq(schema.pmProjects.id, id))
    .limit(1);
  return row ?? null;
}

export async function listProjects(filters: {
  workspaceId: number;
  status?: string;
  sourceModule?: string;
  sourceRefId?: number;
  limit?: number;
  offset?: number;
}): Promise<schema.PmProject[]> {
  const conditions = [eq(schema.pmProjects.workspaceId, filters.workspaceId)];
  if (filters.status) {
    conditions.push(eq(schema.pmProjects.status, filters.status));
  }
  if (filters.sourceModule) {
    conditions.push(eq(schema.pmProjects.sourceModule, filters.sourceModule));
  }
  if (filters.sourceRefId !== undefined) {
    conditions.push(eq(schema.pmProjects.sourceRefId, filters.sourceRefId));
  }
  let q = db()
    .select()
    .from(schema.pmProjects)
    .where(and(...conditions))
    .orderBy(desc(schema.pmProjects.updatedAt));
  if (filters.limit) q = q.limit(filters.limit) as any;
  if (filters.offset) q = q.offset(filters.offset) as any;
  return q;
}

export async function updateProject(
  id: number,
  patch: Partial<schema.InsertPmProject>,
): Promise<schema.PmProject> {
  const [row] = await db()
    .update(schema.pmProjects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmProjects.id, id))
    .returning();
  return row;
}

// ── Plans ───────────────────────────────────────────────────────────────────

export async function createPlan(
  data: schema.InsertPmPlan,
): Promise<schema.PmPlan> {
  const [row] = await db().insert(schema.pmPlans).values(data).returning();
  return row;
}

export async function getPlanById(id: number): Promise<schema.PmPlan | null> {
  const [row] = await db()
    .select()
    .from(schema.pmPlans)
    .where(eq(schema.pmPlans.id, id))
    .limit(1);
  return row ?? null;
}

export async function listPlansByProject(
  pmProjectId: number,
): Promise<schema.PmPlan[]> {
  return db()
    .select()
    .from(schema.pmPlans)
    .where(eq(schema.pmPlans.pmProjectId, pmProjectId))
    .orderBy(desc(schema.pmPlans.updatedAt));
}

export async function updatePlan(
  id: number,
  patch: Partial<schema.InsertPmPlan>,
): Promise<schema.PmPlan> {
  const [row] = await db()
    .update(schema.pmPlans)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmPlans.id, id))
    .returning();
  return row;
}

// ── Milestones ──────────────────────────────────────────────────────────────

export async function createMilestone(
  data: schema.InsertPmMilestone,
): Promise<schema.PmMilestone> {
  const [row] = await db()
    .insert(schema.pmMilestones)
    .values(data)
    .returning();
  return row;
}

export async function getMilestoneById(
  id: number,
): Promise<schema.PmMilestone | null> {
  const [row] = await db()
    .select()
    .from(schema.pmMilestones)
    .where(eq(schema.pmMilestones.id, id))
    .limit(1);
  return row ?? null;
}

export async function listMilestonesByProject(
  pmProjectId: number,
): Promise<schema.PmMilestone[]> {
  return db()
    .select()
    .from(schema.pmMilestones)
    .where(eq(schema.pmMilestones.pmProjectId, pmProjectId))
    .orderBy(schema.pmMilestones.sortOrder);
}

export async function updateMilestone(
  id: number,
  patch: Partial<schema.InsertPmMilestone>,
): Promise<schema.PmMilestone> {
  const [row] = await db()
    .update(schema.pmMilestones)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmMilestones.id, id))
    .returning();
  return row;
}

export async function deleteMilestone(id: number): Promise<void> {
  await db().delete(schema.pmMilestones).where(eq(schema.pmMilestones.id, id));
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export async function createTask(
  data: schema.InsertPmTask,
): Promise<schema.PmTask> {
  const [row] = await db().insert(schema.pmTasks).values(data).returning();
  return row;
}

export async function getTaskById(id: number): Promise<schema.PmTask | null> {
  const [row] = await db()
    .select()
    .from(schema.pmTasks)
    .where(eq(schema.pmTasks.id, id))
    .limit(1);
  return row ?? null;
}

export async function listTasksByProject(
  pmProjectId: number,
): Promise<schema.PmTask[]> {
  return db()
    .select()
    .from(schema.pmTasks)
    .where(eq(schema.pmTasks.pmProjectId, pmProjectId))
    .orderBy(desc(schema.pmTasks.updatedAt));
}

export async function updateTask(
  id: number,
  patch: Partial<schema.InsertPmTask>,
): Promise<schema.PmTask> {
  const [row] = await db()
    .update(schema.pmTasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmTasks.id, id))
    .returning();
  return row;
}

export async function deleteTask(id: number): Promise<void> {
  await db().delete(schema.pmTasks).where(eq(schema.pmTasks.id, id));
}

// ── Risks ───────────────────────────────────────────────────────────────────

export async function createRisk(
  data: schema.InsertPmRisk,
): Promise<schema.PmRisk> {
  const [row] = await db().insert(schema.pmRisks).values(data).returning();
  return row;
}

export async function getRiskById(id: number): Promise<schema.PmRisk | null> {
  const [row] = await db()
    .select()
    .from(schema.pmRisks)
    .where(eq(schema.pmRisks.id, id))
    .limit(1);
  return row ?? null;
}

export async function listRisksByProject(
  pmProjectId: number,
): Promise<schema.PmRisk[]> {
  return db()
    .select()
    .from(schema.pmRisks)
    .where(eq(schema.pmRisks.pmProjectId, pmProjectId))
    .orderBy(desc(schema.pmRisks.updatedAt));
}

export async function updateRisk(
  id: number,
  patch: Partial<schema.InsertPmRisk>,
): Promise<schema.PmRisk> {
  const [row] = await db()
    .update(schema.pmRisks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmRisks.id, id))
    .returning();
  return row;
}

// ── Issues ──────────────────────────────────────────────────────────────────

export async function createIssue(
  data: schema.InsertPmIssue,
): Promise<schema.PmIssue> {
  const [row] = await db().insert(schema.pmIssues).values(data).returning();
  return row;
}

export async function getIssueById(id: number): Promise<schema.PmIssue | null> {
  const [row] = await db()
    .select()
    .from(schema.pmIssues)
    .where(eq(schema.pmIssues.id, id))
    .limit(1);
  return row ?? null;
}

export async function listIssuesByProject(
  pmProjectId: number,
): Promise<schema.PmIssue[]> {
  return db()
    .select()
    .from(schema.pmIssues)
    .where(eq(schema.pmIssues.pmProjectId, pmProjectId))
    .orderBy(desc(schema.pmIssues.updatedAt));
}

export async function updateIssue(
  id: number,
  patch: Partial<schema.InsertPmIssue>,
): Promise<schema.PmIssue> {
  const [row] = await db()
    .update(schema.pmIssues)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmIssues.id, id))
    .returning();
  return row;
}

// ── Decisions ───────────────────────────────────────────────────────────────

export async function recordDecision(
  data: schema.InsertPmDecision,
): Promise<schema.PmDecision> {
  const [row] = await db()
    .insert(schema.pmDecisions)
    .values(data)
    .returning();
  return row;
}

export async function listDecisionsByProject(
  pmProjectId: number,
): Promise<schema.PmDecision[]> {
  return db()
    .select()
    .from(schema.pmDecisions)
    .where(eq(schema.pmDecisions.pmProjectId, pmProjectId))
    .orderBy(desc(schema.pmDecisions.decidedAt));
}

// ── Handoffs ────────────────────────────────────────────────────────────────

export async function recordHandoff(
  data: schema.InsertPmHandoff,
): Promise<schema.PmHandoff> {
  const [row] = await db().insert(schema.pmHandoffs).values(data).returning();
  return row;
}

export async function getHandoffById(
  id: number,
): Promise<schema.PmHandoff | null> {
  const [row] = await db()
    .select()
    .from(schema.pmHandoffs)
    .where(eq(schema.pmHandoffs.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateHandoff(
  id: number,
  patch: Partial<schema.InsertPmHandoff>,
): Promise<schema.PmHandoff> {
  const [row] = await db()
    .update(schema.pmHandoffs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.pmHandoffs.id, id))
    .returning();
  return row;
}

export async function listPendingHandoffs(): Promise<schema.PmHandoff[]> {
  return db()
    .select()
    .from(schema.pmHandoffs)
    .where(eq(schema.pmHandoffs.status, "received"))
    .orderBy(desc(schema.pmHandoffs.createdAt));
}

// ── Activity log ────────────────────────────────────────────────────────────

export async function logActivity(
  data: schema.InsertPmActivity,
): Promise<void> {
  await db().insert(schema.pmActivityLog).values(data);
}

// ── Summary / counts ────────────────────────────────────────────────────────

export async function summary(workspaceId: number): Promise<{
  totalProjects: number;
  activeProjects: number;
  blockedProjects: number;
  overdueMilestones: number;
  openRisks: number;
  openIssues: number;
  pendingHandoffs: number;
}> {
  const d = db();
  const [{ cnt: totalProjects }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_projects WHERE workspace_id = ${workspaceId}`,
  )).rows as any;
  const [{ cnt: activeProjects }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_projects WHERE workspace_id = ${workspaceId} AND status = 'active'`,
  )).rows as any;
  const [{ cnt: blockedProjects }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_projects WHERE workspace_id = ${workspaceId} AND status = 'blocked'`,
  )).rows as any;
  const [{ cnt: overdueMilestones }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_milestones m
        JOIN pm_projects p ON p.id = m.pm_project_id
        WHERE p.workspace_id = ${workspaceId}
          AND m.status NOT IN ('completed','cancelled')
          AND m.due_date IS NOT NULL AND m.due_date < now()`,
  )).rows as any;
  const [{ cnt: openRisks }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_risks r
        JOIN pm_projects p ON p.id = r.pm_project_id
        WHERE p.workspace_id = ${workspaceId} AND r.status IN ('open','monitoring')`,
  )).rows as any;
  const [{ cnt: openIssues }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_issues i
        JOIN pm_projects p ON p.id = i.pm_project_id
        WHERE p.workspace_id = ${workspaceId} AND i.status IN ('open','in_progress')`,
  )).rows as any;
  const [{ cnt: pendingHandoffs }] = (await d.execute(
    sql`SELECT count(*)::int AS cnt FROM pm_handoffs WHERE status = 'received'`,
  )).rows as any;
  return {
    totalProjects: Number(totalProjects),
    activeProjects: Number(activeProjects),
    blockedProjects: Number(blockedProjects),
    overdueMilestones: Number(overdueMilestones),
    openRisks: Number(openRisks),
    openIssues: Number(openIssues),
    pendingHandoffs: Number(pendingHandoffs),
  };
}

export async function pingDb(): Promise<boolean> {
  try {
    await db().execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// Suppress unused-import warning for `lt` in environments where the
// summary fragments above are evaluated lazily.
void lt;
