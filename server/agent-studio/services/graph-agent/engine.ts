/**
 * Graph Agent Lite — engine.
 *
 * Phase 13. Orchestrates: plan → retrieve → reason → answer → trace.
 *
 * BOUNDARY RULES (source-scan tested):
 *   - Tools called via dispatchMcpToolCall() only (server/agent-studio/services/mcp/dispatcher).
 *   - Models called via OpenRouter Model Access (server/openrouter/model-access).
 *   - Graph access via GraphRepository only.
 *   - No graph mutation.
 *   - Emits runtime trace events to agsRuntimeRuns (V3 schema).
 */

import type { GraphRepository, RuntimeContext } from "../graph/repository/index.js";
import { GraphRetrievalRouter } from "../graph/retrieval/retrieval-router.js";
import { pickGraphRagStrategy } from "../graph/retrieval/strategy-selector.js";
import type { GraphAgentAnswer, GraphAgentAnswerCitation, GraphAgentRunInput } from "./contracts.js";
import type {
  AgenticPlanner,
  AgenticPlannerEligiblePack,
  AgenticLoopBudget,
} from "./agentic-planner-contract.js";
import {
  runAgenticLoop,
  type AgenticLoopResult,
} from "./agentic-loop.js";
import { recordFailureStateEvent } from "../failure-states/observability-bridge.js";

/**
 * Adapter interface for the existing OpenRouter Model Access path.
 * The real implementation imports from `server/openrouter/model-access`;
 * the engine accepts it as a dependency so tests can stub it.
 */
export interface ModelAccessAdapter {
  execute(input: {
    prompt: string;
    systemPrompt?: string;
    contextBlocks: Array<{ sourceKind: string; sourceId: string; content: string }>;
    modelHint?: string;
  }): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }>;
}

/**
 * Adapter interface for the existing MCP dispatcher.
 * Real impl: `dispatchMcpToolCall` from server/agent-studio/services/mcp/dispatcher.
 */
export interface McpDispatchAdapter {
  dispatch(input: { toolName: string; args: Record<string, unknown>; runtimeRunId?: number }): Promise<unknown>;
}

/**
 * Adapter for emitting runtime trace rows to agsRuntimeRuns (V3 schema).
 */
export interface RuntimeTraceAdapter {
  startRun(input: { agentKey: string; userId?: number; triggerType: string }): Promise<{ runId: number }>;
  finalizeRun(runId: number, status: "completed" | "failed", durationMs: number, errorReason?: string): Promise<void>;
}

/**
 * Phase 13 §2 — Decision-trace writer port. Writes a row to
 * `ags_graph_agent_runs` on start, one `ags_graph_agent_steps` row per
 * phase the engine works through (plan / retrieve / model / health),
 * and a finalize row at the end. The graph-agent run row is FK-linked
 * back to the top-level `agsRuntimeRuns` row via `runtime_run_id` so
 * operators can join the trace ledgers.
 *
 * Optional. When omitted, the engine runs the legacy path (top-level
 * runtime trace only) — matches the recorder fail-safe pattern from
 * §4-§13. Errors from this writer are NOT swallowed: a failing trace
 * write is operator-actionable.
 */
export interface GraphAgentDecisionTraceAdapter {
  startGraphAgentRun(input: {
    agentKey: string;
    userId?: number;
    workspaceId?: number;
    userQuery: string;
    runtimeRunId?: number;
  }): Promise<{ graphAgentRunId: number }>;
  recordStep(input: {
    graphAgentRunId: number;
    stepIndex: number;
    stepKind: string;
    stepInput?: Record<string, unknown>;
    stepOutput?: Record<string, unknown>;
    durationMs?: number;
  }): Promise<void>;
  finalizeGraphAgentRun(input: {
    graphAgentRunId: number;
    status: "completed" | "failed";
    durationMs: number;
    errorMessage?: string;
  }): Promise<void>;
}

