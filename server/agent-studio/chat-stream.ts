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

const MAX_TOOL_TURNS = 6;
const INPUT_COST_PER_1M = 5; // USD, gpt-4o mid-tier estimate
const OUTPUT_COST_PER_1M = 15;

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
        const tp = (m.toolPayload ?? null) as any;
        messagesForModelAccess.push({
          role: "tool",
          content: m.content,
          toolCallId: String(tp?.toolCallId ?? ""),
        });
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
      messages: messagesForModelAccess,
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
        const spec = specByOpenaiName.get(openaiName);
        let runtimeValidation: RuntimeValidationResult | null = null;
        let runtimeVerdict: RuntimeDispatchVerdict | null = null;
        if (spec) {
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
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: draftId,
          toolName: dispatchKey,
          args: parsedArgs,
          source: "live_runtime",
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
        await repo.appendChatMessage({
          sessionId,
          role: "tool",
          content: toolContent,
          toolPayload: { toolCallId: call.id, name: openaiName },
        });
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
