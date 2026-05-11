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
import type { GraphAgentAnswer, GraphAgentAnswerCitation, GraphAgentRunInput } from "./contracts.js";

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
}

export class GraphAgentEngine {
  constructor(private readonly options: GraphAgentEngineOptions) {}

  async run(input: GraphAgentRunInput): Promise<GraphAgentAnswer> {
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
        await this.options.decisionTrace.recordStep({
          graphAgentRunId,
          stepIndex: 2,
          stepKind: "retrieve",
          stepInput: { mode: retrievalMode, query: input.query },
          stepOutput: {
            contextBlockCount: retrieval.contextBlocks.length,
            truncated: retrieval.truncated,
            rejectionReason: retrieval.rejectionReason,
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

  private pickRetrievalMode(input: GraphAgentRunInput) {
    if (input.retrievalPreference !== "auto") return input.retrievalPreference;
    return "graphrag_local";
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
