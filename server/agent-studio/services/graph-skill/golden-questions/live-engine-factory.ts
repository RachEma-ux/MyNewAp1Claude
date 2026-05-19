/**
 * Native Graph Workspace V1.0 — Golden Questions live engine factory.
 *
 * Strict-audit item #2. Composes the Graph Agent Lite engine with
 * real adapter wiring for live operator runs. This is the ONE module
 * in the Golden Questions surface that touches the model-access /
 * MCP dispatcher / GraphRepository boundaries — every other module
 * accepts narrow callbacks.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - GraphRepository is the only graph access path.
 *   - OpenRouter Model Access (`server/openrouter/model-access`) is
 *     the only model execution path. `execute()` itself uses
 *     `withProviderCredential` internally (Plan v3 D1), so no script
 *     body here reads raw provider-key env vars directly.
 *   - `dispatchMcpToolCall` is the only tool execution path. Graph
 *     Agent Lite doesn't dispatch tools today; the adapter is wired
 *     so future agentic loops can.
 *   - No graph mutation — engine is read-only by interface design.
 *
 * Config surface (live mode):
 *   GOLDEN_Q_LIVE=true                                 # opt-in switch
 *   GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID=<int>         # model access
 *   GOLDEN_Q_LIVE_MODEL_REF=<string>                   # e.g. "anthropic/claude-3-5-sonnet"
 *   GOLDEN_Q_LIVE_WORKSPACE_ID=<int>                   # smoke vault
 *   GOLDEN_Q_LIVE_ACTOR_ID=<int>                       # actor/user id
 *
 * Documented in:
 *   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md §4.1 / §4.4
 *
 * Test posture:
 *   This file does I/O on the model-access boundary and is exercised
 *   only by live-mode operator runs. Unit tests cover the pure scorer
 *   + report formatter in `live-evaluator.ts`. A boundary test
 *   (`tests/agent-studio/golden-questions-live-engine-boundary.test.ts`)
 *   source-scans this file to enforce the hard rules above.
 */

import { GraphAgentEngine } from "../../graph-agent/engine.js";
import type {
  ModelAccessAdapter,
  McpDispatchAdapter,
  RuntimeTraceAdapter,
} from "../../graph-agent/engine.js";
import { getGraphRepository } from "../../graph/repository/index.js";
import { GraphRetrievalRouter } from "../../graph/retrieval/retrieval-router.js";
import { execute as modelAccessExecute } from "../../../../openrouter/model-access/index.js";
import { dispatchMcpToolCall } from "../../mcp/dispatcher.js";

export interface LiveEngineConfig {
  /** Provider connection row id — credential resolution is `withProviderCredential` inside `execute()`. */
  readonly providerConnectionId: number;
  /** Model ref (e.g. "anthropic/claude-3-5-sonnet" or operator-bound key). */
  readonly modelRef: string;
  /** Workspace id for the engine run. */
  readonly workspaceId: number;
  /** Actor id for the engine run. */
  readonly actorId: number;
}

export interface ParsedLiveEnv {
  readonly ok: true;
  readonly config: LiveEngineConfig;
}

export interface ParsedLiveEnvError {
  readonly ok: false;
  readonly reason: string;
}

/**
 * Pure: read the documented env vars and return either a valid
 * `LiveEngineConfig` or a structured error. The error is surfaced
 * verbatim into the CLI exit path so operators can diagnose without
 * grepping the source.
 */
