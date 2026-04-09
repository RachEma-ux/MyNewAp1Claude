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
 *       4. Calls runViaOpenAIDirect (same adapter the simulation
 *          engine uses) — no openllm-agent2 required
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
 * the same runViaOpenAIDirect call with an onToken callback.
 */

import OpenAI from "openai";
import * as repo from "../repository";
import { resolveProviderApiKey } from "../adapters/openllm-runtime-adapter";
import { dispatchMcpToolCall } from "./mcp/dispatcher";
import { getSnapshot } from "./mcp/registry";
import type { Message } from "../../providers/types";

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
 * Tool-call loop: runs an OpenAI chat completion with tools wired, and
 * whenever the response contains tool_calls, dispatches each through
 * the MCP dispatcher, persists the tool result as a role=tool message,
 * and re-calls the model. Terminates on either a final assistant
 * message with content OR MAX_TOOL_TURNS iterations.
 *
 * Returns the final assistant row + cumulative usage + duration so
 * the caller can bump session totals the same way the no-tool path
 * does.
 */
async function runChatWithTools(input: {
  sessionId: number;
  draftId: number;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  systemPrompt: string;
  tools: ChatToolSpec[];
}) {
  const client = new OpenAI({ apiKey: input.apiKey });
  const dispatchKeyByOpenaiName = new Map<string, string>(
    input.tools.map((t) => [t.openaiName, t.dispatchKey])
  );
  const toolSchemas = input.tools.map((t) => t.schema);

  // Rebuild the messages array on every turn by reloading history
  // from the DB. This ensures previously-persisted tool messages and
  // assistant tool_calls are visible to the next completion.
  const startMs = Date.now();
  let cumulativeInputTokens = 0;
  let cumulativeOutputTokens = 0;
  let cumulativeCostMicrocents = 0;

  // Cost estimate (same rates as chat-stream.ts — gpt-4o mid-tier)
  const INPUT_COST_PER_1M = 5;
  const OUTPUT_COST_PER_1M = 15;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    // Build the messages array from current history
    const history = await repo.listChatMessages(input.sessionId);
    const messagesForApi: any[] = [
      { role: "system", content: input.systemPrompt },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messagesForApi.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        // If this assistant turn was a tool-calling turn, its
        // toolPayload contains the tool_calls array we need to
        // re-emit so the model has matching tool responses.
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

    const response = await client.chat.completions.create({
      model: input.model,
      messages: messagesForApi,
      temperature: input.temperature,
      ...(input.maxTokens != null ? { max_completion_tokens: input.maxTokens } : {}),
      tools: toolSchemas,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");

    // Accumulate usage
    const usage = response.usage;
    if (usage) {
      cumulativeInputTokens += usage.prompt_tokens ?? 0;
      cumulativeOutputTokens += usage.completion_tokens ?? 0;
      const turnCost =
        ((usage.prompt_tokens ?? 0) / 1_000_000) * INPUT_COST_PER_1M +
        ((usage.completion_tokens ?? 0) / 1_000_000) * OUTPUT_COST_PER_1M;
      cumulativeCostMicrocents += Math.round(turnCost * 1_000_000);
    }

    const msg = choice.message;
    const toolCalls = (msg as any).tool_calls as any[] | undefined;

    if (toolCalls && toolCalls.length > 0) {
      // Persist the assistant turn that carries the tool_calls (no
      // content yet). Store tool_calls in toolPayload so the next
      // turn's history rebuild can re-emit them.
      await repo.appendChatMessage({
        sessionId: input.sessionId,
        role: "assistant",
        content: msg.content ?? "",
        toolPayload: { toolCalls },
        model: input.model,
      });

      // Dispatch each tool call and persist results as role=tool
      for (const call of toolCalls) {
        const openaiName: string = call.function?.name ?? "";
        const rawArgs: string = call.function?.arguments ?? "{}";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }
        const dispatchKey = dispatchKeyByOpenaiName.get(openaiName);
        if (!dispatchKey) {
          await repo.appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: JSON.stringify({
              error: `unknown tool: ${openaiName}`,
            }),
            toolPayload: { toolCallId: call.id, name: openaiName },
          });
          continue;
        }
        const dispatchResult = await dispatchMcpToolCall({
          agentDraftId: input.draftId,
          toolName: dispatchKey,
          args,
          source: "live_runtime",
        });
        const toolContent = dispatchResult.ok
          ? JSON.stringify(dispatchResult.result ?? null)
          : JSON.stringify({
              error: dispatchResult.error?.message ?? "dispatch failed",
              code: dispatchResult.error?.code,
            });
        await repo.appendChatMessage({
          sessionId: input.sessionId,
          role: "tool",
          content: toolContent,
          toolPayload: { toolCallId: call.id, name: openaiName },
        });
      }
      // Loop again — the next iteration rebuilds history and calls
      // the model with the tool outputs now in context.
      continue;
    }

    // No tool calls — this is the final assistant response
    const finalContent = msg.content ?? "";
    const durationMs = Date.now() - startMs;
    const assistantRow = await repo.appendChatMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: finalContent,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      model: input.model,
      durationMs,
    });
    return {
      assistantRow,
      inputTokens: cumulativeInputTokens,
      outputTokens: cumulativeOutputTokens,
      costMicrocents: cumulativeCostMicrocents,
      durationMs,
      content: finalContent,
    };
  }

  // Loop hit MAX_TOOL_TURNS without terminating — write a synthetic
  // assistant message noting this and return.
  const durationMs = Date.now() - startMs;
  const capMsg = `(Tool loop stopped after ${MAX_TOOL_TURNS} turns without a final answer.)`;
  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: capMsg,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    model: input.model,
    durationMs,
  });
  return {
    assistantRow,
    inputTokens: cumulativeInputTokens,
    outputTokens: cumulativeOutputTokens,
    costMicrocents: cumulativeCostMicrocents,
    durationMs,
    content: capMsg,
  };
}

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
 * Send a user message in an existing chat session, get the
 * assistant's response, persist both, and return the assistant
 * message. Errors are returned in the result shape rather than
 * thrown so the caller can surface them in the UI without a
 * separate error-handling code path.
 */
