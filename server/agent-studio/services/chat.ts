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

import * as repo from "../repository";
import { runViaOpenAIDirect } from "../adapters/openai-direct-adapter";
import { resolveProviderApiKey } from "../adapters/openllm-runtime-adapter";
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
      error: "Agent's providerConfig is missing `model` (e.g., 'gpt-4').",
    };
  }

  // 4. Load the full message history (AFTER persisting the new user
  //    message, so the history includes it — though we'll build the
  //    messages array manually to control the system prompt slot)
  const history = await repo.listChatMessages(input.sessionId);

  // 5. Build the OpenAI messages array:
  //    - system: draft.systemInstructions + draft.roleInstructions
  //    - history: every user/assistant message in order
  //    - (new user message is already in `history` since we persisted
  //       it above — no need to append again)
  const systemPrompt =
    [draft.systemInstructions, draft.roleInstructions]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n") || "You are a helpful assistant.";

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

  // 6. Call the direct OpenAI adapter. We pass userMessage="" because
  //    runViaOpenAIDirect's signature expects a single userMessage; we
  //    instead pass the full history through systemPrompt concatenation.
  //    Actually, we need a version that takes the full messages array.
  //    For the MVP, I'll use the OpenAIProvider directly here to avoid
  //    threading a new signature through the adapter.
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
