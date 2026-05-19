/**
 * Per-model context-window registry.
 *
 * Slice 35 of the no-deferral continuation-2 catalogue (2026-05-19).
 * Closes `context-window.ts:37` + `chat-stream.ts:175` ("Single global
 * budget rather than model-specific; model-aware windowing … is
 * deferred to cycle-8 — requires a registry that doesn't exist yet").
 *
 * The registry is a closed-taxonomy map keyed by model ref. Numbers
 * are conservative — token budgets are sized down from the published
 * windows to leave headroom for the agent's system prompt, tool
 * definitions, and a useful response.
 *
 * Lookup is by exact match on `modelRef`, then by provider/model
 * prefix (for refs like `openrouter/anthropic/claude-haiku-4-5`).
 * Unknown refs fall back to the `MAX_CONTEXT_TOKENS` env-tuned default
 * supplied by the caller — the registry never throws.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter`
 *     imports — the registry is a pure data table.
 */

export interface ModelContextWindowEntry {
  /** Model ref pattern. Matched exact-first then prefix.
   *  Use the canonical Model Access ref (provider-slug-prefixed). */
  readonly modelRef: string;
  /** Token budget for `windowChatHistory({ maxTokens })`. Conservative
   *  — sized to leave room for system prompt + tools + response. */
  readonly tokenBudget: number;
  /** Published window for operator-visible UI. Optional, informational. */
  readonly publishedWindow?: number;
  /** Display label for operator UI / debug logs. */
  readonly label: string;
}

/**
 * The registry. New models land here when the workspace begins routing
 * to them; unknown refs degrade to the env-tuned global default.
 */
export const MODEL_CONTEXT_WINDOWS: ReadonlyArray<ModelContextWindowEntry> = [
  // ── Anthropic Claude 4.x ──
  {
    modelRef: "anthropic/claude-opus-4-7",
    tokenBudget: 180_000,
    publishedWindow: 200_000,
    label: "Anthropic Claude Opus 4.7",
  },
  {
    modelRef: "anthropic/claude-sonnet-4-6",
    tokenBudget: 180_000,
    publishedWindow: 200_000,
    label: "Anthropic Claude Sonnet 4.6",
  },
  {
    modelRef: "anthropic/claude-haiku-4-5",
    tokenBudget: 180_000,
    publishedWindow: 200_000,
    label: "Anthropic Claude Haiku 4.5",
  },
  // ── OpenAI GPT-4 family ──
  {
    modelRef: "openai/gpt-4o",
    tokenBudget: 100_000,
    publishedWindow: 128_000,
    label: "OpenAI GPT-4o",
  },
  {
    modelRef: "openai/gpt-4o-mini",
    tokenBudget: 100_000,
    publishedWindow: 128_000,
    label: "OpenAI GPT-4o mini",
  },
  {
    modelRef: "openai/gpt-4-turbo",
    tokenBudget: 100_000,
    publishedWindow: 128_000,
    label: "OpenAI GPT-4 Turbo",
  },
  // ── Google Gemini ──
  {
    modelRef: "google/gemini-1.5-pro",
    tokenBudget: 700_000,
    publishedWindow: 1_000_000,
    label: "Google Gemini 1.5 Pro",
  },
  {
    modelRef: "google/gemini-1.5-flash",
    tokenBudget: 700_000,
    publishedWindow: 1_000_000,
    label: "Google Gemini 1.5 Flash",
  },
  // ── Local llama.cpp / Ollama family — conservative on a single GPU ──
  {
    modelRef: "ollama/llama3",
    tokenBudget: 6_000,
    publishedWindow: 8_192,
    label: "Ollama Llama 3 (8k window)",
  },
  {
    modelRef: "ollama/llama3:70b",
    tokenBudget: 6_000,
    publishedWindow: 8_192,
    label: "Ollama Llama 3 70B (8k window)",
  },
];

/**
 * Lookup the token budget for a model ref. Returns the registry entry
 * when a match is found; `null` otherwise. Match order:
 *
 *   1. Exact `modelRef` match.
 *   2. Suffix match — `MODEL_CONTEXT_WINDOWS[i].modelRef` is the
 *      suffix of the input ref. Handles routed refs like
 *      `openrouter/anthropic/claude-haiku-4-5`.
 *
 * Empty / null inputs return `null` so the caller falls back cleanly.
 */
export function lookupModelContextWindow(
  modelRef: string | null | undefined,
): ModelContextWindowEntry | null {
  if (modelRef == null || modelRef.length === 0) return null;
  const exact = MODEL_CONTEXT_WINDOWS.find((e) => e.modelRef === modelRef);
  if (exact) return exact;
  // Suffix match — accept "openrouter/anthropic/claude-haiku-4-5"
  // for the "anthropic/claude-haiku-4-5" entry. Length guard prevents
  // a 1-char registry entry from matching every ref.
  const suffix = MODEL_CONTEXT_WINDOWS.find(
    (e) => e.modelRef.length > 8 && modelRef.endsWith(e.modelRef),
  );
  return suffix ?? null;
}

/**
 * Pick the maxTokens budget. Returns the registry entry's budget when
 * a match is found; the fallback otherwise. This is the helper
 * `chat-stream.ts` calls per-request.
 */
export function resolveContextTokenBudget(
  modelRef: string | null | undefined,
  fallback: number,
): { tokens: number; entry: ModelContextWindowEntry | null } {
  const entry = lookupModelContextWindow(modelRef);
  return { tokens: entry?.tokenBudget ?? fallback, entry };
}
