/**
 * AI Agent Studio — Repository
 *
 * Data access layer for the AI Agent Studio module. Wraps Drizzle queries
 * against the ags_* table family in the main mynewap1claude database.
 *
 * No cross-module imports — this module is fully independent.
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
// Phase 12.5: Agent Studio operates against its own dedicated PostgreSQL
// database (`asdb`), separate from the main mynewap1claude app DB.
// Mirrors the wfdb/prmdb/psmdb/codedb pattern.
import { getAsDb } from "./db/connection";
import {
  buildApprovalStepStateUpdate,
  buildPublishRequestStateUpdate,
} from "./services/retention/lifecycle-transition";
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
  agsRuntimeToolCalls,
  agsRuntimeMemoryEvents,
  agsRuntimePolicyEvents,
  agsRuntimeHookExecutions,
  agsPublishRequests,
  agsApprovalSteps,
  // ── Phase 0a: openllm-agent2 native parity tables ──
  agsDraftHooks,
  agsDraftMcpServers,
  agsDraftSkills,
  agsDraftSubagents,
  agsDraftPlugins,
  agsDraftPermissionRules,
  // ── Phase 3: Interactive permission requests ──
  agsPendingPermissionRequests,
  // ── Phase 13: Catalog (user-authored tools + skills) ──
  agsCatalogTools,
  agsCatalogSkills,
  // ── Phase 14: Marketplace ──
  agsMarketplaceItems,
  agsMarketplaceCollections,
  agsMarketplaceInstalls,
  agsChatSessions,
  agsChatMessages,
  // ── MCP hardening Phase 5.1: persisted FSM transition log ──
  agsMcpTransitions,
  // ── Plan v3 Phase 40: catalog-sync log ──
  agsCatalogSyncLog,
} from "../../drizzle/tables/agent-studio";

function db() {
  const conn = getAsDb();
  if (!conn) throw new Error("[AgentStudio] ASDB not available");
  return conn;
}

// ── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents(filters: {
  state?: string;
  ownerId?: number;
  search?: string;
  limit?: number;
}) {
  const conn = getAsDb();
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
  const rows = await conn
    .select()
    .from(agsAgents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agsAgents.updatedAt))
    .limit(filters.limit ?? 100);

  // Enrich each agent with its current draft's providerConfig so the
  // UI can show chat compatibility without a second round trip. Used
  // by the Studio Chat FAB agent picker to disable non-openai agents.
  // One batch query — O(1) extra SQL regardless of page size.
  const draftIds = rows
    .map((a) => a.currentDraftId)
    .filter((x): x is number => x != null);
  const draftRows = draftIds.length > 0
    ? await conn
        .select({
          id: agsAgentDrafts.id,
          providerConfig: agsAgentDrafts.providerConfig,
        })
        .from(agsAgentDrafts)
        .where(inArray(agsAgentDrafts.id, draftIds))
    : [];
  const configByDraftId = new Map<number, unknown>(
    draftRows.map((d) => [d.id, d.providerConfig])
  );
  return rows.map((a) => ({
    ...a,
    providerConfig:
      a.currentDraftId != null ? configByDraftId.get(a.currentDraftId) ?? null : null,
  }));
}

export async function getAgentById(agentId: number) {
  const rows = await db().select().from(agsAgents).where(eq(agsAgents.id, agentId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Phase 5a (Roadmap V3) — single-column lookup for the runtime
 * lifecycle gate. Returns the `lifecycle_state` field on the agent
 * row (`"new" | "draft" | "design" | "simulation" | "staging" |
 * "published" | "archived"`). Cheaper than `getAgentById` for the
 * hot path — chat-stream.ts and chat.ts call this on every request.
 *
 * Phase 5b will use this as the "is this a published agent?"
 * discriminator inside `checkAllowedTools` to enforce fail-closed
 * permissions when no rules exist.
 */
export async function getAgentLifecycleState(
  agentId: number,
): Promise<string | null> {
  const rows = await db()
    .select({ lifecycleState: agsAgents.lifecycleState })
    .from(agsAgents)
    .where(eq(agsAgents.id, agentId))
    .limit(1);
  return rows[0]?.lifecycleState ?? null;
}

/**
 * Lookup an agent by its `internal_key`. Used by the openllm-agent2 seeder
 * to make seeding idempotent.
 */
