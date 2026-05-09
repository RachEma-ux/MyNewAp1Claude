/**
 * AI Agent Studio — Chat Stream (SSE)
 *
 * Phase 19 follow-up: streaming endpoint for the Studio Chat. Replaces
 * the blocking `agentStudio.chat.sendMessage` mutation with token-by-
 * token delivery so the UI can render the assistant response as it
 * arrives. Same contract as `server/agents/stream.ts` (events:
 * `token | tool_start | tool_end | done | error`).
 *
 * Endpoint: GET /api/agent-studio/chat/stream?sessionId=N&message=...
 *
 * Two paths:
 *
 *   A. NO-TOOLS (draft has no CONNECTED MCP server snapshots): plain
 *      streaming completion with `stream_options.include_usage`.
 *      Emits `token` per delta, then `done` with real token counts.
 *
 *   B. TOOL-CALL LOOP (draft has at least one connected MCP server
 *      snapshot): a full streaming loop up to MAX_TOOL_TURNS. Each
 *      iteration:
 *        - Open a streaming chat.completions call with `tools` wired
 *        - Accumulate content deltas → emit `token` events
 *        - Accumulate tool_call deltas (id, name, arguments stream in
 *          separate chunks; the SDK gives us partial updates per
 *          chunk.choices[0].delta.tool_calls[*])
 *        - On stream end, inspect `finish_reason`:
 *            * "stop" → final assistant message, exit loop
 *            * "tool_calls" → dispatch each via dispatchMcpToolCall,
 *              persist role=assistant (tool_calls) + role=tool rows,
 *              emit tool_start / tool_end events, re-loop
 *        - On MAX_TOOL_TURNS: write a synthetic assistant message
 *          flagging the cap and exit
 *
 *      Usage accumulates across turns so the session totals bump
 *      correctly. Cost estimate uses the same $5/$15 per 1M rates
 *      as the chat service blocking path (gpt-4o mid-tier proxy).
 *
 * Both paths persist the user message FIRST so it survives LLM
 * failures, then stream the response, then persist the assistant
 * row(s) on success.
 */

import type { Request, Response } from "express";
import * as repo from "./repository";
import { getAgentProviderBinding } from "./bindings";
import { gatewayCall } from "../platform/modules/module-gateway";
import type {
  ModelAccessExecuteInput,
  ModelAccessMessage,
  ModelAccessResult,
  ModelAccessStreamChunk,
  ModelAccessToolCall,
} from "../openrouter/model-access/types";
import { dispatchMcpToolCall } from "./services/mcp/dispatcher";
import { getSnapshot } from "./services/mcp/registry";
import type { McpTool } from "./services/mcp/types";
import {
  gateRuntimeDispatch,
  persistRuntimeToolCallTrace,
  validateRuntimeToolCall,
  type RuntimeDispatchVerdict,
  type RuntimeValidationResult,
} from "./services/runtime/proposed-tool-call-runtime";
// C1-c6 (cycle-6 audit closure §C1-c6): shared D-RESUME loop —
// chat-stream + chat.ts both delegate so an asymmetry-bug between
// the two parallel implementations cannot recur (cycle-5 lesson #1).
// The helper internally consults `getApprovalEventBus()`; the inline
// import from approval-event-bus is no longer needed in this file.
import { awaitApprovalDecision } from "./services/runtime/approval-resume-loop";
// H8-c7 (cycle-7 audit closure §H8-c7): conversation-context windowing
// before each model.execute() call. Bounded by MAX_CONTEXT_TOKENS env
// var (default 32000). Pre-cycle-7 long sessions grew unbounded.
import { windowChatHistory } from "./services/runtime/context-window";
import {
  CagRequiredError,
  type ComposerMode,
} from "./services/runtime/system-prompt-composer";
import {
  buildRuntimeSystemPrompt,
  RetrievalRequiredError,
} from "./services/runtime/rac-orchestrator";
import {
  writeTrace,
  writeContextBlocks,
  buildContextBlockRows,
} from "./services/rac/trace";

type SseSend = (data: unknown) => void;

/**
 * H4-c6 (cycle-6 audit closure §H4-c6) — exported SSE event contract
 * for the `awaiting_approval` event.
 *
 * Pre-cycle-6 the file header declared SSE event types as
 * `token | tool_start | tool_end | done | error`. The
 * `awaiting_approval` event introduced by cycle-4 C2-c4 PR-3 was
 * shoehorned in as a `status` variant of `tool_end` with two
 * undocumented sibling fields (`approvalRequestId`, `timeoutSec`).
 * The UI inferred the shape; no TypeScript interface or test pinned
 * it. A future refactor renaming `timeoutSec` → `timeout_seconds`
 * (or dropping `approvalRequestId`) would silently break the UI.
 *
 * Post-cycle-6: this exported interface IS the contract. Callers
 * that need to decode the event in tests or external consumers
 * import from this module. The shape is locked by
 * `tests/agent-studio/chat-stream-sse-contract.test.ts`.
 *
 * The event piggybacks on `tool_end` (with `ok=false`) because the
 * SSE consumer's reducer already routes on `type`. A breaking
 * change (new top-level `type: "awaiting_approval"`) would force
 * every UI consumer to update — keep the variant shape until/unless
 * a future cycle decides to migrate the contract.
 */
export interface AwaitingApprovalEvent {
  type: "tool_end";
  toolName: string;
  ok: false;
  status: "awaiting_approval";
  /** `agsPendingPermissionRequests.id` — UI uses to deep-link to the
   *  approval row in RetrofitPage. */
  approvalRequestId: number;
  /** Seconds remaining in the bounded wait window. UI shows a
   *  countdown badge. */
  timeoutSec: number;
}

const MAX_TOOL_TURNS = 6;

