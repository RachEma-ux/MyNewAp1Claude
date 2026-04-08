/**
 * AI Agent Studio — Versioning Service
 *
 * Creates immutable version snapshots of an agent's draft state, supports
 * compare and rollback. Used by Phase 4 publish/release flows.
 */

import * as repo from "../repository";
import { computeReadiness } from "./readiness";
import { evaluateGovernance } from "./governance-adapter";

export async function snapshotAgent(input: {
  agentId: number;
  label: string;
  summary?: string;
  createdBy?: number;
}) {
  const agent = await repo.getAgentById(input.agentId);
  const draft = await repo.getCurrentDraft(input.agentId);
  if (!agent || !draft) throw new Error(`Cannot snapshot — agent or draft missing`);

  const tools = await repo.listToolBindings(draft.id);
  const knowledge = await repo.listKnowledgeBindings(draft.id);
  const memory = await repo.listMemoryConfigs(draft.id);
  const nodes = await repo.listWorkflowNodes(draft.id);
  const edges = await repo.listWorkflowEdges(draft.id);

  const readiness = await computeReadiness(input.agentId);
  const governance = await evaluateGovernance(input.agentId);

  const snapshot = {
    agent: {
      id: agent.id,
      name: agent.name,
      internalKey: agent.internalKey,
      description: agent.description,
      domain: agent.domain,
      tags: agent.tags,
      agentClass: agent.agentClass,
      visibility: agent.visibility,
    },
    draft: {
      mission: draft.mission,
      role: draft.role,
      scope: draft.scope,
      allowedTasks: draft.allowedTasks,
      blockedTasks: draft.blockedTasks,
      successCriteria: draft.successCriteria,
      escalationRules: draft.escalationRules,
      autonomyLevel: draft.autonomyLevel,
      interventionTriggers: draft.interventionTriggers,
      systemInstructions: draft.systemInstructions,
      roleInstructions: draft.roleInstructions,
      policyInstructions: draft.policyInstructions,
      outputContract: draft.outputContract,
      promptExamples: draft.promptExamples,
      fallbackBehavior: draft.fallbackBehavior,
      refusalBehavior: draft.refusalBehavior,
      memoryConfig: draft.memoryConfig,
      knowledgeConfig: draft.knowledgeConfig,
      workflowConfig: draft.workflowConfig,
      governancePolicy: draft.governancePolicy,
      runtimeConfig: draft.runtimeConfig,
      simulationDefaults: draft.simulationDefaults,
    },
    bindings: { tools, knowledge, memory, nodes, edges },
    readinessScore: readiness.score,
    governanceVerdict: governance.verdict,
  };

  const version = await repo.createVersion({
    agentId: input.agentId,
    label: input.label,
    summary: input.summary,
    snapshot,
    readinessScore: readiness.score,
    governanceVerdict: governance.verdict,
    createdBy: input.createdBy,
  });

  return version;
}

/**
 * Restore the active draft (and all bindings) from an immutable version
 * snapshot. Verifies the version belongs to the agent before mutating.
 *
 * Restores:
 *   - draft scalar fields (mission/scope/prompts/etc.)
 *   - tool bindings
 *   - knowledge bindings
 *   - memory configs
 *   - workflow nodes + edges
 *
 * Does NOT touch:
 *   - immutable versions or releases
 *   - agent core fields (name/internalKey)
 */
