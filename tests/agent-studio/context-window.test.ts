/**
 * H8-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H8-c7) — context-window helper unit tests.
 *
 * The helper is pure. The chat flows wire it BEFORE
 * `model.execute()`. This file pins the windowing behavioral
 * contract:
 *   1. estimateTokens uses chars/4 + per-message overhead
 *   2. Tool-calls JSON is included in the cost
 *   3. System messages are ALWAYS kept (regardless of budget)
 *   4. Eviction walks newest → oldest
 *   5. Returns oldest-first order for downstream model.execute()
 *   6. Telemetry: truncated flag + evictedCount + estimatedTokens
 *   7. Empty / no-truncation cases work cleanly
 *   8. The "keep at least one non-system message" guard fires when
 *      a single message exceeds the budget
 */
import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  windowChatHistory,
} from "../../server/agent-studio/services/runtime/context-window";
import type { ModelAccessMessage } from "../../server/openrouter/model-access/types";

function msg(
  role: ModelAccessMessage["role"],
  content: string,
  extras: Partial<ModelAccessMessage> = {},
): ModelAccessMessage {
  return { role, content, ...extras };
}

describe("estimateTokens", () => {
  it("returns the per-message overhead for empty content", () => {
    // overhead = 4
    expect(estimateTokens(msg("user", ""))).toBe(4);
  });

  it("scales content length by chars/4 (rounded up)", () => {
    // 12 chars / 4 = 3 tokens + 4 overhead = 7
    expect(estimateTokens(msg("user", "hello world!"))).toBe(7);
  });

  it("rounds up partial tokens (4-char overhead + ceil(13/4)=4)", () => {
    expect(estimateTokens(msg("user", "hello world!!"))).toBe(8);
  });

  it("includes tool_calls JSON in the cost", () => {
    // Without tool_calls: overhead 4 + content 4 = 8
    const without = estimateTokens(msg("assistant", "hi!"));
    // With tool_calls — the JSON adds significant cost
    const with_tc = estimateTokens(
      msg("assistant", "hi!", {
        toolCalls: [
          { id: "call_1", name: "search", arguments: '{"q":"x"}' },
        ],
      }),
    );
    expect(with_tc).toBeGreaterThan(without);
  });

  it("includes toolCallId cost on tool messages", () => {
    const without = estimateTokens(msg("tool", "result"));
    const with_id = estimateTokens(
      msg("tool", "result", { toolCallId: "call_abc12345" }),
    );
    expect(with_id).toBeGreaterThan(without);
  });
});

