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
import { router, protectedProcedure, adminProcedure, governedProcedure } from "../../_core/trpc";
import { getAuditLogger } from "../../services/auditLogger";
import * as repo from "../repository";
import * as readinessSvc from "../services/readiness";
import * as govSvc from "../services/governance-adapter";
import * as simSvc from "../services/simulation";
import * as testSvc from "../services/testing";
import * as versionSvc from "../services/versioning";
// H1-c6 (cycle-6 audit closure §H1-c6): permissions.decide migrated
// from `repo.decidePendingPermissionRequest` (no audit row) to
// `decideApprovalRequest` (writes the agsRuntimePolicyEvents
// state-transition row per D-APP-EXT-6 + emits the resume bus event).
// Pre-cycle-6 the legacy path bypassed the canonical audit ledger.
// Mirrors cycle-4 C1-c4 — different operator surface, same gap shape.
import { decideApprovalRequest } from "../services/approval/approval-gate";
import * as toolCatalog from "../adapters/tool-catalog-adapter";
import * as knowledgeAdapter from "../adapters/knowledge-adapter";
import * as templateRegistry from "../adapters/template-registry";
import * as skillCatalog from "../adapters/skill-catalog-adapter";
import * as catalogSkillsService from "../services/catalog-skills";
import * as catalogToolsService from "../services/catalog-tools";
import { cloneAgent } from "../services/cloning";
import * as marketplaceService from "../services/marketplace";
import {
  installMarketplaceItem,
  uninstallMarketplaceItem,
} from "../services/marketplace-installer";
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
import { providerBindingsRouter } from "./provider-bindings-router";
import { workspaceDefaultBindingsRouter } from "./workspace-default-bindings-router";
import { cagRouter } from "./cag-router";
import { racSourcesRouter } from "./rac-sources-router";
import { racIngestionRouter } from "./rac-ingestion-router";
import { ingestionRouter } from "./ingestion-router";
import { graphChangeRouter } from "./graph-change-router";
import { racTraceRouter } from "./rac-trace-router";
import { racEvaluationRouter } from "./rac-evaluation-router";
import { kbRouter } from "./kb-router";
import { toolKnowledgeRouter } from "./tool-knowledge-router";
import { mcpSchemaSyncRouter } from "./mcp-schema-sync-router";
import { toolApprovalsRouter } from "./tool-approvals-router";
import { graphSkillRouter } from "./graph-skill-router";
import { graphAgentRouter } from "../services/graph-agent/router";
import { workspaceObservabilityRouter } from "../services/workspace-observability/router";
import { graphCorrectionRouter } from "../services/graph-correction/router";
import { graphQualityRouter } from "../services/graph-quality/router";
import {
  agentIdSchema,
  archiveAgentSchema,
  attachSkillSchema,
  attachToolSchema,
  cloneAgentSchema,
  compactRunSchema,
  createCatalogSkillSchema,
  createCatalogToolSchema,
  exchangeMcpOAuthSchema,
  initiateMcpOAuthSchema,
  listCatalogSkillsSchema,
  listCatalogToolsSchema,
  removeCatalogSkillSchema,
  removeCatalogToolSchema,
  updateCatalogSkillSchema,
  updateCatalogToolSchema,
  importSkillMarkdownSchema,
  installMarketplaceItemSchema,
  listMarketplaceItemsSchema,
  getMarketplaceItemSchema,
  publishMarketplaceItemSchema,
  refreshMarketplaceRegistrySchema,
  uninstallMarketplaceItemSchema,
  unpublishMarketplaceItemSchema,
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
import { captureUnexpectedTrpcError } from "../services/workspace-observability/public-api";

/**
 * Fire-and-forget observability capture before throwing the TRPCError.
 * 8th router on the trpc-error-capture chain (top-level agentStudio.*
 * surface; the leaf service routers wired in #490–#511 cover the
 * sub-routers — this one covers the home/identity/behavior/prompts/
 * tools/knowledge/memory/workflows/governance/simulation/testing/runs/
 * versions/publish lanes).
 */
function throwTrpcAndCapture(trpcErr: TRPCError): never {
  void captureUnexpectedTrpcError("agentStudio.api.router", trpcErr);
  throw trpcErr;
}

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
    throwTrpcAndCapture(new TRPCError({
      code: "CONFLICT",
      message: "An agent with that internal key already exists. Pick a unique key.",
    }));
  }
  throwTrpcAndCapture(new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: msg,
  }));
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
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Template not found: ${input.templateKey}`,
        }));
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
    if (!agent) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Agent not found" }));
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
    if (!agent) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Agent not found" }));
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
    if (!agent) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Agent not found" }));
    const draft = await repo.getCurrentDraft(input.agentId);
    return { agent, draft };
  }),
  update: protectedProcedure.input(updateIdentitySchema).mutation(async ({ input }) => {
    const agent = await repo.getAgentById(input.agentId);
    if (!agent) {
      throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Agent not found" }));
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Binding not found" }));
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
      if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
    if (!run) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Simulation run not found" }));
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
      if (!run) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Simulation run not found" }));

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

  // ── Retention (Phase 22 follow-up #649 + #650 + #651) ────────────
  //
  // Operator surface for `ags_simulation_runs` retention. Sister of
  // `runs.pruneRetention` (#623), `runs.pruneToolCallTracesRetention`
  // (#627), `mcp.pruneTransitionsRetention` (#631),
  // `catalogSyncLog.pruneRetention` (#635), `racTrace.pruneRetention`
  // (#640), `cag.pruneEventsRetention` (#647). adminProcedure because
  // the cron + sweep operate across all agents/scenarios.
  pruneRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "queued",
                "running",
                "passed",
                "failed",
                "cancelled",
              ]),
            )
            .max(5)
            .optional(),
          agentId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          scenarioId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldSimulationRuns } = await import(
        "../services/simulation-runs-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldSimulationRuns({
        olderThan,
        statuses: input?.statuses,
        agentId: input?.agentId,
        scenarioId: input?.scenarioId,
      });
    }),
  getRetentionCronStatus: adminProcedure.query(async () => {
    const { getSimulationRunsRetentionCronStatus } = await import(
      "../services/simulation-runs-retention-cron"
    );
    return getSimulationRunsRetentionCronStatus();
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
      if (!suite) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Suite not found" }));
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
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Test run not found" }));
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

  // ── Retention (Phase 22 follow-up #653 + #654 + #655) ────────────
  //
  // Operator surface for `ags_test_runs` retention. Sister of
  // `runs.pruneRetention` (#623), `simulation.pruneRetention` (#651).
  // adminProcedure because the cron + sweep operate across all
  // suites/agents.
  pruneRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "queued",
                "running",
                "passed",
                "failed",
                "cancelled",
              ]),
            )
            .max(5)
            .optional(),
          agentId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          suiteId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldTestRuns } = await import(
        "../services/test-runs-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldTestRuns({
        olderThan,
        statuses: input?.statuses,
        agentId: input?.agentId,
        suiteId: input?.suiteId,
      });
    }),
  getRetentionCronStatus: adminProcedure.query(async () => {
    const { getTestRunsRetentionCronStatus } = await import(
      "../services/test-runs-retention-cron"
    );
    return getTestRunsRetentionCronStatus();
  }),
});

// ── Runs / Traces ───────────────────────────────────────────────────────────

const runsRouter = router({
  list: protectedProcedure.input(listRunsSchema).query(async ({ input }) => {
    return repo.listRuntimeRuns(input.agentId, input.limit);
  }),
  getDetail: protectedProcedure.input(getRunDetailSchema).query(async ({ input }) => {
    const run = await repo.getRuntimeRunById(input.runId);
    if (!run) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Runtime run not found" }));
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
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Run not found" }));
      }
      return tree;
    }),

  // ── Retention (Phase 22 follow-up #621 + #622 + #623) ─────────────
  //
  // Admin-only sweep + status surface for ags_runtime_runs +
  // ags_runtime_run_steps. The cron (#622) fires on its own; these
  // procedures let an operator (a) fire a sweep on demand and
  // (b) inspect the last-run state of the cron from the UI without
  // tailing logs.
  //
  // adminProcedure (not protected) because cron state isn't workspace-
  // scoped and the sweep deletes rows across all workspaces. Operators
  // doing cross-tenant ops monitoring shouldn't be filtered by their
  // own workspace membership.
  pruneRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "queued",
                "pending",
                "running",
                "awaiting_approval",
                "completed",
                "failed",
                "cancelled",
              ]),
            )
            .max(7)
            .optional(),
          agentId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          environment: z
            .union([
              z.string().min(1).max(32),
              z.array(z.string().min(1).max(32)).max(10),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldRuntimeRuns } = await import(
        "../services/runtime-runs-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldRuntimeRuns({
        olderThan,
        statuses: input?.statuses,
        agentId: input?.agentId,
        environment: input?.environment,
      });
    }),
  getRetentionCronStatus: adminProcedure.query(async () => {
    const { getRuntimeRunsRetentionCronStatus } = await import(
      "../services/runtime-runs-retention-cron"
    );
    return getRuntimeRunsRetentionCronStatus();
  }),

  // ── Tool-call-traces retention (Phase 22 follow-up #625 + #626 + #627) ──
  //
  // Sister of runs.pruneRetention / runs.getRetentionCronStatus on the
  // ags_tool_call_traces table. Same adminProcedure pattern + same
  // shape conventions. dispatchResults filter defaults to ["ok"] on
  // the service side (forensic-preserving — see #625 doc-block).
  pruneToolCallTracesRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          dispatchResults: z
            .array(z.enum(["ok", "error", "blocked"]))
            .max(3)
            .optional(),
          workspaceId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          agentId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldToolCallTraces } = await import(
        "../services/tool-call-traces-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldToolCallTraces({
        olderThan,
        dispatchResults: input?.dispatchResults,
        workspaceId: input?.workspaceId,
        agentId: input?.agentId,
      });
    }),
  getToolCallTracesRetentionCronStatus: adminProcedure.query(async () => {
    const { getToolCallTracesRetentionCronStatus } = await import(
      "../services/tool-call-traces-retention-cron"
    );
    return getToolCallTracesRetentionCronStatus();
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
  // Phase 19 follow-up pattern: downgraded from governedProcedure to
  // protectedProcedure. Root cause: Agent Studio tRPC paths are never
  // registered in server/governance/action-key-map.ts, so governedProcedure
  // was deny-by-defaulting every rollback click with "This action is
  // restricted for your current account or role." The proper long-term
  // fix is to register ags paths in the action registry; this downgrade
  // matches what 43af4d9 did for mcp.connect/disconnect/oauth* and
  // preserves the versioning service's own ownership verification.
  rollback: protectedProcedure
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
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: msg }));
        }
        if (/does not belong/i.test(msg)) {
          throwTrpcAndCapture(new TRPCError({ code: "FORBIDDEN", message: msg }));
        }
        throwTrpcAndCapture(new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg }));
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
  // Phase 19 follow-up pattern: downgraded from governedProcedure to
  // protectedProcedure (see rollback above for rationale). The in-
  // handler governance verdict check at step 3 still runs, so blocked
  // agents continue to be rejected — we just bypass the action-registry
  // lookup that was deny-by-defaulting every publish click.
  publishVersion: protectedProcedure
    .input(publishVersionSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Verify the version exists AND belongs to this agent
      const version = await repo.getVersionById(input.versionId);
      if (!version) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Version ${input.versionId} not found`,
        }));
      }
      if (version.agentId !== input.agentId) {
        throwTrpcAndCapture(new TRPCError({
          code: "FORBIDDEN",
          message: `Version ${input.versionId} does not belong to agent ${input.agentId}`,
        }));
      }

      // 2. Readiness gate
      const readiness = await readinessSvc.computeReadiness(input.agentId);
      if (!readiness.publishReady) {
        throwTrpcAndCapture(new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Agent not ready to publish — score=${readiness.score}, blockers=${readiness.blockers.length}`,
        }));
      }

      // 3. Governance verdict gate — preserved from the old
      // governedProcedure implementation so BLOCKED verdicts still stop
      // the publish even though the platform-level middleware was
      // downgraded.
      const governance = await govSvc.evaluateGovernance(input.agentId);
      if (governance.verdict === "blocked") {
        throwTrpcAndCapture(new TRPCError({
          code: "FORBIDDEN",
          message: "Governance verdict is BLOCKED — cannot publish",
        }));
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
  // Phase 19 follow-up pattern: downgraded from governedProcedure.
  // Archive is lifecycle_state = "archived" on the agent row — a
  // reversible state change, not a destructive data delete.
  archive: protectedProcedure.input(archiveAgentSchema).mutation(async ({ input }) => {
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
  // C1-c4 — Publish-workflow approval decision. Was protectedProcedure
  // since Phase 19 with the framing that the per-agent lifecycle state
  // machine was the enforcement surface. Cycle-4 audit
  // (/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md §C1-c4) flagged this:
  // the state machine enforces transition order, not who is allowed to
  // decide, and zero audit rows were emitted, leaving the procedure
  // governance-blind. Now governedProcedure (so RBAC + freeze checks
  // run via the tRPC middleware) and writes a LIFECYCLE_TRANSITION
  // governance_audit_logs row per state change (rejected, all-approved,
  // single-step-approved). agsRuntimePolicyEvents is not used here
  // because that table requires a runtime run ID and publish-workflow
  // approvals are not bound to a runtime run.
  decideApproval: governedProcedure
    .input(decideApprovalStepSchema)
    .mutation(async ({ ctx, input }) => {
      const audit = getAuditLogger();
      const step = await repo.getApprovalStepById(input.stepId);
      if (!step) {
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "Approval step not found" }));
      }
      if (step.state !== "pending") {
        throwTrpcAndCapture(new TRPCError({
          code: "CONFLICT",
          message: `Step already decided (state=${step.state})`,
        }));
      }
      const updated = await repo.decideApprovalStep({
        stepId: input.stepId,
        state: input.decision,
        decidedBy: ctx.user.id,
        decisionNote: input.note,
      });
      if (!updated) {
        throwTrpcAndCapture(new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Decision failed" }));
      }

      // Roll up to the publish request
      const allSteps = await repo.listApprovalSteps(step.publishRequestId);
      const request = await repo.getPublishRequestById(step.publishRequestId);
      if (!request) {
        await audit.log({
          actor_id: String(ctx.user.id),
          action_type: "LIFECYCLE_TRANSITION",
          target_type: "publish_approval_step",
          target_id: String(input.stepId),
          decision_result: "success",
          metadata: {
            stepDecision: input.decision,
            publishRequestId: step.publishRequestId,
            note: "publish_request_missing_no_rollup",
          },
        }).catch(() => {});
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
        await audit.log({
          actor_id: String(ctx.user.id),
          action_type: "LIFECYCLE_TRANSITION",
          target_type: "publish_approval_step",
          target_id: String(input.stepId),
          decision_result: "denied",
          metadata: {
            stepDecision: "rejected",
            publishRequestId: step.publishRequestId,
            agentId: request.agentId,
            requestState: "rejected",
            agentState: "blocked",
          },
        }).catch(() => {});
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
        await audit.log({
          actor_id: String(ctx.user.id),
          action_type: "LIFECYCLE_TRANSITION",
          target_type: "publish_approval_step",
          target_id: String(input.stepId),
          decision_result: "success",
          metadata: {
            stepDecision: "approved",
            publishRequestId: step.publishRequestId,
            agentId: request.agentId,
            requestState: "approved",
            agentState: "ready_to_publish",
          },
        }).catch(() => {});
        return {
          success: true,
          step: updated,
          requestState: "approved" as const,
          agentState: "ready_to_publish" as const,
        };
      }
      await audit.log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "publish_approval_step",
        target_id: String(input.stepId),
        decision_result: "success",
        metadata: {
          stepDecision: "approved",
          publishRequestId: step.publishRequestId,
          agentId: request.agentId,
          rollup: "partial",
        },
      }).catch(() => {});
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
        throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" }));
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
  // a per-process map.
  //
  // Phase 19 follow-up: downgraded from governedProcedure to
  // protectedProcedure. The platform action registry doesn't have
  // `agentStudio.mcp.connect` / `agentStudio.mcp.disconnect` mappings
  // (no agentStudio.* keys are registered at all in
  // server/governance/action-key-map.ts), so governedProcedure was
  // hitting deny-by-default and bouncing every Connect button click
  // with "this action is restricted for your current account".
  //
  // Connect/disconnect are module-internal operations: the user has
  // already authorized the row by attaching it via mcp.save (also
  // protectedProcedure), and clicking Connect just spawns the child
  // process they configured. Phase 19a's dispatcher chokepoint already
  // governs every actual MCP TOOL call via evaluateMcpPreInvoke /
  // PostInvoke + audit row writes — that's where the per-call
  // governance enforcement lives now, not at the connect lifecycle.
  connect: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return mcpManager.connectMcpServer({ serverId: input.serverId });
    }),
  disconnect: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return mcpManager.disconnectMcpServer(input.serverId);
    }),
  // MCP hardening Phase 3.1: enable / disable a server. Both flip the
  // `enabled` boolean column AND drive the FSM through enable_requested
  // / disable_requested. Direct UPDATEs of the column elsewhere are
  // forbidden — they'd leave the FSM out of sync.
  enable: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await mcpManager.enableMcpServer(input.serverId);
      return { ok: true };
    }),
  disable: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await mcpManager.disableMcpServer(input.serverId);
      return { ok: true };
    }),
  // MCP hardening Phase 5.2: admin force-purge for wedged rows.
  // Clears live connection + FSM + registry, resets DB column to
  // pending. Operational reset only — does NOT change `enabled`.
  purge: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await mcpManager.purgeMcpServer(input.serverId);
      return { ok: true };
    }),
  // MCP hardening Phase 5.1: read the recent FSM transitions for one
  // server. Bounded to the last 100 by default so the response stays
  // small.
  getTransitionHistory: protectedProcedure
    .input(
      z.object({
        serverId: z.number().int().positive(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      return repo.listMcpTransitions(input.serverId, input.limit ?? 100);
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
  // Phase 19b: rich connection state from the FSM. Returns the
  // discriminated union (pending/connecting/connected/needs_auth/
  // failed/disabled) instead of the plain status string. The UI
  // uses this to render in-flight indicators (connecting spinner,
  // failed retry countdown, needs_auth banner with OAuth button).
  getServerState: protectedProcedure
    .input(z.object({ serverId: z.number().int().positive() }))
    .query(({ input }) => {
      return {
        serverId: input.serverId,
        state: mcpManager.getConnectionState(input.serverId),
      };
    }),
  getAllServerStates: protectedProcedure.query(() => {
    return mcpManager.getAllConnectionStates();
  }),
  // Phase 19 follow-up: global MCP Manager snapshot. Joins every
  // ags_draft_mcp_servers row with its in-memory FSM state + connection
  // metadata into a single response. Used by the global "MCP Manager"
  // page in the Agent Studio home sidebar — gives ops visibility into
  // every attached server across every draft without having to navigate
  // into each agent individually.
  getManagerSnapshot: protectedProcedure.query(async () => {
    const rows = await repo.listAllMcpServers();
    const states = new Map(
      mcpManager.getAllConnectionStates().map((s) => [s.serverId, s.state])
    );
    const liveConns = new Map(
      mcpManager.listConnections().map((c) => [c.serverId, c])
    );
    return {
      generatedAt: Date.now(),
      totalServers: rows.length,
      totalConnected: liveConns.size,
      servers: rows.map((row) => {
        const state = states.get(row.id) ?? { kind: "pending" as const };
        const live = liveConns.get(row.id);
        return {
          id: row.id,
          draftId: row.draftId,
          name: row.name,
          transport: row.transport,
          command: row.command,
          url: row.url,
          enabled: row.enabled,
          columnStatus: row.status,
          state,
          live: live
            ? {
                transport: live.transport,
                toolCount: live.toolCount,
              }
            : null,
        };
      }),
    };
  }),
  // ── Phase 15b: OAuth flow ──────────────────────────────────────────────
  //
  // Phase 19 follow-up: downgraded from governedProcedure to
  // protectedProcedure for the same reason as connect/disconnect above —
  // the platform action registry has no agentStudio.* mappings, so
  // governedProcedure was deny-by-defaulting every OAuth click. The
  // tokens themselves are still stored encrypted at rest via the
  // platform encryption helper (the documented cross-module exception)
  // and the OAuth flow runs entirely against the user's own MCP server
  // — no platform-level state is mutated by initiate/exchange.
  oauthInitiate: protectedProcedure
    .input(initiateMcpOAuthSchema)
    .mutation(async ({ input }) => {
      const { buildAuthorizationUrl } = await import("../services/mcp/auth");
      const result = buildAuthorizationUrl(input.config);
      // Persist config + state on the MCP server row so the exchange
      // procedure can find them by serverId. Encryption-at-rest TODO:
      // wire encryptString/decryptString here when we ship secrets to
      // production deployments.
      const server = await repo.getMcpServerById(input.serverId);
      if (!server) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `MCP server ${input.serverId} not found`,
        }));
      }
      await repo.updateMcpServerOAuth(input.serverId, {
        oauthConfig: input.config as Record<string, unknown>,
        oauthState: result.state as unknown as Record<string, unknown>,
      });
      return {
        authorizationUrl: result.authorizationUrl,
        state: result.state.state,
      };
    }),
  oauthExchange: protectedProcedure
    .input(exchangeMcpOAuthSchema)
    .mutation(async ({ input }) => {
      const { exchangeCodeForTokens } = await import("../services/mcp/auth");
      const server = await repo.getMcpServerById(input.serverId);
      if (!server) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `MCP server ${input.serverId} not found`,
        }));
      }
      const config = (server as any).oauthConfig as
        | Record<string, unknown>
        | null;
      const state = (server as any).oauthState as
        | Record<string, unknown>
        | null;
      if (!config || !state) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message:
            "OAuth flow not initiated for this server — call oauthInitiate first",
        }));
      }
      // Defeat CSRF: the state from the provider must match what we
      // generated at initiate time.
      if (input.state !== (state as any).state) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: "OAuth state mismatch — possible CSRF attempt",
        }));
      }
      let tokens;
      try {
        tokens = await exchangeCodeForTokens({
          config: config as any,
          code: input.code,
          codeVerifier: (state as any).codeVerifier,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
      // Phase 17c: encrypt tokens at rest using the platform helper.
      // This is the documented cross-module import exception (the plan
      // explicitly authorizes use of server/_core/encryption.ts for
      // secret storage). The tokens object is JSON-stringified, then
      // encrypted, then stored as a single ciphertext string in
      // oauthState.encryptedTokens. The plain `tokens` field is NOT
      // persisted.
      const { encrypt } = await import("../../_core/encryption");
      const encryptedTokens = encrypt(JSON.stringify(tokens));
      await repo.updateMcpServerOAuth(input.serverId, {
        oauthState: {
          ...(state as Record<string, unknown>),
          encryptedTokens,
          tokenExpiresAt: tokens.expiresAt ?? null,
        },
      });
      // MCP hardening Phase 1.2: tell the FSM the OAuth flow finished
      // and trigger a reconnect. Without this, the row would stay
      // `needs_auth` until the user manually clicked Connect — and the
      // auto-reconnect loop ignores `needs_auth` (it only retries
      // `error`-status rows). Both calls are best-effort: the OAuth
      // exchange itself succeeded, so we never want to fail the
      // mutation if the FSM/connect path stumbles.
      try {
        await mcpManager.notifyAuthProvided(input.serverId);
      } catch {
        /* FSM apply failure is non-fatal here */
      }
      mcpManager
        .connectMcpServer({ serverId: input.serverId })
        .catch(() => {
          /* connect failure is non-fatal — auto-reconnect loop will
             pick the row up if it lands in `error` */
        });
      return { ok: true, expiresAt: tokens.expiresAt ?? null };
    }),

  // ── Transitions retention (Phase 22 follow-up #629 + #630 + #631) ───
  //
  // Admin sweep + status surface for ags_mcp_transitions. Mirrors
  // runs.pruneRetention / runs.getRetentionCronStatus on the
  // mcp-transitions table. Cron (#630) fires daily 06:00 UTC; these
  // procedures let an operator fire on-demand sweeps + monitor the
  // cron from the UI.
  pruneTransitionsRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          serverId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldMcpTransitions } = await import(
        "../services/mcp-transitions-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldMcpTransitions({
        olderThan,
        serverId: input?.serverId,
      });
    }),
  getTransitionsRetentionCronStatus: adminProcedure.query(async () => {
    const { getMcpTransitionsRetentionCronStatus } = await import(
      "../services/mcp-transitions-retention-cron"
    );
    return getMcpTransitionsRetentionCronStatus();
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
      if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
      if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
    if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
      if (!draft) throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: "No draft" }));
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
      // H1-c6: route through `decideApprovalRequest` so the
      // canonical audit row is written + the resume bus event fires.
      // The service writes a rejection-audit row when the row is
      // already terminal (M5-c4 closure — concurrent-decide
      // forensics).
      await decideApprovalRequest({
        approvalRequestId: input.requestId,
        status: input.allowed ? "allowed" : "denied",
        decidedBy: ctx.user.id,
        reason: input.reason ?? null,
      });
      // Re-read the row to preserve the legacy return shape
      // (`agsPendingPermissionRequests.$inferSelect` — clients of the
      // `permissions.decide` mutation expect the full row, not the
      // service's `{ok, status, expiresAt, reason}` projection).
      const row = await repo.getPendingPermissionRequestById(input.requestId);
      if (!row) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Permission request ${input.requestId} not found`,
        }));
      }
      return row;
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
 * registry"). Stricter than the upstream coding-agent reference — see
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
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  update: protectedProcedure
    .input(updateCatalogSkillSchema)
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      try {
        const updated = await catalogSkillsService.updateCatalogSkill(id, patch);
        if (!updated) {
          throwTrpcAndCapture(new TRPCError({
            code: "NOT_FOUND",
            message: `catalog skill ${id} not found`,
          }));
        }
        return updated;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  remove: protectedProcedure
    .input(removeCatalogSkillSchema)
    .mutation(async ({ input }) => {
      const result = await catalogSkillsService.removeCatalogSkill(input.id);
      if (!result.ok) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "remove failed",
        }));
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
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  update: governedProcedure
    .input(updateCatalogToolSchema)
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      try {
        const updated = await catalogToolsService.updateCatalogTool(id, patch);
        if (!updated) {
          throwTrpcAndCapture(new TRPCError({
            code: "NOT_FOUND",
            message: `catalog tool ${id} not found`,
          }));
        }
        return updated;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  remove: governedProcedure
    .input(removeCatalogToolSchema)
    .mutation(async ({ input }) => {
      const result = await catalogToolsService.removeCatalogTool(input.id);
      if (!result.ok) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "remove failed",
        }));
      }
      return { success: true };
    }),
  validate: protectedProcedure
    .input(validateCatalogToolSchema)
    .mutation(async ({ input }) => {
      return catalogToolsService.validateCatalogTool(input);
    }),
});

