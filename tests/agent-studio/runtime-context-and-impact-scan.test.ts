/**
 * Phase 5a (Roadmap V3) — runtime context plumbing + impact-scan
 * script invariants.
 *
 * Locks the prerequisites for Phase 5b's fail-closed enforcement:
 *
 *  1. `RuntimeContext` interface exists with `agentLifecycleState`
 *  2. `buildRuntimeContext` + `isPublishedRuntime` helpers exist
 *  3. `getAgentLifecycleState` repo helper exists
 *  4. Both chat lanes (chat-stream.ts + chat.ts) call the helper +
 *     build a RuntimeContext (parallel-flow lockstep)
 *  5. Operator-facing impact-scan script exists and queries for
 *     published agents with no enabled permission rules
 *
 * Source-scan invariants (cycle-7/8 doc-block + lockstep pattern).
 * The actual DB behavior of the impact-scan script is operator-
 * verifiable; CI doesn't have ASDB.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const RUNTIME_CTX = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/runtime/runtime-context.ts"),
  "utf8",
);
const REPOSITORY = readFileSync(
  join(REPO_ROOT, "server/agent-studio/repository.ts"),
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
const SCAN_SCRIPT_PATH = join(
  REPO_ROOT,
  "scripts/scan-published-agents-no-rules.ts",
);

describe("Phase 5a — runtime context + impact-scan", () => {
  describe("RuntimeContext shape", () => {
    it("declares the RuntimeContext interface with agentLifecycleState", () => {
      expect(RUNTIME_CTX).toMatch(
        /export\s+interface\s+RuntimeContext\s*\{[\s\S]*?agentLifecycleState/,
      );
    });

    it("declares AgentLifecycleState union including 'published' literal", () => {
      expect(RUNTIME_CTX).toMatch(
        /export\s+type\s+AgentLifecycleState[\s\S]*?["']published["']/,
      );
    });

    it("exports buildRuntimeContext (pure function)", () => {
      expect(RUNTIME_CTX).toMatch(/export\s+function\s+buildRuntimeContext/);
    });

    it("exports isPublishedRuntime with strict equality on 'published'", () => {
      // Phase 5b uses strict equality so unknown lifecycle values
      // short-circuit to the dev-friendly behavior. Loose-equality
      // (truthy / not-null) would silently treat staging or archived
      // agents as published — wrong.
      expect(RUNTIME_CTX).toMatch(
        /export\s+function\s+isPublishedRuntime[\s\S]*?===\s*["']published["']/,
      );
    });
  });

  describe("repository helper", () => {
    it("exports getAgentLifecycleState as a single-column lookup", () => {
      expect(REPOSITORY).toMatch(
        /export\s+async\s+function\s+getAgentLifecycleState\(\s*agentId:\s*number\s*,?\s*\)/,
      );
      // Must SELECT only the lifecycleState column (cheap on hot path).
      expect(REPOSITORY).toMatch(
        /\.select\(\{\s*lifecycleState:\s*agsAgents\.lifecycleState\s*\}\)/,
      );
    });
  });

  describe("chat-stream lane plumbing", () => {
    it("imports buildRuntimeContext + isPublishedRuntime", () => {
      expect(CHAT_STREAM).toMatch(
        /import\s*\{\s*buildRuntimeContext[\s\S]*?isPublishedRuntime[\s\S]*?\}\s*from\s*["']\.\/services\/runtime\/runtime-context["']/,
      );
    });

    it("calls getAgentLifecycleState after the draft lookup", () => {
      // Order matters: draft lookup must come first (early-return on
      // missing draft); then the lifecycle lookup.
      const draftIdx = CHAT_STREAM.indexOf("getCurrentDraft(session.agentId)");
      const lifeIdx = CHAT_STREAM.indexOf(
        "getAgentLifecycleState(session.agentId)",
      );
      expect(draftIdx).toBeGreaterThan(0);
      expect(lifeIdx).toBeGreaterThan(0);
      expect(lifeIdx).toBeGreaterThan(draftIdx);
    });

    it("constructs a runtimeContext via buildRuntimeContext", () => {
      expect(CHAT_STREAM).toMatch(
        /buildRuntimeContext\(\s*\{\s*agentLifecycleState:\s*lifecycleState/,
      );
    });
  });

  describe("chat.ts (blocking) parallel-flow lockstep", () => {
    it("imports buildRuntimeContext + isPublishedRuntime", () => {
      expect(CHAT_TS).toMatch(
        /import\s*\{\s*buildRuntimeContext[\s\S]*?isPublishedRuntime[\s\S]*?\}\s*from\s*["']\.\/runtime\/runtime-context["']/,
      );
    });

    it("calls getAgentLifecycleState after the draft lookup", () => {
      // Same parallel-flow lockstep as chat-stream.ts. Catches a
      // future PR that updates one lane without the other.
      const draftIdx = CHAT_TS.indexOf("getCurrentDraft(session.agentId)");
      const lifeIdx = CHAT_TS.indexOf(
        "getAgentLifecycleState(session.agentId)",
      );
      expect(draftIdx).toBeGreaterThan(0);
      expect(lifeIdx).toBeGreaterThan(0);
      expect(lifeIdx).toBeGreaterThan(draftIdx);
    });

    it("constructs a runtimeContext via buildRuntimeContext", () => {
      expect(CHAT_TS).toMatch(
        /buildRuntimeContext\(\s*\{\s*agentLifecycleState:\s*lifecycleState/,
      );
    });
  });

  describe("operator impact-scan script", () => {
    it("scripts/scan-published-agents-no-rules.ts exists", () => {
      expect(existsSync(SCAN_SCRIPT_PATH)).toBe(true);
    });

    it("filters on lifecycle_state = 'published' AND zero enabled rules", () => {
      const src = readFileSync(SCAN_SCRIPT_PATH, "utf8");
      // The query must filter on BOTH conditions — published agents
      // with zero enabled rules. Loose filtering would either include
      // safe rows (with rules) or miss target rows (other lifecycle
      // states).
      expect(src).toMatch(/lifecycle_state\s*=\s*'published'/);
      expect(src).toMatch(
        /NOT\s+EXISTS[\s\S]*?ags_draft_permission_rules[\s\S]*?enabled/i,
      );
    });

    it("returns exit code 2 when remediation is needed (informational, not failure)", () => {
      const src = readFileSync(SCAN_SCRIPT_PATH, "utf8");
      // 0 = clean, 1 = connection error, 2 = informational findings.
      // Distinct from 1 so operators can `|| true` for non-blocking
      // CI runs while still surfacing connection failures.
      expect(src).toMatch(/process\.exit\(2\)/);
      expect(src).toMatch(/process\.exit\(0\)/);
      expect(src).toMatch(/process\.exit\(1\)/);
    });
  });
});
