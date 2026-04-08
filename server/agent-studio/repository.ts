/**
 * AI Agent Studio — Repository
 *
 * Data access layer for the AI Agent Studio module. Wraps Drizzle queries
 * against the ags_* table family in the main mynewap1claude database.
 *
 * No cross-module imports — this module is fully independent.
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  agsAgents,
  agsAgentDrafts,
  agsAgentVersions,
  agsAgentReleases,
  agsDraftToolBindings,
  agsDraftKnowledgeBindings,
  agsDraftMemoryConfigs,
  agsDraftWorkflowNodes,
  agsDraftWorkflowEdges,
  agsSimulationScenarios,
  agsSimulationRuns,
  agsSimulationRunSteps,
  agsTestSuites,
  agsTestCases,
  agsTestRuns,
  agsTestRunResults,
  agsRuntimeRuns,
  agsRuntimeRunSteps,
  agsPublishRequests,
  agsApprovalSteps,
} from "../../drizzle/tables/agent-studio";

function db() {
  const conn = getDb();
  if (!conn) throw new Error("[AgentStudio] Database not available");
  return conn;
}

// ── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents(filters: {
  state?: string;
  ownerId?: number;
  search?: string;
  limit?: number;
}) {
  const conn = getDb();
  if (!conn) return [];
  const conditions = [];
  if (filters.state) conditions.push(eq(agsAgents.lifecycleState, filters.state));
  if (filters.ownerId) conditions.push(eq(agsAgents.ownerId, filters.ownerId));
  if (filters.search && filters.search.trim()) {
    const needle = `%${filters.search.trim()}%`;
    const searchClause = or(
      ilike(agsAgents.name, needle),
      ilike(agsAgents.internalKey, needle),
      ilike(agsAgents.description, needle)
    );
    if (searchClause) conditions.push(searchClause);
  }
  const query = conn
    .select()
    .from(agsAgents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agsAgents.updatedAt))
    .limit(filters.limit ?? 100);
  return query;
}

export async function getAgentById(agentId: number) {
  const rows = await db().select().from(agsAgents).where(eq(agsAgents.id, agentId)).limit(1);
  return rows[0] ?? null;
}

export async function createAgent(input: {
  name: string;
  internalKey: string;
  description?: string;
  agentClass?: string;
  visibility?: string;
  ownerId?: number;
}) {
  const conn = db();
  const [agent] = await conn
    .insert(agsAgents)
    .values({
      name: input.name,
      internalKey: input.internalKey,
      description: input.description,
      agentClass: input.agentClass ?? "assistant",
      visibility: input.visibility ?? "private",
      ownerId: input.ownerId,
      lifecycleState: "draft",
      environment: "draft",
    })
    .returning();
  // Create initial draft
  const [draft] = await conn
    .insert(agsAgentDrafts)
    .values({
      agentId: agent.id,
      name: agent.name,
      description: agent.description ?? undefined,
      agentClass: agent.agentClass ?? undefined,
      visibility: agent.visibility ?? undefined,
      isCurrent: true,
      createdBy: input.ownerId,
    })
    .returning();
  await conn
    .update(agsAgents)
    .set({ currentDraftId: draft.id, updatedAt: new Date() })
    .where(eq(agsAgents.id, agent.id));
  return { agent, draft };
}

export async function updateAgentLifecycleState(agentId: number, state: string) {
  await db()
    .update(agsAgents)
    .set({ lifecycleState: state, updatedAt: new Date() })
    .where(eq(agsAgents.id, agentId));
}

/**
 * Update agent core fields. The agent core (`ags_agents`) is the canonical
 * source for the home table and shell summary. Identity updates must write
 * here in addition to writing the draft, otherwise listings show stale data.
 */
export async function updateAgentCore(
  agentId: number,
  patch: {
    name?: string;
    description?: string | null;
    domain?: string | null;
    tags?: string[];
    agentClass?: string;
    visibility?: string;
    ownerId?: number | null;
  }
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.domain !== undefined) set.domain = patch.domain;
  if (patch.tags !== undefined) set.tags = patch.tags;
  if (patch.agentClass !== undefined) set.agentClass = patch.agentClass;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  await db().update(agsAgents).set(set).where(eq(agsAgents.id, agentId));
}

