/**
 * AI Agent Studio — Chat Service
 *
 * Phase 19 follow-up: dedicated multi-turn chat interface for Agent
 * Studio agents. Like OpenCode's chat view but scoped to the Studio
 * module's agents (ags_*).
 *
 * Architecture:
 *   - Sessions persist in ags_chat_sessions (one per conversation)
 *   - Messages persist in ags_chat_messages (user, assistant, tool)
 *   - Each sendMessage call:
 *       1. Persists the user message
 *       2. Loads the full message history (for context)
 *       3. Builds the LLM request: system prompt from draft.system
 *          Instructions + draft.roleInstructions, then all past
 *          messages, then the new user message
 *       4. Calls `openRouter.modelAccess.execute` via the platform
 *          gateway — Plan v3 D4 surface; credentials resolved
 *          internally by Model Access
 *       5. Persists the assistant response + updates session totals
 *       6. Returns the assistant message to the client
 *
 * Key differences from simulation:
 *   - Multi-turn (message history accumulates across calls)
 *   - No step timeline (chat is just user/assistant message pairs)
 *   - No governance dispatcher (for MVP — can layer it in later
 *     by routing tool calls through dispatchMcpToolCall)
 *   - Persistent (chat survives page reloads via asdb storage)
 *
 * MVP scope: text-only, no tool calls, no streaming. Tool calls and
 * streaming are both additive follow-ups that don't change the data
 * model — tool calls become role="tool" messages, streaming wraps
 * the same `modelAccess.execute` call with an onToken callback.
 */

// Phase 29.0a — `openai` SDK and the legacy `runViaOpenAIDirect` /
// `resolveProviderApiKey` adapter functions are deleted from the
// codebase. Direction A is exclusive on this file: the binding-aware
// paths go through `gatewayCall("openRouter.modelAccess.execute")`.
import * as repo from "../repository";
import { dispatchMcpToolCall } from "./mcp/dispatcher";
import {
  gateRuntimeDispatch,
  persistRuntimeToolCallTrace,
  validateRuntimeToolCall,
  type RuntimeDispatchVerdict,
  type RuntimeValidationResult,
} from "./runtime/proposed-tool-call-runtime";
// C1-c6 (cycle-6 audit closure §C1-c6): chat.ts had NO D-RESUME loop
// pre-cycle-6 — the chat session never resumed when the operator
// approved out-of-band. Both call sites (chat-stream + chat.ts)
// delegate to the same shared helper post-cycle-6.
import { awaitApprovalDecision } from "./runtime/approval-resume-loop";
// H8-c7 (cycle-7 audit closure §H8-c7): conversation-context windowing
// before each model.execute() call. Mirrors chat-stream.ts wire-up.
import { windowChatHistory } from "./runtime/context-window";

function approvalResumeTimeoutMs(): number {
  // C1-c6: same env var as chat-stream.ts uses (APPROVAL_RESUME_TIMEOUT_SEC,
  // default 300s). Inlined here rather than imported so chat.ts has
  // no dependency on the chat-stream module.
  // L5-c6: recommended 10-3600s — see chat-stream.ts L5-c6 doc-block.
  // The `Math.max(1, ...)` floor is a defensive guard against
  // pathological config; not the recommended range.
  const raw = process.env.APPROVAL_RESUME_TIMEOUT_SEC;
  const seconds = raw ? Number.parseInt(raw, 10) : NaN;
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
  if (Number.isFinite(seconds) && (seconds < 10 || seconds > 3600)) {
    console.warn(
      `[ags-runtime] APPROVAL_RESUME_TIMEOUT_SEC=${seconds} is outside ` +
        `the recommended 10-3600s range — see L5-c6 doc-block.`,
    );
  }
  return Math.max(1, safe) * 1000;
}
import { getSnapshot } from "./mcp/registry";
import { getAgentProviderBinding } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import type {
  ModelAccessExecuteInput,
  ModelAccessMessage,
  ModelAccessResult,
  ModelAccessToolCall,
} from "../../openrouter/model-access/types";
import { evaluateProviderUsePolicy } from "./provider-use-governance";
import {
  CagRequiredError,
  type ComposerMode,
} from "./runtime/system-prompt-composer";
import {
  buildRuntimeSystemPrompt,
  RetrievalRequiredError,
} from "./runtime/rac-orchestrator";

export interface SendChatMessageInput {
  sessionId: number;
  userMessage: string;
}