/**
 * H7-c7 (cycle-7 audit closure §H7-c7) — per-tool dispatch ceiling
 * within a single sendChatMessage / chat-stream call. Bounds how
 * many times the model can invoke the SAME tool across the
 * MAX_TOOL_TURNS=6 turn iterations. Default 3 — a legitimate
 * loop (e.g. retrying a flaky tool) rarely needs more; a
 * jailbroken / prompt-injected model trying to spam a destructive
 * tool gets stopped after the third attempt with a synthetic
 * refusal + audit row.
 *
 * Operator override via `MAX_CALLS_PER_TOOL_PER_REQUEST` env var
 * for deployments with legitimate retry-heavy tools (e.g. an MCP
 * tool that needs polling). Out-of-range values warn + fall back.
 */
const MAX_CALLS_PER_TOOL_PER_REQUEST = (() => {
  const raw = process.env.MAX_CALLS_PER_TOOL_PER_REQUEST;
  if (!raw) return 3;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[chat] MAX_CALLS_PER_TOOL_PER_REQUEST=${raw} is not a positive integer; using default 3`,
    );
    return 3;
  }
  return n;
})();

/**
 * H8-c7 (cycle-7 audit closure §H8-c7) — token budget for
 * windowing the conversation history before each model.execute()
 * call. Default 32000 — covers GPT-4 Turbo / Claude 3 with
 * headroom for the model's response. Operator override via
 * `MAX_CONTEXT_TOKENS` env var to match deployment-specific
 * model windows; out-of-range values warn + fall back.
 *
 * Single global budget rather than model-specific; model-aware
 * windowing (read context_window from a per-model registry) is
 * deferred to cycle-8 — requires a registry that doesn't exist
 * yet. The estimate is intentionally a heuristic (chars/4) so
 * tuning the env var is the right knob, not adjusting the math.
 */
const MAX_CONTEXT_TOKENS = (() => {
  const raw = process.env.MAX_CONTEXT_TOKENS;
  if (!raw) return 32_000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[chat] MAX_CONTEXT_TOKENS=${raw} is not a positive integer; using default 32000`,
    );
    return 32_000;
  }
  return n;
})();
const INPUT_COST_PER_1M = 5; // USD, gpt-4o mid-tier estimate
const OUTPUT_COST_PER_1M = 15;

// C2-c4 PR-3 (D-RESUME-2) — bounded wait window for an operator to
// decide on a pending approval before the chat-stream surrenders. Default
// 300s = 5 min. Configurable via env so ops can tune per environment
// (browser/proxy SSE timeouts vary). Lower bound 1s to avoid pathological
// negative values; upper bound left unbounded — operator policy.
//
// L5-c6 (cycle-6 audit closure §L5-c6) — recommended range 10-3600
// seconds. Below 10s: most operators can't react fast enough; the
// approval pipeline collapses to "always timeout." Above 3600s:
// browser/proxy SSE keep-alive limits routinely close the
// connection before the wait completes, leading to user-visible
// stalls. The `Math.max(1, ...)` floor stays as a defensive guard
// against pathological config but is NOT the recommended range.
function approvalResumeTimeoutMs(): number {
  const raw = process.env.APPROVAL_RESUME_TIMEOUT_SEC;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
  // L5-c6: warn on out-of-range configurations so ops notice before
  // the next user-visible incident.
  if (Number.isFinite(parsed) && (parsed < 10 || parsed > 3600)) {
    console.warn(
      `[ags-runtime] APPROVAL_RESUME_TIMEOUT_SEC=${parsed} is outside ` +
        `the recommended 10-3600s range — see L5-c6 doc-block.`,
    );
  }
  return Math.max(1, seconds) * 1000;
}

function setupSse(res: Response): SseSend {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  return (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

// ── Tool schema helpers ──────────────────────────────────────────────────────

function sanitizeOpenAIToolName(raw: string): string {
  let out = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (/^[0-9]/.test(out)) out = "t_" + out;
  if (out.length > 64) out = out.slice(0, 64);
  return out;
}

interface ToolSpec {
  openaiName: string;
  dispatchKey: string; // `mcp__<serverName>__<remoteToolName>`
  /** Canonical server name (matches the agsMcpToolKnowledge mirror). */
  mcpServerId: string;
  /** Remote tool name (without the dispatch-key prefix). */
  remoteToolName: string;
  /** Live snapshot of the tool for the runtime validator (Follow-up A1). */
  liveTool: McpTool;
  schema: {
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  };
}

async function buildToolsForDraft(draftId: number): Promise<ToolSpec[]> {
  const servers = await repo.listMcpServers(draftId);
  const specs: ToolSpec[] = [];
  const taken = new Set<string>();
  for (const server of servers) {
    if (!server.enabled) continue;
    const snap = getSnapshot(server.id);
    if (!snap) continue;
    for (const tool of snap.tools) {
      const dispatchKey = `mcp__${server.name}__${tool.name}`;
      let openaiName = sanitizeOpenAIToolName(`${server.name}__${tool.name}`);
      let suffix = 1;
      const base = openaiName;
      while (taken.has(openaiName)) {
        openaiName = `${base}_${suffix++}`.slice(0, 64);
      }
      taken.add(openaiName);
      const parameters =
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} };
      specs.push({
        openaiName,
        dispatchKey,
        mcpServerId: server.name,
        remoteToolName: tool.name,
        liveTool: tool,
        schema: {
          type: "function",
          function: {
            name: openaiName,
            description: tool.description,
            parameters,
          },
        },
      });
    }
  }
  return specs;
}

// ── Streaming tool-call loop ─────────────────────────────────────────────────

// Phase 27.3 — `StreamingToolCall` accumulator was an OpenAI-stream-shape
// helper used by the deleted client.chat.completions.create(stream:true)
// loop. The Model Access tool path now uses non-streaming execute, which
// returns `result.toolCalls` as a complete array, so the accumulator is
// no longer needed.

