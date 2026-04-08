/**
 * AI Agent Studio — openllm-agent2 seeder
 *
 * Idempotent seeder that creates a canonical "openllm-agent2" agent row in
 * Studio. Triggered explicitly via the `creation.seedOpenllmAgent2` mutation
 * (no boot hook — see Phase 1a decision #b).
 *
 * If the row already exists (by `internal_key`), returns the existing row
 * with no modifications. Safe to call repeatedly.
 *
 * What it creates:
 *   - 1 ags_agents row (lifecycle = "published", environment = "production")
 *   - 1 current draft populated with the openllm-agent2 default state
 *   - 51 tool bindings (all openllm tools, skipping the 12 legacy aliases)
 *   - All vendored skills attached (19 across 9 packs)
 *   - Memory configs (session, episodic, preference)
 *   - Workflow nodes + edges for the standard agent loop
 *   - Permission rules from defaults
 *   - Governance policy
 *   - Runtime config (provider/model/effort/etc.)
 *
 * Source of truth for defaults: ./openllm-agent2-defaults.ts
 */

import * as repo from "../repository";
import * as toolCatalog from "../adapters/tool-catalog-adapter";
import * as skillCatalog from "../adapters/skill-catalog-adapter";
import {
  OPENLLM_AGENT2_INTERNAL_KEY,
  OPENLLM_AGENT2_IDENTITY,
  OPENLLM_AGENT2_BEHAVIOR,
  OPENLLM_AGENT2_PROMPTS,
  OPENLLM_AGENT2_GOVERNANCE_POLICY,
  OPENLLM_AGENT2_RUNTIME_CONFIG,
  OPENLLM_AGENT2_PERMISSION_RULES,
  OPENLLM_AGENT2_MEMORY_CONFIGS,
  OPENLLM_AGENT2_WORKFLOW_NODES,
  OPENLLM_AGENT2_WORKFLOW_EDGES,
} from "./openllm-agent2-defaults";

export interface SeedResult {
  agent: typeof import("../../../drizzle/tables/agent-studio").agsAgents.$inferSelect;
  alreadyExisted: boolean;
  attachedTools: number;
  attachedSkills: number;
  permissionRules: number;
}

/**
 * Run the openllm-agent2 seed. Idempotent — safe to call repeatedly.
 *
 * @param input.ownerId  The user id to record as the agent's owner.
 * @returns The agent row + counts of what was attached.
 */