export async function sendChatMessage(
  input: SendChatMessageInput
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

  // 3. Resolve the provider config — always read from the LIVE draft,
  //    not the session's frozen snapshot.
  //
  //    Earlier revision preferred the session snapshot for "reproduci-
  //    bility," but that caused a real bug: changing the draft's model
  //    or temperature had no effect on ongoing sessions because they
  //    were locked to whatever was captured at session-start time.
  //    Users expect edits to the agent config to apply immediately.
  //    The session.providerSnapshot column stays around for forensic
  //    audit (you can see what the config WAS when the session started)
  //    but the runtime always uses the current draft.
  const providerConfig = (draft.providerConfig ?? {}) as Record<string, unknown>;

  const provider = typeof providerConfig.provider === "string"
    ? providerConfig.provider
    : undefined;
  const model = typeof providerConfig.model === "string"
    ? providerConfig.model
    : undefined;
  const temperature = typeof providerConfig.temperature === "number"
    ? providerConfig.temperature
    : 0.2;
  const maxTokens = typeof providerConfig.maxTokens === "number"
    ? providerConfig.maxTokens
    : undefined;

  if (provider !== "openai") {
    return {
      ok: false,
      error: `Chat only supports provider=openai for now, got provider=${provider ?? "(none)"}. Update the agent's providerConfig.`,
    };
  }

  const apiKey = resolveProviderApiKey(providerConfig);
  if (!apiKey) {
    return {
      ok: false,
      error:
        "No OpenAI API key resolved. Set OPENAI_API_KEY in .env or shell env, or configure a key in the providers table (auto-synced at boot).",
    };
  }
  if (!model) {
    return {
      ok: false,
      error: "Agent's providerConfig is missing `model` (e.g., 'gpt-4o-mini').",
    };
  }

  // 4. Build the system prompt from the draft's instructions
  const systemPrompt =
    [draft.systemInstructions, draft.roleInstructions]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n") || "You are a helpful assistant.";

  // 5. Decide tool-call vs. no-tools path. If the draft has any
  //    CONNECTED MCP servers (registry snapshot present), we run the
  //    tool-call loop which dispatches every invocation through the
  //    Phase 19a dispatcher (governance + audit). Otherwise we fall
  //    through to the simple no-tools path via OpenAIProvider.
  const toolSpecs = await buildToolsForDraft(draft.id);
  if (toolSpecs.length > 0) {
    // Snapshot the message count BEFORE the loop so we can compute
    // how many new rows (tool calls + tool results + final assistant)
    // the loop actually wrote and bump `messageCount` by that delta.
    // The user message was already persisted in step 2, so we count
    // it here so it's included in the delta below.
    const preLoopHistory = await repo.listChatMessages(input.sessionId);
    const preLoopCount = preLoopHistory.length;
    try {
      const loopResult = await runChatWithTools({
        sessionId: input.sessionId,
        draftId: draft.id,
        apiKey,
        model,
        temperature,
        maxTokens,
        systemPrompt,
        tools: toolSpecs,
      });
      // Delta = every message written by the loop. Plus 1 for the
      // user message we pre-persisted in step 2 (which is already in
      // preLoopCount), so we just add (postCount - preLoopCount) + 1.
      const postHistory = await repo.listChatMessages(input.sessionId);
      const deltaFromLoop = postHistory.length - preLoopCount;
      const addedMessages = 1 + deltaFromLoop; // +1 for the user turn
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
          model,
        },
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // 6. No-tools path — build plain messages array and call the
  //    OpenAIProvider (which returns a full result with usage + cost)
  const history = await repo.listChatMessages(input.sessionId);
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(
        (m): Message => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      ),
  ];

  const { OpenAIProvider } = await import("../../providers/openai");
  const providerInstance = new OpenAIProvider({
    id: "agent-studio-chat",
    type: "openai",
    name: "Agent Studio Chat",
    priority: 0,
    enabled: true,
    config: {
      apiKey,
      defaultModel: model,
    },
  } as any);

  const startMs = Date.now();
  let result;
  try {
    await providerInstance.initialize();
    result = await providerInstance.generate({
      messages,
      model,
      temperature,
      maxTokens,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    try {
      await providerInstance.cleanup();
    } catch {
      /* ignore */
    }
  }

  const durationMs = Date.now() - startMs;

  // 7. Persist the assistant message
  const costMicrocents = result.cost != null
    ? Math.round(result.cost * 1_000_000)
    : 0;

  const assistantRow = await repo.appendChatMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: result.content,
    inputTokens: result.usage.promptTokens,
    outputTokens: result.usage.completionTokens,
    costMicrocents,
    model,
    durationMs,
  });

  // 8. Bump session totals so the session list UI can show running
  //    cost + message count without re-aggregating on every list call
  //    Auto-generate a title from the first user message if missing
  const autoTitle =
    !session.title && input.userMessage
      ? input.userMessage.slice(0, 60).trim()
      : undefined;
  await repo.bumpChatSessionTotals({
    sessionId: input.sessionId,
    addInputTokens: result.usage.promptTokens,
    addOutputTokens: result.usage.completionTokens,
    addCostMicrocents: costMicrocents,
    addMessages: 2, // user + assistant
    title: autoTitle,
  });

  return {
    ok: true,
    assistantMessage: {
      id: assistantRow.id,
      content: result.content,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      costMicrocents,
      durationMs,
      model,
    },
  };
}
