/**
 * Code Studio — Repository (CODEDB queries)
 */

import { sql, eq, desc, and } from "drizzle-orm";
import { getCodeDb } from "./connection";
import * as schema from "../../drizzle/tables/codedb";

// ── Jobs ─────────────────────────────────────────────────────────────────────

export async function createJob(data: {
  title: string;
  description?: string;
  objective?: string;
  constraints?: Record<string, any>;
  priority?: string;
  repoId?: number;
  sourceModule?: string;
  sourceWorkflowId?: string;
  actorUserId?: number;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeJobs).values(data as any).returning();
  return row;
}

export async function getJobById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeJobs).where(eq(schema.codeJobs.id, id)).limit(1);
  return row ?? null;
}

export async function updateJob(id: number, data: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db.update(schema.codeJobs).set({ ...data, updatedAt: new Date() }).where(eq(schema.codeJobs.id, id)).returning();
  return updated;
}

export async function listJobs(filters: { status?: string; repoId?: number; limit?: number; offset?: number }) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.status) conditions.push(eq(schema.codeJobs.status, filters.status));
  if (filters.repoId) conditions.push(eq(schema.codeJobs.repoId, filters.repoId));

  const query = db.select().from(schema.codeJobs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.codeJobs.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
  return query;
}

export async function deleteJob(id: number) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  // Cascade delete child rows
  await db.delete(schema.codeArtifacts).where(eq(schema.codeArtifacts.jobId, id));
  await db.delete(schema.codeDiffs).where(eq(schema.codeDiffs.jobId, id));
  await db.delete(schema.codePullRequestCandidates).where(eq(schema.codePullRequestCandidates.jobId, id));
  await db.delete(schema.codeRunEvents).where(eq(schema.codeRunEvents.jobId, id));
  // Delete session children and messages via sessions
  const sessions = await db.select({ id: schema.codeSessions.id }).from(schema.codeSessions).where(eq(schema.codeSessions.jobId, id));
  for (const s of sessions) {
    await db.delete(schema.codeSessionMessages).where(eq(schema.codeSessionMessages.sessionId, s.id));
    await db.delete(schema.codeSessionChildren).where(eq(schema.codeSessionChildren.parentSessionId, s.id));
  }
  await db.delete(schema.codeSessions).where(eq(schema.codeSessions.jobId, id));
  // Delete approvals via permission requests
  const permReqs = await db.select({ id: schema.codePermissionRequests.id }).from(schema.codePermissionRequests).where(eq(schema.codePermissionRequests.jobId, id));
  for (const pr of permReqs) {
    await db.delete(schema.codeApprovals).where(eq(schema.codeApprovals.permissionRequestId, pr.id));
  }
  await db.delete(schema.codePermissionRequests).where(eq(schema.codePermissionRequests.jobId, id));
  await db.delete(schema.codeHandoffs).where(eq(schema.codeHandoffs.jobId, id));
  await db.delete(schema.codeJobSteps).where(eq(schema.codeJobSteps.jobId, id));
  await db.delete(schema.codeWorkspaces).where(eq(schema.codeWorkspaces.jobId, id));
  const [deleted] = await db.delete(schema.codeJobs).where(eq(schema.codeJobs.id, id)).returning();
  return deleted;
}

// ── Job Steps ────────────────────────────────────────────────────────────────

export async function createJobStep(data: { jobId: number; stepName: string; stepOrder: number; agentRole?: string }) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeJobSteps).values(data as any).returning();
  return row;
}

export async function updateJobStep(id: number, data: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db.update(schema.codeJobSteps).set(data).where(eq(schema.codeJobSteps.id, id)).returning();
  return updated;
}

export async function listJobSteps(jobId: number) {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codeJobSteps).where(eq(schema.codeJobSteps.jobId, jobId)).orderBy(schema.codeJobSteps.stepOrder);
}

// ── Repositories ─────────────────────────────────────────────────────────────

export async function createRepo(data: { name: string; url: string; defaultBranch?: string; cloneMethod?: string }) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeRepositories).values(data as any).returning();
  return row;
}

export async function listRepos(limit: number = 50) {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codeRepositories).where(eq(schema.codeRepositories.isActive, true)).orderBy(desc(schema.codeRepositories.createdAt)).limit(limit);
}

export async function getRepoById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeRepositories).where(eq(schema.codeRepositories.id, id)).limit(1);
  return row ?? null;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(data: { jobId: number; opencodeSessionId?: string; agentRole?: string; model?: string }) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeSessions).values(data as any).returning();
  return row;
}

export async function listSessions(filters: { jobId?: number; limit?: number }) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.jobId) conditions.push(eq(schema.codeSessions.jobId, filters.jobId));
  return db.select().from(schema.codeSessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.codeSessions.createdAt))
    .limit(filters.limit ?? 50);
}

export async function getSessionById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeSessions).where(eq(schema.codeSessions.id, id)).limit(1);
  return row ?? null;
}

// ── Approvals ────────────────────────────────────────────────────────────────

export async function createPermissionRequest(data: {
  jobId: number;
  sessionId?: number;
  opencodePermissionId?: string;
  permissionType: string;
  toolName?: string;
  description?: string;
  riskLevel?: string;
  requestPayload?: any;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codePermissionRequests).values(data as any).returning();
  return row;
}