export async function seedOpenllmAgent2(input: {
  ownerId?: number;
}): Promise<SeedResult> {
  // ── 1. Idempotency check ──────────────────────────────────────────────
  const existing = await repo.getAgentByInternalKey(OPENLLM_AGENT2_INTERNAL_KEY);
  if (existing) {
    return {
      agent: existing,
      alreadyExisted: true,
      attachedTools: 0,
      attachedSkills: 0,
      permissionRules: 0,
    };
  }

  // ── 2. Create the agent + initial draft ───────────────────────────────
  const { agent, draft } = await repo.createAgent({
    name: OPENLLM_AGENT2_IDENTITY.name,
    internalKey: OPENLLM_AGENT2_IDENTITY.internalKey,
    description: OPENLLM_AGENT2_IDENTITY.description,
    agentClass: OPENLLM_AGENT2_IDENTITY.agentClass,
    visibility: OPENLLM_AGENT2_IDENTITY.visibility,
    ownerId: input.ownerId,
  });

  // ── 3. Apply identity extras + behavior + prompts to the draft ────────
  await repo.updateAgentCore(agent.id, {
    domain: OPENLLM_AGENT2_IDENTITY.domain,
    tags: OPENLLM_AGENT2_IDENTITY.tags,
  });

  await repo.updateDraft(agent.id, {
    domain: OPENLLM_AGENT2_IDENTITY.domain,
    tags: OPENLLM_AGENT2_IDENTITY.tags,
    // Behavior
    mission: OPENLLM_AGENT2_BEHAVIOR.mission,
    role: OPENLLM_AGENT2_BEHAVIOR.role,
    scope: OPENLLM_AGENT2_BEHAVIOR.scope,
    allowedTasks: OPENLLM_AGENT2_BEHAVIOR.allowedTasks,
    blockedTasks: OPENLLM_AGENT2_BEHAVIOR.blockedTasks,
    successCriteria: OPENLLM_AGENT2_BEHAVIOR.successCriteria,
    escalationRules: OPENLLM_AGENT2_BEHAVIOR.escalationRules,
    autonomyLevel: OPENLLM_AGENT2_BEHAVIOR.autonomyLevel,
    interventionTriggers: OPENLLM_AGENT2_BEHAVIOR.interventionTriggers,
    // Prompts
    systemInstructions: OPENLLM_AGENT2_PROMPTS.systemInstructions,
    roleInstructions: OPENLLM_AGENT2_PROMPTS.roleInstructions,
    policyInstructions: OPENLLM_AGENT2_PROMPTS.policyInstructions,
    outputContract: OPENLLM_AGENT2_PROMPTS.outputContract,
    fallbackBehavior: OPENLLM_AGENT2_PROMPTS.fallbackBehavior,
    refusalBehavior: OPENLLM_AGENT2_PROMPTS.refusalBehavior,
    // Governance policy (jsonb)
    governancePolicy: OPENLLM_AGENT2_GOVERNANCE_POLICY,
  });

  // ── 4. Attach all 51 openllm tools (skip the 12 legacy aliases) ───────
  const catalog = await toolCatalog.listToolCatalog();
  const openllmTools = catalog.filter((t) => !t.name.endsWith("(legacy)"));
  let attachedTools = 0;
  for (const tool of openllmTools) {
    await repo.attachToolBinding({
      draftId: draft.id,
      toolKey: tool.key,
      toolName: tool.name,
      allowedActions: tool.defaultAllowedActions,
      blockedActions: tool.hardBlockedActions,
      requiresApproval: tool.defaultRequiresApproval,
      auditRequired: true,
    });
    attachedTools++;
  }

  // ── 5. Attach all skills from the local catalog ───────────────────────
  const skillCat = await skillCatalog.listSkillCatalog();
  let attachedSkills = 0;
  if (skillCat.loaded) {
    for (const skill of skillCat.skills) {
      await repo.attachSkill({
        draftId: draft.id,
        packKey: skill.packKey,
        skillKey: skill.skillKey,
        skillName: skill.name,
        allowedTools: skill.allowedTools,
        requiresApproval: false,
      });
      attachedSkills++;
    }
  }

  // ── 6. Memory configs ─────────────────────────────────────────────────
  await repo.replaceMemoryConfigs(draft.id, OPENLLM_AGENT2_MEMORY_CONFIGS);

  // ── 7. Workflow graph ─────────────────────────────────────────────────
  await repo.replaceWorkflowGraph(
    draft.id,
    OPENLLM_AGENT2_WORKFLOW_NODES,
    OPENLLM_AGENT2_WORKFLOW_EDGES
  );

  // ── 8. Permission rules ───────────────────────────────────────────────
  let permissionRules = 0;
  for (const rule of OPENLLM_AGENT2_PERMISSION_RULES) {
    await repo.savePermissionRule({
      draftId: draft.id,
      ruleSource: rule.ruleSource,
      ruleBehavior: rule.ruleBehavior,
      toolPattern: rule.toolPattern,
      description: rule.description,
    });
    permissionRules++;
  }

  // ── 9. Runtime config (the 8 new draft columns from Phase 0a) ─────────
  await repo.updateRuntimeConfig(agent.id, {
    effort: OPENLLM_AGENT2_RUNTIME_CONFIG.effort,
    maxTurns: OPENLLM_AGENT2_RUNTIME_CONFIG.maxTurns,
    background: OPENLLM_AGENT2_RUNTIME_CONFIG.background,
    permissionMode: OPENLLM_AGENT2_RUNTIME_CONFIG.permissionMode,
    workingDirectories: OPENLLM_AGENT2_RUNTIME_CONFIG.workingDirectories,
    providerConfig: OPENLLM_AGENT2_RUNTIME_CONFIG.providerConfig,
  });

  // ── 10. Lifecycle bypass: openllm-agent2 is canonical, mark published ─
  // This intentionally bypasses the normal new → draft → tested → published
  // flow because openllm-agent2 represents an external runtime, not a draft
  // being designed in Studio. It's documented as a system seed in the
  // creation router.
  await repo.updateAgentLifecycleState(agent.id, "published");

  // Refetch the agent so the returned row reflects the lifecycle update
  const finalAgent = await repo.getAgentByInternalKey(OPENLLM_AGENT2_INTERNAL_KEY);
  if (!finalAgent) {
    throw new Error(
      `[seed] openllm-agent2 row vanished after seeding — DB anomaly`
    );
  }

  return {
    agent: finalAgent,
    alreadyExisted: false,
    attachedTools,
    attachedSkills,
    permissionRules,
  };
}
