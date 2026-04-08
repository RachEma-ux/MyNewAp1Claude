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
import {
  agentIdSchema,
  archiveAgentSchema,
  attachToolSchema,
  comparePromptPackSchema,
  compareSimulationRunsSchema,
  compareVersionsSchema,
  createBlankAgentSchema,
  createFromTemplateSchema,
  createVersionSchema,
  decideApprovalStepSchema,
  getRunDetailSchema,
  getSimulationRunSchema,
  importDefinitionSchema,
  listAgentsSchema,
  listRunsSchema,
  previewRetrievalSchema,
  promoteSimulationToTestSchema,
  publishVersionSchema,
  removeTestCaseSchema,
  removeToolSchema,
  rollbackToVersionSchema,
  runSimulationSchema,
  runTestSuiteSchema,
  saveSimulationScenarioSchema,
  saveTestCaseSchema,
  saveTestSuiteSchema,
  simulateToolCallSchema,
  submitForReviewSchema,
  updateBehaviorSchema,
  updateGovernancePolicySchema,
  updateIdentitySchema,
  updateKnowledgeConfigSchema,
  updateMemoryConfigSchema,
  updatePromptPackSchema,
  updateToolBindingSchema,
  updateWorkflowConfigSchema,
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
    const [steps, toolCalls, memoryEvents, policyEvents] = await Promise.all([
      repo.listRuntimeRunSteps(input.runId),
      repo.listRuntimeToolCalls(input.runId),
      repo.listRuntimeMemoryEvents(input.runId),
      repo.listRuntimePolicyEvents(input.runId),
    ]);
    return { run, steps, toolCalls, memoryEvents, policyEvents };
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
});