export async function archiveAgent(agentId: number) {
  await db()
    .update(agsAgents)
    .set({
      lifecycleState: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agsAgents.id, agentId));
}

// ── Drafts ──────────────────────────────────────────────────────────────────

export async function getCurrentDraft(agentId: number) {
  const rows = await db()
    .select()
    .from(agsAgentDrafts)
    .where(and(eq(agsAgentDrafts.agentId, agentId), eq(agsAgentDrafts.isCurrent, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDraft(
  agentId: number,
  patch: Partial<typeof agsAgentDrafts.$inferInsert>
) {
  const conn = db();
  const draft = await getCurrentDraft(agentId);
  if (!draft) throw new Error(`No current draft for agent ${agentId}`);
  await conn
    .update(agsAgentDrafts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agsAgentDrafts.id, draft.id));
  return getCurrentDraft(agentId);
}

// ── Tools ───────────────────────────────────────────────────────────────────

export async function listToolBindings(draftId: number) {
  return db()
    .select()
    .from(agsDraftToolBindings)
    .where(eq(agsDraftToolBindings.draftId, draftId))
    .orderBy(desc(agsDraftToolBindings.createdAt));
}

export async function attachToolBinding(input: {
  draftId: number;
  toolKey: string;
  toolName: string;
  permissionMatrix?: Record<string, unknown>;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean;
  rateLimit?: Record<string, unknown>;
  auditRequired?: boolean;
}) {
  const [created] = await db()
    .insert(agsDraftToolBindings)
    .values({
      draftId: input.draftId,
      toolKey: input.toolKey,
      toolName: input.toolName,
      permissionMatrix: input.permissionMatrix ?? {},
      allowedActions: input.allowedActions ?? [],
      blockedActions: input.blockedActions ?? [],
      requiresApproval: input.requiresApproval ?? false,
      rateLimit: input.rateLimit ?? {},
      auditRequired: input.auditRequired ?? true,
    })
    .returning();
  return created;
}

export async function updateToolBinding(
  bindingId: number,
  patch: Partial<typeof agsDraftToolBindings.$inferInsert>
) {
  await db()
    .update(agsDraftToolBindings)
    .set(patch)
    .where(eq(agsDraftToolBindings.id, bindingId));
}

export async function removeToolBinding(bindingId: number) {
  await db().delete(agsDraftToolBindings).where(eq(agsDraftToolBindings.id, bindingId));
}

export async function getToolBindingById(bindingId: number) {
  const rows = await db()
    .select()
    .from(agsDraftToolBindings)
    .where(eq(agsDraftToolBindings.id, bindingId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Replace all tool bindings on a draft. Used by rollback to restore an
 * immutable version's tool set onto the active draft.
 */
export async function replaceToolBindings(
  draftId: number,
  bindings: Array<{
    toolKey: string;
    toolName: string;
    permissionMatrix?: Record<string, unknown>;
    allowedActions?: string[];
    blockedActions?: string[];
    requiresApproval?: boolean;
    rateLimit?: Record<string, unknown>;
    auditRequired?: boolean;
  }>
) {
  const conn = db();
  await conn
    .delete(agsDraftToolBindings)
    .where(eq(agsDraftToolBindings.draftId, draftId));
  if (bindings.length === 0) return;
  await conn.insert(agsDraftToolBindings).values(
    bindings.map((b) => ({
      draftId,
      toolKey: b.toolKey,
      toolName: b.toolName,
      permissionMatrix: b.permissionMatrix ?? {},
      allowedActions: b.allowedActions ?? [],
      blockedActions: b.blockedActions ?? [],
      requiresApproval: b.requiresApproval ?? false,
      rateLimit: b.rateLimit ?? {},
      auditRequired: b.auditRequired ?? true,
    }))
  );
}

// ── Knowledge ───────────────────────────────────────────────────────────────

export async function listKnowledgeBindings(draftId: number) {
  return db()
    .select()
    .from(agsDraftKnowledgeBindings)
    .where(eq(agsDraftKnowledgeBindings.draftId, draftId));
}

export async function replaceKnowledgeBindings(
  draftId: number,
  bindings: Array<{
    sourceKey: string;
    sourceName: string;
    priority?: number;
    freshness?: string;
    groundingMode?: string;
    retrievalDepth?: number;
    contextBudget?: number;
  }>
) {
  const conn = db();
  await conn
    .delete(agsDraftKnowledgeBindings)
    .where(eq(agsDraftKnowledgeBindings.draftId, draftId));
  if (bindings.length === 0) return;
  await conn.insert(agsDraftKnowledgeBindings).values(
    bindings.map((b) => ({
      draftId,
      sourceKey: b.sourceKey,
      sourceName: b.sourceName,
      priority: b.priority ?? 50,
      freshness: b.freshness ?? "standard",
      groundingMode: b.groundingMode ?? "hybrid",
      retrievalDepth: b.retrievalDepth ?? 5,
      contextBudget: b.contextBudget ?? 4000,
    }))
  );
}

// ── Memory ──────────────────────────────────────────────────────────────────

export async function listMemoryConfigs(draftId: number) {
  return db()
    .select()
    .from(agsDraftMemoryConfigs)
    .where(eq(agsDraftMemoryConfigs.draftId, draftId));
}

export async function replaceMemoryConfigs(
  draftId: number,
  configs: Array<{
    memoryType: string;
    enabled: boolean;
    retentionDays?: number | null;
    readPermissions?: string[];
    writePermissions?: string[];
    deletionPolicy?: string;
    privacyRules?: Record<string, unknown>;
  }>
) {
  const conn = db();
  await conn
    .delete(agsDraftMemoryConfigs)
    .where(eq(agsDraftMemoryConfigs.draftId, draftId));
  if (configs.length === 0) return;
  await conn.insert(agsDraftMemoryConfigs).values(
    configs.map((c) => ({
      draftId,
      memoryType: c.memoryType,
      enabled: c.enabled,
      retentionDays: c.retentionDays ?? undefined,
      readPermissions: c.readPermissions ?? [],
      writePermissions: c.writePermissions ?? [],
      deletionPolicy: c.deletionPolicy ?? "manual",
      privacyRules: c.privacyRules ?? {},
    }))
  );
}

// ── Workflow ────────────────────────────────────────────────────────────────

export async function listWorkflowNodes(draftId: number) {
  return db()
    .select()
    .from(agsDraftWorkflowNodes)
    .where(eq(agsDraftWorkflowNodes.draftId, draftId));
}

export async function listWorkflowEdges(draftId: number) {
  return db()
    .select()
    .from(agsDraftWorkflowEdges)
    .where(eq(agsDraftWorkflowEdges.draftId, draftId));
}

export async function replaceWorkflowGraph(
  draftId: number,
  nodes: Array<{
    nodeKey: string;
    nodeType: string;
    label?: string;
    config?: Record<string, unknown>;
    positionX?: number;
    positionY?: number;
  }>,
  edges: Array<{
    fromNodeKey: string;
    toNodeKey: string;
    label?: string;
    condition?: Record<string, unknown>;
  }>
) {
  const conn = db();
  await conn
    .delete(agsDraftWorkflowNodes)
    .where(eq(agsDraftWorkflowNodes.draftId, draftId));
  await conn
    .delete(agsDraftWorkflowEdges)
    .where(eq(agsDraftWorkflowEdges.draftId, draftId));
  if (nodes.length > 0) {
    await conn.insert(agsDraftWorkflowNodes).values(
      nodes.map((n) => ({
        draftId,
        nodeKey: n.nodeKey,
        nodeType: n.nodeType,
        label: n.label,
        config: n.config ?? {},
        positionX: n.positionX ?? 0,
        positionY: n.positionY ?? 0,
      }))
    );
  }
  if (edges.length > 0) {
    await conn.insert(agsDraftWorkflowEdges).values(
      edges.map((e) => ({
        draftId,
        fromNodeKey: e.fromNodeKey,
        toNodeKey: e.toNodeKey,
        label: e.label,
        condition: e.condition ?? {},
      }))
    );
  }
}

// ── Versions ────────────────────────────────────────────────────────────────

export async function listVersions(agentId: number) {
  return db()
    .select()
    .from(agsAgentVersions)
    .where(eq(agsAgentVersions.agentId, agentId))
    .orderBy(desc(agsAgentVersions.versionNumber));
}

export async function getVersionById(versionId: number) {
  const rows = await db()
    .select()
    .from(agsAgentVersions)
    .where(eq(agsAgentVersions.id, versionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createVersion(input: {
  agentId: number;
  label: string;
  summary?: string;
  snapshot: Record<string, unknown>;
  readinessScore?: number;
  governanceVerdict?: string;
  createdBy?: number;
}) {
  const conn = db();
  const existing = await conn
    .select({ max: sql<number>`coalesce(max(${agsAgentVersions.versionNumber}), 0)` })
    .from(agsAgentVersions)
    .where(eq(agsAgentVersions.agentId, input.agentId));
  const nextNumber = (existing[0]?.max ?? 0) + 1;
  const [created] = await conn
    .insert(agsAgentVersions)
    .values({
      agentId: input.agentId,
      versionNumber: nextNumber,
      label: input.label,
      summary: input.summary,
      snapshot: input.snapshot,
      readinessScore: input.readinessScore,
      governanceVerdict: input.governanceVerdict,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

// ── Releases / Publish ──────────────────────────────────────────────────────

export async function createPublishRequest(input: {
  agentId: number;
  versionId?: number;
  targetEnvironment: string;
  notes?: string;
  preflight: Record<string, unknown>;
  requestedBy?: number;
}) {
  const [created] = await db()
    .insert(agsPublishRequests)
    .values({
      agentId: input.agentId,
      versionId: input.versionId,
      targetEnvironment: input.targetEnvironment,
      notes: input.notes,
      preflight: input.preflight,
      requestedBy: input.requestedBy,
      state: "pending",
    })
    .returning();
  return created;
}

export async function listPublishRequests(agentId: number) {
  return db()
    .select()
    .from(agsPublishRequests)
    .where(eq(agsPublishRequests.agentId, agentId))
    .orderBy(desc(agsPublishRequests.createdAt));
}

/** Insert an approval step against a publish request. */
export async function createApprovalStep(input: {
  publishRequestId: number;
  stepOrder: number;
  approverRole: string;
  state?: string;
}) {
  const [created] = await db()
    .insert(agsApprovalSteps)
    .values({
      publishRequestId: input.publishRequestId,
      stepOrder: input.stepOrder,
      approverRole: input.approverRole,
      state: input.state ?? "pending",
    })
    .returning();
  return created;
}

/** List approval steps for a publish request, ordered by stepOrder. */
export async function listApprovalSteps(publishRequestId: number) {
  return db()
    .select()
    .from(agsApprovalSteps)
    .where(eq(agsApprovalSteps.publishRequestId, publishRequestId))
    .orderBy(agsApprovalSteps.stepOrder);
}

export async function getApprovalStepById(stepId: number) {
  const rows = await db()
    .select()
    .from(agsApprovalSteps)
    .where(eq(agsApprovalSteps.id, stepId))
    .limit(1);
  return rows[0] ?? null;
}

/** Decide an approval step (approve or reject). Returns the updated row. */
export async function decideApprovalStep(input: {
  stepId: number;
  state: "approved" | "rejected";
  decidedBy: number;
  decisionNote?: string;
}) {
  const conn = db();
  const [updated] = await conn
    .update(agsApprovalSteps)
    .set({
      state: input.state,
      decidedBy: input.decidedBy,
      decisionNote: input.decisionNote,
      decidedAt: new Date(),
    })
    .where(eq(agsApprovalSteps.id, input.stepId))
    .returning();
  return updated ?? null;
}

/** Get the parent publish request for an approval step. */
export async function getPublishRequestById(publishRequestId: number) {
  const rows = await db()
    .select()
    .from(agsPublishRequests)
    .where(eq(agsPublishRequests.id, publishRequestId))
    .limit(1);
  return rows[0] ?? null;
}

/** Update a publish request's state and decidedAt. */
export async function updatePublishRequestState(input: {
  publishRequestId: number;
  state: "pending" | "approved" | "rejected" | "withdrawn";
}) {
  await db()
    .update(agsPublishRequests)
    .set({ state: input.state, decidedAt: new Date() })
    .where(eq(agsPublishRequests.id, input.publishRequestId));
}

export async function publishRelease(input: {
  agentId: number;
  versionId: number;
  targetEnvironment: string;
  releaseNotes?: string;
  publishedBy?: number;
}) {
  const conn = db();
  const [created] = await conn
    .insert(agsAgentReleases)
    .values({
      agentId: input.agentId,
      versionId: input.versionId,
      targetEnvironment: input.targetEnvironment,
      state: "published",
      releaseNotes: input.releaseNotes,
      publishedBy: input.publishedBy,
      publishedAt: new Date(),
    })
    .returning();
  await conn
    .update(agsAgents)
    .set({
      publishedVersionId: input.versionId,
      lifecycleState: "published",
      environment: input.targetEnvironment,
      updatedAt: new Date(),
    })
    .where(eq(agsAgents.id, input.agentId));
  return created;
}

// ── Simulation ──────────────────────────────────────────────────────────────

export async function listSimulationScenarios(agentId: number) {
  return db()
    .select()
    .from(agsSimulationScenarios)
    .where(eq(agsSimulationScenarios.agentId, agentId))
    .orderBy(desc(agsSimulationScenarios.createdAt));
}

export async function saveSimulationScenario(input: {
  scenarioId?: number;
  agentId: number;
  name: string;
  description?: string;
  inputPayload: Record<string, unknown>;
  toggles: Record<string, unknown>;
  createdBy?: number;
}) {
  const conn = db();
  if (input.scenarioId) {
    await conn
      .update(agsSimulationScenarios)
      .set({
        name: input.name,
        description: input.description,
        inputPayload: input.inputPayload,
        toggles: input.toggles,
      })
      .where(eq(agsSimulationScenarios.id, input.scenarioId));
    return getSimulationScenarioById(input.scenarioId);
  }
  const [created] = await conn
    .insert(agsSimulationScenarios)
    .values({
      agentId: input.agentId,
      name: input.name,
      description: input.description,
      inputPayload: input.inputPayload,
      toggles: input.toggles,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

export async function getSimulationScenarioById(scenarioId: number) {
  const rows = await db()
    .select()
    .from(agsSimulationScenarios)
    .where(eq(agsSimulationScenarios.id, scenarioId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSimulationRun(input: {
  agentId: number;
  scenarioId?: number;
  triggeredBy?: number;
  toggles: Record<string, unknown>;
}) {
  const [created] = await db()
    .insert(agsSimulationRuns)
    .values({
      agentId: input.agentId,
      scenarioId: input.scenarioId,
      triggeredBy: input.triggeredBy,
      toggles: input.toggles,
      status: "queued",
      startedAt: new Date(),
    })
    .returning();
  return created;
}

export async function updateSimulationRun(
  runId: number,
  patch: Partial<typeof agsSimulationRuns.$inferInsert>
) {
  await db().update(agsSimulationRuns).set(patch).where(eq(agsSimulationRuns.id, runId));
}

export async function getSimulationRun(runId: number) {
  const rows = await db()
    .select()
    .from(agsSimulationRuns)
    .where(eq(agsSimulationRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestSimulationRun(agentId: number) {
  const rows = await db()
    .select()
    .from(agsSimulationRuns)
    .where(eq(agsSimulationRuns.agentId, agentId))
    .orderBy(desc(agsSimulationRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function appendSimulationStep(input: {
  runId: number;
  stepIndex: number;
  stepType: string;
  label?: string;
  payload?: Record<string, unknown>;
  verdict?: string;
  durationMs?: number;
}) {
  const [created] = await db()
    .insert(agsSimulationRunSteps)
    .values({
      runId: input.runId,
      stepIndex: input.stepIndex,
      stepType: input.stepType,
      label: input.label,
      payload: input.payload ?? {},
      verdict: input.verdict,
      durationMs: input.durationMs,
    })
    .returning();
  return created;
}

export async function listSimulationRunSteps(runId: number) {
  return db()
    .select()
    .from(agsSimulationRunSteps)
    .where(eq(agsSimulationRunSteps.runId, runId))
    .orderBy(agsSimulationRunSteps.stepIndex);
}

// ── Testing ─────────────────────────────────────────────────────────────────

export async function listTestSuites(agentId: number) {
  return db()
    .select()
    .from(agsTestSuites)
    .where(eq(agsTestSuites.agentId, agentId))
    .orderBy(desc(agsTestSuites.updatedAt));
}

export async function getTestSuite(suiteId: number) {
  const rows = await db()
    .select()
    .from(agsTestSuites)
    .where(eq(agsTestSuites.id, suiteId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * saveTestSuite — always returns the resulting suite row (never null).
 * The previous version returned `T | null | undefined`, which forced callers
 * to use non-null assertions and could crash on the edit path.
 */
export async function saveTestSuite(input: {
  suiteId?: number;
  agentId: number;
  name: string;
  description?: string;
  createdBy?: number;
}): Promise<typeof agsTestSuites.$inferSelect> {
  const conn = db();
  if (input.suiteId) {
    const [updated] = await conn
      .update(agsTestSuites)
      .set({ name: input.name, description: input.description, updatedAt: new Date() })
      .where(eq(agsTestSuites.id, input.suiteId))
      .returning();
    if (!updated) {
      throw new Error(`Test suite ${input.suiteId} not found`);
    }
    return updated;
  }
  const [created] = await conn
    .insert(agsTestSuites)
    .values({
      agentId: input.agentId,
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
    })
    .returning();
  return created;
}

export async function listTestCases(suiteId: number) {
  return db()
    .select()
    .from(agsTestCases)
    .where(eq(agsTestCases.suiteId, suiteId));
}

export async function getTestCaseById(caseId: number) {
  const rows = await db()
    .select()
    .from(agsTestCases)
    .where(eq(agsTestCases.id, caseId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * saveTestCase — insert or update a test case in a suite. Returns the
 * resulting case row.
 */
export async function saveTestCase(input: {
  caseId?: number;
  suiteId: number;
  name: string;
  inputPayload: Record<string, unknown>;
  expected?: Record<string, unknown>;
  assertions?: unknown[];
}): Promise<typeof agsTestCases.$inferSelect> {
  const conn = db();
  if (input.caseId) {
    const [updated] = await conn
      .update(agsTestCases)
      .set({
        name: input.name,
        inputPayload: input.inputPayload,
        expected: input.expected ?? {},
        assertions: input.assertions ?? [],
      })
      .where(eq(agsTestCases.id, input.caseId))
      .returning();
    if (!updated) {
      throw new Error(`Test case ${input.caseId} not found`);
    }
    return updated;
  }
  const [created] = await conn
    .insert(agsTestCases)
    .values({
      suiteId: input.suiteId,
      name: input.name,
      inputPayload: input.inputPayload,
      expected: input.expected ?? {},
      assertions: input.assertions ?? [],
    })
    .returning();
  return created;
}

export async function removeTestCase(caseId: number) {
  await db().delete(agsTestCases).where(eq(agsTestCases.id, caseId));
}

export async function createTestRun(input: {
  suiteId: number;
  agentId: number;
  triggeredBy?: number;
}) {
  const [created] = await db()
    .insert(agsTestRuns)
    .values({
      suiteId: input.suiteId,
      agentId: input.agentId,
      triggeredBy: input.triggeredBy,
      status: "queued",
      startedAt: new Date(),
    })
    .returning();
  return created;
}

export async function updateTestRun(
  runId: number,
  patch: Partial<typeof agsTestRuns.$inferInsert>
) {
  await db().update(agsTestRuns).set(patch).where(eq(agsTestRuns.id, runId));
}

export async function recordTestResult(input: {
  runId: number;
  caseId: number;
  verdict: string;
  actual?: Record<string, unknown>;
  failureMessage?: string;
  durationMs?: number;
}) {
  const [created] = await db()
    .insert(agsTestRunResults)
    .values({
      runId: input.runId,
      caseId: input.caseId,
      verdict: input.verdict,
      actual: input.actual ?? {},
      failureMessage: input.failureMessage,
      durationMs: input.durationMs,
    })
    .returning();
  return created;
}

export async function listTestRunResults(runId: number) {
  return db()
    .select()
    .from(agsTestRunResults)
    .where(eq(agsTestRunResults.runId, runId));
}

export async function getLatestTestRun(agentId: number) {
  const rows = await db()
    .select()
    .from(agsTestRuns)
    .where(eq(agsTestRuns.agentId, agentId))
    .orderBy(desc(agsTestRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTestRunById(runId: number) {
  const rows = await db()
    .select()
    .from(agsTestRuns)
    .where(eq(agsTestRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTestRunsForAgent(agentId: number, limit = 50) {
  return db()
    .select()
    .from(agsTestRuns)
    .where(eq(agsTestRuns.agentId, agentId))
    .orderBy(desc(agsTestRuns.createdAt))
    .limit(limit);
}

export async function listTestRunsForSuite(suiteId: number, limit = 50) {
  return db()
    .select()
    .from(agsTestRuns)
    .where(eq(agsTestRuns.suiteId, suiteId))
    .orderBy(desc(agsTestRuns.createdAt))
    .limit(limit);
}

// ── Runtime Runs (traces) ───────────────────────────────────────────────────

export async function listRuntimeRuns(agentId: number, limit = 50) {
  return db()
    .select()
    .from(agsRuntimeRuns)
    .where(eq(agsRuntimeRuns.agentId, agentId))
    .orderBy(desc(agsRuntimeRuns.createdAt))
    .limit(limit);
}

export async function getRuntimeRunById(runId: number) {
  const rows = await db()
    .select()
    .from(agsRuntimeRuns)
    .where(eq(agsRuntimeRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRuntimeRunSteps(runId: number) {
  return db()
    .select()
    .from(agsRuntimeRunSteps)
    .where(eq(agsRuntimeRunSteps.runId, runId))
    .orderBy(agsRuntimeRunSteps.stepIndex);
}

export async function listRuntimeToolCalls(runId: number) {
  return db()
    .select()
    .from(agsRuntimeToolCalls)
    .where(eq(agsRuntimeToolCalls.runId, runId))
    .orderBy(agsRuntimeToolCalls.id);
}

export async function listRuntimeMemoryEvents(runId: number) {
  return db()
    .select()
    .from(agsRuntimeMemoryEvents)
    .where(eq(agsRuntimeMemoryEvents.runId, runId))
    .orderBy(agsRuntimeMemoryEvents.id);
}

export async function listRuntimePolicyEvents(runId: number) {
  return db()
    .select()
    .from(agsRuntimePolicyEvents)
    .where(eq(agsRuntimePolicyEvents.runId, runId))
    .orderBy(agsRuntimePolicyEvents.id);
}

export async function updateRuntimeRun(
  runId: number,
  patch: Partial<typeof agsRuntimeRuns.$inferInsert>
) {
  await db().update(agsRuntimeRuns).set(patch).where(eq(agsRuntimeRuns.id, runId));
}

export async function appendRuntimeRun(input: {
  agentId: number;
  versionId?: number;
  environment: string;
  status: string;
  triggeredBy?: number;
  triggerType?: string;
  inputPayload?: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  summary?: string;
  durationMs?: number;
}) {
  const [created] = await db()
    .insert(agsRuntimeRuns)
    .values({
      agentId: input.agentId,
      versionId: input.versionId,
      environment: input.environment,
      status: input.status,
      triggeredBy: input.triggeredBy,
      triggerType: input.triggerType,
      inputPayload: input.inputPayload ?? {},
      outputPayload: input.outputPayload ?? {},
      summary: input.summary,
      durationMs: input.durationMs,
      startedAt: new Date(),
      finishedAt: input.durationMs != null ? new Date() : undefined,
    })
    .returning();
  return created;
}

export async function appendRuntimeRunStep(input: {
  runId: number;
  stepIndex: number;
  stepType: string;
  label?: string;
  payload?: Record<string, unknown>;
  verdict?: string;
  durationMs?: number;
}) {
  const [created] = await db()
    .insert(agsRuntimeRunSteps)
    .values({
      runId: input.runId,
      stepIndex: input.stepIndex,
      stepType: input.stepType,
      label: input.label,
      payload: input.payload ?? {},
      verdict: input.verdict,
      durationMs: input.durationMs,
    })
    .returning();
  return created;
}

export async function appendRuntimeToolCall(input: {
  runId: number;
  toolKey: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  verdict?: string;
  durationMs?: number;
}) {
  const [created] = await db()
    .insert(agsRuntimeToolCalls)
    .values({
      runId: input.runId,
      toolKey: input.toolKey,
      requestPayload: input.requestPayload ?? {},
      responsePayload: input.responsePayload ?? {},
      verdict: input.verdict,
      durationMs: input.durationMs,
    })
    .returning();
  return created;
}

export async function appendRuntimeMemoryEvent(input: {
  runId: number;
  memoryType: string;
  operation: string;
  payload?: Record<string, unknown>;
}) {
  const [created] = await db()
    .insert(agsRuntimeMemoryEvents)
    .values({
      runId: input.runId,
      memoryType: input.memoryType,
      operation: input.operation,
      payload: input.payload ?? {},
    })
    .returning();
  return created;
}

export async function appendRuntimePolicyEvent(input: {
  runId: number;
  policyKey: string;
  decision: string;
  reason?: string;
  payload?: Record<string, unknown>;
}) {
  const [created] = await db()
    .insert(agsRuntimePolicyEvents)
    .values({
      runId: input.runId,
      policyKey: input.policyKey,
      decision: input.decision,
      reason: input.reason,
      payload: input.payload ?? {},
    })
    .returning();
  return created;
}

// ── Home / Aggregates ───────────────────────────────────────────────────────

export async function getHomeSummary() {
  const conn = getDb();
  if (!conn) {
    return {
      totalAgents: 0,
      drafts: 0,
      published: 0,
      blocked: 0,
      reviewRequired: 0,
      readyToPublish: 0,
    };
  }
  const totalAgents = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents);
  const drafts = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents)
    .where(eq(agsAgents.lifecycleState, "draft"));
  const published = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents)
    .where(eq(agsAgents.lifecycleState, "published"));
  const blocked = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents)
    .where(eq(agsAgents.lifecycleState, "blocked"));
  const reviewRequired = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents)
    .where(eq(agsAgents.lifecycleState, "review_required"));
  const ready = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(agsAgents)
    .where(eq(agsAgents.lifecycleState, "ready_to_publish"));
  return {
    totalAgents: totalAgents[0]?.count ?? 0,
    drafts: drafts[0]?.count ?? 0,
    published: published[0]?.count ?? 0,
    blocked: blocked[0]?.count ?? 0,
    reviewRequired: reviewRequired[0]?.count ?? 0,
    readyToPublish: ready[0]?.count ?? 0,
  };
}

export async function getReviewQueue() {
  const conn = getDb();
  if (!conn) return [];
  return conn
    .select()
    .from(agsAgents)
    .where(
      sql`${agsAgents.lifecycleState} IN ('review_required', 'blocked')`
    )
    .orderBy(desc(agsAgents.updatedAt))
    .limit(50);
}
