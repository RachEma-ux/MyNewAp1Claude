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
  requestedModel?: string;
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

export async function updateSession(id: number, data: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db.update(schema.codeSessions).set(data).where(eq(schema.codeSessions.id, id)).returning();
  return updated;
}

// ── Session Messages ──────────────────────────────────────────────────────────

export async function createSessionMessage(data: {
  sessionId: number;
  opencodeMessageId?: string;
  role: string;
  contentPreview?: string;
  toolCalls?: any;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeSessionMessages).values(data as any).returning();
  return row;
}

export async function listSessionMessages(sessionId: number, limit: number = 200) {
  const db = getCodeDb();
  if (!db) return [];
  return db.select().from(schema.codeSessionMessages)
    .where(eq(schema.codeSessionMessages.sessionId, sessionId))
    .orderBy(schema.codeSessionMessages.id)
    .limit(limit);
}

export async function getArtifactByType(jobId: number, artifactType: string) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeArtifacts)
    .where(and(eq(schema.codeArtifacts.jobId, jobId), eq(schema.codeArtifacts.artifactType, artifactType)))
    .limit(1);
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

export async function deleteArtifactsByType(jobId: number, artifactType: string) {
  const db = getCodeDb();
  if (!db) return;
  await db.delete(schema.codeArtifacts)
    .where(and(eq(schema.codeArtifacts.jobId, jobId), eq(schema.codeArtifacts.artifactType, artifactType)));
}

// ── Job Templates ────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createTemplate(data: {
  name: string;
  description?: string;
  category?: string;
  templateType?: string;
  isBuiltIn?: boolean;
  titleTemplate?: string;
  objectiveTemplate?: string;
  defaultPriority?: string;
  defaultConstraints?: any;
  variableSchema?: any;
  importSource?: string;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const slug = slugify(data.name);
  const [row] = await db.insert(schema.codeJobTemplates).values({ ...data, slug } as any).returning();
  return row;
}

export async function getTemplateById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeJobTemplates).where(eq(schema.codeJobTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function updateTemplate(id: number, data: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  if (data.name) data.slug = slugify(data.name);
  const [updated] = await db.update(schema.codeJobTemplates).set({ ...data, updatedAt: new Date() }).where(eq(schema.codeJobTemplates.id, id)).returning();
  return updated;
}

export async function deleteTemplate(id: number) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [deleted] = await db.delete(schema.codeJobTemplates).where(eq(schema.codeJobTemplates.id, id)).returning();
  return deleted;
}

export async function listTemplates(filters: { category?: string; isActive?: boolean } = {}) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.category) conditions.push(eq(schema.codeJobTemplates.category, filters.category));
  if (filters.isActive !== undefined) conditions.push(eq(schema.codeJobTemplates.isActive, filters.isActive));
  else conditions.push(eq(schema.codeJobTemplates.isActive, true));
  return db.select().from(schema.codeJobTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.codeJobTemplates.createdAt));
}

export async function getTemplateBySlug(slug: string) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeJobTemplates)
    .where(and(eq(schema.codeJobTemplates.slug, slug), eq(schema.codeJobTemplates.isActive, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Render a template string by replacing {{variable}} placeholders.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return values[key] !== undefined ? values[key] : "";
  });
}

/**
 * Seed built-in templates if they don't already exist.
 */
export async function ensureBuiltInTemplates(): Promise<void> {
  const db = getCodeDb();
  if (!db) return;
  const existing = await db.select().from(schema.codeJobTemplates)
    .where(eq(schema.codeJobTemplates.isBuiltIn, true));
  const hasAudit = existing.some((t: any) => t.slug === "audit-job");
  if (!hasAudit) {
    await createTemplate({
      name: "Audit Job",
      description: "Audit an implementation prompt against actual repository code. Produces a strict evidence-based verdict.",
      category: "audit",
      templateType: "audit",
      isBuiltIn: true,
      titleTemplate: "Audit: {{targetPrompt}}",
      objectiveTemplate: `Read and follow AGENTS.md first as the mandatory repository operating policy.

Mandatory execution order:
Planner -> Builder -> Reviewer -> Tester -> Governance

Do not skip Reviewer.
Do not skip Governance.

Mission:
Audit the implementation produced by the following prompt against the actual repository code.

Target prompt to audit:
{{targetPrompt}}

{{scopeNotes}}

Audit requirements:
1. Inspect the actual current repository code — not summaries or assumptions
2. Compare implementation against every requirement in the target prompt
3. For each requirement, verify: was it implemented correctly?
4. Check for: regressions, scope drift, partial implementations, wrong fixes, conflicts
5. Produce a strict evidence-based verdict with file:line references
6. Rate overall compliance: PASS / PARTIAL / FAIL

Output format:
- Summary verdict
- Requirement-by-requirement checklist (PASS/FAIL per item)
- Specific issues found (with file:line references)
- Missing implementations
- Unexpected changes (scope drift)`,
      defaultPriority: "normal",
      variableSchema: [
        {
          key: "targetPrompt",
          label: "Target prompt to audit",
          type: "long_text",
          required: true,
          placeholder: "Paste the exact original implementation prompt here",
        },
        {
          key: "scopeNotes",
          label: "Extra audit notes",
          type: "long_text",
          required: false,
          placeholder: "Optional: any additional context or focus areas for the audit",
        },
      ],
    });
  }
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

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(schema.codeSettings)
    .where(eq(schema.codeSettings.key, key))
    .limit(1);
  return row ?? null;
}

