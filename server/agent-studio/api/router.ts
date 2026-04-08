/**
 * AI Agent Studio — Top-Level tRPC Router
 *
 * Mounted as `agentStudio.*` in the platform appRouter. Composes all
 * sub-routers (home, identity, behavior, prompts, tools, knowledge, memory,
 * workflows, governance, simulation, testing, runs, versions, publish).
 *
 * - Reads use `protectedProcedure`
 * - Mutations use `protectedProcedure` for low-risk drafts and
 *   `governedProcedure` for risky lifecycle actions (publish, archive,
 *   destructive simulation, real-tool execution)
 *
 * The module is fully independent. It does not import from server/modules,
 * server/agents, or any other module's router.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import * as repo from "../repository";
import * as readinessSvc from "../services/readiness";
import * as govSvc from "../services/governance-adapter";
import * as simSvc from "../services/simulation";
import * as testSvc from "../services/testing";
import * as versionSvc from "../services/versioning";
import * as toolCatalog from "../adapters/tool-catalog-adapter";
import * as knowledgeAdapter from "../adapters/knowledge-adapter";
import * as templateRegistry from "../adapters/template-registry";
import * as skillCatalog from "../adapters/skill-catalog-adapter";
import * as catalogSkillsService from "../services/catalog-skills";
import * as catalogToolsService from "../services/catalog-tools";
import { cloneAgent } from "../services/cloning";
import { importFromMarkdown as importSkillsFromMarkdown } from "../services/skill-importer";
// Phase 12.5: scheduler is now started explicitly via bootAgentStudio()
// in server/agent-studio/boot.ts (called from _core/index.ts). The
// previous side-effect import here was fragile because it depended on
// import order — boot.ts gives us a deterministic start.
import * as mcpManager from "../services/mcp/mcp-manager";
import {
  loadPluginsForDraft,
  validatePlugin,
} from "../services/plugin-loader";
import { compactRun, resumeRun } from "../services/run-snapshot";
import { parseAndExecuteSlashCommand } from "../services/slash-commands";
import { getRunTree, invokeSubagent } from "../services/subagent-runner";
import { seedOpenllmAgent2 } from "../seeds/openllm-agent2-seed";
import {
  agentIdSchema,
  archiveAgentSchema,
  attachSkillSchema,
  attachToolSchema,
  cloneAgentSchema,
  compactRunSchema,
  createCatalogSkillSchema,
  createCatalogToolSchema,
  listCatalogSkillsSchema,
  listCatalogToolsSchema,
  removeCatalogSkillSchema,
  removeCatalogToolSchema,
  updateCatalogSkillSchema,
  updateCatalogToolSchema,
  importSkillMarkdownSchema,
  validateCatalogSkillSchema,
  validateCatalogToolSchema,
  comparePromptPackSchema,
  compareSimulationRunsSchema,
  compareVersionsSchema,
  createBlankAgentSchema,
  createFromTemplateSchema,
  createVersionSchema,
  decideApprovalStepSchema,
  decidePermissionRequestSchema,
  executeSlashCommandSchema,
  getRunDetailSchema,
  getRunTreeSchema,
  getSimulationRunSchema,
  importDefinitionSchema,
  invokeSubagentSchema,
  listAgentsSchema,
  listPendingPermissionRequestsSchema,
  listRunsSchema,
  previewRetrievalSchema,
  promoteSimulationToTestSchema,
  publishVersionSchema,
  removeHookSchema,
  removeMcpServerSchema,
  removePermissionRuleSchema,
  removePluginSchema,
  removeSkillSchema,
  removeSubagentSchema,
  removeTestCaseSchema,
  removeToolSchema,
  resumeRunSchema,
  rollbackToVersionSchema,
  runSimulationSchema,
  runTestSuiteSchema,
  saveHookSchema,
  saveMcpServerSchema,
  savePermissionRuleSchema,
  savePluginSchema,
  saveSimulationScenarioSchema,
  saveSubagentSchema,
  saveTestCaseSchema,
  saveTestSuiteSchema,
  setScheduleConfigSchema,
  simulateToolCallSchema,
  submitForReviewSchema,
  updateBehaviorSchema,
  updateGovernancePolicySchema,
  updateIdentitySchema,
  updateKnowledgeConfigSchema,
  updateMemoryConfigSchema,
  updatePromptPackSchema,
  updateRuntimeConfigSchema,
  updateToolBindingSchema,
  updateWorkflowConfigSchema,
  validatePluginSchema,
  withdrawPublishRequestSchema,
} from "../shared/schemas";

// ── Home ────────────────────────────────────────────────────────────────────

const homeRouter = router({
  listAgents: protectedProcedure.input(listAgentsSchema).query(({ input }) => {
    return repo.listAgents(input ?? {});
  }),
  getHomeSummary: protectedProcedure.query(() => repo.getHomeSummary()),
  getReviewQueue: protectedProcedure.query(() => repo.getReviewQueue()),
});

// ── Creation ────────────────────────────────────────────────────────────────

/**
 * Translate database errors from `createAgent` into clean TRPCErrors so the
 * client sees a friendly message instead of a raw Postgres "duplicate key
 * value violates unique constraint" string.
 */
function translateCreateError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /duplicate key value/i.test(msg) ||
    /unique constraint/i.test(msg) ||
    /uniq_ags_agents_key/i.test(msg)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An agent with that internal key already exists. Pick a unique key.",
    });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: msg,
  });
}