interface LoopStats {
  inputTokens: number;
  outputTokens: number;
  costMicrocents: number;
  durationMs: number;
}

/**
 * Phase 27.3 — Run the tool-call loop via Model Access.
 *
 * Each turn calls `openRouter.modelAccess.execute` (non-streaming) and
 * emits the assistant content for that turn as a single SSE `token`
 * event. This is honestly degraded vs. token-by-token streaming; the
 * trade-off is that Direction A is exclusive (no raw provider key in
 * Agent Studio runtime). Tool-call streaming on Model Access is
 * deferred to a future phase that adds tool-call streaming to the
 * Model Access stream contract.
 *
 * Persists the final assistant row via appendChatMessage and returns
 * its id + cumulative stats so the caller can bump session totals
 * and emit `done`.
 */
async function runStreamingToolLoop(args: {
  providerConnectionId: number;
  modelRef: string;
  temperature: number;
  maxTokens: number | undefined;
  systemPrompt: string;
  sessionId: number;
  agentId: number;
  draftId: number;
  workspaceId: number;
  actorId: number;
  tools: ToolSpec[];
  sendEvent: SseSend;
}): Promise<{
  assistantRowId: number;
  content: string;
  stats: LoopStats;
}> {
  const {
    providerConnectionId,
    modelRef,
    temperature,
    maxTokens,
    systemPrompt,
    sessionId,
    agentId,
    draftId,
    workspaceId,
    actorId,
    tools,
    sendEvent,
  } = args;
  // Local alias kept for code locality with the persistence calls below.
  const model = modelRef;

  const dispatchKeyByOpenaiName = new Map<string, string>(
    tools.map((t) => [t.openaiName, t.dispatchKey])
  );
  const specByOpenaiName = new Map<string, ToolSpec>(
    tools.map((t) => [t.openaiName, t])
  );
  const toolSchemas = tools.map((t) => t.schema);

  const loopStart = Date.now();
  const stats: LoopStats = {
    inputTokens: 0,
    outputTokens: 0,
    costMicrocents: 0,
    durationMs: 0,
  };

  // H7-c7 (cycle-7 audit closure §H7-c7): per-tool dispatch counter
  // for the duration of THIS chat-stream call (across all
  // MAX_TOOL_TURNS turn iterations). Pre-cycle-7 the only loop
  // backstop was MAX_TOOL_TURNS=6; a model could call the same
  // tool up to 6 times in a row (e.g., `delete_all_files` x6) with
  // no per-tool guard. Each call is approved independently — the
  // approval gate has no notion of "this tool was just denied 2
  // turns ago." With this guard, after MAX_CALLS_PER_TOOL_PER_REQUEST
  // dispatches of the same tool we emit a synthetic refusal as the
  // tool result + emit a `tool_loop_guard` audit row and skip the
  // dispatch. The model sees the refusal and (if not jailbroken)
  // moves on; if it keeps trying, the next dispatch hits the same
  // guard.
  const toolDispatchCounts = new Map<string, number>();

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    // Rebuild messages from history so previous tool turns are in
    // scope for the next call. Map our internal shape onto
    // ModelAccessMessage[].
    const history = await repo.listChatMessages(sessionId);
    const messagesForModelAccess: ModelAccessMessage[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messagesForModelAccess.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const tp = (m.toolPayload ?? null) as any;
        if (tp?.toolCalls && Array.isArray(tp.toolCalls)) {
          messagesForModelAccess.push({
            role: "assistant",
            content: m.content || "",
            toolCalls: tp.toolCalls.map((c: any) => ({
              id: String(c.id ?? ""),
              name: String(c.function?.name ?? c.name ?? ""),
              arguments: String(c.function?.arguments ?? c.arguments ?? "{}"),
            })),
          });
        } else {
          messagesForModelAccess.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        // M9-c7 (cycle-7 audit closure §M9-c7): the persisted shape
        // contract for tool-role rows is documented in
        // `runtime/chat-history-shape.ts`. The strict
        // reconstruction (`reconstructToolHistoryMessage`) returns
        // null when toolCallId is missing/empty — but live sessions
        // pre-dating the contract may still carry rows without the
        // field, so we keep the legacy `?? ""` fallback here for
        // in-flight compatibility. New writes go through the
        // canonical `{ toolCallId, name }` shape (see write sites
        // ~lines 574/614/644/753/832). The lockstep test pins both
        // sides; future drift on EITHER fails the test before this
        // empty-string fallback can hide it.
        const tp = (m.toolPayload ?? null) as any;
        messagesForModelAccess.push({
          role: "tool",
          content: m.content,
          toolCallId: String(tp?.toolCallId ?? ""),
        });
      }
    }

    // H8-c7: window the message history to fit MAX_CONTEXT_TOKENS
    // BEFORE the model.execute() call. Pre-cycle-7 long sessions
    // grew unbounded until the provider's context limit was hit
    // and the chat failed unrecoverably. The helper preserves the
    // system message + as much recent history as fits.
    const windowed = windowChatHistory(messagesForModelAccess, {
      maxTokens: MAX_CONTEXT_TOKENS,
    });
    if (windowed.truncated) {
      // Best-effort observability — operators can grep for
      // context_truncation events to spot sessions that hit the
      // budget. Failure to write the audit row does NOT fail the
      // chat (mirrors L4-c5 trace-vs-audit + H7-c7 loop-guard
      // shape).
      try {
        await repo.appendRuntimePolicyEvent({
          runId: sessionId,
          policyKey: "context_truncation",
          decision: "warn",
          reason: "context_window_exceeded",
          payload: {
            maxTokens: MAX_CONTEXT_TOKENS,
            evictedCount: windowed.evictedCount,
            estimatedTokens: windowed.estimatedTokens,
            keptCount: windowed.messages.length,
            source: "chat-stream",
          },
        });
      } catch (e) {
        console.warn(
          `[chat-stream] context_truncation event write failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Phase 27.3 — non-streaming Model Access execute per turn.
    // Tool-call streaming on Model Access is deferred to a future
    // phase; we honestly degrade by emitting the turn's assistant
    // content as one SSE `token` event after the call returns.
    const turnStartMs = Date.now();
    const executeInput: ModelAccessExecuteInput = {
      providerConnectionId,
      modelRef,
      messages: windowed.messages,
      tools: toolSchemas as unknown as unknown[],
      stream: false,
      tokenBudget: maxTokens,
      temperature,
      intent: "chat",
      workspaceId,
      actorId,
    };
    const result: ModelAccessResult = await gatewayCall<
      ModelAccessExecuteInput,
      ModelAccessResult
    >({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId,
        workspaceId,
        // Per-turn governance receipt (Phase 20 hybrid policy).
        governanceReceiptId: `chat-stream-tools-${sessionId}-t${turn}-${Date.now()}`,
      },
      input: executeInput,
    });

    if (result.status !== "ok") {
      throw new Error(result.error ?? "Model Access returned status=error");
    }

    const contentAccum = result.output ?? "";
    const turnPromptTokens = result.usage?.inputTokens ?? 0;
    const turnCompletionTokens = result.usage?.outputTokens ?? 0;
    const finishReason: string | null = result.finishReason ?? null;
    const modelAccessToolCalls: ModelAccessToolCall[] = result.toolCalls ?? [];

    // Emit the turn's content as a single SSE token chunk (degraded
    // from token-by-token; see function-level comment).
    if (contentAccum.length > 0) {
      sendEvent({ type: "token", content: contentAccum });
    }

    // Update cumulative stats
    stats.inputTokens += turnPromptTokens;
    stats.outputTokens += turnCompletionTokens;
    const turnCost =
      (turnPromptTokens / 1_000_000) * INPUT_COST_PER_1M +
      (turnCompletionTokens / 1_000_000) * OUTPUT_COST_PER_1M;
    stats.costMicrocents += Math.round(turnCost * 1_000_000);
    void turnStartMs; // reserved for future per-turn duration telemetry

    if (
      (finishReason === "tool_calls" || modelAccessToolCalls.length > 0) &&
      modelAccessToolCalls.length > 0
    ) {
      // Re-shape ModelAccessToolCall onto the historical OpenAI-style
      // tool_calls shape that the on-disk toolPayload column expects;
      // this preserves history compatibility with prior turns.
      const persistedToolCalls = modelAccessToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      await repo.appendChatMessage({
        sessionId,
        role: "assistant",
        content: contentAccum,
        toolPayload: { toolCalls: persistedToolCalls },
        model,
      });

      // Dispatch every tool call and persist results as role=tool
      for (const call of modelAccessToolCalls) {
        const openaiName = call.name;
        const rawArgs = call.arguments;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(rawArgs || "{}");
        } catch {
          parsedArgs = {};
        }
        const dispatchKey = dispatchKeyByOpenaiName.get(openaiName);
        sendEvent({
          type: "tool_start",
          toolName: openaiName,
          args: parsedArgs,
        });
        // H7-c7: per-tool dispatch ceiling. Increment AFTER tool_start
        // emit (so the operator UI shows the running chip even on the
        // refusal turn — they can see the model TRIED) but BEFORE
        // any other dispatch logic. Refused dispatches don't count
        // against approval gate or trace; they're a synthetic
        // short-circuit + a security event.
        const dispatchCount = (toolDispatchCounts.get(openaiName) ?? 0) + 1;
        toolDispatchCounts.set(openaiName, dispatchCount);
        if (dispatchCount > MAX_CALLS_PER_TOOL_PER_REQUEST) {
          const refusalContent = JSON.stringify({
            error: `tool call limit reached for "${openaiName}" in this request`,
            code: "tool_call_limit_exceeded",
            limit: MAX_CALLS_PER_TOOL_PER_REQUEST,
            attemptedCount: dispatchCount,
          });
          await repo.appendChatMessage({
            sessionId,
            role: "tool",
            content: refusalContent,
            toolPayload: { toolCallId: call.id, name: openaiName },
          });
          // Emit the security event for operator visibility. Best-
          // effort — failure here doesn't fail the chat (mirrors the
          // L4-c5 trace-vs-audit asymmetry shape: this guard's audit
          // is observability, not security-of-record).
          try {
            await repo.appendRuntimePolicyEvent({
              runId: sessionId,
              policyKey: "tool_loop_guard",
              decision: "deny",
              reason: "tool_call_limit_exceeded",
              payload: {
                toolName: openaiName,
                limit: MAX_CALLS_PER_TOOL_PER_REQUEST,
                attemptedCount: dispatchCount,
                source: "chat-stream",
              },
            });
          } catch (e) {
            console.warn(
              `[chat-stream] tool_loop_guard event write failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          sendEvent({
            type: "tool_end",
            toolName: openaiName,
            ok: false,
            error: `tool call limit reached for "${openaiName}" (${dispatchCount}/${MAX_CALLS_PER_TOOL_PER_REQUEST})`,
          });
          continue;
        }
        if (!dispatchKey) {
          const errContent = JSON.stringify({
            error: `unknown tool: ${openaiName}`,
          });
          await repo.appendChatMessage({
            sessionId,
            role: "tool",
            content: errContent,
            toolPayload: { toolCallId: call.id, name: openaiName },
          });
          sendEvent({
            type: "tool_end",
            toolName: openaiName,
            ok: false,
            error: `unknown tool: ${openaiName}`,
          });
          continue;
        }
        // Follow-up A1: ProposedToolCall validator gate runs BEFORE
        // dispatchMcpToolCall. Active gates with this runtime envelope
        // shape: invented_tool, missing_parameter, invented_parameter,
        // quarantined_tool, sandbox_required.
        //
        // Defense-in-depth: dispatchKey and spec are built from the same
        // loop, so spec lookup miss should be impossible. If it happens
        // anyway, fail closed — never bypass the validator + gate
        // because of an internal lookup inconsistency. (Review cleanup.)
        const spec = specByOpenaiName.get(openaiName);
        if (!spec) {
          const errContent = JSON.stringify({
            error: "tool spec lookup failed; refusing to dispatch without validator + gate",
            code: "spec_lookup_failed",
            gate: "proposed_tool_call_validator",
          });
          await repo.appendChatMessage({
            sessionId,
            role: "tool",
            content: errContent,
            toolPayload: { toolCallId: call.id, name: openaiName },
          });
          sendEvent({
            type: "tool_end",
            toolName: openaiName,
            ok: false,
            error: "spec_lookup_failed",
          });
          continue;
        }
        let runtimeValidation: RuntimeValidationResult | null = null;
        let runtimeVerdict: RuntimeDispatchVerdict | null = null;
        {
          runtimeValidation = await validateRuntimeToolCall({
            mcpServerId: spec.mcpServerId,
            toolName: spec.remoteToolName,
            liveTool: spec.liveTool,
            arguments: parsedArgs,
          });
          // Follow-up A2: approval gate after validator. Live chat has
          // no formal runtime-run row, so sessionId stands in as the
          // surrogate runtimeRunId on freshly-created approval rows.
          runtimeVerdict = await gateRuntimeDispatch({
            validation: runtimeValidation,
            agentDraftId: draftId,
            runtimeRunId: sessionId,
            description: `chat session ${sessionId} · tool ${openaiName}`,
          });

          // C1-c6 (cycle-6 audit closure §C1-c6): D-RESUME loop now
          // delegates to the shared `awaitApprovalDecision` helper.
          // Pre-cycle-6 the loop was inlined here AND missing entirely
          // from `services/chat.ts` — same parallel-flow asymmetry
          // shape as cycle-5 C1-c5 (runtimeRunId omission), one layer
          // deeper. The helper also closes C4-c6 (subscribes with an
          // AbortSignal so the early-return path releases the bus
          // listener synchronously instead of leaking until timeout).
          if (
            !runtimeVerdict.ok &&
            (runtimeVerdict.reason === "approval_required" ||
              runtimeVerdict.reason === "approval_pending") &&
            runtimeVerdict.approvalRequestId !== null
          ) {
            const reqId = runtimeVerdict.approvalRequestId;
            const timeoutMs = approvalResumeTimeoutMs();
            const initialVerdict = runtimeVerdict;

            const resume = await awaitApprovalDecision({
              approvalRequestId: reqId,
              timeoutMs,
              initialVerdict,
              revalidate: () =>
                gateRuntimeDispatch({
                  validation: runtimeValidation,
                  agentDraftId: draftId,
                  runtimeRunId: sessionId,
                  description: `chat session ${sessionId} · tool ${openaiName} · resume`,
                }),
              // Streaming surface — emit `awaiting_approval` to the
              // SSE client so UI can render a "waiting for approval"
              // badge. Non-streaming `services/chat.ts` passes no
              // `onAwaiting` (or a no-op). H4-c6: typed via exported
              // `AwaitingApprovalEvent` interface so the SSE shape is
              // a contract, not inference.
              onAwaiting: (rid, tms) => {
                const event: AwaitingApprovalEvent = {
                  type: "tool_end",
                  toolName: openaiName,
                  ok: false,
                  status: "awaiting_approval",
                  approvalRequestId: rid,
                  timeoutSec: Math.floor(tms / 1000),
                };
                sendEvent(event);
              },
            });
            runtimeVerdict = resume.verdict;
          }

          if (!runtimeVerdict.ok) {
            // Follow-up A3: persist a trace row even on rejection so
            // the runs page surfaces blocked attempts.
            await persistRuntimeToolCallTrace({
              workspaceId,
              agentId,
              agentDraftId: draftId,
              runtimeRunId: sessionId,
              runtimeTraceId: null,
              messageId: null,
              verdict: runtimeVerdict,
              validation: runtimeValidation,
              dispatchResult: null,
              governanceVerdict: null,
            });
            const gate =
              runtimeVerdict.reason === "validator_rejected"
                ? "proposed_tool_call_validator"
                : "approval_gate";
            const errContent = JSON.stringify({
              error: runtimeVerdict.message,
              code: runtimeVerdict.code,
              reason: runtimeVerdict.reason,
              approvalRequestId: runtimeVerdict.approvalRequestId,
              gate,
            });
            await repo.appendChatMessage({
              sessionId,
              role: "tool",
              content: errContent,
              toolPayload: { toolCallId: call.id, name: openaiName },
            });
            sendEvent({
              type: "tool_end",
              toolName: openaiName,
              ok: false,
              error: `${runtimeVerdict.reason}: ${runtimeVerdict.message}`,
            });
            continue;
          }
        }
        // C1-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md` §C1-c5)
        // — thread `sessionId` as `runtimeRunId` so the dispatcher writes
        // its `agsRuntimePolicyEvents` audit row. Pre-cycle-5 this call
        // omitted `runtimeRunId`; `writeAuditRow()` (dispatcher.ts:259)
        // returns `undefined` when `runId == null`, silently skipping the
        // canonical governance-audit ledger insert for the entire
        // production live-chat path. Trace row IS written below at line
        // 591 with the same `sessionId` surrogate; this just mirrors the
        // same shape for the audit ledger.
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: draftId,
          toolName: dispatchKey,
          args: parsedArgs,
          source: "live_runtime",
          runtimeRunId: sessionId,
          // M4-c5: thread the verdict's approval-row id (when present)
          // into the dispatcher's audit payload so forensics can resolve
          // "which approval permitted this dispatch" without joining
          // through agsToolCallTraces.
          approvalRequestId: runtimeVerdict?.approvalRequestId ?? undefined,
          // M4-c6: thread caller attribution (operator userId +
          // chat sessionId) so the audit row records WHO triggered
          // the dispatch, not just WHICH approval permitted it.
          // Without this, the audit ledger has caller=null for every
          // live-chat tool dispatch.
          caller: { userId: actorId, sessionId: String(sessionId) },
        });
        // Follow-up A3: persist per-dispatch trace row.
        if (runtimeValidation && runtimeVerdict) {
          await persistRuntimeToolCallTrace({
            workspaceId,
            agentId,
            agentDraftId: draftId,
            runtimeRunId: sessionId,
            runtimeTraceId: null,
            messageId: null,
            verdict: runtimeVerdict,
            validation: runtimeValidation,
            dispatchResult: {
              ok: dispatchResult.ok,
              error: dispatchResult.ok
                ? undefined
                : { message: dispatchResult.error?.message },
              durationMs: dispatchResult.durationMs,
            },
            governanceVerdict: null,
          });
        }
        const toolContent = dispatchResult.ok
          ? JSON.stringify(dispatchResult.result ?? null)
          : JSON.stringify({
              error: dispatchResult.error?.message ?? "dispatch failed",
              code: dispatchResult.error?.code,
            });
        // M5-c7 (cycle-7 audit closure §M5-c7) — persistence ordering
        // invariant: appendChatMessage MUST resolve BEFORE sendEvent
        // emits the SSE `tool_end` event. The contract is "the SSE
        // client never sees a tool result that isn't yet durable in
        // the message store." Reordering for perceived latency would
        // let a client disconnect mid-stream see a result that's not
        // in the persistent record — operator UI re-fetching on
        // reconnect would lose the tool turn. The SSE event is the
        // notification, not the source of truth. Same pattern in
        // services/chat.ts (non-streaming append-then-return).
        await repo.appendChatMessage({
          sessionId,
          role: "tool",
          content: toolContent,
          toolPayload: { toolCallId: call.id, name: openaiName },
        });
        // L2-c7 (cycle-7 audit closure §L2-c7) — KNOWN LIMITATION:
        // `result` is emitted as-is with no size cap on this path.
        // A 10MB tool result (e.g. a file-read MCP tool returning a
        // large blob) JSON-stringifies to >10MB on the wire and
        // could stall the SSE stream. Mitigation rationale for
        // deferring the cap to a follow-up:
        //   1. Most MCP tools return small results (search hits,
        //      file metadata, structured records — KB scale).
        //   2. Durable persistence happened above (`appendChatMessage`)
        //      so the message-store row is the canonical record; a
        //      stalled SSE doesn't lose data, only the live notification.
        //   3. The right cap point is the MCP tool-spec
        //      `outputSchema` (H2-c7 framework already in place) —
        //      schema-level enforcement at registration time
        //      prevents oversize results from ever reaching the
        //      dispatcher, rather than SSE-side truncation that
        //      would diverge what the model sees from what the
        //      operator UI sees. Folded into the H2-c7 schema-
        //      validation follow-up; lockstep test pins this
        //      doc-block so the limitation is discoverable.
        sendEvent({
          type: "tool_end",
          toolName: openaiName,
          ok: dispatchResult.ok,
          result: dispatchResult.ok ? dispatchResult.result : undefined,
          error: dispatchResult.ok ? undefined : dispatchResult.error?.message,
          durationMs: dispatchResult.durationMs,
        });
      }

      // Continue the loop — next iteration rebuilds history with the
      // tool results in scope.
      continue;
    }

    // No tool calls — final assistant message. Persist and return.
    stats.durationMs = Date.now() - loopStart;
    const row = await repo.appendChatMessage({
      sessionId,
      role: "assistant",
      content: contentAccum,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costMicrocents: stats.costMicrocents,
      model,
      durationMs: stats.durationMs,
    });
    return { assistantRowId: row.id, content: contentAccum, stats };
  }

  // Loop cap reached without terminating
  stats.durationMs = Date.now() - loopStart;
  const capMsg = `(Tool loop stopped after ${MAX_TOOL_TURNS} turns without a final answer.)`;
  const row = await repo.appendChatMessage({
    sessionId,
    role: "assistant",
    content: capMsg,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    costMicrocents: stats.costMicrocents,
    model,
    durationMs: stats.durationMs,
  });
  sendEvent({ type: "token", content: capMsg });
  return { assistantRowId: row.id, content: capMsg, stats };
}