export async function listPendingApprovals(filters: { jobId?: number; limit?: number }) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [eq(schema.codePermissionRequests.status, "pending")];
  if (filters.jobId) conditions.push(eq(schema.codePermissionRequests.jobId, filters.jobId));
  return db.select().from(schema.codePermissionRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.codePermissionRequests.createdAt))
    .limit(filters.limit ?? 50);
}

export async function resolvePermissionRequest(id: number, decision: string, actorUserId?: number, scope?: string, rationale?: string) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  // Update permission request status
  await db.update(schema.codePermissionRequests)
    .set({ status: decision === "approved" ? "approved" : "denied", resolvedAt: new Date() })
    .where(eq(schema.codePermissionRequests.id, id));
  // Create approval record
  const [approval] = await db.insert(schema.codeApprovals).values({
    permissionRequestId: id,
    decision,
    scope: scope ?? "once",
    actorUserId,
    rationale,
  }).returning();
  return approval;
}

// ── Diffs ────────────────────────────────────────────────────────────────────

export async function createDiff(data: {
  jobId: number;
  sessionId?: number;
  filePath: string;
  diffType: string;
  diffContent?: string;
  linesAdded?: number;
  linesRemoved?: number;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeDiffs).values(data as any).returning();
  return row;
}

export async function listDiffs(jobId: number) {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codeDiffs).where(eq(schema.codeDiffs.jobId, jobId)).orderBy(schema.codeDiffs.filePath);
}

// ── Handoffs ─────────────────────────────────────────────────────────────────

export async function createHandoff(data: {
  jobId: number;
  direction: string;
  sourceModule?: string;
  payload: any;
  callbackUrl?: string;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeHandoffs).values(data as any).returning();
  return row;
}

// ── Artifacts ────────────────────────────────────────────────────────────────

export async function createArtifact(data: {
  jobId: number;
  artifactType: string;
  name: string;
  content?: string;
  contentRef?: string;
  metadata?: any;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeArtifacts).values(data as any).returning();
  return row;
}

export async function listArtifacts(jobId: number) {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codeArtifacts).where(eq(schema.codeArtifacts.jobId, jobId));
}

// ── Audit ────────────────────────────────────────────────────────────────────

export async function createAuditEvent(data: {
  eventType: string;
  entityType?: string;
  entityId?: number;
  actorUserId?: number;
  details?: any;
}) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.insert(schema.codeAuditEvents).values(data as any).returning();
  return row;
}

export async function listAuditEvents(filters: { eventType?: string; entityType?: string; entityId?: number; limit?: number; offset?: number }) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.eventType) conditions.push(eq(schema.codeAuditEvents.eventType, filters.eventType));
  if (filters.entityType) conditions.push(eq(schema.codeAuditEvents.entityType, filters.entityType));
  if (filters.entityId) conditions.push(eq(schema.codeAuditEvents.entityId, filters.entityId));
  return db.select().from(schema.codeAuditEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.codeAuditEvents.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);
}

// ── Policies ─────────────────────────────────────────────────────────────────

export async function listPolicies() {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codePolicyProfiles).where(eq(schema.codePolicyProfiles.isActive, true));
}

export async function createPolicy(data: { name: string; repoId?: number; rules: any; isDefault?: boolean }) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codePolicyProfiles).values(data as any).returning();
  return row;
}

// ── Health / Summary ─────────────────────────────────────────────────────────

export async function getHealthSummary() {
  const db = getCodeDb();
  if (!db) return { connected: false, tableCount: 0 };
  try {
    const result = await db.execute(sql`
      SELECT count(*)::int as cnt FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tableCount = (result as any).rows?.[0]?.cnt ?? 0;
    return { connected: true, tableCount };
  } catch {
    return { connected: false, tableCount: 0 };
  }
}

export async function getModuleSummary() {
  const db = getCodeDb();
  if (!db) return null;
  try {
    const jobsResult = await db.execute(sql`SELECT count(*)::int as cnt FROM code_jobs`);
    const activeResult = await db.execute(sql`SELECT count(*)::int as cnt FROM code_jobs WHERE status NOT IN ('completed','failed','cancelled','archived')`);
    const sessionsResult = await db.execute(sql`SELECT count(*)::int as cnt FROM code_sessions`);
    const pendingResult = await db.execute(sql`SELECT count(*)::int as cnt FROM code_permission_requests WHERE status = 'pending'`);
    const reposResult = await db.execute(sql`SELECT count(*)::int as cnt FROM code_repositories WHERE is_active = true`);
    return {
      totalJobs: (jobsResult as any).rows?.[0]?.cnt ?? 0,
      activeJobs: (activeResult as any).rows?.[0]?.cnt ?? 0,
      totalSessions: (sessionsResult as any).rows?.[0]?.cnt ?? 0,
      pendingApprovals: (pendingResult as any).rows?.[0]?.cnt ?? 0,
      repositories: (reposResult as any).rows?.[0]?.cnt ?? 0,
    };
  } catch {
    return null;
  }
}
