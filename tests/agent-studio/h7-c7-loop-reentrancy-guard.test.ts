/**
 * H7-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H7-c7) — per-tool dispatch ceiling lockstep.
 *
 * Pre-cycle-7 the only loop backstop was MAX_TOOL_TURNS=6. A model
 * could call the same tool up to 6 times in a row (e.g.,
 * `delete_all_files` x6) with no per-tool guard. Each call was
 * approved independently — the approval gate had no notion of
 * "this tool was just denied 2 turns ago." A jailbroken /
 * prompt-injected model could exhaust budget or cause damage
 * through repeated calls even when approval gates were engaged.
 *
 * Post-cycle-7 both chat-stream.ts and chat.ts track per-tool
 * dispatch counts in a function-scoped Map. After
 * MAX_CALLS_PER_TOOL_PER_REQUEST (default 3, env-overridable)
 * dispatches of the same tool, the next attempt:
 *   1. Synthesizes a refusal tool result (visible to the LLM as
 *      `{error, code: "tool_call_limit_exceeded", limit,
 *      attemptedCount}`)
 *   2. Emits an `agsRuntimePolicyEvents` security row
 *      (`policyKey: "tool_loop_guard"`, `decision: "deny"`,
 *      `reason: "tool_call_limit_exceeded"`)
 *   3. Skips the actual dispatch
 *
 * Both flows use the SAME constant + SAME guard shape — parallel-
 * flow lockstep per the cycles 5/6/7 standing pattern.
 *
 * This file pins via source-scan:
 *   1. MAX_CALLS_PER_TOOL_PER_REQUEST defined in BOTH files with
 *      operator env override
 *   2. Out-of-range env values warn (mirrors L5-c6 + H1-c7)
 *   3. toolDispatchCounts Map declared at function scope (across
 *      turn iterations, not per-turn)
 *   4. Increment + check happens BEFORE the dispatch (so an over-
 *      limit call never reaches the dispatcher)
 *   5. Refusal tool message uses `code: "tool_call_limit_exceeded"`
 *      (catches a future PR that drops the structured code)
 *   6. agsRuntimePolicyEvents emit uses `policyKey: "tool_loop_guard"`
 *      and `decision: "deny"` (operator forensics filter)
 *   7. Security event write is wrapped in try/catch (best-effort
 *      observability — failure doesn't fail the chat)
 *   8. console.warn breadcrumb on event-write failure (mirrors
 *      H9-c7 / L4-c5 trace-vs-audit best-effort pattern)
 *
 * Behavioral coverage (a model spamming the same tool actually
 * gets refused after the 3rd call) is deferred to a B-coverage
 * integration test using a fake model.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);

describe("H7-c7 — MAX_CALLS_PER_TOOL_PER_REQUEST constant in BOTH files", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("source carries the H7-c7 closure marker", () => {
        expect(
          src,
          `H7-c7 violated: ${label} must carry the \`H7-c7\` closure ` +
            `marker so a future audit can trace the loop guard back to ` +
            `its origin item.`,
        ).toMatch(/H7-c7\b/);
      });

      it("defines MAX_CALLS_PER_TOOL_PER_REQUEST with operator env override", () => {
        expect(
          src,
          `H7-c7 violated: ${label} must define ` +
            `MAX_CALLS_PER_TOOL_PER_REQUEST as a named constant with ` +
            `process.env.MAX_CALLS_PER_TOOL_PER_REQUEST override.`,
        ).toMatch(
          /MAX_CALLS_PER_TOOL_PER_REQUEST[\s\S]{0,300}process\.env\.MAX_CALLS_PER_TOOL_PER_REQUEST/,
        );
      });

      it("out-of-range env values produce console.warn (mirrors L5-c6 / H1-c7)", () => {
        expect(
          src,
          `H7-c7 violated: ${label} must console.warn on out-of-range ` +
            `MAX_CALLS_PER_TOOL_PER_REQUEST so operators don't silently ` +
            `get the default. Mirrors L5-c6 timeout-bounds + H1-c7 ` +
            `MCP_TOOL_CALL_TIMEOUT_MS.`,
        ).toMatch(/MAX_CALLS_PER_TOOL_PER_REQUEST[\s\S]{0,400}console\.warn/);
      });

      it("default value is 3", () => {
        // Catches a future PR that "loosens" the default to a higher
        // value without justification. 3 is the audit-suggested value.
        expect(
          src,
          `H7-c7 violated: ${label} default MAX_CALLS_PER_TOOL_PER_REQUEST ` +
            `should be 3 (audit-suggested). A future loosen-to-N change ` +
            `should update this assertion + the doc-block rationale.`,
        ).toMatch(/MAX_CALLS_PER_TOOL_PER_REQUEST[\s\S]{0,500}return\s+3;/);
      });
    });
  }
});

describe("H7-c7 — toolDispatchCounts capture Map", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("declares toolDispatchCounts as a Map<string, number>", () => {
        expect(
          src,
          `H7-c7 violated: ${label} must declare \`toolDispatchCounts\` ` +
            `as a Map<string, number> at function scope so counts ` +
            `accumulate ACROSS turn iterations (not reset per-turn).`,
        ).toMatch(
          /const\s+toolDispatchCounts\s*=\s*new\s+Map<string,\s*number>\(\)/,
        );
      });
    });
  }
});

describe("H7-c7 — guard placement + behavior", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("increments BEFORE checking the limit (off-by-one safety)", () => {
        // Without the increment-then-check pattern, the off-by-one
        // gives N+1 dispatches when the limit is N. Pin the order.
        expect(
          src,
          `H7-c7 violated: ${label} must increment toolDispatchCounts ` +
            `BEFORE checking against the limit so the Nth call (matching) ` +
            `is allowed and the N+1th is refused. Reverse order off-by-` +
            `ones the limit.`,
        ).toMatch(
          /const\s+dispatchCount\s*=\s*\(toolDispatchCounts\.get\([\s\S]{0,80}\)\s*\?\?\s*0\)\s*\+\s*1[\s\S]{0,200}toolDispatchCounts\.set\([\s\S]{0,80}dispatchCount\)[\s\S]{0,300}dispatchCount\s*>\s*MAX_CALLS_PER_TOOL_PER_REQUEST/,
        );
      });

      it("emits structured refusal with code='tool_call_limit_exceeded'", () => {
        // The structured code is what operator UI + log analysis
        // greps for. A future PR that drops the code (or uses a
        // different one) breaks operator forensics.
        expect(
          src,
          `H7-c7 violated: ${label} must emit a structured refusal with ` +
            `code: "tool_call_limit_exceeded" so operator UI + log ` +
            `analysis can filter for loop-guard refusals specifically.`,
        ).toMatch(/code:\s*"tool_call_limit_exceeded"/);
      });

      it("refusal payload carries limit + attemptedCount for forensics", () => {
        // Without these fields, an operator triaging a refused call
        // can't tell if it was the 4th attempt at limit=3 or the
        // 100th attempt with a misconfigured limit. Both fields are
        // load-bearing.
        expect(
          src,
          `H7-c7 violated: ${label} refusal payload must carry both ` +
            `\`limit\` (the configured ceiling) and \`attemptedCount\` ` +
            `(the actual attempt number) so operator triage has full ` +
            `context.`,
        ).toMatch(
          /limit:\s*MAX_CALLS_PER_TOOL_PER_REQUEST[\s\S]{0,200}attemptedCount:\s*dispatchCount/,
        );
      });

      it("emits agsRuntimePolicyEvents with policyKey='tool_loop_guard'", () => {
        // The audit row is the operator's authoritative record of
        // refused dispatches. policyKey lets ops filter for loop-
        // guard events specifically.
        expect(
          src,
          `H7-c7 violated: ${label} must emit an agsRuntimePolicyEvents ` +
            `audit row with policyKey: "tool_loop_guard" so operator ` +
            `forensics can filter for loop-guard refusals.`,
        ).toMatch(
          /appendRuntimePolicyEvent\([\s\S]{0,400}policyKey:\s*"tool_loop_guard"/,
        );
      });

      it("audit row decision is 'deny' (matches refusal semantic)", () => {
        expect(
          src,
          `H7-c7 violated: ${label} loop-guard audit row must use ` +
            `decision: "deny" — the dispatch was actively refused, not ` +
            `merely warned about.`,
        ).toMatch(
          /appendRuntimePolicyEvent\([\s\S]{0,500}decision:\s*"deny"/,
        );
      });

      it("audit-row write is wrapped in try/catch (best-effort observability)", () => {
        // Mirrors H9-c7 + L4-c5: trace/observability rows are best-
        // effort to keep the chat flowing. The audit row's failure
        // doesn't fail the chat.
        expect(
          src,
          `H7-c7 violated: ${label} loop-guard audit-row write must be ` +
            `wrapped in try/catch (mirrors L4-c5 trace-vs-audit + H9-c7 ` +
            `breadcrumb pattern). Failure to write the audit row must ` +
            `NOT fail the chat — the model should still see the refusal.`,
        ).toMatch(
          /try\s*\{\s*await\s+repo\.appendRuntimePolicyEvent\([\s\S]{0,800}\}\s*catch\s*\(/,
        );
      });

      it("audit-write failure produces console.warn breadcrumb", () => {
        expect(
          src,
          `H7-c7 violated: ${label} audit-write failure catch must ` +
            `console.warn with a tool_loop_guard prefix so persistent ` +
            `outages leave a breadcrumb.`,
        ).toMatch(/tool_loop_guard event write failed/);
      });

      it("breadcrumb includes the source-flow tag (chat-stream vs chat)", () => {
        // The audit row's payload also carries a `source` field so
        // operators can tell which flow (streaming vs non-streaming)
        // hit the guard. Catches a future copy-paste bug where both
        // files emit the same source tag.
        const expectedSource =
          label === "chat-stream.ts" ? '"chat-stream"' : '"chat"';
        expect(
          src,
          `H7-c7 violated: ${label} audit row payload must carry ` +
            `source: ${expectedSource} so operators can distinguish which ` +
            `flow the guard fired in.`,
        ).toMatch(new RegExp(`source:\\s*${expectedSource.replace(/"/g, '"')}`));
      });
    });
  }
});

describe("H7-c7 — parallel-flow lockstep (same shape in both files)", () => {
  // The cycles 5/6/7 standing pattern: chat-stream.ts and chat.ts
  // must share the same guard shape. Catches a future PR that
  // updates one file without the other.
  const streamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
  const chatSrc = readFileSync(CHAT_TS_PATH, "utf8");

  it("both files use the same constant name", () => {
    // Source-scan that the same name appears in both — different
    // names would silently let the two flows diverge in operator
    // env-var configuration.
    expect(
      streamSrc.includes("MAX_CALLS_PER_TOOL_PER_REQUEST") &&
        chatSrc.includes("MAX_CALLS_PER_TOOL_PER_REQUEST"),
    ).toBe(true);
  });

  it("both files use the same env-var key", () => {
    expect(streamSrc).toMatch(/process\.env\.MAX_CALLS_PER_TOOL_PER_REQUEST/);
    expect(chatSrc).toMatch(/process\.env\.MAX_CALLS_PER_TOOL_PER_REQUEST/);
  });

  it("both files emit the SAME refusal code (tool_call_limit_exceeded)", () => {
    expect(streamSrc).toMatch(/code:\s*"tool_call_limit_exceeded"/);
    expect(chatSrc).toMatch(/code:\s*"tool_call_limit_exceeded"/);
  });

  it("both files emit the SAME audit policyKey (tool_loop_guard)", () => {
    expect(streamSrc).toMatch(/policyKey:\s*"tool_loop_guard"/);
    expect(chatSrc).toMatch(/policyKey:\s*"tool_loop_guard"/);
  });
});