describe("windowChatHistory — empty + no-truncation cases", () => {
  it("returns empty messages on empty input", () => {
    const r = windowChatHistory([], { maxTokens: 1000 });
    expect(r.messages).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.evictedCount).toBe(0);
    expect(r.estimatedTokens).toBe(0);
  });

  it("returns input unchanged when budget allows the full set", () => {
    const messages = [
      msg("system", "be helpful"),
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "thanks"),
    ];
    const r = windowChatHistory(messages, { maxTokens: 10000 });
    expect(r.messages).toEqual(messages);
    expect(r.truncated).toBe(false);
    expect(r.evictedCount).toBe(0);
    expect(r.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("windowChatHistory — system message preservation", () => {
  it("keeps the system message even when it exceeds the budget alone", () => {
    const huge = msg("system", "x".repeat(10000)); // ~2500 tokens
    const r = windowChatHistory([huge], { maxTokens: 100 });
    // System message survives — even though we're over budget — so
    // the agent's instructions reach the model. Failing the
    // model.execute() with "context too large" is better than
    // silently dropping the system prompt.
    expect(r.messages).toEqual([huge]);
  });

  it("keeps the system message when other messages get evicted", () => {
    const messages = [
      msg("system", "be helpful"),
      msg("user", "x".repeat(800)), // ~204 tokens — over budget
      msg("user", "what's up?"),
    ];
    // Budget tight enough that the long user message has to go
    const r = windowChatHistory(messages, { maxTokens: 100 });
    expect(r.messages[0].role).toBe("system");
    expect(r.truncated).toBe(true);
  });

  it("preserves multiple system messages (e.g., multi-system prompt)", () => {
    const m = [
      msg("system", "rule 1"),
      msg("system", "rule 2"),
      msg("user", "hi"),
    ];
    const r = windowChatHistory(m, { maxTokens: 10000 });
    expect(r.messages.filter((x) => x.role === "system").length).toBe(2);
  });
});

describe("windowChatHistory — eviction direction (newest kept)", () => {
  it("evicts oldest non-system messages when budget is tight", () => {
    const messages = [
      msg("system", "sys"),
      msg("user", "OLDEST" + "x".repeat(400)),
      msg("user", "MIDDLE" + "x".repeat(400)),
      msg("user", "NEWEST" + "x".repeat(400)),
    ];
    // Budget: enough for system + ONE of the long user messages
    const r = windowChatHistory(messages, { maxTokens: 130 });
    expect(r.truncated).toBe(true);
    expect(r.evictedCount).toBeGreaterThan(0);
    // Newest survived
    const lastUser = r.messages[r.messages.length - 1];
    expect(lastUser.content).toContain("NEWEST");
  });

  it("returns kept messages in oldest-first order (model.execute() shape)", () => {
    const messages = [
      msg("system", "sys"),
      msg("user", "1"),
      msg("assistant", "2"),
      msg("user", "3"),
      msg("assistant", "4"),
    ];
    const r = windowChatHistory(messages, { maxTokens: 10000 });
    const order = r.messages.map((m) => m.content);
    expect(order).toEqual(["sys", "1", "2", "3", "4"]);
  });
});

describe("windowChatHistory — keep-at-least-one guard", () => {
  it("keeps at least one non-system message when a single message exceeds budget", () => {
    // The keepReverse.length > 0 guard: when a single message alone
    // is too big, we'd otherwise return zero non-system messages —
    // which leaves the model with just the system prompt and no
    // user input, a useless call. Keep the latest non-system
    // message even if it pushes over budget.
    const messages = [
      msg("system", "sys"),
      msg("user", "x".repeat(10000)), // ~2504 tokens
    ];
    const r = windowChatHistory(messages, { maxTokens: 100 });
    expect(r.messages.length).toBe(2);
    expect(r.messages[1].role).toBe("user");
  });
});

describe("windowChatHistory — telemetry", () => {
  it("reports truncated=false + evictedCount=0 when nothing dropped", () => {
    const r = windowChatHistory([msg("user", "hi")], { maxTokens: 1000 });
    expect(r.truncated).toBe(false);
    expect(r.evictedCount).toBe(0);
  });

  it("reports truncated=true + accurate evictedCount after drops", () => {
    const m = Array.from({ length: 10 }, (_, i) =>
      msg("user", "x".repeat(400) + ` msg ${i}`),
    );
    const r = windowChatHistory(m, { maxTokens: 250 });
    expect(r.truncated).toBe(true);
    expect(r.evictedCount).toBeGreaterThan(0);
    expect(r.evictedCount + r.messages.length).toBe(10);
  });

  it("estimatedTokens reflects the kept set, not the input", () => {
    const m = [
      msg("user", "x".repeat(400)),
      msg("user", "x".repeat(400)),
      msg("user", "x".repeat(400)),
    ];
    const r = windowChatHistory(m, { maxTokens: 150 });
    // estimatedTokens should be roughly the cost of what survived
    expect(r.estimatedTokens).toBeLessThanOrEqual(150 + 110); // budget + last-msg-keep-guard slack
    // And greater than 0
    expect(r.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("windowChatHistory — tool_calls / tool_call_id pairing", () => {
  it("can keep a tool_call/tool_result pair when budget allows", () => {
    const messages = [
      msg("system", "sys"),
      msg("user", "do it"),
      msg("assistant", "", {
        toolCalls: [{ id: "c1", name: "search", arguments: "{}" }],
      }),
      msg("tool", "result", { toolCallId: "c1" }),
      msg("assistant", "done"),
    ];
    const r = windowChatHistory(messages, { maxTokens: 10000 });
    // No truncation — pair survives intact
    expect(r.truncated).toBe(false);
    const toolMsg = r.messages.find((m) => m.role === "tool");
    const assistantWithCalls = r.messages.find(
      (m) => m.role === "assistant" && m.toolCalls,
    );
    expect(toolMsg?.toolCallId).toBe("c1");
    expect(assistantWithCalls?.toolCalls?.[0].id).toBe("c1");
  });
});