export interface SendChatMessageResult {
  ok: boolean;
  assistantMessage?: {
    id: number;
    content: string;
    inputTokens: number;
    outputTokens: number;
    costMicrocents: number;
    durationMs: number;
    model: string;
  };
  error?: string;
  /**
   * Phase 27.5 — structured error code for the binding-required
   * degraded state. UIs key off this to render an inline link to the
   * Phase 14 picker rather than just the human-readable error string.
   */
  /**
   * Structured error code. Pre-cycle-8 only `binding_required` /
   * `binding_missing_model` were surfaced; H1-c8 added the orchestrator
   * codes (`cag_required`, `retrieval_required`) so the non-streaming
   * caller's UI can distinguish them from binding-related errors.
   * The trailing `| string` keeps room for future codes without breaking
   * downstream consumers.
   */
  code?:
    | "binding_required"
    | "binding_missing_model"
    | "cag_required"
    | "retrieval_required"
    | string;
  /**
   * H5-c7 (cycle-7 audit closure §H5-c7) — non-streaming
   * awaiting-approval signal. When the chat turn hit a tool call
   * that required operator approval and the runtime gate's
   * `awaitApprovalDecision` paused the loop, this carries the
   * `approvalRequestId` + countdown of the most recent pending
   * decision. Lets the blocking RPC caller (e.g. a tRPC mutation
   * calling `sendChatMessage`) render a "waiting for approval"
   * surface instead of blocking silently for up to
   * `APPROVAL_RESUME_TIMEOUT_SEC`. The streaming path emits an
   * `AwaitingApprovalEvent` SSE event for the same purpose; this
   * field is the non-streaming equivalent (mirrors the cycle-5/6
   * parallel-flow asymmetry pattern — chat-stream had the signal,
   * chat.ts didn't).
   *
   * Set on the LAST `onAwaiting` fire within the turn (rare to
   * have multiple in one turn since each tool call awaits then
   * resolves before the next). Absent when no tool call awaited.
   */
  awaitingApproval?: { approvalRequestId: number; timeoutSec: number };
}

// ── Tool-call helpers (Phase 19 follow-up Task #5) ───────────────────────────

/**
 * OpenAI function tool names must match ^[a-zA-Z0-9_-]{1,64}$. MCP tool
 * names routinely contain dots (e.g. `studio.echo`, `fs.read_file`) and
 * our dispatcher key format `mcp__server__tool` contains double-
 * underscores. We build a Map from OpenAI-safe name → dispatch key so
 * we don't have to reverse-parse on callback.
 */
function sanitizeOpenAIToolName(raw: string): string {
  // Allowed: a-z A-Z 0-9 _ -
  // Replace anything else with _. If the result starts with a digit,
  // prepend `t_`. Clamp to 64 chars.
  let out = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (/^[0-9]/.test(out)) out = "t_" + out;
  if (out.length > 64) out = out.slice(0, 64);
  return out;
}

interface ChatToolSpec {
  /** Name passed to OpenAI */
  openaiName: string;
  /** Dispatcher key `mcp__<serverName>__<remoteToolName>` */
  dispatchKey: string;
  /** Canonical server name (matches the agsMcpToolKnowledge mirror). */
  mcpServerId: string;
  /** Remote tool name (without the dispatch-key prefix). */
  remoteToolName: string;
  /** Live snapshot of the tool for the runtime validator (Follow-up A1). */
  liveTool: import("./mcp/types").McpTool;
  /** OpenAI tool schema */
  schema: {
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  };
}

/**
 * Build OpenAI function tool schemas from every MCP server attached to
 * the draft, gated by the registry (only CONNECTED servers publish
 * snapshots). Returns an empty array when no tools are available; the
 * caller then runs a no-tools completion.
 */