export function parseLiveEnv(env: NodeJS.ProcessEnv = process.env): ParsedLiveEnv | ParsedLiveEnvError {
  if (env.GOLDEN_Q_LIVE !== "true") {
    return {
      ok: false,
      reason:
        "GOLDEN_Q_LIVE is not 'true'. Set GOLDEN_Q_LIVE=true to opt into live mode.",
    };
  }
  const providerStr = env.GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID;
  const modelRef = env.GOLDEN_Q_LIVE_MODEL_REF;
  const workspaceStr = env.GOLDEN_Q_LIVE_WORKSPACE_ID;
  const actorStr = env.GOLDEN_Q_LIVE_ACTOR_ID;

  const missing: string[] = [];
  if (!providerStr) missing.push("GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID");
  if (!modelRef) missing.push("GOLDEN_Q_LIVE_MODEL_REF");
  if (!workspaceStr) missing.push("GOLDEN_Q_LIVE_WORKSPACE_ID");
  if (!actorStr) missing.push("GOLDEN_Q_LIVE_ACTOR_ID");
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required live-mode env vars: ${missing.join(", ")}`,
    };
  }
  const providerConnectionId = Number(providerStr);
  const workspaceId = Number(workspaceStr);
  const actorId = Number(actorStr);
  if (!Number.isInteger(providerConnectionId) || providerConnectionId <= 0) {
    return {
      ok: false,
      reason: `GOLDEN_Q_LIVE_PROVIDER_CONNECTION_ID must be a positive integer, got "${providerStr}"`,
    };
  }
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return {
      ok: false,
      reason: `GOLDEN_Q_LIVE_WORKSPACE_ID must be a positive integer, got "${workspaceStr}"`,
    };
  }
  if (!Number.isInteger(actorId) || actorId <= 0) {
    return {
      ok: false,
      reason: `GOLDEN_Q_LIVE_ACTOR_ID must be a positive integer, got "${actorStr}"`,
    };
  }
  return {
    ok: true,
    config: { providerConnectionId, modelRef: modelRef as string, workspaceId, actorId },
  };
}

/**
 * Build a model-access adapter bound to a specific
 * provider-connection + model-ref. Credential resolution happens
 * inside `execute()` via `withProviderCredential` — this file never
 * reads `process.env.*_API_KEY`.
 */
export function buildModelAccessAdapter(config: LiveEngineConfig): ModelAccessAdapter {
  return {
    async execute(input) {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
      if (input.systemPrompt) {
        messages.push({ role: "system", content: input.systemPrompt });
      }
      const contextBlock = input.contextBlocks
        .map((b) => `[${b.sourceKind}:${b.sourceId}] ${b.content}`)
        .join("\n\n");
      const userContent =
        contextBlock.length > 0
          ? `Context:\n${contextBlock}\n\nQuestion: ${input.prompt}`
          : input.prompt;
      messages.push({ role: "user", content: userContent });
      const result = await modelAccessExecute({
        providerConnectionId: config.providerConnectionId,
        modelRef: input.modelHint ?? config.modelRef,
        messages,
        intent: "evaluation",
        workspaceId: config.workspaceId,
        actorId: config.actorId,
      });
      if (result.status === "error") {
        throw new Error(`model-access execute failed: ${result.error ?? "unknown"}`);
      }
      return {
        text: result.output ?? "",
        usage: {
          promptTokens: result.usage?.inputTokens,
          completionTokens: result.usage?.outputTokens,
        },
      };
    },
  };
}

/**
 * MCP dispatch adapter — bridges the engine's narrow shape onto the
 * single chokepoint `dispatchMcpToolCall()`. Graph Agent Lite is
 * read-only and does not dispatch tools today; the adapter is wired
 * so future agentic loops that opt skill packs into tool dispatch
 * can use it.
 */
export function buildMcpDispatchAdapter(config: LiveEngineConfig): McpDispatchAdapter {
  return {
    async dispatch(input) {
      return await dispatchMcpToolCall({
        agentDraftId: -1,
        toolName: input.toolName,
        args: input.args,
        source: "live_runtime",
        runtimeRunId: input.runtimeRunId,
        caller: { userId: config.actorId },
      });
    },
  };
}

/**
 * Minimal runtime trace adapter for live golden-questions runs.
 * Emits structured console lines tagged `[golden-q-trace]` so the
 * workflow artifact log captures one entry per question. A real
 * DB-backed `RuntimeTraceAdapter` (writing to `ags_runtime_runs`)
 * exists in the wider Agent Studio runtime path; the Golden
 * Questions live mode intentionally does NOT write trace rows
 * because a smoke-vault eval is not a user-traced session.
 */
export function buildEphemeralRuntimeTraceAdapter(): RuntimeTraceAdapter {
  let runId = 0;
  return {
    async startRun({ agentKey, triggerType }) {
      runId++;
      console.log(
        `[golden-q-trace] startRun runId=${runId} agentKey=${agentKey} triggerType=${triggerType}`,
      );
      return { runId };
    },
    async finalizeRun(id, status, durationMs, errorReason) {
      console.log(
        `[golden-q-trace] finalizeRun runId=${id} status=${status} durMs=${durationMs} err=${errorReason ?? "-"}`,
      );
    },
  };
}

/**
 * Compose the engine. Returns an instance ready for
 * `engine.run.bind(engine)` to be passed as the `GraphAgentRunner`
 * callback into the live evaluator.
 */
export function buildLiveEngine(config: LiveEngineConfig): GraphAgentEngine {
  const repository = getGraphRepository();
  const retrievalRouter = new GraphRetrievalRouter(repository);
  return new GraphAgentEngine({
    repository,
    retrievalRouter,
    modelAccess: buildModelAccessAdapter(config),
    mcpDispatcher: buildMcpDispatchAdapter(config),
    runtimeTrace: buildEphemeralRuntimeTraceAdapter(),
  });
}
