/**
 * H5-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §H5-c8) — strict toolCallId reconstructor migration.
 *
 * Pre-cycle-8 both chat flows still used the legacy
 * `tp?.toolCallId ?? ""` fallback (a cycle-7 M9-c7 in-flight-compat
 * concession). Cycle-7 added the strict
 * `reconstructToolHistoryMessage` helper but didn't migrate the
 * call sites. The audit flagged the cross-concern: when the chat
 * flow ingests a malformed row (missing toolCallId), the empty-
 * string fallback flows into `windowChatHistory` and then the
 * model — violating the OpenAI / Anthropic tool-loop protocol
 * silently.
 *
 * Cycle-8 retires the fallback. Both flows now consume
 * `reconstructToolHistoryMessageOrLog` which:
 *   1. Calls the strict reconstructor (returns null on missing/
 *      empty/non-string toolCallId)
 *   2. On null, emits a rate-limited breadcrumb (one warn per
 *      sessionId per 60s) — mirrors cycle-7 H9-c7 trace-warn
 *      rate-limit shape
 *   3. Returns null so the caller drops the row from the messages
 *      array (the protocol-violating empty-string row never
 *      reaches the model)
 *
 * Pinned invariants:
 *   1. Helper exports: `reconstructToolHistoryMessageOrLog`,
 *      `__resetMalformedRowWarnRateLimitForTests` (test surface)
 *   2. Both chat flows import + call the helper at the tool-row
 *      reconstruction site (cross-flow lockstep parametrized over
 *      both files — cycle-7 H8-c7 / H1-c8 shape)
 *   3. Both call sites pass the right `flow` discriminator (so
 *      breadcrumbs identify which flow saw the malformed row)
 *   4. Both call sites SKIP the row when the helper returns null
 *      (the load-bearing assertion — a future PR that "simplified"
 *      by pushing a default row would silently restore the bug)
 *   5. Behavioral: helper rate-limits to one warn per session per
 *      60s; resets via test escape hatch; valid rows return the
 *      reconstructed message; malformed rows return null + log
 *   6. The legacy `tp?.toolCallId ?? ""` shape is REMOVED from the
 *      tool-row reconstruction site in both files (the regex
 *      ignores comments per cycle-7 lessons)
 *   7. H5-c8 closure marker on both chat flows + the helper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  reconstructToolHistoryMessageOrLog,
  __resetMalformedRowWarnRateLimitForTests,
} from "../../server/agent-studio/services/runtime/chat-history-shape";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);
const SHAPE_HELPER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/chat-history-shape.ts",
);

const sources = {
  "chat-stream.ts": readFileSync(CHAT_STREAM_PATH, "utf8"),
  "chat.ts": readFileSync(CHAT_TS_PATH, "utf8"),
};

// ─────────────────────────────────────────────────────────────────────
// 1. Helper behavior: drop + rate-limit + restore via reset
// ─────────────────────────────────────────────────────────────────────

describe("H5-c8 — reconstructToolHistoryMessageOrLog behavior", () => {
  beforeEach(() => {
    __resetMalformedRowWarnRateLimitForTests();
  });

  afterEach(() => {
    __resetMalformedRowWarnRateLimitForTests();
    vi.useRealTimers();
  });

  it("returns the reconstructed message for valid toolCallId", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "the result",
          toolPayload: { toolCallId: "call_42", name: "search" },
        },
        { sessionId: 1, flow: "chat-stream" },
      );
      expect(out).not.toBeNull();
      expect(out!.toolCallId).toBe("call_42");
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns null + emits warn for empty-string toolCallId", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { toolCallId: "", name: "y" },
        },
        { sessionId: 1, flow: "chat-stream" },
      );
      expect(out).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain("dropped malformed tool history row");
      expect(msg).toContain("session=1");
      expect(msg).toContain("[chat-stream]");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns null + emits warn for missing toolCallId field", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 5, flow: "chat" },
      );
      expect(out).toBeNull();
      expect(warnSpy.mock.calls[0][0]).toContain("session=5");
      expect(warnSpy.mock.calls[0][0]).toContain("[chat]");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rate-limits: only the first warn per session within 60s fires", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseT = 1_700_000_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(baseT);
    try {
      // Three malformed rows in the same session within the same window
      for (let i = 0; i < 3; i++) {
        reconstructToolHistoryMessageOrLog(
          {
            role: "tool",
            content: "x",
            toolPayload: { name: "y" },
          },
          { sessionId: 7, flow: "chat-stream" },
        );
      }
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // After 60s, next warn fires again
      dateSpy.mockReturnValue(baseT + 60_000);
      reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 7, flow: "chat-stream" },
      );
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
      dateSpy.mockRestore();
    }
  });

  it("different sessions have independent rate budgets", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 1, flow: "chat-stream" },
      );
      reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 2, flow: "chat-stream" },
      );
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("__resetMalformedRowWarnRateLimitForTests drops budget for deterministic tests", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 1, flow: "chat-stream" },
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Without reset, second call would suppress; with reset, it fires
      __resetMalformedRowWarnRateLimitForTests();
      reconstructToolHistoryMessageOrLog(
        {
          role: "tool",
          content: "x",
          toolPayload: { name: "y" },
        },
        { sessionId: 1, flow: "chat-stream" },
      );
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Cross-flow lockstep: both chat flows wire the helper
// ─────────────────────────────────────────────────────────────────────

describe("H5-c8 — cross-flow lockstep on both chat flows", () => {
  for (const [label, src] of Object.entries(sources)) {
    describe(label, () => {
      it("source carries the H5-c8 closure marker", () => {
        expect(src).toMatch(/H5-c8\b/);
      });

      it("imports reconstructToolHistoryMessageOrLog from chat-history-shape", () => {
        expect(
          src,
          `H5-c8 violated: ${label} must import the strict ` +
            `reconstructor from runtime/chat-history-shape. The legacy ` +
            `\`tp?.toolCallId ?? ""\` inline fallback is retired.`,
        ).toMatch(/reconstructToolHistoryMessageOrLog/);
      });

      it("calls reconstructToolHistoryMessageOrLog at the tool-row site", () => {
        // Catches a future PR that imports the helper but forgets to
        // invoke it (or invokes it but ignores the return).
        expect(
          src,
          `H5-c8 violated: ${label} must call ` +
            `reconstructToolHistoryMessageOrLog(m, {sessionId, flow}) ` +
            `at the tool-row reconstruction site.`,
        ).toMatch(/reconstructToolHistoryMessageOrLog\(/);
      });

      it("call site passes the correct `flow` discriminator", () => {
        const expectedFlow = label === "chat-stream.ts" ? "chat-stream" : "chat";
        expect(
          src,
          `H5-c8 violated: ${label} must pass flow: "${expectedFlow}" ` +
            `so the breadcrumb names which flow saw the malformed row.`,
        ).toMatch(new RegExp(`flow:\\s*"${expectedFlow}"`));
      });

      it("SKIPS the row when the helper returns null (load-bearing)", () => {
        // A future PR that "simplified" by pushing a default row when
        // the helper returns null would silently restore the empty-
        // string-toolCallId bug. The lockstep pins the conditional.
        expect(
          src,
          `H5-c8 violated: ${label} must check ` +
            `\`if (reconstructed !== null)\` before pushing into the ` +
            `messages array. Pushing unconditionally re-introduces the ` +
            `protocol-violating empty toolCallId row.`,
        ).toMatch(
          /reconstructToolHistoryMessageOrLog\([\s\S]{0,300}if\s*\(\s*reconstructed\s*!==\s*null\s*\)/,
        );
      });

      it("retired the legacy `tp?.toolCallId ?? \"\"` pattern (in code, not comments)", () => {
        // The pre-cycle-8 fallback shape MUST NOT reappear in code.
        // Filter comment lines so doc-block historical references
        // are exempt (mirrors cycle-8 PR-A's comment-stripping
        // pattern from the M3 ??= test).
        const codeLines = src
          .split("\n")
          .filter((line) => !/^\s*(\*|\/\/)/.test(line))
          .join("\n");
        expect(
          codeLines,
          `H5-c8 violated: ${label} must NOT carry the legacy ` +
            `\`tp?.toolCallId ?? ""\` fallback in code. Use the strict ` +
            `reconstructor instead.`,
        ).not.toMatch(/tp\?\.toolCallId\s*\?\?\s*""/);
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. Helper module surface
// ─────────────────────────────────────────────────────────────────────

describe("H5-c8 — chat-history-shape module surface", () => {
  const src = readFileSync(SHAPE_HELPER_PATH, "utf8");

  it("module carries the H5-c8 closure marker", () => {
    expect(src).toMatch(/H5-c8\b/);
  });

  it("rate-limit constant is named MALFORMED_ROW_WARN_MIN_INTERVAL_MS = 60_000", () => {
    expect(
      src,
      "H5-c8 violated: rate-limit constant must be named " +
        "MALFORMED_ROW_WARN_MIN_INTERVAL_MS = 60_000 so it's " +
        "greppable + reviewers see the value without reading the " +
        "doc-block.",
    ).toMatch(/MALFORMED_ROW_WARN_MIN_INTERVAL_MS\s*=\s*60_000/);
  });

  it("rate-limit map is named lastMalformedRowWarnAt", () => {
    expect(src).toMatch(/lastMalformedRowWarnAt\s*=\s*new Map/);
  });

  it("doc-block names cycle-7 H9-c7 as the rate-limit pattern source", () => {
    // The pattern reuse should be discoverable so a future PR
    // tweaking the rate-limit knows where the standing pattern
    // originated.
    expect(
      src,
      "H5-c8 violated: doc-block must name cycle-7 H9-c7 (the " +
        "trace-warn rate-limit) as the standing pattern this helper " +
        "mirrors. Without the reference, a future PR could diverge " +
        "the two rate-limits without realizing they share design.",
    ).toMatch(/H9-c7/);
  });
});