export async function setSetting(key: string, value: any) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const existing = await db
    .select()
    .from(schema.codeSettings)
    .where(eq(schema.codeSettings.key, key))
    .limit(1);
  if (existing.length > 0) {
    const [updated] = await db
      .update(schema.codeSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.codeSettings.key, key))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(schema.codeSettings)
    .values({ key, value })
    .returning();
  return created;
}

// ── Catalog Imports ──────────────────────────────────────────────────────────

export async function listCatalogImports() {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB not connected");
  return db
    .select()
    .from(schema.codeCatalogImports)
    .where(eq(schema.codeCatalogImports.status, "active"))
    .orderBy(schema.codeCatalogImports.id);
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
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB not connected");
  const existing = await db
    .select()
    .from(schema.codeCatalogImports)
    .where(
      and(
        eq(schema.codeCatalogImports.catalogEntryId, data.catalogEntryId),
        eq(schema.codeCatalogImports.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [imported] = await db
    .insert(schema.codeCatalogImports)
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
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB not connected");
  await db
    .update(schema.codeCatalogImports)
    .set({ status: "removed" })
    .where(eq(schema.codeCatalogImports.id, id));
  return { success: true };
}

// ── IDE Instances ─────────────────────────────────────────────────────────

export async function createIdeInstance(data: {
  jobId?: number;
  sessionId?: number;
  workspaceId?: number;
  workspacePath: string;
  instanceType?: string;
  hostname: string;
  port: number;
  proxyKey: string;
  launchCommand?: string;
  processId?: number;
  expiresAt?: Date;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db.insert(schema.codeIdeInstances).values({
    ...data,
    status: "starting",
  } as any).returning();
  return row;
}

export async function getIdeInstanceById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeIdeInstances)
    .where(eq(schema.codeIdeInstances.id, id)).limit(1);
  return row ?? null;
}

export async function getIdeInstanceByProxyKey(proxyKey: string) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeIdeInstances)
    .where(eq(schema.codeIdeInstances.proxyKey, proxyKey)).limit(1);
  return row ?? null;
}

export async function getRunningIdeInstanceForJob(jobId: number) {
  const db = getCodeDb();
  if (!db) return null;
  const rows = await db.select().from(schema.codeIdeInstances)
    .where(and(
      eq(schema.codeIdeInstances.jobId, jobId),
      eq(schema.codeIdeInstances.status, "running"),
    )).limit(1);
  return rows[0] ?? null;
}

export async function getRunningIdeInstanceForWorkspacePath(workspacePath: string) {
  const db = getCodeDb();
  if (!db) return null;
  const rows = await db.select().from(schema.codeIdeInstances)
    .where(and(
      eq(schema.codeIdeInstances.workspacePath, workspacePath),
      eq(schema.codeIdeInstances.status, "running"),
    )).limit(1);
  return rows[0] ?? null;
}

export async function updateIdeInstance(id: number, data: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db.update(schema.codeIdeInstances)
    .set(data)
    .where(eq(schema.codeIdeInstances.id, id)).returning();
  return updated;
}

export async function listIdeInstances(filter?: { status?: string }) {
  const db = getCodeDb();
  if (!db) return [];
  if (filter?.status) {
    return db.select().from(schema.codeIdeInstances)
      .where(eq(schema.codeIdeInstances.status, filter.status))
      .orderBy(desc(schema.codeIdeInstances.startedAt));
  }
  return db.select().from(schema.codeIdeInstances)
    .orderBy(desc(schema.codeIdeInstances.startedAt));
}

export async function getAllocatedPorts(): Promise<number[]> {
  const db = getCodeDb();
  if (!db) return [];
  const rows = await db.select({ port: schema.codeIdeInstances.port })
    .from(schema.codeIdeInstances)
    .where(eq(schema.codeIdeInstances.status, "running"));
  return rows.map(r => r.port);
}