const creationRouter = router({
  createBlankAgent: protectedProcedure
    .input(createBlankAgentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await repo.createAgent({
          ...input,
          ownerId: ctx.user.id,
        });
        return result.agent;
      } catch (err) {
        translateCreateError(err);
      }
    }),
  createFromTemplate: protectedProcedure
    .input(createFromTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const template = await templateRegistry.getTemplateByKey(input.templateKey);
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Template not found: ${input.templateKey}`,
        });
      }
      let result;
      try {
        result = await repo.createAgent({
          name: input.name,
          internalKey: input.internalKey,
          description: `${template.description}`,
          agentClass: template.identity.agentClass,
          visibility: template.identity.visibility,
          ownerId: ctx.user.id,
        });
      } catch (err) {
        translateCreateError(err);
      }
      // Apply the rest of the template (behavior, prompts, tools, knowledge,
      // governance) to the new agent's draft.
      await templateRegistry.applyTemplateToAgent({
        template,
        agentId: result!.agent.id,
        draftId: result!.draft.id,
        repoModule: repo,
      });
      return result!.agent;
    }),
  listTemplates: protectedProcedure.query(() => templateRegistry.listTemplates()),
  /**
   * Phase 1a: Idempotent openllm-agent2 seeder.
   *
   * Creates a canonical "openllm-agent2" agent row in Studio if it doesn't
   * already exist. Safe to call repeatedly — re-clicks return the existing
   * row with no modifications.
   *
   * Bypasses the normal lifecycle flow (new → draft → tested → published)
   * because openllm-agent2 represents an external runtime, not a draft
   * being designed in Studio. This is intentional and documented in the
   * seeder file.
   *
   * Not `governedProcedure` because it's idempotent + creation-only +
   * draft-based for the user. Same trust level as the other creation
   * procedures (createBlankAgent, createFromTemplate, importDefinition).
   */
  seedOpenllmAgent2: protectedProcedure.mutation(async ({ ctx }) => {
    return seedOpenllmAgent2({ ownerId: ctx.user.id });
  }),
  /**
   * Phase 2: Clone an existing agent's full state into a brand-new draft.
   *
   * Copies the entire current draft (identity, behavior, prompts, governance,
   * runtime, tools, knowledge, memory, workflow, hooks, MCP servers, skills,
   * subagents, plugins, permission rules) into a new agent owned by the
   * caller and forces lifecycle to "draft" — even if the source is published.
   *
   * Use case: take the canonical openllm-agent2 row and use it as a starting
   * point for your own agent without touching the source. Caller picks the
   * new name + internal key.
   *
   * Not `governedProcedure` — it's a creation-only mutation that produces
   * a fresh draft owned by the user, same trust level as createBlankAgent
   * and createFromTemplate.
   */
  cloneAgent: protectedProcedure
    .input(cloneAgentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await cloneAgent({
          sourceAgentId: input.sourceAgentId,
          name: input.name,
          internalKey: input.internalKey,
          description: input.description,
          ownerId: ctx.user.id,
        });
      } catch (err) {
        translateCreateError(err);
      }
    }),
  importDefinition: protectedProcedure
    .input(importDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      let result;
      try {
        result = await repo.createAgent({
          name: input.name,
          internalKey: input.internalKey,
          description: "Imported definition",
          ownerId: ctx.user.id,
        });
      } catch (err) {
        translateCreateError(err);
      }
      // Apply selected fields from definition into the draft
      const def = input.definition as Record<string, any>;
      await repo.updateDraft(result!.agent.id, {
        mission: def.mission,
        scope: def.scope,
        systemInstructions: def.systemInstructions,
        outputContract: def.outputContract,
      });
      return result!.agent;
    }),
});

// ── Shell / Overview ────────────────────────────────────────────────────────

const shellRouter = router({
  getShellSummary: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const agent = await repo.getAgentById(input.agentId);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
    const draft = await repo.getCurrentDraft(input.agentId);
    const readiness = await readinessSvc.computeReadiness(input.agentId);
    const governance = await govSvc.evaluateGovernance(input.agentId);
    const latestSim = await repo.getLatestSimulationRun(input.agentId);
    const latestTest = await repo.getLatestTestRun(input.agentId);
    return {
      agent,
      draft,
      readiness,
      governance,
      latestSimulation: latestSim,
      latestTest,
    };
  }),
  getOverview: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const agent = await repo.getAgentById(input.agentId);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
    const draft = await repo.getCurrentDraft(input.agentId);
    const readiness = await readinessSvc.computeReadiness(input.agentId);
    const governance = await govSvc.evaluateGovernance(input.agentId);
    const latestSim = await repo.getLatestSimulationRun(input.agentId);
    const latestTest = await repo.getLatestTestRun(input.agentId);
    const recentRuns = await repo.listRuntimeRuns(input.agentId, 5);
    return {
      agent,
      draft,
      readiness,
      governance,
      latestSimulation: latestSim,
      latestTest,
      recentRuns,
    };
  }),
});

// ── Identity ────────────────────────────────────────────────────────────────

const identityRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const agent = await repo.getAgentById(input.agentId);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
    const draft = await repo.getCurrentDraft(input.agentId);
    return { agent, draft };
  }),
  update: protectedProcedure.input(updateIdentitySchema).mutation(async ({ input }) => {
    const agent = await repo.getAgentById(input.agentId);
    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
    }

    // 1. Update agent core fields (name/desc/class/visibility/etc.) so the
    //    home table, shell summary, and other listings reflect the change
    //    immediately. Without this, lists show stale identity data.
    await repo.updateAgentCore(input.agentId, {
      name: input.name,
      description: input.description,
      domain: input.domain,
      tags: input.tags,
      agentClass: input.agentClass,
      visibility: input.visibility,
      ownerId: input.ownerId,
    });

    // 2. Update lifecycle state if provided
    if (input.lifecycleState) {
      await repo.updateAgentLifecycleState(input.agentId, input.lifecycleState);
    }

    // 3. Mirror the same fields into the draft so subsequent draft reads
    //    stay coherent with the agent core.
    return repo.updateDraft(input.agentId, {
      name: input.name,
      description: input.description,
      ownerId: input.ownerId ?? undefined,
      domain: input.domain ?? undefined,
      tags: input.tags,
      agentClass: input.agentClass,
      visibility: input.visibility,
      supportedEnvironments: input.supportedEnvironments,
    });
  }),
});

// ── Behavior ────────────────────────────────────────────────────────────────

const behaviorRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    return repo.getCurrentDraft(input.agentId);
  }),
  update: protectedProcedure.input(updateBehaviorSchema).mutation(async ({ input }) => {
    return repo.updateDraft(input.agentId, {
      mission: input.mission,
      role: input.role,
      scope: input.scope,
      allowedTasks: input.allowedTasks,
      blockedTasks: input.blockedTasks,
      successCriteria: input.successCriteria,
      escalationRules: input.escalationRules,
      autonomyLevel: input.autonomyLevel,
      interventionTriggers: input.interventionTriggers,
    });
  }),
});

// ── Prompts ─────────────────────────────────────────────────────────────────

const promptsRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    return repo.getCurrentDraft(input.agentId);
  }),
  update: protectedProcedure.input(updatePromptPackSchema).mutation(async ({ input }) => {
    return repo.updateDraft(input.agentId, {
      systemInstructions: input.systemInstructions,
      roleInstructions: input.roleInstructions,
      policyInstructions: input.policyInstructions,
      outputContract: input.outputContract,
      promptExamples: input.promptExamples as unknown[],
      fallbackBehavior: input.fallbackBehavior,
      refusalBehavior: input.refusalBehavior,
    });
  }),
  assemblePreview: protectedProcedure
    .input(agentIdSchema)
    .query(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) return { preview: "" };
      const parts: string[] = [];
      if (draft.systemInstructions) parts.push(`# System\n${draft.systemInstructions}`);
      if (draft.roleInstructions) parts.push(`# Role\n${draft.roleInstructions}`);
      if (draft.policyInstructions) parts.push(`# Policy\n${draft.policyInstructions}`);
      if (draft.outputContract) parts.push(`# Output Contract\n${draft.outputContract}`);
      if (draft.refusalBehavior) parts.push(`# Refusal\n${draft.refusalBehavior}`);
      return { preview: parts.join("\n\n---\n\n") };
    }),
  compare: protectedProcedure
    .input(comparePromptPackSchema)
    .query(async ({ input }) => {
      // Phase 1: compare against latest version snapshot if available
      const versions = await repo.listVersions(input.agentId);
      const a = versions.find((v) => v.id === input.versionA) ?? versions[1];
      const b = versions.find((v) => v.id === input.versionB) ?? versions[0];
      return { a, b };
    }),
});