// ── Pure (no-tools) streaming path ───────────────────────────────────────────

/**
 * Phase 27.3 — No-tools streaming via Model Access.
 *
 * Token-by-token streaming is preserved for the no-tools path because
 * `openRouter.modelAccess.stream` exposes an SSE-style async-iterable
 * that yields {delta, done, usage} chunks. The chat-stream SSE format
 * is unchanged: each non-empty `delta` becomes a `token` event.
 */
async function runPureStream(args: {
  providerConnectionId: number;
  modelRef: string;
  temperature: number;
  maxTokens: number | undefined;
  systemPrompt: string;
  sessionId: number;
  workspaceId: number;
  actorId: number;
  sendEvent: SseSend;
}): Promise<{
  assistantRowId: number;
  content: string;
  stats: LoopStats;
}> {
  const {
    providerConnectionId,
    modelRef,
    temperature,
    maxTokens,
    systemPrompt,
    sessionId,
    workspaceId,
    actorId,
    sendEvent,
  } = args;
  const model = modelRef;

  const history = await repo.listChatMessages(sessionId);
  const messagesForModelAccess: ModelAccessMessage[] = [
    { role: "system", content: systemPrompt },
    ...history
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      })),
  ];

  const startMs = Date.now();
  let accumulated = "";
  let promptTokens = 0;
  let completionTokens = 0;

  // Use Model Access stream via the gateway. Tool-less path; D2 boundary
  // resolves the credential inside OpenRouter; no apiKey ever crosses
  // back into Agent Studio.
  const chunks: AsyncIterable<ModelAccessStreamChunk> = await gatewayCall<
    ModelAccessExecuteInput,
    AsyncIterable<ModelAccessStreamChunk>
  >({
    ctx: {
      sourceModule: "agentStudio",
      targetModule: "openRouter",
      actionKey: "openRouter.modelAccess.stream",
      actorId,
      workspaceId,
      governanceReceiptId: `chat-stream-pure-${sessionId}-${Date.now()}`,
    },
    input: {
      providerConnectionId,
      modelRef,
      messages: messagesForModelAccess,
      stream: true,
      tokenBudget: maxTokens,
      temperature,
      intent: "chat",
      workspaceId,
      actorId,
    },
  });

  for await (const chunk of chunks) {
    if (chunk.delta && chunk.delta.length > 0) {
      accumulated += chunk.delta;
      sendEvent({ type: "token", content: chunk.delta });
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.inputTokens ?? promptTokens;
      completionTokens = chunk.usage.outputTokens ?? completionTokens;
    }
    if (chunk.done) break;
  }

  const durationMs = Date.now() - startMs;
  const estCost =
    (promptTokens / 1_000_000) * INPUT_COST_PER_1M +
    (completionTokens / 1_000_000) * OUTPUT_COST_PER_1M;
  const costMicrocents = Math.round(estCost * 1_000_000);

  const row = await repo.appendChatMessage({
    sessionId,
    role: "assistant",
    content: accumulated,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    costMicrocents,
    model,
    durationMs,
  });

  return {
    assistantRowId: row.id,
    content: accumulated,
    stats: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costMicrocents,
      durationMs,
    },
  };
}