export interface GraphAgentEngineOptions {
  readonly repository: GraphRepository;
  readonly retrievalRouter: GraphRetrievalRouter;
  readonly modelAccess: ModelAccessAdapter;
  readonly mcpDispatcher: McpDispatchAdapter;
  readonly runtimeTrace: RuntimeTraceAdapter;
  readonly decisionTrace?: GraphAgentDecisionTraceAdapter;
  /**
   * Phase 13.5 PR #2 — optional agentic planner. When supplied,
   * `run()` invokes the bounded agentic loop instead of the fixed
   * plan → retrieve → reason → answer pipeline. Each `retrieve`
   * action from the planner executes through the same
   * `GraphRetrievalRouter` the fixed pipeline uses — boundaries
   * are preserved. Omit to retain the Phase 13 Graph Agent Lite
   * shape (no behavior change).
   */
  readonly agenticPlanner?: AgenticPlanner;
  /** Phase 13.5 — optional agentic loop budget; falls back to DEFAULT_AGENTIC_LOOP_BUDGET. */
  readonly agenticBudget?: Partial<AgenticLoopBudget>;
  /**
   * Phase 13.5 — operator-curated list of skill packs eligible
   * for the agentic loop. The engine passes this to the planner
   * so the planner cannot reach packs the operator hasn't opted
   * into agentic mode (PR #2 carries them in-memory; PR #3 lands
   * the agenticEligible DB column).
   */
  readonly agenticEligibleSkillPacks?: ReadonlyArray<AgenticPlannerEligiblePack>;
}

export class GraphAgentEngine {
  constructor(private readonly options: GraphAgentEngineOptions) {}

  async run(input: GraphAgentRunInput): Promise<GraphAgentAnswer> {
    // Phase 13.5 PR #2 — branch on agentic-planner presence. If
    // supplied, run the bounded adaptive loop; otherwise preserve
    // the fixed Phase 13 pipeline byte-for-byte.
    if (this.options.agenticPlanner) {
      return this.runAgentic(input);
    }
    return this.runFixed(input);
  }