// ── Tools ───────────────────────────────────────────────────────────────────

const toolsRouter = router({
  listCatalog: protectedProcedure.query(() => toolCatalog.listToolCatalog()),
  listBindings: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listToolBindings(draft.id);
  }),
  attach: protectedProcedure.input(attachToolSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    return repo.attachToolBinding({
      draftId: draft.id,
      toolKey: input.toolKey,
      toolName: input.toolName,
      permissionMatrix: input.permissionMatrix,
      allowedActions: input.allowedActions,
      blockedActions: input.blockedActions,
      requiresApproval: input.requiresApproval,
      rateLimit: input.rateLimit,
      auditRequired: input.auditRequired,
    });
  }),
  updateBinding: protectedProcedure
    .input(updateToolBindingSchema)
    .mutation(async ({ input }) => {
      await repo.updateToolBinding(input.bindingId, {
        permissionMatrix: input.permissionMatrix,
        allowedActions: input.allowedActions,
        blockedActions: input.blockedActions,
        requiresApproval: input.requiresApproval,
        rateLimit: input.rateLimit,
        auditRequired: input.auditRequired,
      });
      return { success: true };
    }),
  remove: protectedProcedure.input(removeToolSchema).mutation(async ({ input }) => {
    await repo.removeToolBinding(input.bindingId);
    return { success: true };
  }),
  testBinding: protectedProcedure
    .input(z.object({ bindingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      // Deterministic connection test — verifies the binding exists and
      // reads its kind from the catalog adapter so the user sees a
      // tool-aware result. Does NOT call the real tool.
      const binding = await repo.getToolBindingById(input.bindingId);
      if (!binding) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Binding not found" });
      }
      const entry = await toolCatalog.getToolCatalogEntry(binding.toolKey);
      return {
        ok: true,
        toolKey: binding.toolKey,
        kind: entry?.category ?? "unknown",
        message: entry
          ? `Connection OK (simulated) — ${entry.category}`
          : "Connection test simulated (tool not in catalog)",
      };
    }),
  simulateCall: protectedProcedure
    .input(simulateToolCallSchema)
    .mutation(async ({ input }) => {
      return toolCatalog.simulateToolCall(input.toolKey, input.payload);
    }),
});

// ── Knowledge ───────────────────────────────────────────────────────────────

const knowledgeRouter = router({
  listSources: protectedProcedure.query(() => knowledgeAdapter.listKnowledgeSources()),
  getConfig: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return { config: {}, bindings: [] };
    const bindings = await repo.listKnowledgeBindings(draft.id);
    return { config: draft.knowledgeConfig ?? {}, bindings };
  }),
  updateConfig: protectedProcedure
    .input(updateKnowledgeConfigSchema)
    .mutation(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
      await repo.updateDraft(input.agentId, { knowledgeConfig: input.config });
      if (input.bindings) {
        await repo.replaceKnowledgeBindings(draft.id, input.bindings);
      }
      return { success: true };
    }),
  previewRetrieval: protectedProcedure
    .input(previewRetrievalSchema)
    .query(async ({ input }) => {
      // Real preview reads the agent's actual knowledge bindings + grounding
      // policy and returns deterministic per-source hits via the adapter.
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) {
        return {
          query: input.query,
          totalHits: 0,
          hits: [],
          groundingPolicy: "(no draft)",
        };
      }
      const bindings = await repo.listKnowledgeBindings(draft.id);
      return knowledgeAdapter.previewRetrieval({
        query: input.query,
        bindings: bindings.map((b) => ({
          sourceKey: b.sourceKey,
          sourceName: b.sourceName,
          priority: b.priority ?? 50,
          retrievalDepth: b.retrievalDepth ?? 5,
          groundingMode: b.groundingMode ?? "hybrid",
        })),
      });
    }),
});

// ── Memory ──────────────────────────────────────────────────────────────────

const memoryRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return { configs: [] };
    const configs = await repo.listMemoryConfigs(draft.id);
    return { configs };
  }),
  update: protectedProcedure.input(updateMemoryConfigSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    await repo.replaceMemoryConfigs(draft.id, input.configs);
    return { success: true };
  }),
});

// ── Workflows ───────────────────────────────────────────────────────────────

const workflowsRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return { config: {}, nodes: [], edges: [] };
    const nodes = await repo.listWorkflowNodes(draft.id);
    const edges = await repo.listWorkflowEdges(draft.id);
    return { config: draft.workflowConfig ?? {}, nodes, edges };
  }),
  update: protectedProcedure.input(updateWorkflowConfigSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    await repo.updateDraft(input.agentId, { workflowConfig: input.config });
    if (input.nodes !== undefined && input.edges !== undefined) {
      await repo.replaceWorkflowGraph(draft.id, input.nodes, input.edges);
    }
    return { success: true };
  }),
  validate: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return { ok: false, errors: ["no draft"] };
    const nodes = await repo.listWorkflowNodes(draft.id);
    const edges = await repo.listWorkflowEdges(draft.id);
    const errors: string[] = [];
    const keys = new Set(nodes.map((n) => n.nodeKey));
    for (const e of edges) {
      if (!keys.has(e.fromNodeKey)) errors.push(`edge from unknown node: ${e.fromNodeKey}`);
      if (!keys.has(e.toNodeKey)) errors.push(`edge to unknown node: ${e.toNodeKey}`);
    }
    return { ok: errors.length === 0, errors };
  }),
});

// ── Governance ──────────────────────────────────────────────────────────────

const governanceRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    return { policy: (draft?.governancePolicy ?? {}) as Record<string, unknown> };
  }),
  update: protectedProcedure
    .input(updateGovernancePolicySchema)
    .mutation(async ({ input }) => {
      await repo.updateDraft(input.agentId, { governancePolicy: input.policy });
      return { success: true };
    }),
  evaluate: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    return govSvc.evaluateGovernance(input.agentId);
  }),
});

// ── Simulation ──────────────────────────────────────────────────────────────

const simulationRouter = router({
  listScenarios: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    return repo.listSimulationScenarios(input.agentId);
  }),
  saveScenario: protectedProcedure
    .input(saveSimulationScenarioSchema)
    .mutation(async ({ ctx, input }) => {
      return repo.saveSimulationScenario({
        scenarioId: input.scenarioId,
        agentId: input.agentId,
        name: input.name,
        description: input.description,
        inputPayload: input.inputPayload,
        toggles: input.toggles,
        createdBy: ctx.user.id,
      });
    }),
  run: protectedProcedure.input(runSimulationSchema).mutation(async ({ ctx, input }) => {
    return simSvc.runSimulation({
      agentId: input.agentId,
      scenarioId: input.scenarioId,
      inputPayload: input.inputPayload,
      // input.toggles is a partial set; the service merges with DEFAULT_TOGGLES
      toggles: input.toggles,
      triggeredBy: ctx.user.id,
    });
  }),
  getRun: protectedProcedure.input(getSimulationRunSchema).query(async ({ input }) => {
    const run = await repo.getSimulationRun(input.runId);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Simulation run not found" });
    const steps = await repo.listSimulationRunSteps(input.runId);
    return { run, steps };
  }),
  compareRuns: protectedProcedure
    .input(compareSimulationRunsSchema)
    .query(({ input }) => simSvc.compareSimulationRuns(input.runIdA, input.runIdB)),
  promoteToTest: protectedProcedure
    .input(promoteSimulationToTestSchema)
    .mutation(async ({ ctx, input }) => {
      const run = await repo.getSimulationRun(input.runId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Simulation run not found" });

      // Resolve target suite — create a default one if not provided
      let suiteId = input.suiteId;
      if (!suiteId) {
        const suite = await repo.saveTestSuite({
          agentId: run.agentId,
          name: `Promoted scenarios — agent ${run.agentId}`,
          createdBy: ctx.user.id,
        });
        suiteId = suite.id;
      }

      // Pull the original scenario input (if any) to seed the case
      const scenario = run.scenarioId
        ? await repo.getSimulationScenarioById(run.scenarioId)
        : null;
      const inputPayload =
        (scenario?.inputPayload as Record<string, unknown> | undefined) ?? {};

      // Build expected envelope from the simulation run's verdict — the case
      // expects the same verdict and a non-aborted output.
      const expected = {
        verdict: run.verdict ?? "pass",
        aborted: false,
      };

      const created = await repo.saveTestCase({
        suiteId,
        name: input.caseName,
        inputPayload,
        expected,
        assertions: [{ kind: "verdict_eq", value: expected.verdict }],
      });

      return {
        suiteId,
        caseId: created.id,
        promoted: true,
        caseName: created.name,
      };
    }),
});

// ── Testing ─────────────────────────────────────────────────────────────────

const testingRouter = router({
  listSuites: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    return repo.listTestSuites(input.agentId);
  }),
  getSuite: protectedProcedure
    .input(z.object({ suiteId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const suite = await repo.getTestSuite(input.suiteId);
      if (!suite) throw new TRPCError({ code: "NOT_FOUND", message: "Suite not found" });
      const cases = await repo.listTestCases(input.suiteId);
      return { suite, cases };
    }),
  saveSuite: protectedProcedure
    .input(saveTestSuiteSchema)
    .mutation(async ({ ctx, input }) => {
      return repo.saveTestSuite({
        suiteId: input.suiteId,
        agentId: input.agentId,
        name: input.name,
        description: input.description,
        createdBy: ctx.user.id,
      });
    }),
  runSuite: protectedProcedure
    .input(runTestSuiteSchema)
    .mutation(async ({ ctx, input }) => {
      return testSvc.runTestSuite({
        suiteId: input.suiteId,
        triggeredBy: ctx.user.id,
      });
    }),
  saveCase: protectedProcedure
    .input(saveTestCaseSchema)
    .mutation(async ({ input }) => {
      return repo.saveTestCase({
        caseId: input.caseId,
        suiteId: input.suiteId,
        name: input.name,
        inputPayload: input.inputPayload,
        expected: input.expected,
        assertions: input.assertions,
      });
    }),
  removeCase: protectedProcedure
    .input(removeTestCaseSchema)
    .mutation(async ({ input }) => {
      await repo.removeTestCase(input.caseId);
      return { success: true };
    }),
  getRun: protectedProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const run = await repo.getTestRunById(input.runId);
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Test run not found" });
      }
      const results = await repo.listTestRunResults(input.runId);
      return { run, results };
    }),
  listRuns: protectedProcedure.input(agentIdSchema).query(({ input }) => {
    return repo.listTestRunsForAgent(input.agentId);
  }),
  listRunsForSuite: protectedProcedure
    .input(z.object({ suiteId: z.number().int().positive() }))
    .query(({ input }) => repo.listTestRunsForSuite(input.suiteId)),
});

// ── Runs / Traces ───────────────────────────────────────────────────────────

