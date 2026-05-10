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

export interface GraphAgentEngineOptions {
  readonly repository: GraphRepository;
  readonly retrievalRouter: GraphRetrievalRouter;
  readonly modelAccess: ModelAccessAdapter;
  readonly mcpDispatcher: McpDispatchAdapter;
  readonly runtimeTrace: RuntimeTraceAdapter;
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

    try {
      const runtime: RuntimeContext = {
        userId: input.userId,
        workspaceId: input.workspaceId,
        userRole: "user", // Phase 13.5 wires real role from auth
      };

      // 1. Plan retrieval mode
      const retrievalMode = this.pickRetrievalMode(input);

      // 2. Retrieve
      const retrieval = await this.options.retrievalRouter.retrieve({
        mode: retrievalMode,
        query: input.query,
        runtime,
      });

      // 3. Assemble context blocks for model
      const modelContext = retrieval.contextBlocks.map((b) => ({
        sourceKind: b.sourceKind,
        sourceId: b.sourceId,
        content: b.contentSnippet ?? JSON.stringify(b.payload),
      }));

      // 4. Call model via OpenRouter Model Access (boundary)
      const modelOutput = await this.options.modelAccess.execute({
        prompt: input.query,
        systemPrompt: this.buildSystemPrompt(),
        contextBlocks: modelContext,
        modelHint: input.modelHint,
      });

      // 5. Backend health snapshot for Why-This-Answer panel
      const health = await this.options.repository.health();

      // 6. Finalize trace
      await this.options.runtimeTrace.finalizeRun(runId, "completed", Date.now() - startedAt);

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
      await this.options.runtimeTrace.finalizeRun(runId, "failed", Date.now() - startedAt, errorReason);
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
