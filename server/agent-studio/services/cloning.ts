/**
 * AI Agent Studio — Clone-as-Template Service
 *
 * Phase 2: copy a source agent's full state into a brand-new agent so users
 * can take any existing agent (most importantly the canonical openllm-agent2
 * row) and use it as a starting point for their own work without touching
 * the source.
 *
 * The clone always lands in lifecycle "draft" — even when the source is
 * "published" — because it's a fresh user-owned agent that has never been
 * reviewed.
 *
 * What gets copied (everything attached to the *current* draft of the source):
 *   - Identity columns (name, description, domain, tags, agentClass, visibility)
 *     overridden by the caller's `name` + `internalKey`
 *   - All draft-scoped behavior, prompts, governance, runtime, memory config
 *   - Tool bindings (allowedActions, blockedActions, requiresApproval, etc.)
 *   - Knowledge bindings
 *   - Memory configs
 *   - Workflow nodes + edges
 *   - Hooks
 *   - MCP servers
 *   - Skills (from local catalog)
 *   - Subagents
 *   - Plugins
 *   - Permission rules
 *
 * What does NOT get copied (intentional):
 *   - Versions, releases, publish requests, approval steps — these belong
 *     to the source agent's lifecycle history, not to a fresh draft
 *   - Simulation runs, test runs, runtime runs — fresh agent has no history
 *   - Audit logs — same reason
 *   - The owner is set to the caller, not the source agent's owner
 */

import * as repo from "../repository";

export interface CloneAgentInput {
  /** Source agent to clone from. Must exist. */
  sourceAgentId: number;
  /** Display name for the new agent. */
  name: string;
  /** Internal key for the new agent — must be unique. */
  internalKey: string;
  /** Optional description override. If omitted, source description is used. */
  description?: string;
  /** Owner id to record on the new agent (typically the caller's user id). */
  ownerId?: number;
}

export interface CloneAgentResult {
  agent: typeof import("../../../drizzle/tables/agent-studio").agsAgents.$inferSelect;
  draftId: number;
  copied: {
    toolBindings: number;
    knowledgeBindings: number;
    memoryConfigs: number;
    workflowNodes: number;
    workflowEdges: number;
    hooks: number;
    mcpServers: number;
    skills: number;
    subagents: number;
    plugins: number;
    permissionRules: number;
  };
}

/**
 * Clone an existing agent's full state into a brand-new draft agent.
 *
 * Throws if the source agent doesn't exist or has no current draft. The
 * caller is responsible for catching unique-key conflicts on `internalKey`
 * (the creation router translates these to TRPC CONFLICT errors).
 */