// ── Phase 14: Marketplace sub-router ────────────────────────────────────────

/**
 * Agent Studio's own marketplace. Local-first, ONE official registry
 * URL hardcoded in the service. Per Decision #7, publishing to a remote
 * registry is "file a PR" — there's no API for it.
 *
 * Trust levels:
 *   - list / get / listCollections      → protectedProcedure (read-only)
 *   - publish / unpublish                → protectedProcedure (local DB)
 *   - refresh (network fetch of registry) → governedProcedure
 *   - install / uninstall                 → protectedProcedure (Phase 14d)
 */

// ── Phase 19 follow-up: Chat ──────────────────────────────────────────────
//
// Dedicated multi-turn chat interface for Agent Studio agents, like
// OpenCode's chat view but scoped to ags_* agents. Persists sessions
// and messages in asdb, calls the model via
// `openRouter.modelAccess.execute` through the platform gateway
// (Phase 29.0a — replaces the legacy `runViaOpenAIDirect` adapter
// path that simulation also used to share).
//
// Trust level: protectedProcedure for everything (chat is a local
// interaction, not a governed mutation — the per-call governance
// chokepoint lives inside the dispatcher which the chat service
// bypasses for the MVP since there are no tool calls yet).
const chatRouter = router({
  listSessions: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return repo.listChatSessions(input.agentId);
    }),
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return repo.getChatSessionById(input.sessionId);
    }),
  listMessages: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return repo.listChatMessages(input.sessionId);
    }),
  startSession: protectedProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { startChatSession } = await import("../services/chat");
      return startChatSession(input);
    }),
  sendMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        userMessage: z.string().min(1),
        // Plan v3 Phase 17 — used by the binding-driven Model Access
        // path to stamp the call with the correct workspace. Optional
        // for backward compat; defaults to the demo-workspace constant
        // inside the service.
        workspaceId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sendChatMessage } = await import("../services/chat");
      return sendChatMessage(
        { sessionId: input.sessionId, userMessage: input.userMessage },
        { workspaceId: input.workspaceId, actorId: ctx.user.id },
      );
    }),
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await repo.deleteChatSession(input.sessionId);
      return { ok: true };
    }),
  renameSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        title: z.string().min(1).max(120),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await repo.renameChatSession(input);
      return { ok: true, session: updated };
    }),
});

