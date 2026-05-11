/**
 * Graph Agent Lite — wiring.
 *
 * Phase 13. This is the ONLY file in the graph-agent module that imports
 * the existing OpenRouter Model Access and MCP dispatcher. Everything else
 * (engine, contracts, public-api) uses adapter interfaces so the engine
 * itself is testable in isolation.
 *
 * Imports (boundary surface):
 *   - server/openrouter/model-access → execute()        ← model boundary
 *   - server/agent-studio/services/mcp/dispatcher        ← tool boundary
 *   - server/agent-studio/repository.appendRuntimeRun    ← runtime trace boundary
 *
 * ADR: docs/architecture/agent-studio-graph-agent-integration-boundaries.md
 */

import { execute as openRouterExecute } from "../../../openrouter/model-access/execute.js";
import { dispatchMcpToolCall } from "../mcp/dispatcher.js";
import * as repo from "../../repository.js";
import { GraphAgentEngine, type GraphAgentEngineOptions, type McpDispatchAdapter, type ModelAccessAdapter, type RuntimeTraceAdapter } from "./engine.js";
import { GraphRetrievalRouter } from "../graph/retrieval/retrieval-router.js";
import { getGraphRepository } from "../graph/repository/index.js";
import {
  createRuntimeUsageRecorder,
  createQueryTemplateRunRecorder,
} from "../graph-skill/public-api.js";

/**
 * Real ModelAccessAdapter delegating to the existing OpenRouter
 * `execute()` entry point. No direct provider SDK imports.
 *
 * Phase 13.5 expands the binding lookup to resolve a workspace's
 * configured Graph Agent model. MVP uses a hard-coded modelRef from env
 * for fast end-to-end wiring; operator overrides via `GRAPH_AGENT_MODEL_REF`.
 */
export class OpenRouterModelAccessAdapter implements ModelAccessAdapter {
  constructor(
    private readonly options: {
      readonly providerConnectionId: number;
      readonly modelRef: string;
      readonly workspaceId: number;
      readonly actorId: number;
    },
  ) {}

  async execute(input: {
    prompt: string;
    systemPrompt?: string;
    contextBlocks: Array<{ sourceKind: string; sourceId: string; content: string }>;
    modelHint?: string;
  }): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
    const systemMessages = input.systemPrompt
      ? [{ role: "system" as const, content: input.systemPrompt }]
      : [];

    const contextLines = input.contextBlocks.length
      ? [
          "Context:",
          ...input.contextBlocks.map(
            (b) => `[${b.sourceKind}:${b.sourceId}] ${b.content}`,
          ),
        ].join("\n")
      : "";

    const userContent = contextLines
      ? `${contextLines}\n\nQuestion: ${input.prompt}`
      : input.prompt;

    const result = await openRouterExecute({
      providerConnectionId: this.options.providerConnectionId,
      modelRef: input.modelHint ?? this.options.modelRef,
      messages: [
        ...systemMessages,
        { role: "user" as const, content: userContent },
      ],
      intent: "graph_agent_lite_run" as never,
      workspaceId: this.options.workspaceId,
      actorId: this.options.actorId,
    } as never);

    // Result shape is normalized by OpenRouter Model Access; pull text +
    // usage out of the result envelope. The type cast bridges this file
    // to OpenRouter's `ModelAccessResult` without re-exporting its types.
    const text =
      (result as { content?: string }).content ??
      (result as { text?: string }).text ??
      "";
    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } })
      .usage ?? {};

    return {
      text,
      usage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
      },
    };
  }
}

/**
 * Real McpDispatchAdapter delegating to the existing MCP dispatcher.
 * No private tool execution paths.
 */
export class McpDispatcherAdapter implements McpDispatchAdapter {
  constructor(
    private readonly options: {
      readonly workspaceId: number;
      readonly actorUserId: number;
      readonly agentDraftId: number;
    },
  ) {}

  async dispatch(input: {
    toolName: string;
    args: Record<string, unknown>;
    runtimeRunId?: number;
  }): Promise<unknown> {
    return dispatchMcpToolCall({
      toolName: input.toolName,
      input: input.args,
      workspaceId: this.options.workspaceId,
      actorUserId: this.options.actorUserId,
      agentDraftId: this.options.agentDraftId,
      runtimeRunId: input.runtimeRunId,
    } as never);
  }
}

