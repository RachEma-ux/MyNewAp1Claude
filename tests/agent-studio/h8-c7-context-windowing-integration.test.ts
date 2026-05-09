/**
 * H8-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H8-c7) — context-windowing integration lockstep.
 *
 * Pre-cycle-7 chat-stream.ts and chat.ts both built the per-turn LLM
 * prompt by fetching the full conversation history with NO offset/limit,
 * then sending the full array to the model. Long sessions silently
 * grew until the underlying provider's context-length limit was hit
 * and the chat failed unrecoverably.
 *
 * Post-cycle-7 both flows window the message array through
 * `windowChatHistory()` BEFORE calling `model.execute()`. Truncation
 * emits a best-effort `context_truncation` audit row so operators
 * can spot sessions hitting the budget.
 *
 * Behavioral coverage of the windowing helper lives in
 * `tests/agent-studio/context-window.test.ts`. This file pins the
 * dispatcher integration via source-scan:
 *   1. MAX_CONTEXT_TOKENS constant defined in BOTH files (operator
 *      env override + warn on out-of-range)
 *   2. `windowChatHistory` import in both files
 *   3. Window call wraps the messages BEFORE `model.execute()` /
 *      `gatewayCall`-equivalent
 *   4. Windowed.messages flows into the executeInput (not the
 *      pre-window array)
 *   5. Truncation triggers a `context_truncation` audit row
 *      (best-effort try/catch — failure doesn't fail the chat)
 *   6. Both files use the same env-var key + audit policyKey
 *      (parallel-flow lockstep)
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

describe("H8-c7 — MAX_CONTEXT_TOKENS constant in BOTH files", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("source carries the H8-c7 closure marker", () => {
        expect(
          src,
          `H8-c7 violated: ${label} must carry the \`H8-c7\` closure ` +
            `marker so a future audit can trace the windowing back to ` +
            `its origin item.`,
        ).toMatch(/H8-c7\b/);
      });

      it("defines MAX_CONTEXT_TOKENS with operator env override", () => {
        expect(
          src,
          `H8-c7 violated: ${label} must define MAX_CONTEXT_TOKENS as ` +
            `a named constant with process.env.MAX_CONTEXT_TOKENS override.`,
        ).toMatch(
          /MAX_CONTEXT_TOKENS[\s\S]{0,400}process\.env\.MAX_CONTEXT_TOKENS/,
        );
      });

      it("out-of-range env values produce console.warn", () => {
        expect(
          src,
          `H8-c7 violated: ${label} must console.warn on out-of-range ` +
            `MAX_CONTEXT_TOKENS so operators don't silently get the ` +
            `default. Mirrors L5-c6 / H1-c7 / H7-c7 env-validation pattern.`,
        ).toMatch(/MAX_CONTEXT_TOKENS[\s\S]{0,500}console\.warn/);
      });

      it("default value is 32000 (covers GPT-4 Turbo / Claude 3 with headroom)", () => {
        expect(
          src,
          `H8-c7 violated: ${label} default MAX_CONTEXT_TOKENS should ` +
            `be 32000 (audit-suggested baseline that covers modern ` +
            `models with headroom for the model's response).`,
        ).toMatch(/MAX_CONTEXT_TOKENS[\s\S]{0,600}return\s+32_?000;/);
      });
    });
  }
});

describe("H8-c7 — windowChatHistory wired into both flows", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("imports windowChatHistory from the dedicated module", () => {
        // Both files share the same helper module. Importing from
        // elsewhere or inlining the logic would defeat the single-
        // source-of-truth contract.
        expect(
          src,
          `H8-c7 violated: ${label} must import windowChatHistory from ` +
            `the runtime/context-window module so the windowing logic ` +
            `stays centralized.`,
        ).toMatch(
          /import\s*\{\s*windowChatHistory\s*\}\s*from\s*["'][^"']*runtime\/context-window["']/,
        );
      });

      it("calls windowChatHistory with maxTokens: MAX_CONTEXT_TOKENS", () => {
        expect(
          src,
          `H8-c7 violated: ${label} must invoke windowChatHistory ` +
            `with the MAX_CONTEXT_TOKENS budget so the env-tunable ` +
            `constant is the single source of truth.`,
        ).toMatch(
          /windowChatHistory\([\s\S]{0,200}maxTokens:\s*MAX_CONTEXT_TOKENS/,
        );
      });

      it("passes windowed.messages (not the pre-window array) to executeInput", () => {
        // The load-bearing assertion. A future PR that "simplified"
        // by reverting to the pre-window array would silently restore
        // the unbounded-growth bug.
        expect(
          src,
          `H8-c7 violated: ${label} must pass \`windowed.messages\` ` +
            `(not the pre-window array) to ModelAccessExecuteInput. ` +
            `Reverting to the pre-window array silently restores the ` +
            `unbounded-context-growth bug.`,
        ).toMatch(/messages:\s*windowed\.messages/);
      });
    });
  }
});

describe("H8-c7 — context_truncation audit on truncation", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    describe(label, () => {
      const src = readFileSync(path, "utf8");

      it("checks windowed.truncated before emitting the audit row", () => {
        // The audit row should only fire when truncation actually
        // happened — emitting on every turn would spam the audit log
        // with no signal value.
        expect(
          src,
          `H8-c7 violated: ${label} must check \`windowed.truncated\` ` +
            `before emitting the context_truncation audit row.`,
        ).toMatch(/if\s*\(\s*windowed\.truncated\s*\)/);
      });

      it("emits agsRuntimePolicyEvents with policyKey='context_truncation'", () => {
        expect(
          src,
          `H8-c7 violated: ${label} must emit a context_truncation ` +
            `audit row with policyKey: "context_truncation" so operator ` +
            `forensics can filter for sessions hitting the budget.`,
        ).toMatch(
          /appendRuntimePolicyEvent\([\s\S]{0,400}policyKey:\s*"context_truncation"/,
        );
      });

      it("audit row decision is 'warn' (operator-visible signal, not a hard block)", () => {
        // Truncation is a degraded behavior, not a denial. The chat
        // proceeds with the truncated history; warn signals "you may
        // want to start a new session".
        expect(
          src,
          `H8-c7 violated: ${label} context_truncation audit row must ` +
            `use decision: "warn" — truncation degrades the chat, it ` +
            `doesn't block it.`,
        ).toMatch(
          /appendRuntimePolicyEvent\([\s\S]{0,500}decision:\s*"warn"/,
        );
      });

      it("payload carries maxTokens + evictedCount + estimatedTokens for triage", () => {
        // Operator triaging a truncation event needs to know the
        // budget vs the actual tokens vs how many messages were
        // dropped to decide "tune the budget" vs "advise the user
        // to start a new session".
        expect(
          src,
          `H8-c7 violated: ${label} context_truncation payload must ` +
            `carry maxTokens + evictedCount + estimatedTokens so ` +
            `operator triage has the full budget context.`,
        ).toMatch(
          /maxTokens:\s*MAX_CONTEXT_TOKENS[\s\S]{0,400}evictedCount:\s*windowed\.evictedCount[\s\S]{0,200}estimatedTokens:\s*windowed\.estimatedTokens/,
        );
      });

      it("audit-row write is wrapped in try/catch (best-effort observability)", () => {
        expect(
          src,
          `H8-c7 violated: ${label} context_truncation write must be ` +
            `try/catch (mirrors L4-c5 + H7-c7 best-effort observability ` +
            `pattern). Failure to write the audit row must NOT fail ` +
            `the chat — the truncated turn should still proceed.`,
        ).toMatch(
          /try\s*\{\s*await\s+repo\.appendRuntimePolicyEvent\([\s\S]{0,800}\}\s*catch\s*\(/,
        );
      });

      it("audit-write failure produces console.warn breadcrumb", () => {
        expect(
          src,
          `H8-c7 violated: ${label} audit-write failure catch must ` +
            `console.warn with a context_truncation prefix.`,
        ).toMatch(/context_truncation event write failed/);
      });

      it("source-flow tag in payload distinguishes chat-stream vs chat", () => {
        const expectedSource =
          label === "chat-stream.ts" ? '"chat-stream"' : '"chat"';
        expect(
          src,
          `H8-c7 violated: ${label} context_truncation payload must ` +
            `carry source: ${expectedSource} so operators can distinguish ` +
            `which flow hit the limit.`,
        ).toMatch(new RegExp(`source:\\s*${expectedSource.replace(/"/g, '"')}`));
      });
    });
  }
});

describe("H8-c7 — parallel-flow lockstep (same shape in both files)", () => {
  // Cycles 5/6/7 standing pattern: chat-stream.ts and chat.ts must
  // share the same shape. Catches a future PR that updates one
  // without the other.
  const streamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
  const chatSrc = readFileSync(CHAT_TS_PATH, "utf8");

  it("both files use the same env-var key", () => {
    expect(streamSrc).toMatch(/process\.env\.MAX_CONTEXT_TOKENS/);
    expect(chatSrc).toMatch(/process\.env\.MAX_CONTEXT_TOKENS/);
  });

  it("both files emit the SAME audit policyKey (context_truncation)", () => {
    expect(streamSrc).toMatch(/policyKey:\s*"context_truncation"/);
    expect(chatSrc).toMatch(/policyKey:\s*"context_truncation"/);
  });

  it("both files emit the SAME reason (context_window_exceeded)", () => {
    expect(streamSrc).toMatch(/reason:\s*"context_window_exceeded"/);
    expect(chatSrc).toMatch(/reason:\s*"context_window_exceeded"/);
  });
});