export async function getAgentByInternalKey(internalKey: string) {
  const rows = await db()
    .select()
    .from(agsAgents)
    .where(eq(agsAgents.internalKey, internalKey))
    .limit(1);
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

/**
 * Phase 19a: Look up a draft by its primary id (not by agentId).
 * The MCP dispatcher path holds a draftId from the upstream caller and
 * needs to read the draft's `governancePolicy` blob without round-tripping
 * through `getCurrentDraft(agentId)`.
 */
export async function getDraftById(draftId: number) {
  const rows = await db()
    .select()
    .from(agsAgentDrafts)
    .where(eq(agsAgentDrafts.id, draftId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDraft(
  agentId: number,
  patch: Partial<typeof agsAgentDrafts.$inferInsert>
) {
  // V1+ MR-3 fortieth batch (PR-V1-110): Path B consumer.
  // `getCurrentDraft` already returns a draft row with `id` — we use
  // that draftId to resolve workspaceId via Path B's resolver. The
  // UPDATE then routes via getAsDbForWorkspace. Falls back to the
  // bootstrap handle when the draft has no binding (legacy / pre-
  // Phase-11).
  const lookupConn = db();
  const draft = await getCurrentDraft(agentId);
  if (!draft) throw new Error(`No current draft for agent ${agentId}`);
  // Phase 27.2A — strip raw provider keys before persistence (LK-01).
  // The cloning path passes `providerConfig` here verbatim; guard catches it.
  let safePatch: typeof patch = patch;
  if (patch.providerConfig !== undefined) {
    const { sanitizeProviderConfig } = await import("./services/provider-config-guard");
    safePatch = {
      ...patch,
      providerConfig: sanitizeProviderConfig(
        patch.providerConfig as Record<string, unknown>,
        { agentId, draftId: draft.id, source: "repository.updateDraft" },
      ),
    };
  }
  // Phase 6 (Roadmap V3) — config schema versioning. Reject any
  // inbound block carrying an unsupported `schemaVersion`, then stamp
  // every present block with the current canonical version. Existing
  // unstamped rows drift to stamped state on their next write — no
  // migration required for read paths.
  {
    const {
      RUNTIME_CONFIG_BLOCK_NAMES,
      assertConfigSchemaVersion,
      stampConfigSchemaVersion,
    } = await import("./services/runtime/config-schema-version");
    const stamped: Record<string, unknown> = {};
    for (const name of RUNTIME_CONFIG_BLOCK_NAMES) {
      const v = (safePatch as Record<string, unknown>)[name];
      if (v === undefined) continue;
      assertConfigSchemaVersion(v, name);
      stamped[name] = stampConfigSchemaVersion(v as Record<string, unknown>);
    }
    if (Object.keys(stamped).length > 0) {
      safePatch = { ...safePatch, ...stamped } as typeof patch;
    }
  }
  const { resolveWorkspaceIdForDraft } = await import(
    "./services/region/draft-workspace-resolver"
  );
  const workspaceId = await resolveWorkspaceIdForDraft(lookupConn, draft.id);
  const { getAsDbForWorkspace } = await import("./db/connection");
  const conn =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupConn)
      : lookupConn;
  await conn
    .update(agsAgentDrafts)
    .set({ ...safePatch, updatedAt: new Date() })
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
  // V1+ MR-3 forty-first batch (PR-V1-111): Path B consumer.
  // The INSERT routes via getAsDbForWorkspace(workspaceId) resolved
  // through Path B from input.draftId. Falls back to bootstrap when
  // the draft has no binding (legacy pre-Phase-11 or binding-pending).
  const lookupConn = db();
  const { resolveWorkspaceIdForDraft } = await import(
    "./services/region/draft-workspace-resolver"
  );
  const workspaceId = await resolveWorkspaceIdForDraft(lookupConn, input.draftId);
  const { getAsDbForWorkspace } = await import("./db/connection");
  const conn =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupConn)
      : lookupConn;
  const [created] = await conn
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

async function resolveToolBindingDraftId(
  conn: ReturnType<typeof db>,
  bindingId: number,
): Promise<number | null> {
  // V1+ MR-3 forty-second batch (PR-V1-112): tool-binding → draftId
  // resolver. agsDraftToolBindings carries draftId; we read it so
  // Path B's resolver can derive workspaceId.
  const rows = await conn
    .select({ draftId: agsDraftToolBindings.draftId })
    .from(agsDraftToolBindings)
    .where(eq(agsDraftToolBindings.id, bindingId))
    .limit(1);
  return rows[0]?.draftId ?? null;
}

async function resolveBindingRoutedConn(
  lookupConn: ReturnType<typeof db>,
  bindingId: number,
) {
  const draftId = await resolveToolBindingDraftId(lookupConn, bindingId);
  if (draftId == null) return lookupConn;
  const { resolveWorkspaceIdForDraft } = await import(
    "./services/region/draft-workspace-resolver"
  );
  const workspaceId = await resolveWorkspaceIdForDraft(lookupConn, draftId);
  if (workspaceId == null) return lookupConn;
  const { getAsDbForWorkspace } = await import("./db/connection");
  return getAsDbForWorkspace(workspaceId) ?? lookupConn;
}

export async function updateToolBinding(
  bindingId: number,
  patch: Partial<typeof agsDraftToolBindings.$inferInsert>
) {
  // V1+ MR-3 forty-second batch (PR-V1-112): Path B consumer via
  // tool-binding → draftId resolver. Falls back to bootstrap when
  // the binding row is missing OR the draft has no provider binding.
  const lookupConn = db();
  const conn = await resolveBindingRoutedConn(lookupConn, bindingId);
  await conn
    .update(agsDraftToolBindings)
    .set(patch)
    .where(eq(agsDraftToolBindings.id, bindingId));
}

export async function removeToolBinding(bindingId: number) {
  // V1+ MR-3 forty-second batch (PR-V1-112): same Path B chain as
  // updateToolBinding above.
  const lookupConn = db();
  const conn = await resolveBindingRoutedConn(lookupConn, bindingId);
  await conn.delete(agsDraftToolBindings).where(eq(agsDraftToolBindings.id, bindingId));
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
async function resolveDraftRoutedConn(
  lookupConn: ReturnType<typeof db>,
  draftId: number,
) {
  // V1+ MR-3 forty-third batch (PR-V1-113): shared draftId→routed-
  // conn helper for draftId-scoped replace* mutations. Path B
  // resolver + bootstrap fallback. Mirrors the
  // resolveBindingRoutedConn pattern from #863 but skips the
  // bindingId→draftId step.
  const { resolveWorkspaceIdForDraft } = await import(
    "./services/region/draft-workspace-resolver"
  );
  const workspaceId = await resolveWorkspaceIdForDraft(lookupConn, draftId);
  if (workspaceId == null) return lookupConn;
  const { getAsDbForWorkspace } = await import("./db/connection");
  return getAsDbForWorkspace(workspaceId) ?? lookupConn;
}

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
  // V1+ MR-3 forty-third batch (PR-V1-113): Path B consumer via
  // resolveDraftRoutedConn. Both the DELETE-all and the bulk-INSERT
  // share a single routed conn — preserves atomicity (Phase-2: no
  // cross-region writes within one function).
  const lookupConn = db();
  const conn = await resolveDraftRoutedConn(lookupConn, draftId);
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
  // V1+ MR-3 forty-third batch (PR-V1-113): Path B consumer via
  // resolveDraftRoutedConn. Single conn shared by DELETE + INSERT.
  const lookupConn = db();
  const conn = await resolveDraftRoutedConn(lookupConn, draftId);
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
  // V1+ MR-3 forty-third batch (PR-V1-113): Path B consumer via
  // resolveDraftRoutedConn. Single conn shared by DELETE + INSERT.
  const lookupConn = db();
  const conn = await resolveDraftRoutedConn(lookupConn, draftId);
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
  // V1+ MR-3 forty-third batch (PR-V1-113): Path B consumer via
  // resolveDraftRoutedConn. Single conn shared by 2 DELETEs + up to 2
  // INSERTs — preserves atomicity for the full graph swap.
  const lookupConn = db();
  const conn = await resolveDraftRoutedConn(lookupConn, draftId);
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

/**
 * Decide an approval step (approve or reject). Returns the updated row.
 *
 * Routes the state transition through `buildApprovalStepStateUpdate` so
 * `terminalAt` + `terminalReason` are set atomically with the state change.
 * Retention age depends on `terminalAt`; if the helper is bypassed the row
 * will never be retention-eligible.
 */
export async function decideApprovalStep(input: {
  stepId: number;
  state: "approved" | "rejected";
  decidedBy: number;
  decisionNote?: string;
}) {
  const conn = db();
  const terminal = buildApprovalStepStateUpdate({
    state: input.state,
    reason: input.decisionNote ?? `decided by user ${input.decidedBy}`,
  });
  const [updated] = await conn
    .update(agsApprovalSteps)
    .set({
      state: terminal.state,
      decidedBy: input.decidedBy,
      decisionNote: input.decisionNote,
      decidedAt: new Date(),
      terminalAt: terminal.terminalAt,
      terminalReason: terminal.terminalReason,
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

/**
 * Update a publish request's state and decidedAt.
 *
 * Routes the state transition through `buildPublishRequestStateUpdate` so
 * `terminalAt` + `terminalReason` are set atomically with the state change.
 * Retention age depends on `terminalAt`; if the helper is bypassed the row
 * will never be retention-eligible.
 *
 * The `state` union accepts the extended vocab (`cancelled`, `superseded`,
 * `failed_terminal`) so callers in any future caller surface can transition
 * to those terminal states without re-edit of this function signature.
 */
export async function updatePublishRequestState(input: {
  publishRequestId: number;
  state:
    | "pending"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "cancelled"
    | "superseded"
    | "failed_terminal";
  reason?: string;
}) {
  const terminal = buildPublishRequestStateUpdate({
    state: input.state,
    reason: input.reason,
  });
  await db()
    .update(agsPublishRequests)
    .set({
      state: terminal.state,
      decidedAt: new Date(),
      terminalAt: terminal.terminalAt,
      terminalReason: terminal.terminalReason,
    })
    .where(eq(agsPublishRequests.id, input.publishRequestId));
}

/**
 * Plan v3 Phase 22 — lifecycle-only publish.
 *
 * Writes to:
 *   - `ags_agent_releases` (Agent Studio-owned) — release row,
 *     state="published", catalog_ready_at=now (export-candidate
 *     marker for Phase 25).
 *   - `ags_agents` (Agent Studio-owned) — flips lifecycleState
 *     and pins publishedVersionId.
 *
 * Does NOT write to `catalog_entries` and does NOT call AI Types
 * catalog write. Catalog registration is a separate concern handled
 * by `aiTypes.catalog.register` (Phase 25), which reads the
 * `catalog_ready_at` marker to find ready releases.
 *
 * Test guarantee: `tests/agent-studio/publish-no-catalog-write.test.ts`
 * asserts no `catalog_entries` write happens during publish.
 */
export async function publishRelease(input: {
  agentId: number;
  versionId: number;
  targetEnvironment: string;
  releaseNotes?: string;
  publishedBy?: number;
}) {
  const conn = db();
  const now = new Date();
  const [created] = await conn
    .insert(agsAgentReleases)
    .values({
      agentId: input.agentId,
      versionId: input.versionId,
      targetEnvironment: input.targetEnvironment,
      state: "published",
      releaseNotes: input.releaseNotes,
      publishedBy: input.publishedBy,
      publishedAt: now,
      // Plan v3 Phase 22 — export-candidate marker.
      catalogReadyAt: now,
    })
    .returning();
  await conn
    .update(agsAgents)
    .set({
      publishedVersionId: input.versionId,
      lifecycleState: "published",
      environment: input.targetEnvironment,
      updatedAt: now,
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

/**
 * Phase 8: Direct children of a runtime run — used to render nested
 * subagent invocations under their parent.
 */
export async function listChildRuntimeRuns(parentRunId: number) {
  return db()
    .select()
    .from(agsRuntimeRuns)
    .where(eq(agsRuntimeRuns.parentRunId, parentRunId))
    .orderBy(agsRuntimeRuns.createdAt);
}

export async function getRuntimeRunById(runId: number) {
  const rows = await db()
    .select()
    .from(agsRuntimeRuns)
    .where(eq(agsRuntimeRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Phase 19 follow-up: list the most recent runtime runs across ALL
 * agents. Used by the Studio MCP server's `resources/list` to expose
 * runtime traces as MCP resources without needing an agentId filter.
 */
export async function listRecentRuntimeRunsAcrossAgents(limit = 20) {
  return db()
    .select()
    .from(agsRuntimeRuns)
    .orderBy(desc(agsRuntimeRuns.createdAt))
    .limit(limit);
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

// ── Phase 4: Runtime hook executions ───────────────────────────────────────

export async function appendRuntimeHookExecution(input: {
  runId: number;
  hookId?: number | null;
  eventName: string;
  matcher?: string | null;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string | null;
}) {
  const [created] = await db()
    .insert(agsRuntimeHookExecutions)
    .values({
      runId: input.runId,
      hookId: input.hookId ?? null,
      eventName: input.eventName,
      matcher: input.matcher ?? null,
      command: input.command,
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr,
      durationMs: input.durationMs,
      timedOut: input.timedOut,
      error: input.error ?? null,
    })
    .returning();
  return created;
}

export async function listRuntimeHookExecutions(runId: number) {
  return db()
    .select()
    .from(agsRuntimeHookExecutions)
    .where(eq(agsRuntimeHookExecutions.runId, runId))
    .orderBy(agsRuntimeHookExecutions.id);
}

// ── Home / Aggregates ───────────────────────────────────────────────────────

export async function getHomeSummary() {
  const conn = getAsDb();
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
  const conn = getAsDb();
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

// ── Phase 0b: openllm-agent2 native parity functions ───────────────────────
//
// Each new draft-scoped table gets a list / save / remove / replace set,
// following the same pattern as `saveTestSuite` (returning() → throw if not
// found on update path → returning() on insert path).

// ── Hooks ───────────────────────────────────────────────────────────────────

export async function listHooks(draftId: number) {
  return db()
    .select()
    .from(agsDraftHooks)
    .where(eq(agsDraftHooks.draftId, draftId))
    .orderBy(agsDraftHooks.eventName, agsDraftHooks.id);
}

export async function getHookById(hookId: number) {
  const rows = await db()
    .select()
    .from(agsDraftHooks)
    .where(eq(agsDraftHooks.id, hookId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveHook(input: {
  hookId?: number;
  draftId: number;
  eventName: string;
  matcher?: string | null;
  command: string;
  timeoutMs?: number | null;
  requiresApproval?: boolean;
  enabled?: boolean;
}): Promise<typeof agsDraftHooks.$inferSelect> {
  const conn = db();
  if (input.hookId) {
    const [updated] = await conn
      .update(agsDraftHooks)
      .set({
        eventName: input.eventName,
        matcher: input.matcher ?? null,
        command: input.command,
        timeoutMs: input.timeoutMs ?? null,
        requiresApproval: input.requiresApproval,
        enabled: input.enabled,
        updatedAt: new Date(),
      })
      .where(eq(agsDraftHooks.id, input.hookId))
      .returning();
    if (!updated) throw new Error(`Hook ${input.hookId} not found`);
    return updated;
  }
  const [created] = await conn
    .insert(agsDraftHooks)
    .values({
      draftId: input.draftId,
      eventName: input.eventName,
      matcher: input.matcher ?? null,
      command: input.command,
      timeoutMs: input.timeoutMs ?? null,
      requiresApproval: input.requiresApproval ?? false,
      enabled: input.enabled ?? true,
    })
    .returning();
  return created;
}

export async function removeHook(hookId: number) {
  await db().delete(agsDraftHooks).where(eq(agsDraftHooks.id, hookId));
}

export async function replaceHooks(
  draftId: number,
  hooks: Array<{
    eventName: string;
    matcher?: string | null;
    command: string;
    timeoutMs?: number | null;
    requiresApproval?: boolean;
    enabled?: boolean;
  }>
) {
  const conn = db();
  await conn.delete(agsDraftHooks).where(eq(agsDraftHooks.draftId, draftId));
  if (hooks.length === 0) return;
  await conn.insert(agsDraftHooks).values(
    hooks.map((h) => ({
      draftId,
      eventName: h.eventName,
      matcher: h.matcher ?? null,
      command: h.command,
      timeoutMs: h.timeoutMs ?? null,
      requiresApproval: h.requiresApproval ?? false,
      enabled: h.enabled ?? true,
    }))
  );
}

// ── MCP servers ─────────────────────────────────────────────────────────────

export async function listMcpServers(draftId: number) {
  return db()
    .select()
    .from(agsDraftMcpServers)
    .where(eq(agsDraftMcpServers.draftId, draftId))
    .orderBy(agsDraftMcpServers.name);
}

export async function getMcpServerById(serverId: number) {
  const rows = await db()
    .select()
    .from(agsDraftMcpServers)
    .where(eq(agsDraftMcpServers.id, serverId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveMcpServer(input: {
  serverId?: number;
  draftId: number;
  name: string;
  transport: string;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  url?: string | null;
  enabled?: boolean;
}): Promise<typeof agsDraftMcpServers.$inferSelect> {
  const conn = db();
  if (input.serverId) {
    const [updated] = await conn
      .update(agsDraftMcpServers)
      .set({
        name: input.name,
        transport: input.transport,
        command: input.command ?? null,
        args: input.args ?? [],
        env: input.env ?? {},
        url: input.url ?? null,
        enabled: input.enabled,
        updatedAt: new Date(),
      })
      .where(eq(agsDraftMcpServers.id, input.serverId))
      .returning();
    if (!updated) throw new Error(`MCP server ${input.serverId} not found`);
    return updated;
  }
  const [created] = await conn
    .insert(agsDraftMcpServers)
    .values({
      draftId: input.draftId,
      name: input.name,
      transport: input.transport,
      command: input.command ?? null,
      args: input.args ?? [],
      env: input.env ?? {},
      url: input.url ?? null,
      status: "pending",
      enabled: input.enabled ?? true,
    })
    .returning();
  return created;
}

export async function removeMcpServer(serverId: number) {
  await db().delete(agsDraftMcpServers).where(eq(agsDraftMcpServers.id, serverId));
}

/**
 * Phase 7: Update only the `status` column of an MCP server row. Used by
 * the MCP manager to flip pending → connected → disconnected → error.
 */
export async function updateMcpServerStatus(
  serverId: number,
  // Phase 19b: widened to accept the FSM column projection. The
  // pre-19b values ("pending" | "connected" | "disconnected" | "error")
  // remain valid; "connecting" | "needs_auth" | "disabled" are
  // additive new values written by `projectStateToColumn` in
  // services/mcp/state-machine.ts. The column itself has no CHECK
  // constraint (varchar(32) only), so the new values are accepted
  // as-is at the DB level.
  status:
    | "pending"
    | "connecting"
    | "connected"
    | "needs_auth"
    | "disconnected"
    | "error"
    | "abandoned"
    | "disabled"
) {
  await db()
    .update(agsDraftMcpServers)
    .set({ status, updatedAt: new Date() })
    .where(eq(agsDraftMcpServers.id, serverId));
}

/**
 * MCP hardening Phase 3.1: flip the `enabled` boolean column. Kept as a
 * separate column from the FSM `disabled` state so existing code paths
 * (boot.ts auto-connect filter, MCP Manager UI badges) keep working
 * unchanged. The mcp-manager wraps both writes (this column + the FSM
 * apply) in `enableMcpServer` / `disableMcpServer` so they stay in sync.
 */
export async function setMcpServerEnabled(
  serverId: number,
  enabled: boolean
) {
  await db()
    .update(agsDraftMcpServers)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(agsDraftMcpServers.id, serverId));
}

/**
 * MCP hardening Phase 5.1: append one FSM transition row. Caps the
 * per-server history at MCP_TRANSITION_CAP rows by trimming the
 * oldest after each insert. A flapping server can otherwise generate
 * thousands of rows per hour — the cap keeps the table bounded
 * without a separate cleanup job.
 */
const MCP_TRANSITION_CAP = 500;

export async function recordMcpTransition(
  serverId: number,
  fromKind: string,
  toKind: string,
  eventType: string,
  reason?: string | null
) {
  const conn = db();
  await conn.insert(agsMcpTransitions).values({
    serverId,
    fromKind,
    toKind,
    eventType,
    reason: reason ?? null,
  });
  // Trim: keep newest MCP_TRANSITION_CAP for this server, delete the rest.
  await conn.execute(sql`
    DELETE FROM ags_mcp_transitions
    WHERE server_id = ${serverId}
      AND id NOT IN (
        SELECT id FROM ags_mcp_transitions
        WHERE server_id = ${serverId}
        ORDER BY ts DESC
        LIMIT ${MCP_TRANSITION_CAP}
      )
  `);
}

/**
 * MCP hardening Phase 5.1: read recent FSM transitions for one
 * server. Newest first. Caller passes the limit (router caps at 500).
 */
export async function listMcpTransitions(serverId: number, limit: number) {
  return db()
    .select()
    .from(agsMcpTransitions)
    .where(eq(agsMcpTransitions.serverId, serverId))
    .orderBy(desc(agsMcpTransitions.ts))
    .limit(limit);
}

/**
 * Phase 17e: List EVERY MCP server across all drafts. Used by the
 * auto-reconnect loop in the MCP manager which needs to walk all
 * known servers (the manager is process-wide, not per-draft).
 */
export async function listAllMcpServers() {
  // Phase 19 follow-up: deterministic ordering. Without ORDER BY,
  // Postgres returns rows in physical heap order which shuffles after
  // every UPDATE. The MCP Manager page polls every 5 seconds and was
  // re-rendering cards in a different order on each poll, making it
  // look like servers were turning off and others taking their place
  // when in fact the connection state was correct — just the position
  // in the list changed. Order by (draftId, name) for stable cross-
  // draft visibility, with id as the final tiebreaker.
  return db()
    .select()
    .from(agsDraftMcpServers)
    .where(eq(agsDraftMcpServers.enabled, true))
    .orderBy(
      agsDraftMcpServers.draftId,
      agsDraftMcpServers.name,
      agsDraftMcpServers.id
    );
}

/**
 * Phase 15b: Update OAuth config and/or state on an MCP server row.
 * Either field can be patched independently. Tokens stored inside
 * oauthState should be encrypted by the caller before passing them in.
 */
export async function updateMcpServerOAuth(
  serverId: number,
  patch: {
    oauthConfig?: Record<string, unknown>;
    oauthState?: Record<string, unknown>;
  }
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.oauthConfig !== undefined) set.oauthConfig = patch.oauthConfig;
  if (patch.oauthState !== undefined) set.oauthState = patch.oauthState;
  await db()
    .update(agsDraftMcpServers)
    .set(set)
    .where(eq(agsDraftMcpServers.id, serverId));
}

export async function replaceMcpServers(
  draftId: number,
  servers: Array<{
    name: string;
    transport: string;
    command?: string | null;
    args?: string[];
    env?: Record<string, string>;
    url?: string | null;
    enabled?: boolean;
  }>
) {
  const conn = db();
  await conn.delete(agsDraftMcpServers).where(eq(agsDraftMcpServers.draftId, draftId));
  if (servers.length === 0) return;
  await conn.insert(agsDraftMcpServers).values(
    servers.map((s) => ({
      draftId,
      name: s.name,
      transport: s.transport,
      command: s.command ?? null,
      args: s.args ?? [],
      env: s.env ?? {},
      url: s.url ?? null,
      status: "pending",
      enabled: s.enabled ?? true,
    }))
  );
}

// ── Skills (attached from local catalog) ────────────────────────────────────

export async function listSkills(draftId: number) {
  return db()
    .select()
    .from(agsDraftSkills)
    .where(eq(agsDraftSkills.draftId, draftId))
    .orderBy(agsDraftSkills.packKey, agsDraftSkills.skillKey);
}

export async function attachSkill(input: {
  draftId: number;
  packKey: string;
  skillKey: string;
  skillName: string;
  allowedTools?: string[];
  blockedTools?: string[];
  requiresApproval?: boolean;
  argsSchema?: Record<string, unknown>;
}): Promise<typeof agsDraftSkills.$inferSelect> {
  const [created] = await db()
    .insert(agsDraftSkills)
    .values({
      draftId: input.draftId,
      packKey: input.packKey,
      skillKey: input.skillKey,
      skillName: input.skillName,
      allowedTools: input.allowedTools ?? [],
      blockedTools: input.blockedTools ?? [],
      requiresApproval: input.requiresApproval ?? false,
      argsSchema: input.argsSchema ?? {},
      enabled: true,
    })
    .returning();
  return created;
}

export async function removeSkill(skillId: number) {
  await db().delete(agsDraftSkills).where(eq(agsDraftSkills.id, skillId));
}

export async function replaceSkills(
  draftId: number,
  skills: Array<{
    packKey: string;
    skillKey: string;
    skillName: string;
    allowedTools?: string[];
    blockedTools?: string[];
    requiresApproval?: boolean;
    argsSchema?: Record<string, unknown>;
  }>
) {
  const conn = db();
  await conn.delete(agsDraftSkills).where(eq(agsDraftSkills.draftId, draftId));
  if (skills.length === 0) return;
  await conn.insert(agsDraftSkills).values(
    skills.map((s) => ({
      draftId,
      packKey: s.packKey,
      skillKey: s.skillKey,
      skillName: s.skillName,
      allowedTools: s.allowedTools ?? [],
      blockedTools: s.blockedTools ?? [],
      requiresApproval: s.requiresApproval ?? false,
      argsSchema: s.argsSchema ?? {},
      enabled: true,
    }))
  );
}

// ── Subagents ───────────────────────────────────────────────────────────────

export async function listSubagents(draftId: number) {
  return db()
    .select()
    .from(agsDraftSubagents)
    .where(eq(agsDraftSubagents.draftId, draftId))
    .orderBy(agsDraftSubagents.name);
}

export async function getSubagentById(subagentId: number) {
  const rows = await db()
    .select()
    .from(agsDraftSubagents)
    .where(eq(agsDraftSubagents.id, subagentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveSubagent(input: {
  subagentId?: number;
  draftId: number;
  name: string;
  description?: string | null;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string | null;
  maxTurns?: number | null;
  background?: boolean;
  effort?: string | null;
  permissionMode?: string | null;
  memory?: string | null;
  initialPrompt?: string | null;
  criticalSystemReminder?: string | null;
}): Promise<typeof agsDraftSubagents.$inferSelect> {
  const conn = db();
  if (input.subagentId) {
    const [updated] = await conn
      .update(agsDraftSubagents)
      .set({
        name: input.name,
        description: input.description ?? null,
        prompt: input.prompt,
        tools: input.tools ?? [],
        disallowedTools: input.disallowedTools ?? [],
        model: input.model ?? null,
        maxTurns: input.maxTurns ?? null,
        background: input.background,
        effort: input.effort ?? null,
        permissionMode: input.permissionMode ?? null,
        memory: input.memory ?? null,
        initialPrompt: input.initialPrompt ?? null,
        criticalSystemReminder: input.criticalSystemReminder ?? null,
        updatedAt: new Date(),
      })
      .where(eq(agsDraftSubagents.id, input.subagentId))
      .returning();
    if (!updated) throw new Error(`Subagent ${input.subagentId} not found`);
    return updated;
  }
  const [created] = await conn
    .insert(agsDraftSubagents)
    .values({
      draftId: input.draftId,
      name: input.name,
      description: input.description ?? null,
      prompt: input.prompt,
      tools: input.tools ?? [],
      disallowedTools: input.disallowedTools ?? [],
      model: input.model ?? null,
      maxTurns: input.maxTurns ?? null,
      background: input.background ?? false,
      effort: input.effort ?? null,
      permissionMode: input.permissionMode ?? null,
      memory: input.memory ?? null,
      initialPrompt: input.initialPrompt ?? null,
      criticalSystemReminder: input.criticalSystemReminder ?? null,
      enabled: true,
    })
    .returning();
  return created;
}

export async function removeSubagent(subagentId: number) {
  await db().delete(agsDraftSubagents).where(eq(agsDraftSubagents.id, subagentId));
}

export async function replaceSubagents(
  draftId: number,
  subagents: Array<{
    name: string;
    description?: string | null;
    prompt: string;
    tools?: string[];
    disallowedTools?: string[];
    model?: string | null;
    maxTurns?: number | null;
    background?: boolean;
    effort?: string | null;
    permissionMode?: string | null;
    memory?: string | null;
    initialPrompt?: string | null;
    criticalSystemReminder?: string | null;
  }>
) {
  const conn = db();
  await conn.delete(agsDraftSubagents).where(eq(agsDraftSubagents.draftId, draftId));
  if (subagents.length === 0) return;
  await conn.insert(agsDraftSubagents).values(
    subagents.map((s) => ({
      draftId,
      name: s.name,
      description: s.description ?? null,
      prompt: s.prompt,
      tools: s.tools ?? [],
      disallowedTools: s.disallowedTools ?? [],
      model: s.model ?? null,
      maxTurns: s.maxTurns ?? null,
      background: s.background ?? false,
      effort: s.effort ?? null,
      permissionMode: s.permissionMode ?? null,
      memory: s.memory ?? null,
      initialPrompt: s.initialPrompt ?? null,
      criticalSystemReminder: s.criticalSystemReminder ?? null,
      enabled: true,
    }))
  );
}

// ── Plugins ─────────────────────────────────────────────────────────────────

export async function listPlugins(draftId: number) {
  return db()
    .select()
    .from(agsDraftPlugins)
    .where(eq(agsDraftPlugins.draftId, draftId))
    .orderBy(agsDraftPlugins.path);
}

export async function savePlugin(input: {
  pluginId?: number;
  draftId: number;
  type?: string;
  path: string;
  enabled?: boolean;
}): Promise<typeof agsDraftPlugins.$inferSelect> {
  const conn = db();
  if (input.pluginId) {
    const [updated] = await conn
      .update(agsDraftPlugins)
      .set({
        type: input.type ?? "local",
        path: input.path,
        enabled: input.enabled,
      })
      .where(eq(agsDraftPlugins.id, input.pluginId))
      .returning();
    if (!updated) throw new Error(`Plugin ${input.pluginId} not found`);
    return updated;
  }
  const [created] = await conn
    .insert(agsDraftPlugins)
    .values({
      draftId: input.draftId,
      type: input.type ?? "local",
      path: input.path,
      enabled: input.enabled ?? true,
    })
    .returning();
  return created;
}

export async function removePlugin(pluginId: number) {
  await db().delete(agsDraftPlugins).where(eq(agsDraftPlugins.id, pluginId));
}

export async function replacePlugins(
  draftId: number,
  plugins: Array<{
    type?: string;
    path: string;
    enabled?: boolean;
  }>
) {
  const conn = db();
  await conn.delete(agsDraftPlugins).where(eq(agsDraftPlugins.draftId, draftId));
  if (plugins.length === 0) return;
  await conn.insert(agsDraftPlugins).values(
    plugins.map((p) => ({
      draftId,
      type: p.type ?? "local",
      path: p.path,
      enabled: p.enabled ?? true,
    }))
  );
}

// ── Permission rules ────────────────────────────────────────────────────────

export async function listPermissionRules(draftId: number) {
  return db()
    .select()
    .from(agsDraftPermissionRules)
    .where(eq(agsDraftPermissionRules.draftId, draftId))
    .orderBy(agsDraftPermissionRules.toolPattern);
}

export async function savePermissionRule(input: {
  ruleId?: number;
  draftId: number;
  ruleSource: string;
  ruleBehavior: string;
  toolPattern: string;
  contentPattern?: string | null;
  description?: string | null;
}): Promise<typeof agsDraftPermissionRules.$inferSelect> {
  const conn = db();
  if (input.ruleId) {
    const [updated] = await conn
      .update(agsDraftPermissionRules)
      .set({
        ruleSource: input.ruleSource,
        ruleBehavior: input.ruleBehavior,
        toolPattern: input.toolPattern,
        contentPattern: input.contentPattern ?? null,
        description: input.description ?? null,
      })
      .where(eq(agsDraftPermissionRules.id, input.ruleId))
      .returning();
    if (!updated) throw new Error(`Permission rule ${input.ruleId} not found`);
    return updated;
  }
  const [created] = await conn
    .insert(agsDraftPermissionRules)
    .values({
      draftId: input.draftId,
      ruleSource: input.ruleSource,
      ruleBehavior: input.ruleBehavior,
      toolPattern: input.toolPattern,
      contentPattern: input.contentPattern ?? null,
      description: input.description ?? null,
      enabled: true,
    })
    .returning();
  return created;
}

export async function removePermissionRule(ruleId: number) {
  await db()
    .delete(agsDraftPermissionRules)
    .where(eq(agsDraftPermissionRules.id, ruleId));
}

export async function replacePermissionRules(
  draftId: number,
  rules: Array<{
    ruleSource: string;
    ruleBehavior: string;
    toolPattern: string;
    contentPattern?: string | null;
    description?: string | null;
  }>
) {
  const conn = db();
  await conn
    .delete(agsDraftPermissionRules)
    .where(eq(agsDraftPermissionRules.draftId, draftId));
  if (rules.length === 0) return;
  await conn.insert(agsDraftPermissionRules).values(
    rules.map((r) => ({
      draftId,
      ruleSource: r.ruleSource,
      ruleBehavior: r.ruleBehavior,
      toolPattern: r.toolPattern,
      contentPattern: r.contentPattern ?? null,
      description: r.description ?? null,
      enabled: true,
    }))
  );
}

// ── Runtime config (8 new draft columns surfaced via dedicated update) ─────

export async function getRuntimeConfig(agentId: number) {
  const draft = await getCurrentDraft(agentId);
  if (!draft) return null;
  return {
    effort: draft.effort,
    maxTurns: draft.maxTurns,
    background: draft.background,
    initialPrompt: draft.initialPrompt,
    criticalSystemReminder: draft.criticalSystemReminder,
    permissionMode: draft.permissionMode,
    workingDirectories: (draft.workingDirectories ?? []) as string[],
    providerConfig: (draft.providerConfig ?? {}) as Record<string, unknown>,
    // Phase 12: presentation
    outputStyle: (draft as any).outputStyle ?? null,
    statusLineConfig: ((draft as any).statusLineConfig ?? {}) as Record<
      string,
      unknown
    >,
    theme: (draft as any).theme ?? null,
  };
}

export async function updateRuntimeConfig(
  agentId: number,
  patch: {
    effort?: string | null;
    maxTurns?: number | null;
    background?: boolean;
    initialPrompt?: string | null;
    criticalSystemReminder?: string | null;
    permissionMode?: string | null;
    workingDirectories?: string[];
    providerConfig?: Record<string, unknown>;
    // Phase 12: presentation
    outputStyle?: string | null;
    statusLineConfig?: Record<string, unknown>;
    theme?: string | null;
  }
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.effort !== undefined) set.effort = patch.effort;
  if (patch.maxTurns !== undefined) set.maxTurns = patch.maxTurns;
  if (patch.background !== undefined) set.background = patch.background;
  if (patch.initialPrompt !== undefined) set.initialPrompt = patch.initialPrompt;
  if (patch.criticalSystemReminder !== undefined)
    set.criticalSystemReminder = patch.criticalSystemReminder;
  if (patch.permissionMode !== undefined) set.permissionMode = patch.permissionMode;
  if (patch.workingDirectories !== undefined)
    set.workingDirectories = patch.workingDirectories;
  if (patch.providerConfig !== undefined) {
    // Phase 27.2A — strip raw provider keys before persistence (LK-01).
    const { sanitizeProviderConfig } = await import("./services/provider-config-guard");
    set.providerConfig = sanitizeProviderConfig(patch.providerConfig, {
      agentId,
      source: "repository.updateRuntimeConfig",
    });
  }
  if (patch.outputStyle !== undefined) set.outputStyle = patch.outputStyle;
  if (patch.statusLineConfig !== undefined)
    set.statusLineConfig = patch.statusLineConfig;
  if (patch.theme !== undefined) set.theme = patch.theme;

  const draft = await getCurrentDraft(agentId);
  if (!draft) throw new Error(`No current draft for agent ${agentId}`);
  await db()
    .update(agsAgentDrafts)
    .set(set)
    .where(eq(agsAgentDrafts.id, draft.id));
  return getRuntimeConfig(agentId);
}

// ── Phase 10: Scheduled agent execution ────────────────────────────────────

/**
 * Read scheduleConfig for a draft via the agent id. Returns null when no
 * draft exists or no config has been set.
 */
export async function getScheduleConfig(
  agentId: number
): Promise<Record<string, unknown> | null> {
  const draft = await getCurrentDraft(agentId);
  if (!draft) return null;
  const cfg = (draft as any).scheduleConfig;
  if (!cfg || typeof cfg !== "object") return null;
  return cfg as Record<string, unknown>;
}

/**
 * Patch the scheduleConfig of an agent's current draft. The full new
 * config is written (no field merge) — callers are responsible for
 * preserving fields they want to keep.
 */
export async function updateScheduleConfig(
  agentId: number,
  config: Record<string, unknown>
) {
  const draft = await getCurrentDraft(agentId);
  if (!draft) throw new Error(`No current draft for agent ${agentId}`);
  await db()
    .update(agsAgentDrafts)
    .set({
      scheduleConfig: config,
      updatedAt: new Date(),
    })
    .where(eq(agsAgentDrafts.id, draft.id));
  return getScheduleConfig(agentId);
}

/**
 * Variant of updateScheduleConfig that targets a draft id directly. Used
 * by the scheduler tick which already has the draftId in hand.
 */
export async function updateScheduleConfigByDraftId(
  draftId: number,
  config: Record<string, unknown>
) {
  await db()
    .update(agsAgentDrafts)
    .set({
      scheduleConfig: config,
      updatedAt: new Date(),
    })
    .where(eq(agsAgentDrafts.id, draftId));
}

/**
 * List all agents whose current draft has scheduleConfig.enabled = true.
 * Returns a flattened shape ready for the scheduler tick.
 */
export async function listScheduledAgents(): Promise<
  Array<{ agentId: number; draftId: number; config: Record<string, unknown> }>
> {
  const conn = getAsDb();
  if (!conn) return [];
  // Use a raw filter on the jsonb column. drizzle's sql tag handles
  // parameterization safely — `enabled` is a constant string here.
  const rows = await conn
    .select({
      agentId: agsAgentDrafts.agentId,
      draftId: agsAgentDrafts.id,
      scheduleConfig: agsAgentDrafts.scheduleConfig,
    })
    .from(agsAgentDrafts)
    .where(
      and(
        eq(agsAgentDrafts.isCurrent, true),
        sql`(${agsAgentDrafts.scheduleConfig}->>'enabled')::boolean = true`
      )
    );
  return rows.map((r) => ({
    agentId: r.agentId,
    draftId: r.draftId,
    config: (r.scheduleConfig ?? {}) as Record<string, unknown>,
  }));
}

// ── Phase 3: Pending permission requests ───────────────────────────────────

/**
 * Insert a new pending permission request. Used by the simulation engine
 * when a permission rule resolves to "ask" — the request blocks until a
 * human flips the row's status (or it times out).
 */
export async function createPendingPermissionRequest(input: {
  runtimeRunId: number;
  toolName: string;
  description?: string | null;
  rawPayload?: Record<string, unknown>;
}): Promise<typeof agsPendingPermissionRequests.$inferSelect> {
  const [created] = await db()
    .insert(agsPendingPermissionRequests)
    .values({
      runtimeRunId: input.runtimeRunId,
      toolName: input.toolName,
      description: input.description ?? null,
      rawPayload: input.rawPayload ?? {},
      status: "pending",
    })
    .returning();
  return created;
}

/**
 * H2-c6 (cycle-6 audit closure §H2-c6) — safe-projection columns for
 * approval rows. Mirrors the API-layer `PUBLIC_APPROVAL_COLUMNS` in
 * `api/tool-approvals-router.ts` so any path returning rows that
 * eventually reach a client never leaks `rawPayload` /
 * `proposedToolCallJson` (both can carry unredacted credentials).
 *
 * If a callsite legitimately needs the unsafe columns (e.g. forensic
 * server-internal use), add a separate `*Raw` helper that explicitly
 * projects them.
 */
const PUBLIC_APPROVAL_COLUMNS = {
  id: agsPendingPermissionRequests.id,
  runtimeRunId: agsPendingPermissionRequests.runtimeRunId,
  toolName: agsPendingPermissionRequests.toolName,
  description: agsPendingPermissionRequests.description,
  status: agsPendingPermissionRequests.status,
  decidedBy: agsPendingPermissionRequests.decidedBy,
  decidedAt: agsPendingPermissionRequests.decidedAt,
  reason: agsPendingPermissionRequests.reason,
  createdAt: agsPendingPermissionRequests.createdAt,
  proposedToolCallHash: agsPendingPermissionRequests.proposedToolCallHash,
  expiresAt: agsPendingPermissionRequests.expiresAt,
  lastUsedAt: agsPendingPermissionRequests.lastUsedAt,
  agentDraftId: agsPendingPermissionRequests.agentDraftId,
} as const;

export async function getPendingPermissionRequestById(requestId: number) {
  // H2-c6: safe projection — no rawPayload / proposedToolCallJson.
  // Both API callers and the simulation poll loop only need the
  // status / lifecycle columns; neither reads the leaky fields.
  const rows = await db()
    .select(PUBLIC_APPROVAL_COLUMNS)
    .from(agsPendingPermissionRequests)
    .where(eq(agsPendingPermissionRequests.id, requestId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * List all pending requests for a runtime run, newest first. Used by the
 * runs page banner to surface what's blocking and by the simulation poll
 * loop (only the rows it created itself).
 */
export async function listPendingPermissionRequests(runtimeRunId: number) {
  // H2-c6: safe projection — no rawPayload / proposedToolCallJson.
  return db()
    .select(PUBLIC_APPROVAL_COLUMNS)
    .from(agsPendingPermissionRequests)
    .where(eq(agsPendingPermissionRequests.runtimeRunId, runtimeRunId))
    .orderBy(desc(agsPendingPermissionRequests.createdAt));
}

// H1-c6 (cycle-6 audit closure §H1-c6): the legacy
// `decidePendingPermissionRequest` was deleted. Pre-cycle-6 it was
// the second decide path on `agsPendingPermissionRequests` and it
// did NOT write the canonical audit row in `agsRuntimePolicyEvents`
// (D-APP-EXT-6). The 2 callers (`api/router.ts:permissions.decide`
// + `services/simulation.ts` system-timeout flip) both migrated to
// `services/approval/approval-gate.ts → decideApprovalRequest`,
// which is now the single decide-with-audit path on this table.
// Source-scan lockstep at
// `tests/agent-studio/legacy-decide-removed.test.ts` asserts no
// caller of the removed symbol resurfaces.

// ── Phase 13: Catalog skills (user-authored) ───────────────────────────────

export async function listCatalogSkills(filter?: {
  packKey?: string;
  source?: string;
  search?: string;
}) {
  const conditions = [] as any[];
  if (filter?.packKey) conditions.push(eq(agsCatalogSkills.packKey, filter.packKey));
  if (filter?.source) conditions.push(eq(agsCatalogSkills.source, filter.source));
  if (filter?.search && filter.search.trim()) {
    const needle = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(agsCatalogSkills.skillKey, needle),
        ilike(agsCatalogSkills.name, needle),
        ilike(agsCatalogSkills.description, needle)
      )!
    );
  }
  let q = db().select().from(agsCatalogSkills);
  if (conditions.length > 0) q = q.where(and(...conditions)) as any;
  return q.orderBy(agsCatalogSkills.packKey, agsCatalogSkills.skillKey);
}

export async function getCatalogSkillById(id: number) {
  const rows = await db()
    .select()
    .from(agsCatalogSkills)
    .where(eq(agsCatalogSkills.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCatalogSkillByKey(packKey: string, skillKey: string) {
  const rows = await db()
    .select()
    .from(agsCatalogSkills)
    .where(
      and(
        eq(agsCatalogSkills.packKey, packKey),
        eq(agsCatalogSkills.skillKey, skillKey)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createCatalogSkill(input: {
  packKey: string;
  skillKey: string;
  name: string;
  description?: string | null;
  context?: string | null;
  agent?: string | null;
  model?: string | null;
  allowedTools?: string[];
  argNames?: string[];
  effort?: string | null;
  body: string;
  version?: string | null;
  source?: string;
  sourcePath?: string | null;
  createdBy?: number | null;
}) {
  const [created] = await db()
    .insert(agsCatalogSkills)
    .values({
      packKey: input.packKey,
      skillKey: input.skillKey,
      name: input.name,
      description: input.description ?? null,
      context: input.context ?? "inline",
      agent: input.agent ?? null,
      model: input.model ?? null,
      allowedTools: input.allowedTools ?? [],
      argNames: input.argNames ?? [],
      effort: input.effort ?? null,
      body: input.body,
      version: input.version ?? null,
      source: input.source ?? "db",
      sourcePath: input.sourcePath ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function updateCatalogSkill(
  id: number,
  patch: Partial<typeof agsCatalogSkills.$inferInsert>
) {
  const [updated] = await db()
    .update(agsCatalogSkills)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agsCatalogSkills.id, id))
    .returning();
  return updated ?? null;
}

export async function removeCatalogSkill(id: number) {
  await db().delete(agsCatalogSkills).where(eq(agsCatalogSkills.id, id));
}

// ── Phase 13: Catalog tools (user-authored) ────────────────────────────────

export async function listCatalogTools(filter?: {
  category?: string;
  search?: string;
}) {
  const conditions = [] as any[];
  if (filter?.category) conditions.push(eq(agsCatalogTools.category, filter.category));
  if (filter?.search && filter.search.trim()) {
    const needle = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(agsCatalogTools.key, needle),
        ilike(agsCatalogTools.name, needle),
        ilike(agsCatalogTools.description, needle)
      )!
    );
  }
  let q = db().select().from(agsCatalogTools);
  if (conditions.length > 0) q = q.where(and(...conditions)) as any;
  return q.orderBy(agsCatalogTools.key);
}

export async function getCatalogToolById(id: number) {
  const rows = await db()
    .select()
    .from(agsCatalogTools)
    .where(eq(agsCatalogTools.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCatalogToolByKey(key: string) {
  const rows = await db()
    .select()
    .from(agsCatalogTools)
    .where(eq(agsCatalogTools.key, key))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCatalogTool(input: {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  defaultAllowedActions?: string[];
  hardBlockedActions?: string[];
  defaultRequiresApproval?: boolean;
  destructive?: boolean;
  invocationKind: string;
  invocationConfig?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  version?: string | null;
  createdBy?: number | null;
}) {
  const [created] = await db()
    .insert(agsCatalogTools)
    .values({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? "custom",
      defaultAllowedActions: input.defaultAllowedActions ?? [],
      hardBlockedActions: input.hardBlockedActions ?? [],
      defaultRequiresApproval: input.defaultRequiresApproval ?? false,
      destructive: input.destructive ?? false,
      invocationKind: input.invocationKind,
      invocationConfig: input.invocationConfig ?? {},
      inputSchema: input.inputSchema ?? {},
      version: input.version ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function updateCatalogTool(
  id: number,
  patch: Partial<typeof agsCatalogTools.$inferInsert>
) {
  const [updated] = await db()
    .update(agsCatalogTools)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agsCatalogTools.id, id))
    .returning();
  return updated ?? null;
}

export async function removeCatalogTool(id: number) {
  await db().delete(agsCatalogTools).where(eq(agsCatalogTools.id, id));
}

// ── Phase 14: Marketplace ──────────────────────────────────────────────────

export async function listMarketplaceItems(filter?: {
  itemType?: string;
  author?: string;
  source?: string;
  search?: string;
  limit?: number;
}) {
  const conditions = [] as any[];
  if (filter?.itemType)
    conditions.push(eq(agsMarketplaceItems.itemType, filter.itemType));
  if (filter?.author)
    conditions.push(eq(agsMarketplaceItems.author, filter.author));
  if (filter?.source)
    conditions.push(eq(agsMarketplaceItems.source, filter.source));
  if (filter?.search && filter.search.trim()) {
    const needle = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(agsMarketplaceItems.itemKey, needle),
        ilike(agsMarketplaceItems.displayName, needle),
        ilike(agsMarketplaceItems.description, needle)
      )!
    );
  }
  let q = db().select().from(agsMarketplaceItems);
  if (conditions.length > 0) q = q.where(and(...conditions)) as any;
  q = q.orderBy(desc(agsMarketplaceItems.installCount), agsMarketplaceItems.itemKey) as any;
  if (filter?.limit) q = q.limit(filter.limit) as any;
  return q;
}

export async function getMarketplaceItemById(id: number) {
  const rows = await db()
    .select()
    .from(agsMarketplaceItems)
    .where(eq(agsMarketplaceItems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMarketplaceItemByKeyVersion(
  itemKey: string,
  version?: string
) {
  if (version) {
    const rows = await db()
      .select()
      .from(agsMarketplaceItems)
      .where(
        and(
          eq(agsMarketplaceItems.itemKey, itemKey),
          eq(agsMarketplaceItems.version, version)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }
  // No version → most recent (orderBy desc on createdAt)
  const rows = await db()
    .select()
    .from(agsMarketplaceItems)
    .where(eq(agsMarketplaceItems.itemKey, itemKey))
    .orderBy(desc(agsMarketplaceItems.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createMarketplaceItem(input: {
  itemKey: string;
  itemType: string;
  displayName: string;
  description?: string | null;
  author?: string | null;
  version: string;
  payload: Record<string, unknown>;
  tags?: string[];
  contentHash?: string | null;
  source?: string;
  createdBy?: number | null;
}) {
  const [created] = await db()
    .insert(agsMarketplaceItems)
    .values({
      itemKey: input.itemKey,
      itemType: input.itemType,
      displayName: input.displayName,
      description: input.description ?? null,
      author: input.author ?? null,
      version: input.version,
      payload: input.payload,
      tags: input.tags ?? [],
      contentHash: input.contentHash ?? null,
      source: input.source ?? "local",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function removeMarketplaceItem(id: number) {
  await db().delete(agsMarketplaceItems).where(eq(agsMarketplaceItems.id, id));
}

export async function bumpMarketplaceInstallCount(itemId: number) {
  await db()
    .update(agsMarketplaceItems)
    .set({
      installCount: sql`${agsMarketplaceItems.installCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agsMarketplaceItems.id, itemId));
}

export async function decrementMarketplaceInstallCount(itemId: number) {
  await db()
    .update(agsMarketplaceItems)
    .set({
      installCount: sql`GREATEST(0, ${agsMarketplaceItems.installCount} - 1)`,
      updatedAt: new Date(),
    })
    .where(eq(agsMarketplaceItems.id, itemId));
}

// ── Marketplace collections ────────────────────────────────────────────────

export async function listMarketplaceCollections() {
  return db()
    .select()
    .from(agsMarketplaceCollections)
    .orderBy(desc(agsMarketplaceCollections.isOfficial), agsMarketplaceCollections.key);
}

export async function createMarketplaceCollection(input: {
  key: string;
  name: string;
  description?: string | null;
  itemKeys?: string[];
  isOfficial?: boolean;
  createdBy?: number | null;
}) {
  const [created] = await db()
    .insert(agsMarketplaceCollections)
    .values({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      itemKeys: input.itemKeys ?? [],
      isOfficial: input.isOfficial ?? false,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created;
}

// ── Marketplace installs (audit + uninstall) ───────────────────────────────

export async function recordMarketplaceInstall(input: {
  itemId: number;
  agentId?: number | null;
  createdSkillIds?: number[];
  createdToolIds?: number[];
  installedBy?: number | null;
}) {
  const [created] = await db()
    .insert(agsMarketplaceInstalls)
    .values({
      itemId: input.itemId,
      agentId: input.agentId ?? null,
      createdSkillIds: input.createdSkillIds ?? [],
      createdToolIds: input.createdToolIds ?? [],
      installedBy: input.installedBy ?? null,
    })
    .returning();
  return created;
}

export async function getMarketplaceInstallById(id: number) {
  const rows = await db()
    .select()
    .from(agsMarketplaceInstalls)
    .where(eq(agsMarketplaceInstalls.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMarketplaceInstallsForItem(itemId: number) {
  return db()
    .select()
    .from(agsMarketplaceInstalls)
    .where(eq(agsMarketplaceInstalls.itemId, itemId))
    .orderBy(desc(agsMarketplaceInstalls.installedAt));
}

export async function removeMarketplaceInstall(id: number) {
  await db()
    .delete(agsMarketplaceInstalls)
    .where(eq(agsMarketplaceInstalls.id, id));
}

// ── Phase 19 follow-up: Chat sessions + messages ───────────────────────────

/**
 * List all chat sessions for an agent, most-recent first. Includes
 * the session totals (token counts, cost, message count) so the UI
 * can render a session list without additional queries.
 */
export async function listChatSessions(agentId: number) {
  return db()
    .select()
    .from(agsChatSessions)
    .where(eq(agsChatSessions.agentId, agentId))
    .orderBy(desc(agsChatSessions.updatedAt));
}

export async function getChatSessionById(sessionId: number) {
  const rows = await db()
    .select()
    .from(agsChatSessions)
    .where(eq(agsChatSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createChatSession(input: {
  agentId: number;
  title?: string;
  userId?: number;
  providerSnapshot?: Record<string, unknown>;
}) {
  const [created] = await db()
    .insert(agsChatSessions)
    .values({
      agentId: input.agentId,
      title: input.title ?? null,
      userId: input.userId ?? null,
      providerSnapshot: input.providerSnapshot ?? {},
    })
    .returning();
  return created;
}

/**
 * Update session totals after a new assistant message is added.
 * Increments token + cost counters and bumps updatedAt.
 */
export async function bumpChatSessionTotals(input: {
  sessionId: number;
  addInputTokens?: number;
  addOutputTokens?: number;
  addCostMicrocents?: number;
  addMessages?: number;
  title?: string;
}) {
  // Fetch current totals
  const current = await getChatSessionById(input.sessionId);
  if (!current) return null;
  const [updated] = await db()
    .update(agsChatSessions)
    .set({
      totalInputTokens: (current.totalInputTokens ?? 0) + (input.addInputTokens ?? 0),
      totalOutputTokens: (current.totalOutputTokens ?? 0) + (input.addOutputTokens ?? 0),
      totalCostMicrocents:
        (current.totalCostMicrocents ?? 0) + (input.addCostMicrocents ?? 0),
      messageCount: (current.messageCount ?? 0) + (input.addMessages ?? 0),
      title: input.title ?? current.title,
      updatedAt: new Date(),
    })
    .where(eq(agsChatSessions.id, input.sessionId))
    .returning();
  return updated;
}

export async function deleteChatSession(sessionId: number) {
  // Delete messages first (no ON DELETE CASCADE per clone-safe convention)
  await db().delete(agsChatMessages).where(eq(agsChatMessages.sessionId, sessionId));
  await db().delete(agsChatSessions).where(eq(agsChatSessions.id, sessionId));
}

/**
 * Rename a chat session. Updates the title and bumps updatedAt so the
 * session list reorders correctly. Used by the Studio Chat UI rename
 * button + inline edit.
 */
export async function renameChatSession(input: {
  sessionId: number;
  title: string;
}) {
  const [updated] = await db()
    .update(agsChatSessions)
    .set({ title: input.title, updatedAt: new Date() })
    .where(eq(agsChatSessions.id, input.sessionId))
    .returning();
  return updated;
}

export async function listChatMessages(sessionId: number) {
  return db()
    .select()
    .from(agsChatMessages)
    .where(eq(agsChatMessages.sessionId, sessionId))
    .orderBy(agsChatMessages.createdAt, agsChatMessages.id);
}

export async function appendChatMessage(input: {
  sessionId: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolPayload?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  costMicrocents?: number;
  model?: string;
  durationMs?: number;
  /**
   * Phase 3.2 idempotency key. When set on role="user", a SELECT against
   * `(sessionId, clientMessageId)` happens first; if a row already exists,
   * we return it with `created: false` instead of inserting a duplicate.
   * For non-user roles the field is ignored (assistant/tool messages
   * carry no idempotency dimension from the client).
   */
  clientMessageId?: string | null;
}): Promise<typeof agsChatMessages.$inferSelect> {
  // Phase 3.2 — silent dedup on `(sessionId, clientMessageId)` for user
  // messages. Pattern mirrors M2-c6 (`createApprovalRequest` SELECT-then-
  // INSERT) and applies app-level race protection until the partial
  // unique index from
  // `scripts/migrations/manual/ags-chat-messages-client-message-id.sql`
  // is operator-applied.
  if (input.role === "user" && input.clientMessageId) {
    const [existing] = await db()
      .select()
      .from(agsChatMessages)
      .where(
        and(
          eq(agsChatMessages.sessionId, input.sessionId),
          eq(agsChatMessages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const [created] = await db()
    .insert(agsChatMessages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      toolPayload: input.toolPayload,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costMicrocents: input.costMicrocents,
      model: input.model,
      durationMs: input.durationMs,
      clientMessageId:
        input.role === "user" ? (input.clientMessageId ?? null) : null,
    })
    .returning();
  return created;
}

/**
 * Phase 3.2 — explicit "did I create this row, or did I find a duplicate"
 * variant. Callers that need to know whether they're handling a fresh
 * request vs an idempotency hit (e.g. chat-stream emitting
 * `idempotency_conflict`) use this; the simpler `appendChatMessage`
 * returns the row only.
 */
export async function appendChatMessageWithIdempotency(input: {
  sessionId: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolPayload?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  costMicrocents?: number;
  model?: string;
  durationMs?: number;
  clientMessageId?: string | null;
}): Promise<{
  created: boolean;
  row: typeof agsChatMessages.$inferSelect;
}> {
  if (input.role === "user" && input.clientMessageId) {
    const [existing] = await db()
      .select()
      .from(agsChatMessages)
      .where(
        and(
          eq(agsChatMessages.sessionId, input.sessionId),
          eq(agsChatMessages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);
    if (existing) return { created: false, row: existing };
  }

  const [row] = await db()
    .insert(agsChatMessages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      toolPayload: input.toolPayload,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costMicrocents: input.costMicrocents,
      model: input.model,
      durationMs: input.durationMs,
      clientMessageId:
        input.role === "user" ? (input.clientMessageId ?? null) : null,
    })
    .returning();
  return { created: true, row };
}

// ── Plan v3 Phase 40: catalog-sync log ──────────────────────────────────────

export interface RecordCatalogSyncEventInput {
  eventId: string;
  eventType: string;
  catalogEntryId: number;
  sourceModule: string;
  sourceRefId: number | null;
  action: string | null;
  payload: Record<string, unknown>;
}

/**
 * Plan v3 Phase 40 — append a row to ags_catalog_sync_log.
 *
 * Idempotent on `event_id` via the unique index — duplicate deliveries
 * (bus retries, replay) silently skip the insert via ON CONFLICT DO NOTHING.
 * The catalog-sync subscribers in `services/catalog-sync-subscribers.ts`
 * call this; nothing else writes to the log.
 */
export async function recordCatalogSyncEvent(
  input: RecordCatalogSyncEventInput,
): Promise<void> {
  await db()
    .insert(agsCatalogSyncLog)
    .values({
      eventId: input.eventId,
      eventType: input.eventType,
      catalogEntryId: input.catalogEntryId,
      sourceModule: input.sourceModule,
      sourceRefId: input.sourceRefId,
      action: input.action,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: agsCatalogSyncLog.eventId });
}

/**
 * Plan v3 Phase 40 — return the most recent catalog-sync log row for a
 * given (catalog_entry_id) pair, or null when no events have been
 * received. Used by Phase 41 reconciliation and by the export-status
 * derivation when an AS-side mirror is preferred over a cross-DB join.
 */
export async function getLatestCatalogSyncEvent(
  catalogEntryId: number,
): Promise<{
  eventType: string;
  action: string | null;
  receivedAt: Date;
} | null> {
  const conn = getAsDb();
  if (!conn) return null;
  const rows = await conn
    .select({
      eventType: agsCatalogSyncLog.eventType,
      action: agsCatalogSyncLog.action,
      receivedAt: agsCatalogSyncLog.receivedAt,
    })
    .from(agsCatalogSyncLog)
    .where(eq(agsCatalogSyncLog.catalogEntryId, catalogEntryId))
    .orderBy(desc(agsCatalogSyncLog.receivedAt))
    .limit(1);
  return rows[0] ?? null;
}