  private async runFixed(input: GraphAgentRunInput): Promise<GraphAgentAnswer> {
    const startedAt = Date.now();
    const { runId } = await this.options.runtimeTrace.startRun({
      agentKey: input.agentKey,
      userId: input.userId,
      triggerType: input.agentKey,
    });

    // Phase 13 §2 — decision-trace writer is optional. When wired, we
    // open a graph-agent-specific run row FK-linked to the top-level
    // runtime run, and record a step row per phase. Step indices are
    // 1-based for operator-facing UIs.
    let graphAgentRunId: number | undefined;
    if (this.options.decisionTrace) {
      const opened = await this.options.decisionTrace.startGraphAgentRun({
        agentKey: input.agentKey,
        userId: input.userId,
        workspaceId: input.workspaceId,
        userQuery: input.query,
        runtimeRunId: runId,
      });
      graphAgentRunId = opened.graphAgentRunId;
    }

    try {
      const runtime: RuntimeContext = {
        userId: input.userId,
        workspaceId: input.workspaceId,
        userRole: "user", // Phase 13.5 wires real role from auth
      };

      // 1. Plan retrieval mode
      const planStartedAt = Date.now();
      const retrievalMode = this.pickRetrievalMode(input);
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex: 1,
          stepKind: "plan_retrieval_mode",
          stepInput: {
            retrievalPreference: input.retrievalPreference ?? "auto",
          },
          stepOutput: { retrievalMode },
          durationMs: Date.now() - planStartedAt,
        });
      }

      // 2. Retrieve
      const retrieveStartedAt = Date.now();
      const retrieval = await this.options.retrievalRouter.retrieve({
        mode: retrievalMode,
        query: input.query,
        runtime,
        runtimeRunId: runId,
      });
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        // Item 34: record the graph node ids retrieved from each
        // GraphRAG block so `provenance-enricher` can later attach
        // `explainNode` provenance per node. Additive on JSONB —
        // existing readers ignore the new field. Path-mode blocks
        // (graphrag_shortest_path) emit a single block whose payload
        // carries `from` + `to` instead of a single node id; we
        // surface both endpoints so the path enricher can be called.
        const graphNodeIds = extractGraphNodeIdsFromContextBlocks(
          retrieval.contextBlocks,
        );
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex: 2,
          stepKind: "retrieve",
          stepInput: { mode: retrievalMode, query: input.query },
          stepOutput: {
            contextBlockCount: retrieval.contextBlocks.length,
            truncated: retrieval.truncated,
            rejectionReason: retrieval.rejectionReason,
            graphNodeIds,
          },
          durationMs: Date.now() - retrieveStartedAt,
        });
      }

      // 3. Assemble context blocks for model
      const modelContext = retrieval.contextBlocks.map((b) => ({
        sourceKind: b.sourceKind,
        sourceId: b.sourceId,
        content: b.contentSnippet ?? JSON.stringify(b.payload),
      }));

      // 4. Call model via OpenRouter Model Access (boundary)
      const modelStartedAt = Date.now();
      const modelOutput = await this.options.modelAccess.execute({
        prompt: input.query,
        systemPrompt: this.buildSystemPrompt(),
        contextBlocks: modelContext,
        modelHint: input.modelHint,
      });
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex: 3,
          stepKind: "model_call",
          stepInput: {
            modelHint: input.modelHint,
            contextBlockCount: modelContext.length,
          },
          stepOutput: {
            responseLength: modelOutput.text.length,
            promptTokens: modelOutput.usage?.promptTokens,
            completionTokens: modelOutput.usage?.completionTokens,
          },
          durationMs: Date.now() - modelStartedAt,
        });
      }

      // 5. Backend health snapshot for Why-This-Answer panel
      const healthStartedAt = Date.now();
      const health = await this.options.repository.health();
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex: 4,
          stepKind: "health_snapshot",
          stepOutput: {
            backendKey: this.options.repository.backendKey,
            status: health.status,
          },
          durationMs: Date.now() - healthStartedAt,
        });
      }

      // 6. Finalize trace
      const totalDuration = Date.now() - startedAt;
      await this.options.runtimeTrace.finalizeRun(runId, "completed", totalDuration);
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.finalizeGraphAgentRun({
          graphAgentRunId,
          status: "completed",
          durationMs: totalDuration,
        });
      }

      const citations: GraphAgentAnswerCitation[] = retrieval.citations.map((c) => ({
        sourceKind: c.sourceKind,
        sourceId: c.sourceId,
        sourceVersionId: c.sourceVersionId,
      }));

      return {
        runId,
        answer: modelOutput.text,
        citations,
        graphPaths: [],
        confidence: undefined,
        whyThisAnswer: {
          retrievalMode,
          graphBackendKey: this.options.repository.backendKey,
          truncationReason: retrieval.truncated ? "max_results_reached" : undefined,
        },
      };
    } catch (e) {
      const errorReason = e instanceof Error ? e.message : String(e);
      const totalDuration = Date.now() - startedAt;
      await this.options.runtimeTrace.finalizeRun(runId, "failed", totalDuration, errorReason);
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.finalizeGraphAgentRun({
          graphAgentRunId,
          status: "failed",
          durationMs: totalDuration,
          errorMessage: errorReason,
        });
      }
      throw e;
    }
  }

  /**
   * Phase 13.5 PR #2 — agentic-mode run.
   *
   * Drives the bounded agentic loop. For each `retrieve` action the
   * planner returns, runs `retrievalRouter.retrieve()` (the same
   * chokepoint the fixed pipeline uses). After the loop terminates
   * (planner answer / stop / max iterations / wall-clock budget /
   * invalid action), assembles the accumulated retrieval results
   * into a single model context and emits the answer through the
   * same OpenRouter Model Access path.
   *
   * Boundary preservation:
   *   - No new graph entry point — every retrieve goes through
   *     `GraphRetrievalRouter.retrieve()`.
   *   - No tool dispatch from the loop — `AgenticPlannerAction` is
   *     closed to retrieve/answer/stop by interface design.
   *   - No graph mutation — read-only by interface design.
   *   - Model call still routes through `modelAccess.execute()`.
   *   - Decision-trace writer (when wired) gets one step row per
   *     planner iteration plus the wrapping model-call step.
   */
  private async runAgentic(input: GraphAgentRunInput): Promise<GraphAgentAnswer> {
    const planner = this.options.agenticPlanner;
    if (!planner) {
      // Defensive — caller should not reach this branch without a
      // planner, but typescript flow doesn't carry the union narrow.
      return this.runFixed(input);
    }

    const startedAt = Date.now();
    const { runId } = await this.options.runtimeTrace.startRun({
      agentKey: input.agentKey,
      userId: input.userId,
      triggerType: input.agentKey,
    });

    let graphAgentRunId: number | undefined;
    if (this.options.decisionTrace) {
      const opened = await this.options.decisionTrace.startGraphAgentRun({
        agentKey: input.agentKey,
        userId: input.userId,
        workspaceId: input.workspaceId,
        userQuery: input.query,
        runtimeRunId: runId,
      });
      graphAgentRunId = opened.graphAgentRunId;
    }

    try {
      const runtime: RuntimeContext = {
        userId: input.userId,
        workspaceId: input.workspaceId,
        userRole: "user",
      };

      // Tracking for the final whyThisAnswer + decision-trace.
      const accumulatedContextBlocks: Array<{
        sourceKind: string;
        sourceId: string;
        content: string;
      }> = [];
      const accumulatedCitations: GraphAgentAnswerCitation[] = [];
      const retrievalModes: string[] = [];
      let stepIndex = 0;
      let truncated = false;

      // Drive the loop. The loop function delegates back to the
      // engine for every `retrieve` action via the planner contract
      // — but the loop ITSELF does not execute retrieval. We compose
      // a wrapping planner that intercepts retrieve actions, runs
      // the retrieval, then returns the next planner decision based
      // on accumulated results.
      const loopResult: AgenticLoopResult = await runAgenticLoop(
        { query: input.query },
        {
          planner: {
            plan: async (loopInput) => {
              const action = await planner.plan(loopInput);
              if (action.kind === "retrieve") {
                // Execute the retrieve through the bounded
                // chokepoint, then record a step row.
                stepIndex += 1;
                const retrieveStartedAt = Date.now();
                const retrieval = await this.options.retrievalRouter.retrieve({
                  mode: action.retrievalMode,
                  query: input.query,
                  runtime,
                  runtimeRunId: runId,
                });
                retrievalModes.push(action.retrievalMode);
                truncated = truncated || retrieval.truncated;
                for (const b of retrieval.contextBlocks) {
                  accumulatedContextBlocks.push({
                    sourceKind: b.sourceKind,
                    sourceId: b.sourceId,
                    content: b.contentSnippet ?? JSON.stringify(b.payload),
                  });
                }
                for (const c of retrieval.citations) {
                  accumulatedCitations.push({
                    sourceKind: c.sourceKind,
                    sourceId: c.sourceId,
                    sourceVersionId: c.sourceVersionId,
                  });
                }
                if (this.options.decisionTrace && graphAgentRunId !== undefined) {
                  await this.options.decisionTrace.recordStep({
                    graphAgentRunId,
                    stepIndex,
                    stepKind: `agentic_iteration_${loopInput.iterationIndex}_retrieve`,
                    stepInput: {
                      mode: action.retrievalMode,
                      reason: action.reason,
                    },
                    stepOutput: {
                      contextBlockCount: retrieval.contextBlocks.length,
                      truncated: retrieval.truncated,
                      rejectionReason: retrieval.rejectionReason,
                    },
                    durationMs: Date.now() - retrieveStartedAt,
                  });
                }
              }
              return action;
            },
          },
          budget: this.options.agenticBudget,
          skillPackEligibility: this.options.agenticEligibleSkillPacks ?? [],
        },
      );

      // After the loop terminates, run a single model call against
      // the accumulated context. The model call path is identical
      // to the fixed pipeline — OpenRouter Model Access chokepoint.
      stepIndex += 1;
      // T-I.5 batch B — bridge "agent converged via budget exhaustion"
      // to the Phase 22 closed-taxonomy emission surface. Only the two
      // budget-exhaustion termination reasons count; `planner_stop` and
      // `planner_answer` are clean convergence. `invalid_action` is a
      // separate planner-contract violation (not modeled in Phase 22
      // closed taxonomy). Fire-and-forget; observability never
      // propagates into the engine return path.
      if (
        loopResult.terminationReason === "max_iterations" ||
        loopResult.terminationReason === "wall_clock_budget"
      ) {
        void recordFailureStateEvent({
          failureState: "graph_agent_answer_incomplete",
          sourceKind: "graph-agent-lite",
          sourceId: String(runId),
          errorMessage: `Agent loop exhausted ${loopResult.terminationReason}`,
          metadata: {
            terminationReason: loopResult.terminationReason,
            plannerCallCount: loopResult.plannerCallCount,
            retrievalModes,
            workspaceId: runtime.workspaceId,
          },
        }).catch(() => {
          // Fail-soft.
        });
      }

      const modelStartedAt = Date.now();
      const modelOutput = await this.options.modelAccess.execute({
        prompt: input.query,
        systemPrompt: this.buildAgenticSystemPrompt(loopResult.terminationReason),
        contextBlocks: accumulatedContextBlocks,
        modelHint: input.modelHint,
      });
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex,
          stepKind: "agentic_model_call",
          stepInput: {
            iterationsRun: loopResult.plannerCallCount,
            terminationReason: loopResult.terminationReason,
            contextBlockCount: accumulatedContextBlocks.length,
          },
          stepOutput: {
            responseLength: modelOutput.text.length,
            promptTokens: modelOutput.usage?.promptTokens,
            completionTokens: modelOutput.usage?.completionTokens,
          },
          durationMs: Date.now() - modelStartedAt,
        });
      }

      // Backend health snapshot (mirrors fixed pipeline step 5).
      const health = await this.options.repository.health();

      const totalDuration = Date.now() - startedAt;
      await this.options.runtimeTrace.finalizeRun(runId, "completed", totalDuration);
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.finalizeGraphAgentRun({
          graphAgentRunId,
          status: "completed",
          durationMs: totalDuration,
        });
      }

      return {
        runId,
        answer: modelOutput.text,
        citations: accumulatedCitations,
        graphPaths: [],
        confidence: undefined,
        whyThisAnswer: {
          retrievalMode: retrievalModes[0] ?? "agentic_no_retrieve",
          graphBackendKey: this.options.repository.backendKey,
          truncationReason: truncated ? "max_results_reached" : undefined,
          agenticIterations: loopResult.plannerCallCount,
          agenticTerminationReason: loopResult.terminationReason,
          agenticRetrievalModes: retrievalModes,
        },
      };
    } catch (e) {
      const errorReason = e instanceof Error ? e.message : String(e);
      const totalDuration = Date.now() - startedAt;
      await this.options.runtimeTrace.finalizeRun(runId, "failed", totalDuration, errorReason);
      if (this.options.decisionTrace && graphAgentRunId !== undefined) {
        await this.options.decisionTrace.finalizeGraphAgentRun({
          graphAgentRunId,
          status: "failed",
          durationMs: totalDuration,
          errorMessage: errorReason,
        });
      }
      throw e;
    }
  }

  private pickRetrievalMode(input: GraphAgentRunInput) {
    if (input.retrievalPreference !== "auto") return input.retrievalPreference;
    // Item 58 (Advanced GraphRAG, slice 1): query-shape-aware
    // strategy selection. Pure, deterministic, no model call.
    // Differentiates neighborhood / shortest_path / algorithm /
    // local / global based on query keywords + caller hints — was
    // previously hard-coded to graphrag_local.
    const selected = pickGraphRagStrategy({ query: input.query });
    return selected.mode;
  }

  private buildAgenticSystemPrompt(terminationReason: string): string {
    return [
      "You are Graph Agent (agentic mode), a graph-aware assistant inside Agent Studio.",
      "Multiple retrieval iterations have produced the context blocks below.",
      "Cite every claim by sourceId. Do not invent paths that are not in the context.",
      "If the context is insufficient, say so explicitly.",
      `Loop terminated with reason: ${terminationReason}.`,
    ].join("\n");
  }

  private buildSystemPrompt(): string {
    return [
      "You are Graph Agent Lite, a graph-aware assistant inside Agent Studio.",
      "Use the provided context blocks. Cite every claim by sourceId.",
      "If the context is insufficient, say so explicitly.",
      "Do not invent graph paths that are not in the context.",
    ].join("\n");
  }
}