const runsRouter = router({
  list: protectedProcedure.input(listRunsSchema).query(async ({ input }) => {
    return repo.listRuntimeRuns(input.agentId, input.limit);
  }),
  getDetail: protectedProcedure.input(getRunDetailSchema).query(async ({ input }) => {
    const run = await repo.getRuntimeRunById(input.runId);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Runtime run not found" });
    // Phase 4: include hook executions in the trace
    const [steps, toolCalls, memoryEvents, policyEvents, hookExecutions] =
      await Promise.all([
        repo.listRuntimeRunSteps(input.runId),
        repo.listRuntimeToolCalls(input.runId),
        repo.listRuntimeMemoryEvents(input.runId),
        repo.listRuntimePolicyEvents(input.runId),
        repo.listRuntimeHookExecutions(input.runId),
      ]);
    return { run, steps, toolCalls, memoryEvents, policyEvents, hookExecutions };
  }),
  // Phase 11: resume / compact prior runs. Both create a new runtime run
  // that uses the source run as preamble (resume) or summary (compact).
  // Lineage is recorded via resumedFromRunId / compactedFromRunId on the
  // new row. protectedProcedure — same trust as runSimulation itself.
  resume: protectedProcedure
    .input(resumeRunSchema)
    .mutation(async ({ ctx, input }) => {
      return resumeRun({
        sourceRunId: input.sourceRunId,
        newInput: input.newInput,
        triggeredBy: ctx.user.id,
      });
    }),
  compact: protectedProcedure
    .input(compactRunSchema)
    .mutation(async ({ ctx, input }) => {
      return compactRun({
        sourceRunId: input.sourceRunId,
        triggeredBy: ctx.user.id,
      });
    }),
  // Phase 8: subagent invocation. Spawns a child run from a parent run
  // by name. The subagent's prompt is composed as preamble.
  // protectedProcedure — same trust as runSimulation.
  invokeSubagent: protectedProcedure
    .input(invokeSubagentSchema)
    .mutation(async ({ ctx, input }) => {
      return invokeSubagent({
        parentRunId: input.parentRunId,
        subagentName: input.subagentName,
        input: input.input,
        triggeredBy: ctx.user.id,
      });
    }),
  // Phase 8: hierarchical tree view of a run + all its subagent
  // descendants. Used by the runs page to render nesting.
  getTree: protectedProcedure
    .input(getRunTreeSchema)
    .query(async ({ input }) => {
      const tree = await getRunTree(input.runId);
      if (!tree) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      return tree;
    }),
});

// ── Versions ────────────────────────────────────────────────────────────────

const versionsRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(({ input }) => {
    return repo.listVersions(input.agentId);
  }),
  create: protectedProcedure.input(createVersionSchema).mutation(async ({ ctx, input }) => {
    return versionSvc.snapshotAgent({
      agentId: input.agentId,
      label: input.label,
      summary: input.summary,
      createdBy: ctx.user.id,
    });
  }),
  compare: protectedProcedure.input(compareVersionsSchema).query(({ input }) => {
    return versionSvc.compareVersions(input);
  }),
  rollback: governedProcedure
    .input(rollbackToVersionSchema)
    .mutation(async ({ input }) => {
      // versioning service verifies agent ownership of the version,
      // restores draft scalars + tool/knowledge/memory/workflow bindings
      try {
        return await versionSvc.restoreFromVersion({
          agentId: input.agentId,
          versionId: input.versionId,
        });
      } catch (err: any) {
        const msg = err?.message ?? "Rollback failed";
        if (/not found/i.test(msg)) {
          throw new TRPCError({ code: "NOT_FOUND", message: msg });
        }
        if (/does not belong/i.test(msg)) {
          throw new TRPCError({ code: "FORBIDDEN", message: msg });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),
});

// ── Publish / Deploy ────────────────────────────────────────────────────────

const publishRouter = router({
  preflight: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const readiness = await readinessSvc.computeReadiness(input.agentId);
    const governance = await govSvc.evaluateGovernance(input.agentId);
    const latestSim = await repo.getLatestSimulationRun(input.agentId);
    const latestTest = await repo.getLatestTestRun(input.agentId);
    return {
      readiness,
      governance,
      latestSimulation: latestSim,
      latestTest,
      checklist: [
        { key: "readiness", label: "Readiness ≥ 70%", ok: readiness.score >= 70 },
        { key: "no_blockers", label: "No blockers", ok: readiness.blockers.length === 0 },
        { key: "governance", label: "Governance verdict not blocked", ok: governance.verdict !== "blocked" },
        { key: "simulation", label: "At least one simulation run", ok: !!latestSim },
        { key: "tests_pass", label: "Latest test run passing", ok: !!latestTest && (latestTest.failedCount ?? 0) === 0 },
      ],
      publishReady: readiness.publishReady && governance.verdict !== "blocked",
    };
  }),
  submitForReview: protectedProcedure
    .input(submitForReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const readiness = await readinessSvc.computeReadiness(input.agentId);
      // Serialize the report to a plain JSON record for DB storage
      const preflightSnapshot: Record<string, unknown> = {
        score: readiness.score,
        completeness: readiness.completeness,
        publishReady: readiness.publishReady,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        sections: readiness.sections,
      };
      const created = await repo.createPublishRequest({
        agentId: input.agentId,
        versionId: input.versionId,
        targetEnvironment: input.targetEnvironment,
        notes: input.notes,
        preflight: preflightSnapshot,
        requestedBy: ctx.user.id,
      });
      // Phase 2 fix: actually write a default approval step row so the
      // ags_approval_steps table is exercised and review state is auditable.
      await repo.createApprovalStep({
        publishRequestId: created.id,
        stepOrder: 1,
        approverRole: "owner",
        state: "pending",
      });
      await repo.updateAgentLifecycleState(input.agentId, "review_required");
      return created;
    }),
  publishVersion: governedProcedure
    .input(publishVersionSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Verify the version exists AND belongs to this agent
      const version = await repo.getVersionById(input.versionId);
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Version ${input.versionId} not found`,
        });
      }
      if (version.agentId !== input.agentId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Version ${input.versionId} does not belong to agent ${input.agentId}`,
        });
      }

      // 2. Readiness gate
      const readiness = await readinessSvc.computeReadiness(input.agentId);
      if (!readiness.publishReady) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Agent not ready to publish — score=${readiness.score}, blockers=${readiness.blockers.length}`,
        });
      }

      // 3. Governance verdict gate (in addition to platform governedProcedure
      // which already ran governance evaluation in middleware)
      const governance = await govSvc.evaluateGovernance(input.agentId);
      if (governance.verdict === "blocked") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Governance verdict is BLOCKED — cannot publish",
        });
      }

      // 4. Persist the release
      return repo.publishRelease({
        agentId: input.agentId,
        versionId: input.versionId,
        targetEnvironment: input.targetEnvironment,
        releaseNotes: input.releaseNotes,
        publishedBy: ctx.user.id,
      });
    }),
  archive: governedProcedure.input(archiveAgentSchema).mutation(async ({ input }) => {
    await repo.archiveAgent(input.agentId);
    return { success: true };
  }),
  listRequests: protectedProcedure.input(agentIdSchema).query(({ input }) => {
    return repo.listPublishRequests(input.agentId);
  }),
  listApprovals: protectedProcedure
    .input(z.object({ publishRequestId: z.number().int().positive() }))
    .query(({ input }) => {
      return repo.listApprovalSteps(input.publishRequestId);
    }),
  /**
   * Decide an approval step (approve or reject). When the decision causes
   * ALL steps on the parent publish request to be approved, the publish
   * request advances to "approved" and the agent's lifecycle moves to
   * "ready_to_publish". A reject moves both to "rejected"/"blocked".
   */
  decideApproval: governedProcedure
    .input(decideApprovalStepSchema)
    .mutation(async ({ ctx, input }) => {
      const step = await repo.getApprovalStepById(input.stepId);
      if (!step) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Approval step not found" });
      }
      if (step.state !== "pending") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Step already decided (state=${step.state})`,
        });
      }
      const updated = await repo.decideApprovalStep({
        stepId: input.stepId,
        state: input.decision,
        decidedBy: ctx.user.id,
        decisionNote: input.note,
      });
      if (!updated) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Decision failed" });
      }

      // Roll up to the publish request
      const allSteps = await repo.listApprovalSteps(step.publishRequestId);
      const request = await repo.getPublishRequestById(step.publishRequestId);
      if (!request) {
        return { success: true, step: updated };
      }

      if (input.decision === "rejected") {
        // Any rejection moves the whole request to rejected, and the agent
        // lifecycle to blocked so the user must address the issue.
        await repo.updatePublishRequestState({
          publishRequestId: step.publishRequestId,
          state: "rejected",
        });
        await repo.updateAgentLifecycleState(request.agentId, "blocked");
        return {
          success: true,
          step: updated,
          requestState: "rejected" as const,
          agentState: "blocked" as const,
        };
      }

      // Approval — advance only when ALL steps are approved
      const allApproved = allSteps.every(
        (s) => s.id === input.stepId || s.state === "approved"
      );
      if (allApproved) {
        await repo.updatePublishRequestState({
          publishRequestId: step.publishRequestId,
          state: "approved",
        });
        await repo.updateAgentLifecycleState(request.agentId, "ready_to_publish");
        return {
          success: true,
          step: updated,
          requestState: "approved" as const,
          agentState: "ready_to_publish" as const,
        };
      }
      return { success: true, step: updated };
    }),
  withdrawRequest: protectedProcedure
    .input(withdrawPublishRequestSchema)
    .mutation(async ({ input }) => {
      await repo.updatePublishRequestState({
        publishRequestId: input.publishRequestId,
        state: "withdrawn",
      });
      return { success: true };
    }),
});

