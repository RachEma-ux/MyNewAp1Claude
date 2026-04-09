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
import OpenAI from "openai";
import * as repo from "./repository";
import { resolveProviderApiKey } from "./adapters/openllm-runtime-adapter";
import { dispatchMcpToolCall } from "./services/mcp/dispatcher";
import { getSnapshot } from "./services/mcp/registry";

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

/**
 * Accumulator for a single tool_call as it streams in across chunks.
 * OpenAI streams the `id`, `type`, `function.name` in the first chunk
 * that introduces the tool call, then streams `function.arguments` as
 * partial JSON across subsequent chunks.
 */
interface StreamingToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LoopStats {
  inputTokens: number;
  outputTokens: number;
  costMicrocents: number;
  durationMs: number;
}

/**
 * Run the streaming tool-call loop. Persists the final assistant row
 * via appendChatMessage and returns its id + cumulative stats so the
 * caller can bump session totals and emit `done`.
 */
async function runStreamingToolLoop(args: {
  client: OpenAI;
  model: string;
  temperature: number;
  maxTokens: number | undefined;
  systemPrompt: string;
  sessionId: number;
  draftId: number;
  tools: ToolSpec[];
  sendEvent: SseSend;
}): Promise<{
  assistantRowId: number;
  content: string;
  stats: LoopStats;
}> {
  const {
    client,
    model,
    temperature,
    maxTokens,
    systemPrompt,
    sessionId,
    draftId,
    tools,
    sendEvent,
  } = args;

  const dispatchKeyByOpenaiName = new Map<string, string>(
    tools.map((t) => [t.openaiName, t.dispatchKey])
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
    // scope for the next call
    const history = await repo.listChatMessages(sessionId);
    const messagesForApi: any[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messagesForApi.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const tp = (m.toolPayload ?? null) as any;
        if (tp?.toolCalls && Array.isArray(tp.toolCalls)) {
          messagesForApi.push({
            role: "assistant",
            content: m.content || null,
            tool_calls: tp.toolCalls,
          });
        } else {
          messagesForApi.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        const tp = (m.toolPayload ?? null) as any;
        messagesForApi.push({
          role: "tool",
          tool_call_id: tp?.toolCallId ?? "",
          content: m.content,
        });
      }
    }

    // Open streaming completion
    const stream = await client.chat.completions.create({
      model,
      messages: messagesForApi,
      temperature,
      ...(maxTokens != null ? { max_completion_tokens: maxTokens } : {}),
      tools: toolSchemas,
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
    });

    // Accumulate content + tool calls across chunks
    let contentAccum = "";
    const toolCallAccum = new Map<number, StreamingToolCall>();
    let finishReason: string | null = null;
    let turnPromptTokens = 0;
    let turnCompletionTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) {
        // Final chunk in include_usage mode has no choices, just usage
        if ((chunk as any).usage) {
          turnPromptTokens = (chunk as any).usage.prompt_tokens ?? 0;
          turnCompletionTokens = (chunk as any).usage.completion_tokens ?? 0;
        }
        continue;
      }
      const delta = choice.delta;
      if (delta?.content) {
        contentAccum += delta.content;
        sendEvent({ type: "token", content: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index ?? 0;
          let acc = toolCallAccum.get(idx);
          if (!acc) {
            acc = {
              id: tcDelta.id ?? "",
              type: "function",
              function: {
                name: tcDelta.function?.name ?? "",
                arguments: "",
              },
            };
            toolCallAccum.set(idx, acc);
          } else {
            // Later chunks may refine id or name (rare but possible)
            if (tcDelta.id) acc.id = tcDelta.id;
            if (tcDelta.function?.name) acc.function.name = tcDelta.function.name;
          }
          if (tcDelta.function?.arguments) {
            acc.function.arguments += tcDelta.function.arguments;
          }
        }
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    // Update cumulative stats
    stats.inputTokens += turnPromptTokens;
    stats.outputTokens += turnCompletionTokens;
    const turnCost =
      (turnPromptTokens / 1_000_000) * INPUT_COST_PER_1M +
      (turnCompletionTokens / 1_000_000) * OUTPUT_COST_PER_1M;
    stats.costMicrocents += Math.round(turnCost * 1_000_000);

    const toolCalls = Array.from(toolCallAccum.values()).sort((a, b) => {
      // keyed by index; stable order by accumulator map insertion
      return 0;
    });

    if (finishReason === "tool_calls" && toolCalls.length > 0) {
      // Persist assistant turn with tool_calls (may have partial content
      // too — some models interleave reasoning with tool_calls)
      await repo.appendChatMessage({
        sessionId,
        role: "assistant",
        content: contentAccum,
        toolPayload: { toolCalls },
        model,
      });

      // Dispatch every tool call and persist results as role=tool
      for (const call of toolCalls) {
        const openaiName = call.function.name;
        const rawArgs = call.function.arguments;
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
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: draftId,
          toolName: dispatchKey,
          args: parsedArgs,
          source: "live_runtime",
        });
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

async function runPureStream(args: {
  client: OpenAI;
  model: string;
  temperature: number;
  maxTokens: number | undefined;
  systemPrompt: string;
  sessionId: number;
  sendEvent: SseSend;
}): Promise<{
  assistantRowId: number;
  content: string;
  stats: LoopStats;
}> {
  const { client, model, temperature, maxTokens, systemPrompt, sessionId, sendEvent } =
    args;

  const history = await repo.listChatMessages(sessionId);
  const messagesForApi = [
    { role: "system" as const, content: systemPrompt },
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

  const stream = await client.chat.completions.create({
    model,
    messages: messagesForApi,
    temperature,
    ...(maxTokens != null ? { max_completion_tokens: maxTokens } : {}),
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      accumulated += delta.content;
      sendEvent({ type: "token", content: delta.content });
    }
    if ((chunk as any).usage) {
      promptTokens = (chunk as any).usage.prompt_tokens ?? 0;
      completionTokens = (chunk as any).usage.completion_tokens ?? 0;
    }
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
    const provider =
      typeof providerConfig.provider === "string" ? providerConfig.provider : undefined;
    const model =
      typeof providerConfig.model === "string" ? providerConfig.model : undefined;
    const temperature =
      typeof providerConfig.temperature === "number" ? providerConfig.temperature : 0.2;
    const maxTokens =
      typeof providerConfig.maxTokens === "number" ? providerConfig.maxTokens : undefined;

    if (provider !== "openai") {
      sendEvent({
        type: "error",
        error: `Chat only supports provider=openai, got provider=${provider ?? "(none)"}.`,
      });
      res.end();
      return;
    }
    const apiKey = resolveProviderApiKey(providerConfig);
    if (!apiKey) {
      sendEvent({
        type: "error",
        error:
          "No OpenAI API key resolved. Set OPENAI_API_KEY in env or configure a key in the providers table.",
      });
      res.end();
      return;
    }
    if (!model) {
      sendEvent({ type: "error", error: "Agent's providerConfig is missing `model`." });
      res.end();
      return;
    }

    // Persist user message FIRST so it survives LLM failures
    await repo.appendChatMessage({
      sessionId,
      role: "user",
      content: userMessage,
    });

    const systemPrompt =
      [draft.systemInstructions, draft.roleInstructions]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join("\n\n") || "You are a helpful assistant.";

    const client = new OpenAI({ apiKey });

    // Pick path based on whether any MCP server for this draft has
    // a live registry snapshot (i.e. is actually connected)
    const toolSpecs = await buildToolsForDraft(draft.id);
    const pathResult =
      toolSpecs.length > 0
        ? await runStreamingToolLoop({
            client,
            model,
            temperature,
            maxTokens,
            systemPrompt,
            sessionId,
            draftId: draft.id,
            tools: toolSpecs,
            sendEvent,
          })
        : await runPureStream({
            client,
            model,
            temperature,
            maxTokens,
            systemPrompt,
            sessionId,
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