/**
 * Real RuntimeTraceAdapter that writes through the existing Agent Studio
 * `repository.appendRuntimeRun` + `updateRuntimeRun` functions. Same
 * V3 observability columns (`sseFirstTokenMs`, `sseDurationMs`,
 * `errorReason`, `clientDisconnected`, `idempotencyConflicts`) are
 * preserved; Graph Agent Lite only populates the subset relevant to
 * its lane (no SSE; uses `errorReason` + `durationMs`).
 *
 * The type-loose import bridges this file to the repository without
 * needing to know the exact column shape — the existing repository
 * already validates inputs against the Drizzle schema.
 */
export class RuntimeTraceWriterAdapter implements RuntimeTraceAdapter {
  async startRun(input: {
    agentKey: string;
    userId?: number;
    triggerType: string;
  }): Promise<{ runId: number }> {
    const repoAny = repo as unknown as {
      appendRuntimeRun?: (row: Record<string, unknown>) => Promise<{ id: number }>;
    };
    if (typeof repoAny.appendRuntimeRun === "function") {
      const result = await repoAny.appendRuntimeRun({
        triggerType: input.triggerType,
        agentKey: input.agentKey,
        userId: input.userId,
        startedAt: new Date(),
        status: "running",
      });
      return { runId: result.id };
    }
    // Fallback: dev environment where the runtime-runs table isn't reachable.
    // This keeps the engine usable in tests via the stub trace adapter; the
    // real DB-backed path is preferred when ASDB is available.
    return { runId: 0 };
  }

  async finalizeRun(
    runId: number,
    status: "completed" | "failed",
    durationMs: number,
    errorReason?: string,
  ): Promise<void> {
    const repoAny = repo as unknown as {
      updateRuntimeRun?: (id: number, patch: Record<string, unknown>) => Promise<void>;
    };
    if (runId > 0 && typeof repoAny.updateRuntimeRun === "function") {
      await repoAny.updateRuntimeRun(runId, {
        status,
        durationMs,
        errorReason,
        completedAt: new Date(),
      });
    }
  }
}

/**
 * Factory: wires Graph Agent Lite engine with real OpenRouter + MCP +
 * runtime-trace boundaries. Returns the engine ready for use by the
 * router / public-api tRPC layer.
 *
 * Operator must supply provider/model binding via env or DB config:
 *   - GRAPH_AGENT_PROVIDER_CONNECTION_ID
 *   - GRAPH_AGENT_MODEL_REF
 *
 * Phase 13.5 adds a workspace-scoped binding lookup; MVP uses env.
 */
export interface GraphAgentLiteWiringInput {
  readonly workspaceId: number;
  readonly actorUserId: number;
  readonly agentDraftId?: number;
  /** Provider connection id; defaults to env GRAPH_AGENT_PROVIDER_CONNECTION_ID. */
  readonly providerConnectionId?: number;
  /** Model reference; defaults to env GRAPH_AGENT_MODEL_REF. */
  readonly modelRef?: string;
}

export function wireGraphAgentLite(input: GraphAgentLiteWiringInput): GraphAgentEngine {
  const providerConnectionId =
    input.providerConnectionId ??
    Number.parseInt(process.env.GRAPH_AGENT_PROVIDER_CONNECTION_ID ?? "0", 10);
  const modelRef = input.modelRef ?? process.env.GRAPH_AGENT_MODEL_REF ?? "anthropic/claude-3-5-haiku-20250101";

  const repository = getGraphRepository();
  const retrievalRouter = new GraphRetrievalRouter(repository, {
    recordRuntimeUsage: createRuntimeUsageRecorder(),
    recordQueryTemplateRun: createQueryTemplateRunRecorder(),
  });

  const modelAccess = new OpenRouterModelAccessAdapter({
    providerConnectionId,
    modelRef,
    workspaceId: input.workspaceId,
    actorId: input.actorUserId,
  });

  const mcpDispatcher = new McpDispatcherAdapter({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    agentDraftId: input.agentDraftId ?? -1,
  });

  const runtimeTrace = new RuntimeTraceWriterAdapter();

  const options: GraphAgentEngineOptions = {
    repository,
    retrievalRouter,
    modelAccess,
    mcpDispatcher,
    runtimeTrace,
  };
  return new GraphAgentEngine(options);
}
