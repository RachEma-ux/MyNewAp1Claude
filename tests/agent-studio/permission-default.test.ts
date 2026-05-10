/**
 * Phase 2 Layer 8 — Permission default behavior test.
 *
 * Locks today's "no enabled permission rules → bypass allowedTools"
 * behavior so that Phase 5b's flip to fail-closed (when
 * `runtimeContext.agentLifecycleState === "published"`) is detectable.
 *
 * Per `server/agent-studio/services/mcp/dispatcher.ts:411-417`,
 * `checkAllowedTools` returns:
 *   - "allow"  → rule explicitly permits this tool
 *   - "deny"   → rule explicitly denies, OR no matching rule
 *   - "ask"    → rule says ask. Dispatcher treats as "deny"
 *   - "skip"   → no rules at all → bypass (treat as wide open)
 *
 * The "skip" behavior at `dispatcher.ts:437` is the **single Phase-2
 * authorship gap** identified by Phase 1e §3 M4 — every other Phase-2
 * category had at least one existing test, but no file proved
 * "no rules → permitted". This test closes that gap.
 *
 * Phase 5b will change the source at line 437 to:
 *   if (enabled.length === 0) {
 *     if (runtimeContext.agentLifecycleState === "published") return "deny";
 *     return "skip";
 *   }
 *
 * When that change lands, this test fails — the implementer must
 * update both the test and the dispatcher in lockstep, exactly the
 * "doc-block + lockstep" pattern from cycle-5/6/7/8 closure reports.
 *
 * Source-scan rather than behavioral mocking: avoids replicating the
 * ~150-line dispatcher.test.ts mock boilerplate for a single-line
 * invariant. The colocated `services/mcp/__tests__/dispatcher.test.ts`
 * already covers the dispatch-path behavior end-to-end (Layer 8 also
 * runs that file).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);

describe("permission default — no enabled rules → skip (current behavior)", () => {
  it("dispatcher.ts checkAllowedTools returns 'skip' for empty rules", () => {
    const source = readFileSync(DISPATCHER_PATH, "utf8");

    // The function body is small enough to assert on directly. We
    // search for the precise line that decides "no rules at all".
    // Phase 5b will modify this line; that is intentional and the
    // failure message tells the next implementer what to do.
    const skipLine = `if (enabled.length === 0) return "skip";`;

    if (!source.includes(skipLine)) {
      throw new Error(
        [
          "Permission-default invariant changed.",
          "",
          "Expected `dispatcher.ts` to contain:",
          `  ${skipLine}`,
          "",
          "If you are implementing Phase 5b (published-agent fail-closed),",
          "update this test alongside the dispatcher change. The new test",
          "should assert both branches:",
          "  - non-published runtime: still returns 'skip' (preserves",
          "    developer-friendly behavior on drafts/simulation)",
          "  - published runtime + zero enabled rules: returns 'deny'",
          "    (closes Gate 5 — Published Agent Fail-Closed)",
          "",
          "The published-runtime signal is",
          "`runtimeContext.agentLifecycleState === \"published\"`,",
          "derived from `agent.lifecycle.state` per pre-flight #4 of the",
          "Runtime Hardening Roadmap V3.",
        ].join("\n"),
      );
    }

    expect(source).toContain(skipLine);
  });

  it("dispatcher.ts checkAllowedTools doc-comment still describes 'skip' as wide-open", () => {
    const source = readFileSync(DISPATCHER_PATH, "utf8");

    // The doc-block at lines 413-415 explains the "skip" semantics. If
    // Phase 5b lands without updating this comment, the test catches
    // the doc-vs-source drift (cycle-5/6/7/8 doc-block + lockstep
    // pattern).
    const docPhrase = "no rules at all → bypass";

    expect(
      source.includes(docPhrase),
      `dispatcher.ts comment about empty-rules behavior should mention "${docPhrase}". ` +
        `If you changed the behavior in Phase 5b, update both the comment and this test.`,
    ).toBe(true);
  });

  it("dispatcher.ts checkAllowedTools fail-closed default still applies on DB read failure", () => {
    const source = readFileSync(DISPATCHER_PATH, "utf8");

    // The catch block at dispatcher.ts:432-434 is "DB read failed →
    // fail closed (return 'deny')". That invariant is independent of
    // Phase 5b; it must stay.
    const failClosedPhrase = `// DB read failed — fail closed`;

    expect(source).toContain(failClosedPhrase);
    expect(source).toMatch(/catch[^{]*\{\s*\/\/ DB read failed[\s\S]*?return "deny"/);
  });
});