// ── Phase 0b: openllm-agent2 native parity sub-routers ──────────────────────

// ── Hooks (27 lifecycle events) ─────────────────────────────────────────────

const hooksRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listHooks(draft.id);
  }),
  save: protectedProcedure.input(saveHookSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    return repo.saveHook({
      hookId: input.hookId,
      draftId: draft.id,
      eventName: input.eventName,
      matcher: input.matcher,
      command: input.command,
      timeoutMs: input.timeoutMs,
      requiresApproval: input.requiresApproval,
      enabled: input.enabled,
    });
  }),
  remove: protectedProcedure.input(removeHookSchema).mutation(async ({ input }) => {
    await repo.removeHook(input.hookId);
    return { success: true };
  }),
});

// ── MCP servers ─────────────────────────────────────────────────────────────

const mcpRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listMcpServers(draft.id);
  }),
  save: protectedProcedure.input(saveMcpServerSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    return repo.saveMcpServer({
      serverId: input.serverId,
      draftId: draft.id,
      name: input.name,
      transport: input.transport,
      command: input.command,
      args: input.args,
      env: input.env,
      url: input.url,
      enabled: input.enabled,
    });
  }),
  remove: protectedProcedure
    .input(removeMcpServerSchema)
    .mutation(async ({ input }) => {
      await repo.removeMcpServer(input.serverId);
      return { success: true };
    }),
  // Stub: deterministic connection test (does NOT actually connect to the server)
  testConnection: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const server = await repo.getMcpServerById(input.serverId);
      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }
      return {
        ok: true,
        serverId: server.id,
        transport: server.transport,
        message: `Connection test simulated for ${server.transport} server "${server.name}"`,
      };
    }),
  // Phase 7: Real connect / disconnect / list. Spawns the child process
  // (stdio) or opens an HTTP client and stores the live connection in
  // a per-process map. governedProcedure on connect because spawning
  // child processes / opening sockets is sensitive — same trust level
  // as publish/archive.
  connect: governedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return mcpManager.connectMcpServer({ serverId: input.serverId });
    }),
  disconnect: governedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return mcpManager.disconnectMcpServer(input.serverId);
    }),
  listConnectedTools: protectedProcedure
    .input(agentIdSchema)
    .query(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) return [];
      return mcpManager.listConnectedTools(draft.id);
    }),
  listConnections: protectedProcedure.query(() => {
    return mcpManager.listConnections();
  }),
});

// ── Skills (attached from local catalog — adapter comes in Phase 0c) ────────