// ── Request handler ──────────────────────────────────────────────────────────

export async function handleAgentStudioChatStream(req: Request, res: Response) {
  const sessionIdRaw = req.query.sessionId as string | undefined;
  const userMessage = req.query.message as string | undefined;
  if (!sessionIdRaw || !userMessage) {
    res
      .status(400)
      .json({ error: "Missing required parameters: sessionId, message" });
    return;
  }
  const sessionId = parseInt(sessionIdRaw, 10);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  const sendEvent = setupSse(res);

  try {
    const session = await repo.getChatSessionById(sessionId);
    if (!session) {
      sendEvent({ type: "error", error: `Chat session ${sessionId} not found` });
      res.end();
      return;
    }
    const draft = await repo.getCurrentDraft(session.agentId);
    if (!draft) {
      sendEvent({
        type: "error",
        error: `Agent ${session.agentId} has no current draft`,
      });
      res.end();
      return;
    }

    const providerConfig = (draft.providerConfig ?? {}) as Record<string, unknown>;
    const temperature =
      typeof providerConfig.temperature === "number" ? providerConfig.temperature : 0.2;
    const maxTokens =
      typeof providerConfig.maxTokens === "number" ? providerConfig.maxTokens : undefined;

    // Phase 27.3 — binding-required. Streaming Expert chat no longer
    // resolves provider keys directly. Every runtime path goes through
    // OpenRouter Model Access (D2), which means an active Provider
    // Connection bound to this draft is now mandatory.
    const binding = await getAgentProviderBinding(draft.id, "primary");
    if (
      !binding ||
      binding.status !== "binding_v1" ||
      !binding.providerConnectionId
    ) {
      sendEvent({
        type: "error",
        error:
          "No active provider binding configured for this agent. " +
          "Open the Provider Binding page in Agent Studio and bind a provider/model " +
          "from the AI Types catalog before starting an Expert chat.",
        code: "binding_required",
      });
      res.end();
      return;
    }
    const providerConnectionId = binding.providerConnectionId;
    const modelRef = binding.modelRef;
    if (!modelRef || modelRef.length === 0) {
      sendEvent({
        type: "error",
        error: "Provider binding is missing modelRef.",
        code: "binding_missing_model",
      });
      res.end();
      return;
    }
    const model = modelRef;

    // Plan v3 Phase 15 staleness check is enforced inside Model Access's
    // resolve path; we don't need to duplicate it here. Workspace and
    // actor are required for the gatewayCall sealed context.
    const workspaceId =
      typeof (draft as any).workspaceId === "number" ? (draft as any).workspaceId : 1;
    const actorId =
      typeof (session as any).createdBy === "number"
        ? (session as any).createdBy
        : 1;

    // Persist user message FIRST so it survives LLM failures
    await repo.appendChatMessage({
      sessionId,
      role: "user",
      content: userMessage,
    });

    // RAC P6 — runtime orchestrator owns the locked sequence:
    // resolveCagPack -> RAC profile/plan/execute/filter/assemble ->
    // composeSystemPrompt. CAG_MODE env var (default safe_degraded)
    // applies to BOTH CAG and retrieval per D-PRM-6.
    const cagMode = (process.env.CAG_MODE as ComposerMode) ?? "safe_degraded";
    let systemPrompt: string;
    let racBuilt: Awaited<ReturnType<typeof buildRuntimeSystemPrompt>> | null = null;
    try {
      racBuilt = await buildRuntimeSystemPrompt({
        mode: cagMode,
        workspaceId,
        agentId: (draft as any).agentId ?? draft.id,
        agentDraftId: draft.id,
        actorId,
        query: userMessage,
        draft: {
          name: (draft as any).name ?? null,
          role: (draft as any).role ?? null,
          scope: (draft as any).scope ?? null,
          mission: (draft as any).mission ?? null,
          systemInstructions: draft.systemInstructions ?? null,
          roleInstructions: draft.roleInstructions ?? null,
          policyInstructions: (draft as any).policyInstructions ?? null,
          successCriteria: (draft as any).successCriteria ?? null,
          escalationRules: (draft as any).escalationRules ?? null,
        },
      });
      systemPrompt = racBuilt.systemPrompt;
      for (const w of racBuilt.context.warnings) console.info(`[chat-stream/rac] ${w}`);
      for (const w of racBuilt.composerWarnings) console.info(`[chat-stream/composer] ${w}`);
    } catch (err) {
      if (err instanceof CagRequiredError) {
        sendEvent({ type: "error", error: err.message, code: "cag_required" });
        res.end();
        return;
      }
      if (err instanceof RetrievalRequiredError) {
        sendEvent({ type: "error", error: err.message, code: "retrieval_required" });
        res.end();
        return;
      }
      throw err;
    }

    // Pick path based on whether any MCP server for this draft has
    // a live registry snapshot (i.e. is actually connected)
    const toolSpecs = await buildToolsForDraft(draft.id);
    const pathResult =
      toolSpecs.length > 0
        ? await runStreamingToolLoop({
            providerConnectionId,
            modelRef,
            temperature,
            maxTokens,
            systemPrompt,
            sessionId,
            agentId: (draft as any).agentId ?? draft.id,
            draftId: draft.id,
            workspaceId,
            actorId,
            tools: toolSpecs,
            sendEvent,
          })
        : await runPureStream({
            providerConnectionId,
            modelRef,
            temperature,
            maxTokens,
            systemPrompt,
            sessionId,
            workspaceId,
            actorId,
            sendEvent,
          });

    // Bump session totals + auto-title. The tool loop wrote multiple
    // messages (assistant-with-tool_calls + role=tool rows + final
    // assistant) — count the delta from the pre-stream history to
    // capture all of them. Pure-stream path adds exactly 2 (user +
    // assistant), since we pre-persisted the user row ourselves.
    const postHistory = await repo.listChatMessages(sessionId);
    // Count of messages added by this request = postHistory size
    // minus (pre-request size). We don't know pre-request size here
    // exactly, but we know the pure-stream path adds 2 and the loop
    // path adds N where N = 1 (user) + 2K (assistant+tool per turn)
    // + 1 (final assistant). For the totals row, we just care about
    // the delta since the last bumpChatSessionTotals — so on pure
    // stream we bump by 2, on loop we recompute from the history
    // length compared to the stored messageCount.
    const priorMessageCount = session.messageCount ?? 0;
    const addedMessages = postHistory.length - priorMessageCount;

    const autoTitle =
      !session.title && userMessage
        ? userMessage.slice(0, 60).trim()
        : undefined;
    await repo.bumpChatSessionTotals({
      sessionId,
      addInputTokens: pathResult.stats.inputTokens,
      addOutputTokens: pathResult.stats.outputTokens,
      addCostMicrocents: pathResult.stats.costMicrocents,
      addMessages: Math.max(2, addedMessages),
      title: autoTitle,
    });

    // RAC P7 — best-effort trace persistence at end-of-stream. We
    // already have the assistantMessageId via pathResult; the
    // orchestrator captured the trace metrics + per-source detail.
    if (racBuilt) {
      const t = racBuilt.context.trace;
      const st = racBuilt.context.sourceTrace;
      writeTrace({
        workspaceId,
        agentId: (draft as any).agentId ?? draft.id,
        agentDraftId: draft.id,
        sessionId,
        messageId: pathResult.assistantRowId,
        actorId,
        mode: cagMode,
        cagPackId: t.cagPackId,
        cagPackVersion: t.cagPackVersion,
        retrievalEnabled: t.retrievalEnabled,
        retrievalLatencyMs: t.retrievalEnabled ? t.retrievalLatencyMs : null,
        chunksReturned: t.chunksReturned,
        chunksFiltered: t.chunksFiltered,
        chunksIncluded: t.chunksIncluded,
        truncatedByBudget: t.truncatedByBudget,
        fallbackReason: t.fallbackReason,
        warnings: racBuilt.context.warnings,
        perSourceLatencyMs: t.perSourceLatencyMs,
        piiBlockedCount: t.piiBlockedCount,
        licenseBlockedCount: t.licenseBlockedCount,
      })
        .then(async (traceId) => {
          if (st.includedChunks.length === 0) return;
          const blocks = buildContextBlockRows({
            traceId,
            workspaceId,
            includedChunks: st.includedChunks,
            chunkSourceMap: st.chunkSourceMap,
            perSourceLatencyMs: t.perSourceLatencyMs,
          });
          await writeContextBlocks(blocks);
        })
        .catch((err) =>
          console.warn(
            `[chat-stream/trace] write failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    sendEvent({
      type: "done",
      assistantMessageId: pathResult.assistantRowId,
      usage: {
        promptTokens: pathResult.stats.inputTokens,
        completionTokens: pathResult.stats.outputTokens,
      },
      model,
      durationMs: pathResult.stats.durationMs,
      costMicrocents: pathResult.stats.costMicrocents,
    });
    res.end();
  } catch (error: any) {
    console.error("[AgentStudioChatStream] Error:", error);
    try {
      sendEvent({ type: "error", error: error?.message ?? String(error) });
    } catch {
      /* headers already sent, ignore */
    }
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
}
