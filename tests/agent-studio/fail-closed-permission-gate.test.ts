/**
 * Phase 5b (Roadmap V3) — fail-closed permission gate.
 *
 * Locks the wiring + lattice that closes Definition-of-Done Gate 5:
 * a published agent with zero enabled permission rules MUST receive
 * a `not_authorized` response from `dispatchMcpToolCall` (instead
 * of the cycle-8 `"skip"` warn-allow), gated by the operator-flipped
 * `RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED` env flag.
 *
 * Source-scan invariants (cycle-7/8 doc-block + lockstep pattern).
 * Exercises the regex shapes that prove:
 *
 *   1. The dispatcher imports `isPublishedRuntime` + `RuntimeContext`
 *   2. The env flag function exists and reads
 *      `RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED`
 *   3. The new lattice cell is wired: `enabled.length === 0` →
 *      flag-on + isPublishedRuntime → return `{ verdict: "deny",
 *      reason: REASON_DENY_MISSING_RULES_PUBLISHED }`
 *   4. The reason constant `deny_missing_rules_for_published_agent`
 *      exists (stable token for forensic grep)
 *   5. `DispatchMcpToolCallInput` carries `runtimeContext?: RuntimeContext`
 *   6. Both chat lanes (chat-stream.ts + chat.ts) thread the
 *      runtimeContext through to dispatchMcpToolCall — parallel-flow
 *      lockstep with cycle-6 C1-c6 / Phase 4.5 R2/R4
 *
 * Pure source-scan — no DB, no network. Companion to the Phase 5a
 * `runtime-context-and-impact-scan.test.ts` invariants.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const DISPATCHER = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/mcp/dispatcher.ts"),
  "utf8",
);
const DISPATCHER_TYPES = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/mcp/dispatcher-types.ts"),
  "utf8",
);
const CHAT_STREAM = readFileSync(
  join(REPO_ROOT, "server/agent-studio/chat-stream.ts"),
  "utf8",
);
const CHAT_TS = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/chat.ts"),
  "utf8",
);

describe("Phase 5b — fail-closed permission gate (Gate 5)", () => {
  describe("dispatcher imports + env-flag wiring", () => {
    it("imports isPublishedRuntime and RuntimeContext from runtime-context", () => {
      expect(DISPATCHER).toMatch(
        /import\s*\{[\s\S]*?isPublishedRuntime[\s\S]*?type\s+RuntimeContext[\s\S]*?\}\s*from\s*["']\.\.\/runtime\/runtime-context["']/,
      );
    });

    it("declares isFailClosedPublishedEnabled reading the env var", () => {
      // Operator flips the flag without restarting the server, so the
      // function must read process.env on every call (not at module
      // load). Lock the read site explicitly.
      expect(DISPATCHER).toMatch(
        /function\s+isFailClosedPublishedEnabled\s*\([^)]*\)\s*:\s*boolean[\s\S]{0,400}process\.env\.RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED/,
      );
    });

    it("default-off semantics: requires explicit lower-case 'true' to enable", () => {
      // Anything other than the literal string "true" (case-insensitive)
      // preserves cycle-8 behavior. This protects against `"1"` / `"on"`
      // / `"yes"` accidentally enabling the deny path during rollout.
      expect(DISPATCHER).toMatch(
        /process\.env\.RUNTIME_FAIL_CLOSED_PUBLISHED_ENABLED[\s\S]{0,80}\.toLowerCase\(\)[\s\S]{0,40}===\s*\n?\s*["']true["']/,
      );
    });

    it("declares REASON_DENY_MISSING_RULES_PUBLISHED stable token", () => {
      // Forensic stability: operators grep audit / errorMessage rows
      // for this exact string. Renaming it is a breaking change to
      // any external SIEM dashboard keyed off the token.
      expect(DISPATCHER).toMatch(
        /REASON_DENY_MISSING_RULES_PUBLISHED\s*=\s*\n?\s*["']deny_missing_rules_for_published_agent["']/,
      );
    });
  });

  describe("checkAllowedTools lattice cell", () => {
    it("accepts runtimeContext as a third parameter", () => {
      // Threading via the function signature (not via a side-channel
      // singleton) means the gate is testable without mocking module
      // state. The optional `?` keeps the mcp-manager / simulation /
      // system call sites backward compatible.
      expect(DISPATCHER).toMatch(
        /async\s+function\s+checkAllowedTools\s*\(\s*\n?\s*agentDraftId:\s*number\s*,\s*\n?\s*fullToolName:\s*string\s*,\s*\n?\s*runtimeContext\?:\s*RuntimeContext\s*,?\s*\n?\s*\)/,
      );
    });

    it("returns deny when zero enabled rules + flag on + isPublishedRuntime(ctx)", () => {
      // The triple-AND short-circuits in the right order: flag check
      // first (cheap), then runtimeContext presence, then strict
      // equality on "published". Any reordering that flips the gate
      // open is caught here.
      expect(DISPATCHER).toMatch(
        /enabled\.length\s*===\s*0[\s\S]{0,400}isFailClosedPublishedEnabled\(\)[\s\S]{0,80}runtimeContext[\s\S]{0,80}isPublishedRuntime\(runtimeContext\)[\s\S]{0,200}verdict:\s*["']deny["'][\s\S]{0,200}reason:\s*REASON_DENY_MISSING_RULES_PUBLISHED/,
      );
    });

    it("preserves the cycle-8 'skip' fallback for non-published / no-context", () => {
      // The existing dev-friendly path stays intact: when the flag is
      // off, runtimeContext is missing, or lifecycle != "published",
      // checkAllowedTools must still return verdict:"skip" so drafts
      // and ad-hoc dispatches keep working.
      expect(DISPATCHER).toMatch(
        /enabled\.length\s*===\s*0[\s\S]{0,800}return\s*\{\s*verdict:\s*["']skip["']\s*\}/,
      );
    });
  });

  describe("DispatchMcpToolCallInput shape", () => {
    it("carries runtimeContext?: RuntimeContext", () => {
      expect(DISPATCHER_TYPES).toMatch(
        /runtimeContext\?:\s*RuntimeContext\s*;?/,
      );
    });

    it("imports the RuntimeContext type from runtime-context", () => {
      expect(DISPATCHER_TYPES).toMatch(
        /import\s+type\s*\{\s*RuntimeContext\s*\}\s*from\s*["']\.\.\/runtime\/runtime-context["']/,
      );
    });
  });

  describe("chat-stream lane: dispatch call site", () => {
    it("threads runtimeContext into runStreamingToolLoop", () => {
      // The SSE handler builds `runtimeContext` once per request
      // (Phase 5a) and passes it into the loop function. The loop
      // forwards it to every per-call dispatch. Locking the parameter
      // catches a future PR that removes the thread.
      expect(CHAT_STREAM).toMatch(
        /runStreamingToolLoop\(\s*\{[\s\S]{0,800}runtimeContext\s*,?\s*\}\)/,
      );
    });

    it("forwards runtimeContext into dispatchMcpToolCall", () => {
      // Inside the loop, every `dispatchMcpToolCall` invocation must
      // carry runtimeContext or the gate has nothing to enforce on.
      expect(CHAT_STREAM).toMatch(
        /dispatchMcpToolCall\(\s*\{[\s\S]{0,1200}runtimeContext\s*,?\s*\}\)/,
      );
    });
  });

  describe("chat.ts (blocking) lane: parallel-flow lockstep", () => {
    it("threads runtimeContext into runChatWithToolsViaBinding", () => {
      // Same pattern as chat-stream.ts. sendChatMessage builds the
      // runtimeContext (Phase 5a) and passes it into the binding loop,
      // which forwards to every dispatch.
      expect(CHAT_TS).toMatch(
        /runChatWithToolsViaBinding\(\s*\{[\s\S]{0,1500}runtimeContext\s*,?\s*\}\)/,
      );
    });

    it("forwards input.runtimeContext into dispatchMcpToolCall", () => {
      // Inside runChatWithToolsViaBinding the runtimeContext is on
      // `input.runtimeContext` (parameter, not closure). Locking the
      // exact reference catches a refactor that drops the thread.
      expect(CHAT_TS).toMatch(
        /dispatchMcpToolCall\(\s*\{[\s\S]{0,1500}runtimeContext:\s*input\.runtimeContext\s*,?\s*\}\)/,
      );
    });
  });

  describe("dispatcher fail() error message", () => {
    it("surfaces the stable reason token in the error message for forensic grep", () => {
      // The dispatcher prefixes the not_authorized message with the
      // bracketed reason key (e.g. `[deny_missing_rules_for_published_agent]
      // Tool "..." denied: ...`). Operators grepping audit-row
      // errorMessage / SSE tool_end rely on the stable prefix.
      expect(DISPATCHER).toMatch(
        /authResult\.reason\s*\?\s*`\[\$\{authResult\.reason\}\]/,
      );
    });

    it("emits a Phase 5b-specific message when reason matches the published-deny token", () => {
      expect(DISPATCHER).toMatch(
        /authResult\.reason\s*===\s*REASON_DENY_MISSING_RULES_PUBLISHED[\s\S]{0,400}published agent has no enabled permission rules[\s\S]{0,200}fail-closed/i,
      );
    });
  });
});
