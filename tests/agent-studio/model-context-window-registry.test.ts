/**
 * Per-model context-window registry — source-scan + behavioral tests.
 *
 * Slice 35 of the no-deferral continuation-2 catalogue (2026-05-19).
 * Closes context-window.ts:37 + chat-stream.ts:175 "model-aware
 * windowing is deferred to cycle-8 — requires a registry that doesn't
 * exist yet".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODEL_CONTEXT_WINDOWS,
  lookupModelContextWindow,
  resolveContextTokenBudget,
} from "../../server/agent-studio/services/runtime/model-context-windows.js";

const REPO_ROOT = join(__dirname, "..", "..");
const REGISTRY_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/runtime/model-context-windows.ts",
);
const CONTEXT_WINDOW_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/runtime/context-window.ts",
);
const CHAT_STREAM_PATH = join(
  REPO_ROOT,
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/chat.ts",
);

describe("model-context-window registry — slice 35 source-scan", () => {
  const registry = readFileSync(REGISTRY_PATH, "utf8");
  const contextWindow = readFileSync(CONTEXT_WINDOW_PATH, "utf8");
  const chatStream = readFileSync(CHAT_STREAM_PATH, "utf8");
  const chatTs = readFileSync(CHAT_TS_PATH, "utf8");

  it("registry module declares MODEL_CONTEXT_WINDOWS + helpers", () => {
    expect(registry).toContain("export const MODEL_CONTEXT_WINDOWS");
    expect(registry).toContain("export function lookupModelContextWindow");
    expect(registry).toContain("export function resolveContextTokenBudget");
  });

  it("context-window.ts doc-block no longer claims the registry is deferred", () => {
    expect(contextWindow).not.toContain(
      "Single global budget, not model-specific",
    );
    expect(contextWindow).not.toContain(
      "deferred to cycle-8 — it requires a",
    );
    expect(contextWindow).toContain("model-context-windows.ts");
  });

  it("chat-stream.ts wires resolveContextTokenBudget", () => {
    expect(chatStream).toContain(
      'from "./services/runtime/model-context-windows"',
    );
    expect(chatStream).toContain(
      "resolveContextTokenBudget(modelRef, MAX_CONTEXT_TOKENS)",
    );
    expect(chatStream).not.toContain(
      "deferred to cycle-8 — requires a registry that doesn't exist",
    );
  });

  it("chat.ts wires the same registry (parallel-flow lockstep)", () => {
    expect(chatTs).toContain('from "./runtime/model-context-windows"');
    expect(chatTs).toContain(
      "resolveContextTokenBudget(input.modelRef, MAX_CONTEXT_TOKENS)",
    );
  });

  it("context_truncation audit payload carries the resolved modelRef + label", () => {
    expect(chatStream).toContain("modelRef,");
    expect(chatStream).toContain(
      "registryEntry: budget.entry?.label ?? null",
    );
    expect(chatTs).toContain("modelRef: input.modelRef");
    expect(chatTs).toContain(
      "registryEntry: budget.entry?.label ?? null",
    );
  });
});

describe("model-context-window registry — behavioral", () => {
  it("registry carries ≥ 10 closed-taxonomy entries", () => {
    expect(MODEL_CONTEXT_WINDOWS.length).toBeGreaterThanOrEqual(10);
  });

  it("every entry has a positive tokenBudget + non-empty modelRef + label", () => {
    for (const e of MODEL_CONTEXT_WINDOWS) {
      expect(e.tokenBudget).toBeGreaterThan(0);
      expect(e.modelRef.length).toBeGreaterThan(0);
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it("entries are unique by modelRef", () => {
    const slugs = MODEL_CONTEXT_WINDOWS.map((e) => e.modelRef);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("lookup exact-match resolves the registry entry", () => {
    const e = lookupModelContextWindow("anthropic/claude-haiku-4-5");
    expect(e).not.toBeNull();
    expect(e?.modelRef).toBe("anthropic/claude-haiku-4-5");
    expect(e?.tokenBudget).toBeGreaterThan(100_000);
  });

  it("lookup suffix-match resolves the registry entry for routed refs", () => {
    const e = lookupModelContextWindow(
      "openrouter/anthropic/claude-haiku-4-5",
    );
    expect(e).not.toBeNull();
    expect(e?.modelRef).toBe("anthropic/claude-haiku-4-5");
  });

  it("lookup returns null for empty / unknown refs", () => {
    expect(lookupModelContextWindow("")).toBeNull();
    expect(lookupModelContextWindow(null)).toBeNull();
    expect(lookupModelContextWindow(undefined)).toBeNull();
    expect(lookupModelContextWindow("totally-unknown-model")).toBeNull();
  });

  it("resolveContextTokenBudget falls back to the env-tuned default for unknown refs", () => {
    const { tokens, entry } = resolveContextTokenBudget(
      "unknown-model",
      32_000,
    );
    expect(tokens).toBe(32_000);
    expect(entry).toBeNull();
  });

  it("resolveContextTokenBudget returns the registry budget for known refs", () => {
    const { tokens, entry } = resolveContextTokenBudget(
      "anthropic/claude-haiku-4-5",
      32_000,
    );
    expect(tokens).toBeGreaterThan(32_000);
    expect(entry?.modelRef).toBe("anthropic/claude-haiku-4-5");
  });

  it("ollama family stays conservative (single-GPU baseline)", () => {
    const e = lookupModelContextWindow("ollama/llama3");
    expect(e).not.toBeNull();
    expect(e!.tokenBudget).toBeLessThanOrEqual(8_192);
  });
});
