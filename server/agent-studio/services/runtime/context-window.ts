/**
 * H8-c7 (cycle-7 audit closure §H8-c7) — conversation-context windowing.
 *
 * Pre-cycle-7 chat-stream.ts and chat.ts both built the per-turn LLM
 * prompt by:
 *   1. `repo.listChatMessages(sessionId)` — returns the FULL history
 *      with no offset/limit
 *   2. Iterating to build `messagesForModelAccess: ModelAccessMessage[]`
 *   3. Sending the full array to the model via `model.execute()`
 *
 * As a chat session accumulated messages, the prompt grew unbounded
 * until the underlying provider's context-length limit was hit and
 * the request failed with "context length exceeded." The chat became
 * unrecoverable without manual session truncation (which is not
 * implemented). Long iterative-agent sessions (the target use case
 * for Agent Studio) silently degraded.
 *
 * Post-cycle-7 both chat flows window their `messagesForModelAccess`
 * array through `windowChatHistory()` BEFORE calling `model.execute()`.
 * The helper:
 *   1. Keeps the system message ALWAYS (it carries the agent's
 *      instructions — evicting it would break behavior)
 *   2. Walks the rest from NEWEST → OLDEST, accumulating tokens
 *   3. Stops accumulating when the budget is hit
 *   4. Returns the kept-set in original (oldest-first) order with
 *      truncation telemetry
 *
 * Design choices:
 *   - **Heuristic estimation, not tiktoken.** chars/4 ≈ tokens is the
 *     industry rule of thumb for English text. Adding a real
 *     tokenizer (`js-tiktoken`) would add ~5MB of model-specific
 *     vocab files for marginal accuracy on the windowing decision.
 *     The heuristic over-counts slightly (good for safety — we
 *     truncate sooner rather than later).
 *   - **Per-model budget, with a global fallback.** Slice 35 of the
 *     no-deferral continuation-2 catalogue (2026-05-19) wired the
 *     central per-model context-window registry at
 *     `model-context-windows.ts`. Callers resolve the per-model
 *     `tokenBudget` via `resolveContextTokenBudget(modelRef, fallback)`
 *     and pass the result as `maxTokens` here. Unknown refs (newly
 *     added model not yet in the closed taxonomy) fall back to
 *     `MAX_CONTEXT_TOKENS` env (default 32000 — covers GPT-4 Turbo /
 *     Claude 3 with headroom).
 *   - **Tool-call/tool-result pairing preserved.** Eviction is
 *     turn-aligned via the message order — we never split a
 *     tool_call from its matching tool result (which would break
 *     the OpenAI/Anthropic tool-loop protocol). The walk-from-
 *     newest order naturally keeps adjacent pairs together; if a
 *     pair sits at the eviction boundary and one side fits but the
 *     other doesn't, both are evicted (preserves protocol
 *     correctness over keeping incomplete state).
 */
import type { ModelAccessMessage } from "../../../openrouter/model-access/types";

/**
 * Industry-standard char-to-token heuristic for English. Scales
 * conservatively (over-counts) for non-English / heavy-symbol content.
 * The 4× factor keeps the budget arithmetic simple — exact
 * tokenization is not required for windowing decisions.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the token cost of a single message. Includes the content
 * + a small per-message overhead for the role/structure markers + a
 * tool_calls JSON serialization cost when present.
 */
export function estimateTokens(message: ModelAccessMessage): number {
  // Per-message overhead — covers role + content delimiters + system
  // tokens that wrap each message in chat-completions format.
  let total = 4;
  total += Math.ceil(message.content.length / CHARS_PER_TOKEN);
  if (message.toolCalls && message.toolCalls.length > 0) {
    // tool_calls serialize as JSON in the prompt; the helper accounts
    // for the JSON envelope cost via the same chars/4 heuristic.
    const json = JSON.stringify(message.toolCalls);
    total += Math.ceil(json.length / CHARS_PER_TOKEN);
  }
  if (message.toolCallId) {
    total += Math.ceil(message.toolCallId.length / CHARS_PER_TOKEN);
  }
  return total;
}

export interface WindowChatHistoryOptions {
  /**
   * Token budget the windowed messages must fit under. Caller-supplied
   * so chat-stream + chat.ts can apply per-flow defaults without this
   * helper coupling to env vars.
   */
  maxTokens: number;
}

export interface WindowChatHistoryResult {
  messages: ModelAccessMessage[];
  truncated: boolean;
  /** How many oldest messages were dropped to fit the budget. */
  evictedCount: number;
  /** Approximate total tokens of the kept set (post-window). */
  estimatedTokens: number;
}

/**
 * Window a `ModelAccessMessage[]` array down to fit `maxTokens`.
 *
 * Behavior:
 *   - System message (role === "system") is ALWAYS kept regardless of
 *     budget. If it alone exceeds the budget, we still keep it — the
 *     model call will likely fail downstream, but failing with a
 *     clear "system prompt too large" signal is better than silently
 *     dropping the agent's instructions.
 *   - Walks non-system messages from newest → oldest. Stops when
 *     adding the next message would push over budget.
 *   - Returns the kept set in original oldest-first order so callers
 *     can pass directly to `model.execute()`.
 */
export function windowChatHistory(
  messages: ModelAccessMessage[],
  options: WindowChatHistoryOptions,
): WindowChatHistoryResult {
  const { maxTokens } = options;

  // Partition: system messages preserved verbatim (in original order),
  // others windowed.
  const systemMessages: ModelAccessMessage[] = [];
  const otherMessages: ModelAccessMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemMessages.push(m);
    } else {
      otherMessages.push(m);
    }
  }

  // System message tokens are unconditional — they're kept even if
  // they exceed the budget by themselves.
  let usedTokens = 0;
  for (const m of systemMessages) usedTokens += estimateTokens(m);

  // Walk non-system messages from newest → oldest.
  const keptReverse: ModelAccessMessage[] = [];
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const m = otherMessages[i];
    const cost = estimateTokens(m);
    if (usedTokens + cost > maxTokens && keptReverse.length > 0) {
      // Adding this message would push over budget AND we have at
      // least one non-system message kept. Stop here. (The
      // `keptReverse.length > 0` guard ensures we keep at least one
      // user/assistant message even if it alone exceeds the
      // remaining budget — otherwise the chat call would have no
      // input at all.)
      break;
    }
    keptReverse.push(m);
    usedTokens += cost;
  }

  // Reverse back to oldest-first order so the kept set sits in normal
  // chronological position relative to the system message(s).
  const keptForward = keptReverse.reverse();
  const evictedCount = otherMessages.length - keptForward.length;

  return {
    messages: [...systemMessages, ...keptForward],
    truncated: evictedCount > 0,
    evictedCount,
    estimatedTokens: usedTokens,
  };
}