export async function restoreFromVersion(input: {
  agentId: number;
  versionId: number;
}) {
  const version = await repo.getVersionById(input.versionId);
  if (!version) {
    throw new Error(`Version ${input.versionId} not found`);
  }
  if (version.agentId !== input.agentId) {
    throw new Error(
      `Version ${input.versionId} does not belong to agent ${input.agentId}`
    );
  }

  const draft = await repo.getCurrentDraft(input.agentId);
  if (!draft) {
    throw new Error(`No active draft for agent ${input.agentId}`);
  }

  const snap = version.snapshot as {
    draft?: Record<string, unknown>;
    bindings?: {
      tools?: Array<Record<string, unknown>>;
      knowledge?: Array<Record<string, unknown>>;
      memory?: Array<Record<string, unknown>>;
      nodes?: Array<Record<string, unknown>>;
      edges?: Array<Record<string, unknown>>;
    };
  };

  // 1. Restore draft scalar fields
  if (snap.draft) {
    await repo.updateDraft(input.agentId, snap.draft as any);
  }

  // 2. Restore tool bindings
  const tools = (snap.bindings?.tools ?? []).map((t: any) => ({
    toolKey: t.toolKey,
    toolName: t.toolName,
    permissionMatrix: t.permissionMatrix ?? {},
    allowedActions: t.allowedActions ?? [],
    blockedActions: t.blockedActions ?? [],
    requiresApproval: t.requiresApproval ?? false,
    rateLimit: t.rateLimit ?? {},
    auditRequired: t.auditRequired ?? true,
  }));
  await repo.replaceToolBindings(draft.id, tools);

  // 3. Restore knowledge bindings
  const knowledge = (snap.bindings?.knowledge ?? []).map((k: any) => ({
    sourceKey: k.sourceKey,
    sourceName: k.sourceName,
    priority: k.priority ?? 50,
    freshness: k.freshness ?? "standard",
    groundingMode: k.groundingMode ?? "hybrid",
    retrievalDepth: k.retrievalDepth ?? 5,
    contextBudget: k.contextBudget ?? 4000,
  }));
  await repo.replaceKnowledgeBindings(draft.id, knowledge);

  // 4. Restore memory configs
  const memory = (snap.bindings?.memory ?? []).map((m: any) => ({
    memoryType: m.memoryType,
    enabled: !!m.enabled,
    retentionDays: m.retentionDays ?? null,
    readPermissions: m.readPermissions ?? [],
    writePermissions: m.writePermissions ?? [],
    deletionPolicy: m.deletionPolicy ?? "manual",
    privacyRules: m.privacyRules ?? {},
  }));
  await repo.replaceMemoryConfigs(draft.id, memory);

  // 5. Restore workflow graph
  const nodes = (snap.bindings?.nodes ?? []).map((n: any) => ({
    nodeKey: n.nodeKey,
    nodeType: n.nodeType,
    label: n.label,
    config: n.config ?? {},
    positionX: n.positionX ?? 0,
    positionY: n.positionY ?? 0,
  }));
  const edges = (snap.bindings?.edges ?? []).map((e: any) => ({
    fromNodeKey: e.fromNodeKey,
    toNodeKey: e.toNodeKey,
    label: e.label,
    condition: e.condition ?? {},
  }));
  await repo.replaceWorkflowGraph(draft.id, nodes, edges);

  return {
    success: true,
    restoredFromVersionId: input.versionId,
    restoredCounts: {
      tools: tools.length,
      knowledge: knowledge.length,
      memory: memory.length,
      nodes: nodes.length,
      edges: edges.length,
    },
  };
}

export async function compareVersions(input: {
  agentId: number;
  versionAId: number;
  versionBId: number;
}) {
  const a = await repo.getVersionById(input.versionAId);
  const b = await repo.getVersionById(input.versionBId);
  if (!a || !b) throw new Error("One or both versions not found");
  if (a.agentId !== input.agentId || b.agentId !== input.agentId) {
    throw new Error("Versions do not belong to this agent");
  }

  const fields = [
    "name",
    "description",
    "mission",
    "scope",
    "systemInstructions",
    "outputContract",
    "autonomyLevel",
  ];
  const diffs: Array<{ field: string; before: unknown; after: unknown }> = [];
  const snapA = a.snapshot as any;
  const snapB = b.snapshot as any;
  for (const f of fields) {
    const before = snapA?.draft?.[f] ?? snapA?.agent?.[f];
    const after = snapB?.draft?.[f] ?? snapB?.agent?.[f];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push({ field: f, before, after });
    }
  }
  return {
    versionA: a,
    versionB: b,
    diffs,
    readinessDelta: (b.readinessScore ?? 0) - (a.readinessScore ?? 0),
  };
}