const skillsRouter = router({
  // ── Catalog (read-only, sourced from local vendored .md files) ──
  listCatalog: protectedProcedure.query(() => skillCatalog.listSkillCatalog()),
  listPacks: protectedProcedure.query(() => skillCatalog.listSkillPacks()),
  listSkillsInPack: protectedProcedure
    .input(z.object({ packKey: z.string().min(1) }))
    .query(({ input }) => skillCatalog.listSkillsInPack(input.packKey)),
  // ── Per-agent attached skills ──
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listSkills(draft.id);
  }),
  attach: protectedProcedure
    .input(attachSkillSchema)
    .mutation(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
      return repo.attachSkill({
        draftId: draft.id,
        packKey: input.packKey,
        skillKey: input.skillKey,
        skillName: input.skillName,
        allowedTools: input.allowedTools,
        blockedTools: input.blockedTools,
        requiresApproval: input.requiresApproval,
        argsSchema: input.argsSchema,
      });
    }),
  remove: protectedProcedure
    .input(removeSkillSchema)
    .mutation(async ({ input }) => {
      await repo.removeSkill(input.skillId);
      return { success: true };
    }),
});

// ── Subagents ───────────────────────────────────────────────────────────────

const subagentsRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listSubagents(draft.id);
  }),
  save: protectedProcedure
    .input(saveSubagentSchema)
    .mutation(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
      return repo.saveSubagent({
        subagentId: input.subagentId,
        draftId: draft.id,
        name: input.name,
        description: input.description,
        prompt: input.prompt,
        tools: input.tools,
        disallowedTools: input.disallowedTools,
        model: input.model,
        maxTurns: input.maxTurns,
        background: input.background,
        effort: input.effort,
        permissionMode: input.permissionMode,
        memory: input.memory,
        initialPrompt: input.initialPrompt,
        criticalSystemReminder: input.criticalSystemReminder,
      });
    }),
  remove: protectedProcedure
    .input(removeSubagentSchema)
    .mutation(async ({ input }) => {
      await repo.removeSubagent(input.subagentId);
      return { success: true };
    }),
});

// ── Plugins ─────────────────────────────────────────────────────────────────

const pluginsRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listPlugins(draft.id);
  }),
  save: protectedProcedure.input(savePluginSchema).mutation(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
    return repo.savePlugin({
      pluginId: input.pluginId,
      draftId: draft.id,
      type: input.type,
      path: input.path,
      enabled: input.enabled,
    });
  }),
  remove: protectedProcedure
    .input(removePluginSchema)
    .mutation(async ({ input }) => {
      await repo.removePlugin(input.pluginId);
      return { success: true };
    }),
  // Phase 9: validate a plugin path before enabling. Returns the parsed
  // manifest on success or a structured error. governedProcedure because
  // it reads arbitrary disk paths — same trust as MCP connect.
  validate: governedProcedure
    .input(validatePluginSchema)
    .mutation(async ({ input }) => {
      return validatePlugin({ agentId: input.agentId, path: input.path });
    }),
  // Load all enabled plugins for a draft + return merged contributions.
  // Read-only — protectedProcedure is fine.
  loadAll: protectedProcedure
    .input(agentIdSchema)
    .query(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) {
        return {
          loaded: [],
          errors: [],
          merged: { tools: [], hooks: [], mcpServers: [] },
        };
      }
      return loadPluginsForDraft({ agentId: input.agentId, draftId: draft.id });
    }),
});

// ── Permission rules ────────────────────────────────────────────────────────

const permissionRulesRouter = router({
  list: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const draft = await repo.getCurrentDraft(input.agentId);
    if (!draft) return [];
    return repo.listPermissionRules(draft.id);
  }),
  save: protectedProcedure
    .input(savePermissionRuleSchema)
    .mutation(async ({ input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "No draft" });
      return repo.savePermissionRule({
        ruleId: input.ruleId,
        draftId: draft.id,
        ruleSource: input.ruleSource,
        ruleBehavior: input.ruleBehavior,
        toolPattern: input.toolPattern,
        contentPattern: input.contentPattern,
        description: input.description,
      });
    }),
  remove: protectedProcedure
    .input(removePermissionRuleSchema)
    .mutation(async ({ input }) => {
      await repo.removePermissionRule(input.ruleId);
      return { success: true };
    }),
});

// ── Runtime config (the 8 new draft columns from Phase 0a) ─────────────────

const runtimeRouter = router({
  get: protectedProcedure.input(agentIdSchema).query(async ({ input }) => {
    const config = await repo.getRuntimeConfig(input.agentId);
    if (config === null) {
      return {
        effort: null,
        maxTurns: null,
        background: false,
        initialPrompt: null,
        criticalSystemReminder: null,
        permissionMode: null,
        workingDirectories: [],
        providerConfig: {},
      };
    }
    return config;
  }),
  update: protectedProcedure
    .input(updateRuntimeConfigSchema)
    .mutation(async ({ input }) => {
      return repo.updateRuntimeConfig(input.agentId, {
        effort: input.effort,
        maxTurns: input.maxTurns,
        background: input.background,
        initialPrompt: input.initialPrompt,
        criticalSystemReminder: input.criticalSystemReminder,
        permissionMode: input.permissionMode,
        workingDirectories: input.workingDirectories,
        providerConfig: input.providerConfig,
        // Phase 12: presentation
        outputStyle: input.outputStyle,
        statusLineConfig: input.statusLineConfig,
        theme: input.theme,
      });
    }),
  // Phase 10: schedule CRUD. setSchedule writes the full config jsonb;
  // getSchedule reads it. The 60s scheduler tick picks up changes on its
  // next iteration.
  getSchedule: protectedProcedure
    .input(agentIdSchema)
    .query(async ({ input }) => {
      const config = await repo.getScheduleConfig(input.agentId);
      return (
        config ?? {
          enabled: false,
          cron: "",
          timezone: "UTC",
          payload: {},
        }
      );
    }),
  setSchedule: protectedProcedure
    .input(setScheduleConfigSchema)
    .mutation(async ({ input }) => {
      return repo.updateScheduleConfig(input.agentId, {
        enabled: input.enabled,
        cron: input.cron,
        timezone: input.timezone,
        payload: input.payload ?? {},
      });
    }),
});

// ── Phase 3: Interactive permission requests ────────────────────────────────

/**
 * Surfaces pending permission requests created by the simulation engine
 * when a permission rule resolves to "ask". The runs page polls
 * `listPending` while a run is live and fires `decide` when a human
 * clicks Allow / Deny.
 *
 * Mutations are `protectedProcedure` (not governed) — the rule itself is
 * the governance gate; the human is just answering it.
 */