/**
 * Item 34 helper — extract graph node ids from a retrieval result's
 * context blocks. Used by the engine's `retrieve` step to surface
 * the ids in `stepOutput.graphNodeIds` so `provenance-enricher` can
 * later attach `explainNode` / `explainPath` provenance.
 *
 * Coverage:
 *   - node-shaped blocks (graphrag_local / graphrag_global /
 *     graphrag_neighborhood / graphrag_algorithm): pull `payload.node.id`
 *     when present, else fall back to the block's own `id`.
 *   - path-shaped blocks (graphrag_shortest_path): pull
 *     `payload.from` + `payload.to` + `payload.nodes`.
 *   - non-graph blocks (cypher_template / retrieval-router /
 *     retrieval-router.text2cypher / etc.): contribute nothing —
 *     the field stays empty so non-graph-derived runs don't get a
 *     spurious enrich call.
 *
 * Returns a deduplicated, order-preserving array.
 */
export function extractGraphNodeIdsFromContextBlocks(
  blocks: ReadonlyArray<{
    readonly id?: string;
    readonly sourceKind: string;
    readonly payload?: unknown;
  }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function push(id: unknown): void {
    if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const b of blocks) {
    const p = b.payload as Record<string, unknown> | undefined;
    if (b.sourceKind === "graph_path") {
      push(p?.from);
      push(p?.to);
      const ns = p?.nodes;
      if (Array.isArray(ns)) for (const n of ns) push(n);
      continue;
    }
    // GraphRAG node blocks carry `payload.node = NodeIdentity`. Fall
    // back to the block's own `id` (which the router sets to the
    // node id).
    const node = p?.node as { id?: unknown } | undefined;
    if (node && typeof node.id === "string") {
      push(node.id);
    } else if (typeof b.id === "string") {
      // Only treat the block id as a graph node id when the
      // sourceKind looks node-like — guard against accidentally
      // promoting cypher_template / retrieval-router synthetic ids.
      if (
        b.sourceKind !== "cypher_template" &&
        b.sourceKind !== "retrieval-router" &&
        !b.sourceKind.startsWith("retrieval-router.") &&
        b.sourceKind !== "graph-template-executor"
      ) {
        push(b.id);
      }
    }
  }
  return out;
}