export async function cloneAgent(
  input: CloneAgentInput
): Promise<CloneAgentResult> {
  // ── 1. Load source ─────────────────────────────────────────────────────
  const source = await repo.getAgentById(input.sourceAgentId);
  if (!source) {
    throw new Error(`Source agent ${input.sourceAgentId} not found`);
  }
  const sourceDraft = await repo.getCurrentDraft(input.sourceAgentId);
  if (!sourceDraft) {
    throw new Error(
      `Source agent ${input.sourceAgentId} has no current draft to clone from`
    );
  }

  // ── 2. Create the new agent shell + initial draft ──────────────────────
  // createAgent already creates an empty draft and sets it as current.
  const { agent: newAgent, draft: newDraft } = await repo.createAgent({
    name: input.name,
    internalKey: input.internalKey,
    description: input.description ?? source.description ?? undefined,
    agentClass: source.agentClass ?? undefined,
    visibility: source.visibility ?? undefined,
    ownerId: input.ownerId,
  });

  // ── 3. Copy agent core fields (domain, tags) onto the new agent row ────
  await repo.updateAgentCore(newAgent.id, {
    domain: source.domain ?? null,
    tags: (source.tags ?? []) as string[],
  });

  // ── 4. Copy all draft-scoped fields onto the new draft ─────────────────
  // We pull every field that isn't bookkeeping (id/agentId/createdAt/etc.)
  // so future schema additions to drafts don't silently get dropped from
  // clones — anything we explicitly forget will surface in code review.
  await repo.updateDraft(newAgent.id, {
    // Identity (description was already set by createAgent — re-apply for completeness)
    domain: sourceDraft.domain,
    tags: sourceDraft.tags,
    supportedEnvironments: sourceDraft.supportedEnvironments,
    // Behavior contract
    mission: sourceDraft.mission,
    role: sourceDraft.role,
    scope: sourceDraft.scope,
    allowedTasks: sourceDraft.allowedTasks,
    blockedTasks: sourceDraft.blockedTasks,
    successCriteria: sourceDraft.successCriteria,
    escalationRules: sourceDraft.escalationRules,
    autonomyLevel: sourceDraft.autonomyLevel,
    interventionTriggers: sourceDraft.interventionTriggers,
    // Prompts
    systemInstructions: sourceDraft.systemInstructions,
    roleInstructions: sourceDraft.roleInstructions,
    policyInstructions: sourceDraft.policyInstructions,
    outputContract: sourceDraft.outputContract,
    promptExamples: sourceDraft.promptExamples,
    fallbackBehavior: sourceDraft.fallbackBehavior,
    refusalBehavior: sourceDraft.refusalBehavior,
    // Memory / Knowledge / Workflow / Governance / Runtime / Simulation jsonb blobs
    memoryConfig: sourceDraft.memoryConfig,
    knowledgeConfig: sourceDraft.knowledgeConfig,
    workflowConfig: sourceDraft.workflowConfig,
    governancePolicy: sourceDraft.governancePolicy,
    runtimeConfig: sourceDraft.runtimeConfig,
    simulationDefaults: sourceDraft.simulationDefaults,
    // Phase 0a runtime columns
    effort: sourceDraft.effort,
    maxTurns: sourceDraft.maxTurns,
    background: sourceDraft.background,
    initialPrompt: sourceDraft.initialPrompt,
    criticalSystemReminder: sourceDraft.criticalSystemReminder,
    permissionMode: sourceDraft.permissionMode,
    workingDirectories: sourceDraft.workingDirectories,
    providerConfig: sourceDraft.providerConfig,
  });

  // ── 5. Tool bindings ───────────────────────────────────────────────────
  const sourceTools = await repo.listToolBindings(sourceDraft.id);
  for (const t of sourceTools) {
    await repo.attachToolBinding({
      draftId: newDraft.id,
      toolKey: t.toolKey,
      toolName: t.toolName,
      permissionMatrix: (t.permissionMatrix ?? {}) as Record<string, unknown>,
      allowedActions: (t.allowedActions ?? []) as string[],
      blockedActions: (t.blockedActions ?? []) as string[],
      requiresApproval: t.requiresApproval ?? false,
      rateLimit: (t.rateLimit ?? {}) as Record<string, unknown>,
      auditRequired: t.auditRequired ?? true,
    });
  }

  // ── 6. Knowledge bindings ──────────────────────────────────────────────
  const sourceKnowledge = await repo.listKnowledgeBindings(sourceDraft.id);
  if (sourceKnowledge.length > 0) {
    await repo.replaceKnowledgeBindings(
      newDraft.id,
      sourceKnowledge.map((k) => ({
        sourceKey: k.sourceKey,
        sourceName: k.sourceName,
        priority: k.priority ?? 50,
        freshness: k.freshness ?? "standard",
        groundingMode: k.groundingMode ?? "hybrid",
        retrievalDepth: k.retrievalDepth ?? 5,
        contextBudget: k.contextBudget ?? 4000,
      }))
    );
  }

  // ── 7. Memory configs ──────────────────────────────────────────────────
  const sourceMemory = await repo.listMemoryConfigs(sourceDraft.id);
  if (sourceMemory.length > 0) {
    await repo.replaceMemoryConfigs(
      newDraft.id,
      sourceMemory.map((m) => ({
        memoryType: m.memoryType,
        enabled: m.enabled ?? true,
        retentionDays: m.retentionDays ?? null,
        readPermissions: (m.readPermissions ?? []) as string[],
        writePermissions: (m.writePermissions ?? []) as string[],
        deletionPolicy: m.deletionPolicy ?? "manual",
        privacyRules: (m.privacyRules ?? {}) as Record<string, unknown>,
      }))
    );
  }

  // ── 8. Workflow graph ──────────────────────────────────────────────────
  const sourceNodes = await repo.listWorkflowNodes(sourceDraft.id);
  const sourceEdges = await repo.listWorkflowEdges(sourceDraft.id);
  if (sourceNodes.length > 0 || sourceEdges.length > 0) {
    await repo.replaceWorkflowGraph(
      newDraft.id,
      sourceNodes.map((n) => ({
        nodeKey: n.nodeKey,
        nodeType: n.nodeType,
        label: n.label ?? undefined,
        config: (n.config ?? {}) as Record<string, unknown>,
        positionX: n.positionX ?? 0,
        positionY: n.positionY ?? 0,
      })),
      sourceEdges.map((e) => ({
        fromNodeKey: e.fromNodeKey,
        toNodeKey: e.toNodeKey,
        label: e.label ?? undefined,
        condition: (e.condition ?? {}) as Record<string, unknown>,
      }))
    );
  }

  // ── 9. Hooks ───────────────────────────────────────────────────────────
  const sourceHooks = await repo.listHooks(sourceDraft.id);
  if (sourceHooks.length > 0) {
    await repo.replaceHooks(
      newDraft.id,
      sourceHooks.map((h) => ({
        eventName: h.eventName,
        matcher: h.matcher,
        command: h.command,
        timeoutMs: h.timeoutMs,
        requiresApproval: h.requiresApproval ?? false,
        enabled: h.enabled ?? true,
      }))
    );
  }

  // ── 10. MCP servers ────────────────────────────────────────────────────
  const sourceMcp = await repo.listMcpServers(sourceDraft.id);
  if (sourceMcp.length > 0) {
    await repo.replaceMcpServers(
      newDraft.id,
      sourceMcp.map((s) => ({
        name: s.name,
        transport: s.transport,
        command: s.command,
        args: (s.args ?? []) as string[],
        env: (s.env ?? {}) as Record<string, string>,
        url: s.url,
        enabled: s.enabled ?? true,
      }))
    );
  }

  // ── 11. Skills ─────────────────────────────────────────────────────────
  const sourceSkills = await repo.listSkills(sourceDraft.id);
  if (sourceSkills.length > 0) {
    await repo.replaceSkills(
      newDraft.id,
      sourceSkills.map((s) => ({
        packKey: s.packKey,
        skillKey: s.skillKey,
        skillName: s.skillName,
        allowedTools: (s.allowedTools ?? []) as string[],
        blockedTools: (s.blockedTools ?? []) as string[],
        requiresApproval: s.requiresApproval ?? false,
        argsSchema: (s.argsSchema ?? {}) as Record<string, unknown>,
      }))
    );
  }

  // ── 12. Subagents ──────────────────────────────────────────────────────
  const sourceSubagents = await repo.listSubagents(sourceDraft.id);
  if (sourceSubagents.length > 0) {
    await repo.replaceSubagents(
      newDraft.id,
      sourceSubagents.map((s) => ({
        name: s.name,
        description: s.description,
        prompt: s.prompt,
        tools: (s.tools ?? []) as string[],
        disallowedTools: (s.disallowedTools ?? []) as string[],
        model: s.model,
        maxTurns: s.maxTurns,
        background: s.background ?? false,
        effort: s.effort,
        permissionMode: s.permissionMode,
        memory: s.memory,
        initialPrompt: s.initialPrompt,
        criticalSystemReminder: s.criticalSystemReminder,
      }))
    );
  }

  // ── 13. Plugins ────────────────────────────────────────────────────────
  const sourcePlugins = await repo.listPlugins(sourceDraft.id);
  if (sourcePlugins.length > 0) {
    await repo.replacePlugins(
      newDraft.id,
      sourcePlugins.map((p) => ({
        type: p.type ?? "local",
        path: p.path,
        enabled: p.enabled ?? true,
      }))
    );
  }

  // ── 14. Permission rules ───────────────────────────────────────────────
  const sourceRules = await repo.listPermissionRules(sourceDraft.id);
  if (sourceRules.length > 0) {
    await repo.replacePermissionRules(
      newDraft.id,
      sourceRules.map((r) => ({
        ruleSource: r.ruleSource,
        ruleBehavior: r.ruleBehavior,
        toolPattern: r.toolPattern,
        contentPattern: r.contentPattern,
        description: r.description,
      }))
    );
  }

  // ── 15. Force lifecycle to "draft" ─────────────────────────────────────
  // createAgent already sets it to "draft" but we re-apply for clarity.
  // The clone is a fresh agent that has never been reviewed, regardless of
  // the source's lifecycle state.
  await repo.updateAgentLifecycleState(newAgent.id, "draft");

  // Refetch the agent to return the canonical row
  const finalAgent = await repo.getAgentById(newAgent.id);
  if (!finalAgent) {
    throw new Error(`[clone] new agent ${newAgent.id} vanished after creation`);
  }

  return {
    agent: finalAgent,
    draftId: newDraft.id,
    copied: {
      toolBindings: sourceTools.length,
      knowledgeBindings: sourceKnowledge.length,
      memoryConfigs: sourceMemory.length,
      workflowNodes: sourceNodes.length,
      workflowEdges: sourceEdges.length,
      hooks: sourceHooks.length,
      mcpServers: sourceMcp.length,
      skills: sourceSkills.length,
      subagents: sourceSubagents.length,
      plugins: sourcePlugins.length,
      permissionRules: sourceRules.length,
    },
  };
}