async function buildToolsForDraft(draftId: number): Promise<ChatToolSpec[]> {
  const servers = await repo.listMcpServers(draftId);
  const specs: ChatToolSpec[] = [];
  const takenNames = new Set<string>();
  for (const server of servers) {
    if (!server.enabled) continue;
    const snap = getSnapshot(server.id);
    if (!snap) continue; // server not connected yet
    for (const tool of snap.tools) {
      const dispatchKey = `mcp__${server.name}__${tool.name}`;
      let openaiName = sanitizeOpenAIToolName(`${server.name}__${tool.name}`);
      // Handle collisions on the sanitized name
      let suffix = 1;
      const base = openaiName;
      while (takenNames.has(openaiName)) {
        openaiName = `${base}_${suffix++}`.slice(0, 64);
      }
      takenNames.add(openaiName);
      // Default parameters schema if the tool doesn't publish one
      const parameters =
        (tool.inputSchema && typeof tool.inputSchema === "object")
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

/**
 * Maximum number of tool-call turns before we force-stop the loop and
 * ask the model to finalize. Prevents infinite loops when the model
 * keeps calling tools instead of answering.
 */
const MAX_TOOL_TURNS = 6;

/**
 * H7-c7 (cycle-7 audit closure §H7-c7) — per-tool dispatch ceiling
 * within a single sendChatMessage call. Mirrors the chat-stream.ts
 * constant exactly so both flows enforce the same loop-hygiene
 * contract (parallel-flow lockstep — cycles 5/6/7 standing pattern).
 *
 * Operator override via `MAX_CALLS_PER_TOOL_PER_REQUEST` env var.
 * Out-of-range values warn + fall back to the default.
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
 * H8-c7 (cycle-7 audit closure §H8-c7) — token budget for windowing
 * the conversation history before each model.execute() call. Mirrors
 * chat-stream.ts's MAX_CONTEXT_TOKENS exactly — same env var
 * controls both flows so operators can't drift them apart.
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


/**
 * Start a new chat session attached to an agent, with an optional
 * initial user message. Returns the created session id.
 */
export async function startChatSession(input: {
  agentId: number;
  title?: string;
}): Promise<{ sessionId: number }> {
  // Resolve the agent's current draft so we can snapshot the provider
  // config at session start (reproducibility: if the user later edits
  // the draft, existing sessions still show the model they were run
  // against).
  const draft = await repo.getCurrentDraft(input.agentId);
  const providerSnapshot = (draft?.providerConfig ?? {}) as Record<string, unknown>;
  const session = await repo.createChatSession({
    agentId: input.agentId,
    title: input.title,
    providerSnapshot,
  });
  return { sessionId: session.id };
}

/**
 * Plan v3 Phase 18 — binding-driven tool-call loop.
 *
 * Mirrors the legacy `runChatWithTools` but routes each turn through
 * `openRouter.modelAccess.execute` via the platform gateway instead
 * of `new OpenAI({apiKey})`. Closes LR-01 for tool-equipped chats:
 * Agent Studio never holds a raw key; Model Access pulls credentials
 * inside its D2 boundary.
 *
 * Exit conditions are identical to the legacy loop:
 *   - Final assistant message with no further tool_calls → return.
 *   - MAX_TOOL_TURNS reached → write a synthetic "(loop stopped…)"
 *     assistant message and return.
 *
 * The dispatcher (`dispatchMcpToolCall`) is unchanged — Phase 18 is
 * about the model-call boundary, not the MCP tool side.
 */
async function runChatWithToolsViaBinding(input: {
  sessionId: number;
  agentId: number;
  draftId: number;
  providerConnectionId: number;
  modelRef: string;
  systemPrompt: string;
  tools: ChatToolSpec[];
  workspaceId: number;
  actorId: number;
  temperature: number;
  maxTokens?: number;
  /** Plan v3 Phase 21 — passed through so the policy gate has refs. */
  binding: import("../bindings").AgentProviderBindingPublic;
}) {
  const dispatchKeyByOpenaiName = new Map<string, string>(
    input.tools.map((t) => [t.openaiName, t.dispatchKey]),
  );
  const specByOpenaiName = new Map<string, ChatToolSpec>(
    input.tools.map((t) => [t.openaiName, t]),
  );
  const toolSchemas = input.tools.map((t) => t.schema);

  // Plan v3 Phase 21 — provider-use governance. Scan the static
  // history once at loop entry; subsequent turns only add server-
  // controlled tool outputs, so a re-scan would be redundant.
  {
    const initialHistory = await repo.listChatMessages(input.sessionId);
    const initialMessages = [
      { role: "system", content: input.systemPrompt },
      ...initialHistory.map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
      })),
    ];
    const policy = await evaluateProviderUsePolicy({
      binding: input.binding,
      messages: initialMessages,
    });
    if (policy.ok === false) {
      throw new Error(`${policy.reason}: ${policy.detail}`);
    }
  }

  const startMs = Date.now();
  let cumulativeInputTokens = 0;
  let cumulativeOutputTokens = 0;
  let cumulativeCostMicrocents = 0;
  // Cost is not surfaced by Model Access in Phase 4 / 18 — leave at 0
  // and let Phase 20+ pricing rollup populate it.

  // H5-c7 (cycle-7 audit closure §H5-c7): capture awaiting-approval
  // state across the turn so the BLOCKING caller (sendChatMessage's
  // tRPC entry point) can surface it in the result alongside the
  // assistantMessage. Pre-cycle-7 chat.ts passed no `onAwaiting`
  // callback (chat-stream.ts emitted SSE; chat.ts blocked silently
  // for up to APPROVAL_RESUME_TIMEOUT_SEC). Recorded as the LAST
  // awaiting-approval event the turn observed.
  let lastAwaiting: { approvalRequestId: number; timeoutSec: number } | null = null;

  // H7-c7 (cycle-7 audit closure §H7-c7): per-tool dispatch counter
  // for THIS chat call (across all MAX_TOOL_TURNS turn iterations).
  // Mirrors the chat-stream.ts loop-hygiene guard exactly — same
  // shape as the cycles 5/6/7 parallel-flow lockstep pattern.
  const toolDispatchCounts = new Map<string, number>();

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const history = await repo.listChatMessages(input.sessionId);
    const messages: ModelAccessMessage[] = [
      { role: "system", content: input.systemPrompt },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const tp = (m.toolPayload ?? null) as any;
        // toolPayload here may be either:
        //   - {toolCalls: [...]} (new Phase 18 binding path) where each
        //     call is already in {id, name, arguments} shape, OR
        //   - {toolCalls: [...]} (legacy OpenAI shape) with
        //     {id, type:"function", function:{name, arguments}} entries.
        // We accept both: normalize to the Phase 18 shape.
        if (tp?.toolCalls && Array.isArray(tp.toolCalls)) {
          const normalized: ModelAccessToolCall[] = tp.toolCalls.map((c: any) => {
            if (c?.function?.name) {
              return {
                id: c.id ?? "",
                name: c.function.name,
                arguments:
                  typeof c.function.arguments === "string"
                    ? c.function.arguments
                    : JSON.stringify(c.function.arguments ?? {}),
              };
            }
            return {
              id: c?.id ?? "",
              name: c?.name ?? "",
              arguments:
                typeof c?.arguments === "string"
                  ? c.arguments
                  : JSON.stringify(c?.arguments ?? {}),
            };
          });
          messages.push({
            role: "assistant",
            content: m.content || "",
            toolCalls: normalized,
          });
        } else {
          messages.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        // M9-c7 (cycle-7 audit closure §M9-c7): the persisted
        // shape contract for tool-role rows is documented in
        // `runtime/chat-history-shape.ts`. The strict
        // reconstruction (`reconstructToolHistoryMessage`) returns
        // null when toolCallId is missing/empty — but live sessions
        // pre-dating the contract may still carry rows without the
        // field, so we keep the legacy `?? ""` fallback here for
        // in-flight compatibility. New writes go through the
        // canonical `{ toolCallId, name }` shape (see write sites
        // ~lines 542/570/589/687/755). The lockstep test pins both
        // sides; future drift on EITHER fails the test before this
        // empty-string fallback can hide it.
        const tp = (m.toolPayload ?? null) as any;
        messages.push({
          role: "tool",
          content: m.content,
          toolCallId: tp?.toolCallId ?? "",
        });
      }
    }

    // H8-c7: window the conversation history to fit MAX_CONTEXT_TOKENS
    // BEFORE the model.execute() call. Mirrors chat-stream.ts's
    // wire-up exactly so both flows behave identically (parallel-flow
    // lockstep). On truncation, emit a best-effort context_truncation
    // audit row for operator visibility.
    const windowed = windowChatHistory(messages, {
      maxTokens: MAX_CONTEXT_TOKENS,
    });
    if (windowed.truncated) {
      try {
        await repo.appendRuntimePolicyEvent({
          runId: input.sessionId,
          policyKey: "context_truncation",
          decision: "warn",
          reason: "context_window_exceeded",
          payload: {
            maxTokens: MAX_CONTEXT_TOKENS,
            evictedCount: windowed.evictedCount,
            estimatedTokens: windowed.estimatedTokens,
            keptCount: windowed.messages.length,
            source: "chat",
          },
        });
      } catch (e) {
        console.warn(
          `[chat] context_truncation event write failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const executeInput: ModelAccessExecuteInput = {
      providerConnectionId: input.providerConnectionId,
      modelRef: input.modelRef,
      messages: windowed.messages,
      tools: toolSchemas,
      intent: "chat",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      temperature: input.temperature,
      tokenBudget: input.maxTokens,
    };

    const result: ModelAccessResult = await gatewayCall<
      ModelAccessExecuteInput,
      ModelAccessResult
    >({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        // Plan v3 Phase 20 — see RECEIPT_POLICY.md. Per-turn receipt
        // id is fine for the tool-loop; Phase 21 will register a
        // single receipt for the whole loop.
        governanceReceiptId: `chat-tools-${input.sessionId}-t${turn}-${Date.now()}`,
      },
      input: executeInput,
    });

    if (result.status !== "ok") {
      throw new Error(result.error ?? "Model Access returned status=error");
    }

    cumulativeInputTokens += result.usage?.inputTokens ?? 0;
    cumulativeOutputTokens += result.usage?.outputTokens ?? 0;

    const toolCalls = result.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      // Persist the assistant turn carrying the tool_calls.
      await repo.appendChatMessage({
        sessionId: input.sessionId,
        role: "assistant",
        content: result.output ?? "",
        toolPayload: { toolCalls },
        model: input.modelRef,
      });

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments);
        } catch {
          args = {};
        }
        // H7-c7: per-tool dispatch ceiling. Same shape as
        // chat-stream.ts's guard — increment, check ceiling, on
        // excess emit a synthetic refusal + audit row + skip the
        // dispatch. Persistence-ordering invariant (M5-c7) holds:
        // refusal message is appended BEFORE the loop continues.
        const dispatchCount =
          (toolDispatchCounts.get(call.name) ?? 0) + 1;
        toolDispatchCounts.set(call.name, dispatchCount);
        if (dispatchCount > MAX_CALLS_PER_TOOL_PER_REQUEST) {
          await repo.appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: JSON.stringify({
              error: `tool call limit reached for "${call.name}" in this request`,
              code: "tool_call_limit_exceeded",
              limit: MAX_CALLS_PER_TOOL_PER_REQUEST,
              attemptedCount: dispatchCount,
            }),
            toolPayload: { toolCallId: call.id, name: call.name },
          });
          try {
            await repo.appendRuntimePolicyEvent({
              runId: input.sessionId,
              policyKey: "tool_loop_guard",
              decision: "deny",
              reason: "tool_call_limit_exceeded",
              payload: {
                toolName: call.name,
                limit: MAX_CALLS_PER_TOOL_PER_REQUEST,
                attemptedCount: dispatchCount,
                source: "chat",
              },
            });
          } catch (e) {
            console.warn(
              `[chat] tool_loop_guard event write failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          continue;
        }
        const dispatchKey = dispatchKeyByOpenaiName.get(call.name);
        if (!dispatchKey) {
          await repo.appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: JSON.stringify({ error: `unknown tool: ${call.name}` }),
            toolPayload: { toolCallId: call.id, name: call.name },
          });
          continue;
        }
        // Follow-up A1: ProposedToolCall validator runs BEFORE dispatch.
        // Defense-in-depth: dispatchKey and spec are built from the same
        // loop, so spec lookup miss should be impossible. If it happens
        // anyway, fail closed — never bypass the validator + gate
        // because of an internal lookup inconsistency. (Review cleanup.)
        const spec = specByOpenaiName.get(call.name);
        if (!spec) {
          await repo.appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: JSON.stringify({
              error: "tool spec lookup failed; refusing to dispatch without validator + gate",
              code: "spec_lookup_failed",
              gate: "proposed_tool_call_validator",
            }),
            toolPayload: { toolCallId: call.id, name: call.name },
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
            arguments: args,
          });
          // Follow-up A2: approval gate after validator. Live chat has
          // no formal runtime-run row, so sessionId stands in as the
          // surrogate runtimeRunId on freshly-created approval rows.
          runtimeVerdict = await gateRuntimeDispatch({
            validation: runtimeValidation,
            agentDraftId: input.draftId,
            runtimeRunId: input.sessionId,
            description: `chat session ${input.sessionId} · tool ${call.name}`,
          });

          // C1-c6 (cycle-6 audit closure §C1-c6): D-RESUME loop. Pre-
          // cycle-6 chat.ts had NO resume loop — the chat session
          // never resumed when the operator approved out-of-band, so
          // every approval-gated tool call appeared as a permanent
          // denial. Now: same shared helper as chat-stream.ts. The
          // blocking RPC client receives the FINAL verdict (approved
          // → tool result; denied → denial; timeout → timeout) within
          // the bounded wait window.
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
                  agentDraftId: input.draftId,
                  runtimeRunId: input.sessionId,
                  description: `chat session ${input.sessionId} · tool ${call.name} · resume`,
                }),
              // H5-c7 (cycle-7 audit closure §H5-c7): chat.ts is the
              // non-streaming path — no SSE surface, but the BLOCKING
              // caller still benefits from knowing approval is pending.
              // Capture the (approvalRequestId, timeoutSec) into the
              // outer-scope `lastAwaiting` var so the function's return
              // shape can surface it (mirrors chat-stream.ts:549-559's
              // SSE `onAwaiting` for the streaming path; same parallel-
              // flow asymmetry resolution as cycle-6 C1-c6's D-RESUME
              // helper extraction).
              onAwaiting: (rid, tms) => {
                lastAwaiting = {
                  approvalRequestId: rid,
                  timeoutSec: Math.floor(tms / 1000),
                };
              },
            });
            runtimeVerdict = resume.verdict;
          }

          if (!runtimeVerdict.ok) {
            // Follow-up A3: persist a trace row even on rejection.
            await persistRuntimeToolCallTrace({
              workspaceId: input.workspaceId,
              agentId: input.agentId,
              agentDraftId: input.draftId,
              runtimeRunId: input.sessionId,
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
            await repo.appendChatMessage({
              sessionId: input.sessionId,
              role: "tool",
              content: JSON.stringify({
                error: runtimeVerdict.message,
                code: runtimeVerdict.code,
                reason: runtimeVerdict.reason,
                approvalRequestId: runtimeVerdict.approvalRequestId,
                gate,
              }),
              toolPayload: { toolCallId: call.id, name: call.name },
            });
            continue;
          }
        }
        // C1-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md` §C1-c5)
        // — thread `sessionId` as `runtimeRunId` so the dispatcher writes
        // its `agsRuntimePolicyEvents` audit row. Same bug as the chat-
        // stream call site (chat-stream.ts:579 pre-cycle-5): omitting
        // `runtimeRunId` makes `writeAuditRow()` (dispatcher.ts:259)
        // return `undefined`, silently skipping the canonical governance-
        // audit ledger insert.
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: input.draftId,
          toolName: dispatchKey,
          args,
          source: "live_runtime",
          runtimeRunId: input.sessionId,
          // M4-c5: thread approval-row id (when present) into the
          // dispatcher's audit payload — same shape as the chat-stream
          // call site. Forensics resolve "which approval permitted
          // this dispatch" without joining through agsToolCallTraces.
          approvalRequestId: runtimeVerdict?.approvalRequestId ?? undefined,
          // M4-c6: thread caller attribution (operator userId +
          // chat sessionId) so the audit row records WHO triggered
          // the dispatch, not just WHICH approval permitted it.
          // Same shape as chat-stream.ts.
          caller: { userId: input.actorId, sessionId: String(input.sessionId) },
        });
        // Follow-up A3: persist per-dispatch trace row.
        if (runtimeValidation && runtimeVerdict) {
          await persistRuntimeToolCallTrace({
            workspaceId: input.workspaceId,
            agentId: input.agentId,
            agentDraftId: input.draftId,
            runtimeRunId: input.sessionId,
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
        // invariant: appendChatMessage MUST resolve BEFORE the loop
        // proceeds to the next iteration (which rebuilds the LLM
        // history from the message store). Reordering would let the
        // next turn see a history without the just-completed tool
        // result — model would hallucinate or repeat the call.
        // Mirrors chat-stream.ts's append-before-send invariant for
        // the streaming SSE path.
        await repo.appendChatMessage({
          sessionId: input.sessionId,
          role: "tool",
          content: toolContent,
          toolPayload: { toolCallId: call.id, name: call.name },
        });
      }
      continue;
    }

    // No tool calls — final answer.
    const finalContent = result.output ?? "";
    const durationMs = Date.now() - startMs;
    const assistantRow = await repo.appendChatMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: finalContent,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      model: input.modelRef,
      durationMs,
    });
    return {
      assistantRow,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      durationMs,
      content: finalContent,
      // H5-c7: surface the LAST awaiting-approval event the turn
      // observed so sendChatMessage's blocking caller can render a
      // pending-approval state. null when no tool call awaited.
      awaitingApproval: lastAwaiting,
    };
  }

  // Max turns hit.
  const durationMs = Date.now() - startMs;
  const capMsg = `(Tool loop stopped after ${MAX_TOOL_TURNS} turns without a final answer.)`;
  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: capMsg,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    model: input.modelRef,
    durationMs,
  });
  return {
    assistantRow,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    durationMs,
    content: capMsg,
    // H5-c7: max-turns-hit return path also surfaces awaitingApproval
    // when the loop hit pending approval before exhausting turns.
    awaitingApproval: lastAwaiting,
  };
}