const permissionsRouter = router({
  listPending: protectedProcedure
    .input(listPendingPermissionRequestsSchema)
    .query(async ({ input }) => {
      return repo.listPendingPermissionRequests(input.runtimeRunId);
    }),
  decide: protectedProcedure
    .input(decidePermissionRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await repo.decidePendingPermissionRequest({
        requestId: input.requestId,
        status: input.allowed ? "allowed" : "denied",
        decidedBy: ctx.user.id,
        reason: input.reason,
      });
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Permission request ${input.requestId} not found`,
        });
      }
      return updated;
    }),
});

// ── Phase 6: Slash command executor ─────────────────────────────────────────

/**
 * Operator commands typed against a live runtime run. The parser is
 * permissive — non-slash inputs return null and the procedure surfaces a
 * structured "not a command" message so the UI can fall through.
 *
 * Most commands are read-only or scoped to the user's own run; the only
 * destructive ones (`/cancel`, `/cwd`) write to the run/draft owned by
 * the caller. `protectedProcedure` is the right gate — same trust level
 * as the rest of the runtime CRUD.
 */
const slashCommandsRouter = router({
  execute: protectedProcedure
    .input(executeSlashCommandSchema)
    .mutation(async ({ input }) => {
      const result = await parseAndExecuteSlashCommand({
        runtimeRunId: input.runtimeRunId,
        rawInput: input.rawInput,
      });
      if (!result) {
        return {
          ok: false,
          parsed: false as const,
          message: `Not a slash command: ${input.rawInput}`,
        };
      }
      return { parsed: true as const, ...result };
    }),
});

// ── Phase 13: Catalog (skills + tools) ──────────────────────────────────────

/**
 * User-authored skills catalog. Vendored .md skills (the 19 from
 * Phase 0c) and DB-backed user creations are merged in listMerged().
 *
 * `validate` is a dry-run check the UI calls before save so the user
 * gets immediate feedback (e.g., "tool name 'BashTool' not found in
 * registry"). Stricter than upstream openclaude — see
 * services/catalog-skills.ts header.
 */
const catalogSkillsRouter = router({
  listMerged: protectedProcedure
    .input(listCatalogSkillsSchema)
    .query(async ({ input }) => {
      return catalogSkillsService.listMergedSkills(input);
    }),
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return repo.getCatalogSkillById(input.id);
    }),
  create: protectedProcedure
    .input(createCatalogSkillSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await catalogSkillsService.createCatalogSkill({
          ...input,
          createdBy: ctx.user.id,
          source: "db",
        });
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  update: protectedProcedure
    .input(updateCatalogSkillSchema)
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      try {
        const updated = await catalogSkillsService.updateCatalogSkill(id, patch);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `catalog skill ${id} not found`,
          });
        }
        return updated;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  remove: protectedProcedure
    .input(removeCatalogSkillSchema)
    .mutation(async ({ input }) => {
      const result = await catalogSkillsService.removeCatalogSkill(input.id);
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "remove failed",
        });
      }
      return { success: true };
    }),
  validate: protectedProcedure
    .input(validateCatalogSkillSchema)
    .mutation(async ({ input }) => {
      return catalogSkillsService.validateCatalogSkill(input);
    }),
  // Phase 13d: batch .md file import. The client uses a file picker
  // (FileReader) to read each file, then POSTs an array of
  // {fileName, content}. Per-file results are returned so the UI can
  // render a table of imported / failed / overwritten outcomes.
  importFromMarkdown: protectedProcedure
    .input(importSkillMarkdownSchema)
    .mutation(async ({ ctx, input }) => {
      return importSkillsFromMarkdown({
        files: input.files,
        packKey: input.packKey,
        overwrite: input.overwrite ?? false,
        createdBy: ctx.user.id,
      });
    }),
});

// ── Phase 13c: Catalog tools sub-router ─────────────────────────────────────

/**
 * User-authored tools catalog. Merged with the static built-in 51 and
 * MCP-discovered tools (when a draftId is supplied).
 *
 * Trust levels (per Decision #2):
 *   - listMerged / get / validate → protectedProcedure (read or dry-run)
 *   - create / update / remove   → governedProcedure (shell/http kinds
 *                                   create executable command surfaces;
 *                                   same sensitivity as MCP connect)
 */
const catalogToolsRouter = router({
  listMerged: protectedProcedure
    .input(listCatalogToolsSchema)
    .query(async ({ input }) => {
      return catalogToolsService.listMergedTools(input);
    }),
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return repo.getCatalogToolById(input.id);
    }),
  create: governedProcedure
    .input(createCatalogToolSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await catalogToolsService.createCatalogTool({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  update: governedProcedure
    .input(updateCatalogToolSchema)
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      try {
        const updated = await catalogToolsService.updateCatalogTool(id, patch);
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `catalog tool ${id} not found`,
          });
        }
        return updated;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  remove: governedProcedure
    .input(removeCatalogToolSchema)
    .mutation(async ({ input }) => {
      const result = await catalogToolsService.removeCatalogTool(input.id);
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "remove failed",
        });
      }
      return { success: true };
    }),
  validate: protectedProcedure
    .input(validateCatalogToolSchema)
    .mutation(async ({ input }) => {
      return catalogToolsService.validateCatalogTool(input);
    }),
});

// ── Compose ─────────────────────────────────────────────────────────────────

export const agentStudioRouter = router({
  home: homeRouter,
  creation: creationRouter,
  shell: shellRouter,
  identity: identityRouter,
  behavior: behaviorRouter,
  prompts: promptsRouter,
  tools: toolsRouter,
  knowledge: knowledgeRouter,
  memory: memoryRouter,
  workflows: workflowsRouter,
  governance: governanceRouter,
  simulation: simulationRouter,
  testing: testingRouter,
  runs: runsRouter,
  versions: versionsRouter,
  publish: publishRouter,
  // Phase 0b: openllm-agent2 native parity sub-routers
  hooks: hooksRouter,
  mcp: mcpRouter,
  skills: skillsRouter,
  subagents: subagentsRouter,
  plugins: pluginsRouter,
  permissionRules: permissionRulesRouter,
  runtime: runtimeRouter,
  // Phase 3: interactive permission requests
  permissions: permissionsRouter,
  // Phase 6: slash command executor
  slashCommands: slashCommandsRouter,
  // Phase 13: Catalog (skills + tools)
  catalogSkills: catalogSkillsRouter,
  catalogTools: catalogToolsRouter,
});
