/**
 * Phase 4.5 (Roadmap V3) — runtime-boundaries lint script invariants.
 *
 * Locks the existence + structure of `scripts/check-runtime-boundaries.ts`
 * so a future PR cannot silently delete or weaken the four static
 * rules that close Definition-of-Done Gate 6:
 *
 *   R1 — No raw provider SDK in server/agent-studio/**
 *   R2 — validateRuntimeToolCall precedes dispatchMcpToolCall on chat lanes
 *   R3 — Direct conn.callTool forbidden outside dispatcher.ts
 *   R4 — gateRuntimeDispatch precedes dispatchMcpToolCall on chat lanes
 *
 * Source-scan invariants — the actual rule behavior is validated by
 * the script's own self-test (running it on a clean repo must pass)
 * + the CI step that runs it on every PR.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SCRIPT_PATH = join(REPO_ROOT, "scripts/check-runtime-boundaries.ts");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/run-tests.yml");

describe("Phase 4.5 — runtime-boundaries lint script", () => {
  it("scripts/check-runtime-boundaries.ts exists", () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  describe("script structure (one rule, four invariants)", () => {
    const src = readFileSync(SCRIPT_PATH, "utf8");

    it("declares Rule R1 — no raw provider SDK", () => {
      expect(src).toMatch(/checkR1NoRawProviderSdk/);
      // Forbidden SDK list must include at least the obvious offenders.
      expect(src).toMatch(/"openai"/);
      expect(src).toMatch(/"@anthropic-ai\/sdk"/);
    });

    it("declares Rule R2 — validator precedes dispatch", () => {
      expect(src).toMatch(/checkR2ValidatorPrecedesDispatch/);
      expect(src).toMatch(/validateRuntimeToolCall/);
      expect(src).toMatch(/dispatchMcpToolCall/);
    });

    it("declares Rule R3 — MCP chokepoint", () => {
      expect(src).toMatch(/checkR3McpChokepoint/);
      expect(src).toMatch(/conn\\.callTool/);
    });

    it("declares Rule R4 — approval gate precedes dispatch", () => {
      expect(src).toMatch(/checkR4ApprovalPrecedesDispatch/);
      expect(src).toMatch(/gateRuntimeDispatch/);
    });

    it("scopes chat-lane rules to chat-stream.ts AND chat.ts (parallel-flow lockstep)", () => {
      // R2 + R4 must check BOTH chat-stream.ts AND services/chat.ts —
      // dropping either side would re-open the cross-flow asymmetry
      // that cycle-6 C1-c6 closed.
      expect(src).toMatch(/server\/agent-studio\/chat-stream\.ts/);
      expect(src).toMatch(/server\/agent-studio\/services\/chat\.ts/);
    });

    it("strips comments before pattern-matching to avoid doc-block false positives", () => {
      // Without comment-stripping, a doc-comment mentioning
      // "conn.callTool" would falsely flag result-validator.ts.
      // The stripComments helper is a load-bearing detail.
      expect(src).toMatch(/function\s+stripComments/);
    });

    it("main() exits 1 on violations and 0 on clean", () => {
      expect(src).toMatch(/process\.exit\(1\)/);
      expect(src).toMatch(/process\.exit\(0\)/);
    });
  });

  describe("CI wiring", () => {
    const wf = readFileSync(WORKFLOW_PATH, "utf8");

    it("run-tests.yml has a Runtime boundaries step", () => {
      expect(wf).toMatch(
        /-\s*name:\s*Runtime boundaries[\s\S]*?npx tsx scripts\/check-runtime-boundaries\.ts/,
      );
    });

    it("the step runs after the existing D1/D2 boundary scripts", () => {
      // Operators reading the workflow expect "boundary lints"
      // grouped together. The Runtime boundaries step must come
      // after Provider env-key boundary (D1) which is the last
      // existing one.
      const idxRuntime = wf.indexOf("Runtime boundaries (Phase 4.5)");
      const idxD1 = wf.indexOf("Provider env-key boundary (D1)");
      expect(idxD1).toBeGreaterThan(0);
      expect(idxRuntime).toBeGreaterThan(idxD1);
    });
  });
});