/**
 * Plan v3 Phase 17 — binding-driven Expert chat path.
 *
 * Resolves the agent's provider/model binding, then sends the
 * conversation through `openRouter.modelAccess.execute` via the
 * platform gateway. Closes LR-01 for binding-equipped agents:
 * Agent Studio never sees a raw key — Model Access pulls the
 * credential through `withProviderCredential` inside the OpenRouter
 * boundary, and only the no-secret reference projection crosses the
 * module wire.
 *
 * Scope (intentional):
 *   - No-tools path only. Tool-call round-tripping requires Model
 *     Access to expose `toolCalls` on the result + a typed tool
 *     schema on the input, which is Phase 18 work (per
 *     `model-access/types.ts:35-44`). For agents with attached MCP
 *     tools, `sendChatMessage` keeps using the legacy tool-loop
 *     until that lands.
 *   - Hosted-provider bindings only. Local-provider bindings
 *     (`providerConnectionId=null`) still flow through the legacy
 *     path — Model Access has no local adapter yet.
 *
 * Returns the same SendChatMessageResult shape as the legacy path
 * so the caller (the tRPC mutation) doesn't need to branch on which
 * path served the request.
 */
async function sendChatMessageViaBinding(
  input: SendChatMessageInput,
  ctx: {
    sessionId: number;
    agentId: number;
    draftId: number;
    workspaceId: number;
    actorId: number;
    systemPrompt: string;
    sessionTitle: string | null;
  },
): Promise<SendChatMessageResult> {
  const binding = await getAgentProviderBinding(ctx.draftId, "primary");
  if (!binding) {
    return {
      ok: false,
      error: "No provider binding configured for this agent. Open the binding picker first.",
    };
  }
  if (binding.status !== "binding_v1") {
    return {
      ok: false,
      error: `Binding status is "${binding.status}" — resolve via the picker before chatting.`,
    };
  }
  if (binding.providerConnectionId === null) {
    return {
      ok: false,
      error:
        "Local-provider bindings can't yet route through Model Access. Use a hosted Provider Connection or wait for the Phase 18 chat upgrade.",
    };
  }

  const history = await repo.listChatMessages(input.sessionId);
  const messages: ModelAccessMessage[] = [
    { role: "system", content: ctx.systemPrompt },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map<ModelAccessMessage>((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  // Plan v3 Phase 21 — provider-use governance.
  const policy = await evaluateProviderUsePolicy({
    binding,
    messages,
  });
  if (policy.ok === false) {
    return {
      ok: false,
      error: `${policy.reason}: ${policy.detail}`,
    };
  }

  const executeInput: ModelAccessExecuteInput = {
    providerConnectionId: binding.providerConnectionId,
    modelRef: binding.modelRef,
    messages,
    intent: "chat",
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
  };

  let result: ModelAccessResult;
  try {
    result = await gatewayCall<ModelAccessExecuteInput, ModelAccessResult>({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId: ctx.actorId,
        workspaceId: ctx.workspaceId,
        // Plan v3 Phase 20 — `intent="chat"` requires a governance
        // receipt per RECEIPT_POLICY.md. We mint a per-message
        // receipt id stitched from the session id + timestamp; the
        // full receipts pipeline (Phase 21) will replace this with
        // a registered receipt row, but the id-shape contract is
        // stable in the meantime.
        governanceReceiptId: `chat-${ctx.sessionId}-${Date.now()}`,
      },
      input: executeInput,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (result.status !== "ok" || result.output == null) {
    return {
      ok: false,
      error: result.error ?? "Model Access returned status=error",
    };
  }

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  // Cost is not surfaced by Model Access in Phase 4 — leave as 0
  // (Phase 19+ feeds usage rollup into pricing). The session totals
  // will accumulate accurately for token counts even without cost.
  const costMicrocents = 0;
  const durationMs = result.latencyMs;

  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: result.output,
    inputTokens,
    outputTokens,
    costMicrocents,
    model: binding.modelRef,
    durationMs,
  });

  const autoTitle =
    !ctx.sessionTitle && input.userMessage
      ? input.userMessage.slice(0, 60).trim()
      : undefined;
  await repo.bumpChatSessionTotals({
    sessionId: input.sessionId,
    addInputTokens: inputTokens,
    addOutputTokens: outputTokens,
    addCostMicrocents: costMicrocents,
    addMessages: 2,
    title: autoTitle,
  });

  return {
    ok: true,
    assistantMessage: {
      id: assistantRow.id,
      content: result.output,
      inputTokens,
      outputTokens,
      costMicrocents,
      durationMs,
      model: binding.modelRef,
    },
  };
}

/**
 * Send a user message in an existing chat session, get the
 * assistant's response, persist both, and return the assistant
 * message. Errors are returned in the result shape rather than
 * thrown so the caller can surface them in the UI without a
 * separate error-handling code path.
 *
 * Plan v3 Phase 17 routing:
 *   - If the agent has a `binding_v1` binding to a hosted provider
 *     AND no MCP tools are attached, the call routes through
 *     `sendChatMessageViaBinding` (Model Access). NO raw key in
 *     Agent Studio.
 *   - Otherwise (no binding, local-provider binding, or tool-equipped
 *     agent), falls back to the legacy direct-OpenAI path. The
 *     LR-01 surface shrinks to those cases until Phase 18 lifts the
 *     tool-loop into Model Access.
 */
export async function sendChatMessage(
  input: SendChatMessageInput,
  options: { workspaceId?: number; actorId?: number } = {},
): Promise<SendChatMessageResult> {
  // 1. Load the session + its parent agent's draft
  const session = await repo.getChatSessionById(input.sessionId);
  if (!session) {
    return { ok: false, error: `Chat session ${input.sessionId} not found` };
  }
  const draft = await repo.getCurrentDraft(session.agentId);
  if (!draft) {
    return {
      ok: false,
      error: `Agent ${session.agentId} has no current draft`,
    };
  }

  // 2. Persist the user message FIRST so it's saved even if the LLM
  //    call fails afterward
  await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.userMessage,
  });

  // RAC P6 — runtime orchestrator owns CAG + retrieval + composer.
  //
  // H1-c8 (cycle-8 audit closure §H1-c8): mirror chat-stream.ts's
  // explicit catch for CagRequiredError + RetrievalRequiredError so
  // the structured error code reaches the non-streaming caller's
  // result shape. Pre-cycle-8 these errors propagated to the outer
  // generic try/catch and collapsed into `{ ok: false, error: msg }`
  // with no `code` field — UI couldn't distinguish "needs CAG" from
  // "needs retrieval" from "binding broken." The instanceof branches
  // below set `code: "cag_required" | "retrieval_required"` so the
  // result-shape mirrors chat-stream.ts's SSE error contract. Lockstep
  // pinned by `tests/agent-studio/h1-c8-orchestrator-error-cross-flow.test.ts`.
  const cagMode = (process.env.CAG_MODE as ComposerMode) ?? "safe_degraded";
  let built: Awaited<ReturnType<typeof buildRuntimeSystemPrompt>>;
  try {
    built = await buildRuntimeSystemPrompt({
      mode: cagMode,
      workspaceId: options.workspaceId ?? 1,
      agentId: (draft as any).agentId ?? draft.id,
      agentDraftId: draft.id,
      actorId: options.actorId ?? 1,
      query: input.userMessage,
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
  } catch (err) {
    if (err instanceof CagRequiredError) {
      return {
        ok: false,
        error: err.message,
        code: "cag_required",
      };
    }
    if (err instanceof RetrievalRequiredError) {
      return {
        ok: false,
        error: err.message,
        code: "retrieval_required",
      };
    }
    throw err;
  }
  const composedForBinding = { text: built.systemPrompt };
  for (const w of built.context.warnings) console.info(`[chat/rac] ${w}`);
  for (const w of built.composerWarnings) console.info(`[chat/composer] ${w}`);
  const systemPromptForBinding = composedForBinding.text;

  // Plan v3 Phase 17/18: prefer the binding-driven Model Access path
  // whenever a binding_v1 row exists for this draft AND it points at
  // a hosted Provider Connection. The Phase 18 tool-call schema on
  // Model Access lets us route tool-equipped chats through the same
  // binding path — no special case for tools any more.
  //
  // Falls through to the legacy OpenAI-direct path only when:
  //   - no binding row exists,
  //   - the binding is not `binding_v1` (legacy_unresolved / disabled),
  //   - the binding is local-provider (providerConnectionId=null —
  //     Model Access has no local adapter yet).
  try {
    const candidateBinding = await getAgentProviderBinding(draft.id, "primary");
    const canUseBindingPath =
      candidateBinding !== null &&
      candidateBinding.status === "binding_v1" &&
      candidateBinding.providerConnectionId !== null;
    if (canUseBindingPath) {
      const toolSpecsForRouting = await buildToolsForDraft(draft.id);
      if (toolSpecsForRouting.length > 0) {
        // Phase 18: tool-equipped binding chat. Mirrors the legacy
        // tool-loop but each turn is a Model Access call.
        const wsId = options.workspaceId ?? 1;
        const actor = options.actorId ?? 1;
        const tempForLoop =
          typeof (draft.providerConfig as any)?.temperature === "number"
            ? (draft.providerConfig as any).temperature
            : 0.2;
        const maxTokensForLoop =
          typeof (draft.providerConfig as any)?.maxTokens === "number"
            ? (draft.providerConfig as any).maxTokens
            : undefined;
        const preLoopCount = (
          await repo.listChatMessages(input.sessionId)
        ).length;
        try {
          const loopResult = await runChatWithToolsViaBinding({
            sessionId: input.sessionId,
            agentId: session.agentId,
            draftId: draft.id,
            providerConnectionId: candidateBinding.providerConnectionId!,
            modelRef: candidateBinding.modelRef,
            systemPrompt: systemPromptForBinding,
            tools: toolSpecsForRouting,
            workspaceId: wsId,
            actorId: actor,
            temperature: tempForLoop,
            maxTokens: maxTokensForLoop,
            binding: candidateBinding,
          });
          const postCount = (await repo.listChatMessages(input.sessionId))
            .length;
          // user turn (already persisted, not yet bumped) + everything
          // the loop wrote. Same delta the legacy tool path computes.
          const addedMessages = 1 + (postCount - preLoopCount);
          const autoTitle =
            !session.title && input.userMessage
              ? input.userMessage.slice(0, 60).trim()
              : undefined;
          await repo.bumpChatSessionTotals({
            sessionId: input.sessionId,
            addInputTokens: loopResult.inputTokens,
            addOutputTokens: loopResult.outputTokens,
            addCostMicrocents: loopResult.costMicrocents,
            addMessages: addedMessages,
            title: autoTitle,
          });
          return {
            ok: true,
            assistantMessage: {
              id: loopResult.assistantRow.id,
              content: loopResult.content,
              inputTokens: loopResult.inputTokens,
              outputTokens: loopResult.outputTokens,
              costMicrocents: loopResult.costMicrocents,
              durationMs: loopResult.durationMs,
              model: candidateBinding.modelRef,
            },
            // H5-c7: surface the LAST awaiting-approval event the
            // turn observed so the blocking caller can render a
            // pending-approval state. `?? undefined` collapses null
            // to undefined for the optional field.
            awaitingApproval: loopResult.awaitingApproval ?? undefined,
          };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      return sendChatMessageViaBinding(input, {
        sessionId: input.sessionId,
        agentId: session.agentId,
        draftId: draft.id,
        workspaceId: options.workspaceId ?? 1,
        actorId: options.actorId ?? 1,
        systemPrompt: systemPromptForBinding,
        sessionTitle: session.title ?? null,
      });
    }
  } catch {
    // Routing probe failed — fall through to the binding-required
    // error response below. Phase 27.5 closes the legacy raw-key
    // fallback that previously lived here.
  }

  // Phase 27.5 — binding-required path. The legacy fallback that
  // resolved a raw provider key from `providerConfig.apiKey` /
  // `apiKeyEnvVar` / `process.env` and called `new OpenAI({apiKey})`
  // (or `OpenAIProvider`) is removed. Non-binding agents now get a
  // structured `binding_required` error pointing them at the
  // Phase 14 picker UI.
  //
  // The Phase 27.5a migration helper at
  //   scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts
  // exists to drain legacy fixtures into binding rows; deferred 27.5b
  // will delete the helper itself once no environment depends on it.
  return {
    ok: false,
    error:
      "No active provider binding configured for this agent. " +
      "Open the Provider Binding page in Agent Studio and bind a provider/model " +
      "from the AI Types catalog before sending a chat message.",
    code: "binding_required",
  } as SendChatMessageResult;
}