const marketplaceRouter = router({
  list: protectedProcedure
    .input(listMarketplaceItemsSchema)
    .query(async ({ input }) => {
      return marketplaceService.listMarketplaceItems(input);
    }),
  get: protectedProcedure
    .input(getMarketplaceItemSchema)
    .query(async ({ input }) => {
      return marketplaceService.getMarketplaceItem(input.itemKey, input.version);
    }),
  publish: protectedProcedure
    .input(publishMarketplaceItemSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await marketplaceService.publishToLocalMarketplace({
          ...input,
          payload: input.payload as any,
          createdBy: ctx.user.id,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  unpublish: protectedProcedure
    .input(unpublishMarketplaceItemSchema)
    .mutation(async ({ input }) => {
      const result = await marketplaceService.unpublishLocalItem(input.itemId);
      if (!result.ok) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "unpublish failed",
        }));
      }
      return { success: true };
    }),
  refresh: governedProcedure
    .input(refreshMarketplaceRegistrySchema)
    .mutation(async ({ input }) => {
      try {
        return await marketplaceService.refreshFromRegistry(input?.registryUrl);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  listCollections: protectedProcedure.query(async () => {
    return marketplaceService.listCollections();
  }),
  // Phase 14d: install/uninstall — materializes payload into catalog
  // tables and records the install for later reversal.
  install: protectedProcedure
    .input(installMarketplaceItemSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await installMarketplaceItem({
          itemId: input.itemId,
          agentId: input.agentId,
          onConflict: input.onConflict,
          installedBy: ctx.user.id,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
  uninstall: protectedProcedure
    .input(uninstallMarketplaceItemSchema)
    .mutation(async ({ input }) => {
      try {
        return await uninstallMarketplaceItem(input.installId);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
});

// ── Catalog sync log retention (Phase 22 follow-up #633 + #634 + #635) ──

const catalogSyncLogRouter = router({
  pruneRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          eventTypes: z
            .array(
              z.enum([
                "aiTypes.catalog.registered",
                "aiTypes.catalog.published",
                "aiTypes.catalog.deprecated",
              ]),
            )
            .max(3)
            .optional(),
          sourceModule: z
            .union([
              z.string().min(1).max(64),
              z.array(z.string().min(1).max(64)).max(10),
            ])
            .optional(),
          catalogEntryId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldCatalogSyncLog } = await import(
        "../services/catalog-sync-log-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldCatalogSyncLog({
        olderThan,
        eventTypes: input?.eventTypes,
        sourceModule: input?.sourceModule,
        catalogEntryId: input?.catalogEntryId,
      });
    }),
  getRetentionCronStatus: adminProcedure.query(async () => {
    const { getCatalogSyncLogRetentionCronStatus } = await import(
      "../services/catalog-sync-log-retention-cron"
    );
    return getCatalogSyncLogRetentionCronStatus();
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
  // Phase 14: Marketplace
  marketplace: marketplaceRouter,
  // Phase 19 follow-up: Multi-turn chat
  chat: chatRouter,
  // Plan v3 Phase 14: provider/model binding picker
  providerBindings: providerBindingsRouter,
  // PMB Phase 30.1: workspace-default-binding admin surface
  workspaceDefaultBindings: workspaceDefaultBindingsRouter,
  // RAC Phase 1D: Capability Pack preview/refresh APIs
  cag: cagRouter,
  // RAC Phase 2: Source registry CRUD (profiles / sources / policies / ws-embedding-default)
  racSources: racSourcesRouter,
  // RAC Phase 3: Ingestion adapter contract (preview / register / validate)
  racIngestion: racIngestionRouter,
  // Phase 22 follow-up #671: Universal Ingestion (Phase 2-3) lifecycle —
  // currently exposes only the ags_ingestion_jobs retention surface.
  ingestion: ingestionRouter,
  // Phase 22 follow-up #675: Graph Change Proposals (Phase 11.5
  // structural mutations) — currently exposes only the retention surface.
  graphChange: graphChangeRouter,
  // RAC Phase 7: Trace + feedback (getTrace / submitFeedback)
  racTrace: racTraceRouter,
  // RAC Phase 8: Evaluation (evaluate / previewRetrieval / runGroundednessCheck)
  racEvaluation: racEvaluationRouter,
  // Retrofit Phase 11: Knowledge Base read surface (units / provenance)
  kb: kbRouter,
  // Retrofit Phase 11: MCP tool knowledge mirror (Phase 7 sync targets)
  toolKnowledge: toolKnowledgeRouter,
  // Retrofit Phase 11: MCP schema sync trigger (Phase 7 sync action)
  mcpSchemaSync: mcpSchemaSyncRouter,
  // Retrofit Phase 11: ProposedToolCall approval queue (Phase 9 gate)
  toolApprovals: toolApprovalsRouter,
  // Native Graph Workspace Phase 12.5 §8: Skill Pack usage analytics
  graphSkill: graphSkillRouter,
  // Native Graph Workspace Phase 13 §1: Graph Agent Lite runtime
  graphAgent: graphAgentRouter,
  // Native Graph Workspace Phase 22: workspace observability (background jobs,
  // user notifications, error events)
  workspaceObservability: workspaceObservabilityRouter,
  // Native Graph Workspace Phase 23: graph correction proposal lifecycle
  // (submit / approve / reject / list / audit)
  graphCorrection: graphCorrectionRouter,
  // Native Graph Workspace Phase 23 §1: graph quality scan + agent run +
  // findings + finding→proposal conversion surface for operator UI.
  graphQuality: graphQualityRouter,
  // Phase 22 follow-up #635: catalog-sync-log retention admin surface
  // (prune + getCronStatus). Sister of runs.pruneRetention (#623),
  // runs.pruneToolCallTracesRetention (#627), and mcp.pruneTransitionsRetention
  // (#631). Lives on its own sub-router because catalog-sync-log is a
  // distinct domain (aiTypes lifecycle events recorded by AS subscriber)
  // — not a runs/MCP concern.
  catalogSyncLog: catalogSyncLogRouter,
});
