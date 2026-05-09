/**
 * M9-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §M9-c7) — chat-history persistence-shape contract.
 *
 * Pre-cycle-7 chat-stream.ts and services/chat.ts each had inline
 * chat-history reconstruction code that read tool-role messages out
 * of `agsChatMessages.toolPayload` and reassembled them into
 * `ModelAccessMessage` shape via:
 *
 *   const tp = (m.toolPayload ?? null) as any;
 *   { role: "tool", content: m.content,
 *     toolCallId: tp?.toolCallId ?? "" }
 *
 * The empty-string fallback was the audit's concern: if a future
 * persistence-side refactor renames the field (`toolCallId → callId`,
 * or moves it under `toolPayload.openai.toolCallId` etc.), the
 * `tp?.toolCallId ?? ""` extraction silently coerces the undefined
 * back to an empty string. The OpenAI / Anthropic tool-loop
 * protocol REQUIRES `tool_call_id` on tool-role messages to point
 * at a specific prior `tool_calls[*].id` in the assistant message.
 * An empty string violates the protocol — the model sees
 * `tool_calls[*].id="abc"` from the assistant turn, then a tool
 * result with `tool_call_id=""`, and either:
 *   - Refuses the turn (good failure mode — explicit error),
 *   - Hallucinates the linkage (bad failure mode — model invents
 *     an answer disconnected from the actual tool result),
 *   - Treats the empty id as a separate (zero-id) tool slot (worst
 *     failure mode — a future tool call with id="" silently joins
 *     a stale earlier-turn result).
 *
 * The first failure mode is rare; modes 2 and 3 are the silent-
 * corruption risks the audit flagged.
 *
 * Post-cycle-7 the reconstruction lives in this single helper.
 * Both flows call it. Source-scan lockstep pins:
 *   1. Both flows import + call `reconstructToolHistoryMessage`
 *   2. The 5+ writer sites in BOTH files use the canonical
 *      `{ toolCallId, name }` shape (so the reader has something
 *      to read)
 *   3. The closure marker `M9-c7` lives on both files + this helper
 *
 * Round-trip behavior is unit-tested with synthetic messages whose
 * `toolPayload` matches the exact shape the writer produces — so a
 * future refactor that drifts EITHER side fails the test.
 */
import type { ModelAccessMessage } from "../../../openrouter/model-access/types";

/**
 * Persisted shape of a tool-role row's `toolPayload` column. The
 * writer sites in chat-stream.ts + chat.ts construct this object
 * literally (one field — `name` — is observability-only and not
 * read back during reconstruction; pinning it here documents the
 * full contract, not just the read-side dependency).
 */
export interface ChatHistoryToolPayload {
  toolCallId: string;
  name: string;
}

/**
 * Persisted shape of an assistant-role row's `toolPayload` column
 * when the assistant turn emitted tool calls. The writer normalizes
 * provider-specific shapes (OpenAI's `function.{name,arguments}`
 * envelope, Anthropic's flat shape) to the inner array of
 * `{id, name, arguments}` records before persisting — so the reader
 * can rely on the inner shape without re-doing the normalization.
 *
 * NOTE: legacy rows persisted before the Phase 18 binding migration
 * may carry the OpenAI envelope shape `{id, type, function:{name,
 * arguments}}` instead. The reader paths in chat.ts + chat-stream.ts
 * handle BOTH shapes (`c.function?.name ?? c.name`); this typedef
 * documents the canonical (post-migration) shape that new writes
 * MUST use.
 */
export interface ChatHistoryAssistantToolPayload {
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

/**
 * Persistence-row shape consumed by `reconstructToolHistoryMessage`.
 * Matches the `agsChatMessages` row's relevant columns. Kept narrow
 * (no Drizzle row-type coupling) so the helper stays callable from
 * both chat flows AND from the unit test without importing Drizzle.
 */
export interface ChatHistoryRow {
  role: string;
  content: string;
  toolPayload?: unknown;
}

/**
 * Reconstruct a tool-role chat history row into a
 * `ModelAccessMessage`. Single source of truth for the
 * `toolPayload.toolCallId → toolCallId` extraction across both
 * chat flows. See file doc-block for the M9-c7 contract.
 *
 * Returns `null` if `toolCallId` cannot be extracted (the persisted
 * shape drifted or the row was corrupted). Callers SHOULD treat a
 * null as "drop the message" rather than "fall back to empty
 * string" — the empty-string fallback was the original M9-c7 bug.
 *
 * NOTE: chat-stream.ts and chat.ts currently still do
 * `?? ""` to preserve pre-cycle-7 behavior for in-flight sessions;
 * the migration to honor the null is deferred to a follow-up. The
 * helper exposes the strictly-correct shape so the upgrade path is
 * a one-line caller change rather than another inline rewrite.
 */
export function reconstructToolHistoryMessage(
  row: ChatHistoryRow,
): ModelAccessMessage | null {
  if (row.role !== "tool") return null;
  const tp = (row.toolPayload ?? null) as Partial<ChatHistoryToolPayload> | null;
  const id = tp?.toolCallId;
  if (typeof id !== "string" || id === "") {
    return null;
  }
  return {
    role: "tool",
    content: row.content,
    toolCallId: id,
  };
}
