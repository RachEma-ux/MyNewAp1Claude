/**
 * Phase 5c (Roadmap V3) — simulation lane governance.
 *
 * Closes H1 surfaced by the Phase 1a/1c audit: `simulation.ts:439`
 * pre-Phase-5c called `dispatchMcpToolCall` directly, skipping the
 * ProposedToolCall validator and the approval gate. After Phase 5c,
 * simulation mirrors the chat lanes' validate → gate → dispatch
 * chain, writes parallel `agsToolCallTraces` rows, and forwards
 * `runtimeContext` so Phase 5b's published-fail-closed default
 * applies uniformly across lanes (per pre-flight #6).
 *
 * Source-scan invariants (cycle-7/8 doc-block + lockstep pattern).
 * Pure-surface tests — no DB, no network. Phase 5c's behavioral
 * contract is also enforced by the Phase 4.5 boundary scanner
 * (R2 + R4 now treat `simulation.ts` as a peer of the chat lanes).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SIMULATION = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/simulation.ts"),
  "utf8",
);
const BOUNDARY_SCRIPT = readFileSync(
  join(REPO_ROOT, "scripts/check-runtime-boundaries.ts"),
  "utf8",
);

describe("Phase 5c — simulation lane governance", () => {
  describe("simulation imports the runtime-governance entry points", () => {
    it("imports validateRuntimeToolCall + gateRuntimeDispatch + persistRuntimeToolCallTrace", () => {
      // The three entry points are colocated in proposed-tool-call-
      // runtime so a single import block is sufficient. Locking the
      // exact import path catches a future module move that doesn't
      // update both lanes in lockstep.
      expect(SIMULATION).toMatch(
        /import\s*\{\s*\n?\s*validateRuntimeToolCall\s*,\s*\n?\s*gateRuntimeDispatch\s*,\s*\n?\s*persistRuntimeToolCallTrace\s*,?\s*\n?\s*\}\s*from\s*["']\.\/runtime\/proposed-tool-call-runtime["']/,
      );
    });

    it("imports buildRuntimeContext from runtime-context", () => {
      expect(SIMULATION).toMatch(
        /import\s*\{\s*buildRuntimeContext\s*\}\s*from\s*["']\.\/runtime\/runtime-context["']/,
      );
    });

    it("imports getSnapshot from mcp/registry for liveTool resolution", () => {
      expect(SIMULATION).toMatch(
        /import\s*\{\s*getSnapshot\s*\}\s*from\s*["']\.\/mcp\/registry["']/,
      );
    });
  });

  describe("simulation builds runtimeContext from agent.lifecycleState", () => {
    it("loads the agent row via repo.getAgentById", () => {
      // The agent row carries both `workspaceId` (needed for trace
      // persistence) and `lifecycleState` (needed for runtimeContext)
      // — one query, two outputs.
      expect(SIMULATION).toMatch(
        /const\s+agent\s*=\s*await\s+repo\.getAgentById\(\s*input\.agentId\s*\)/,
      );
    });

    it("constructs runtimeContext via buildRuntimeContext", () => {
      // Parallel-flow lockstep with chat-stream.ts:1249 + chat.ts:1072.
      // Same construction shape so a future refactor that changes the
      // RuntimeContext interface forces all three lanes to update
      // together.
      expect(SIMULATION).toMatch(
        /buildRuntimeContext\(\s*\{\s*\n?\s*agentLifecycleState:/,
      );
    });
  });

  describe("simulation lane: validate → gate → dispatch", () => {
    it("declares a strict 3-component parser for mcp__server__tool keys", () => {
      // Mirrors registry.ts's `findToolByGlobalNameAsync` — keeps the
      // parser semantics identical across the lane and the registry
      // so a tool whose `name` contains `__` parses the same way in
      // both code paths.
      expect(SIMULATION).toMatch(
        /function\s+parseMcpDispatchKey[\s\S]{0,1000}rest\.startsWith[\s\S]{0,500}return\s+null|function\s+parseMcpDispatchKey[\s\S]{0,1000}startsWith\(["']mcp__["']\)/,
      );
    });

    it("calls validateRuntimeToolCall before dispatchMcpToolCall", () => {
      // Phase 4.5 R2 also enforces this statically; this test locks
      // the lane-source order at the test level too. If the dispatch
      // is moved up, both this test AND the boundary script fail —
      // belt-and-suspenders for a load-bearing invariant.
      const validateIdx = SIMULATION.indexOf("validateRuntimeToolCall(");
      const dispatchIdx = SIMULATION.indexOf("dispatchMcpToolCall(");
      expect(validateIdx).toBeGreaterThan(0);
      expect(dispatchIdx).toBeGreaterThan(0);
      expect(validateIdx).toBeLessThan(dispatchIdx);
    });

    it("calls gateRuntimeDispatch before dispatchMcpToolCall", () => {
      // Phase 4.5 R4 covers this statically; companion to the R2-
      // proximity test above.
      const gateIdx = SIMULATION.indexOf("gateRuntimeDispatch(");
      const dispatchIdx = SIMULATION.indexOf("dispatchMcpToolCall(");
      expect(gateIdx).toBeGreaterThan(0);
      expect(dispatchIdx).toBeGreaterThan(0);
      expect(gateIdx).toBeLessThan(dispatchIdx);
    });

    it("persistRuntimeToolCallTrace called on validator/gate rejection (skip-dispatch path)", () => {
      // When the validator or gate returns !ok, simulation must still
      // write the trace so the runs page surfaces the blocked attempt.
      // Without this, blocked simulations look identical to "tool not
      // found" — operators can't distinguish "would have been denied"
      // from "wasn't connected".
      expect(SIMULATION).toMatch(
        /if\s*\(\s*!runtimeVerdict\.ok\s*\)\s*\{[\s\S]{0,400}persistRuntimeToolCallTrace\(/,
      );
    });

    it("persistRuntimeToolCallTrace called after successful dispatch", () => {
      // Mirror of chat-stream.ts:899 — every successful dispatch in
      // the simulation lane writes a parallel trace row. Locks the
      // post-dispatch trace pattern alongside the rejection-path
      // trace.
      expect(SIMULATION).toMatch(
        /dispatchMcpToolCall\([\s\S]{0,800}\)\s*;[\s\S]{0,2400}persistRuntimeToolCallTrace\(\s*\{[\s\S]{0,800}dispatchResult:\s*\{/,
      );
    });
  });

  describe("simulation forwards runtimeContext + approvalRequestId to dispatch", () => {
    it("dispatchMcpToolCall carries runtimeContext (Phase 5b uniformity)", () => {
      // Pre-flight #6 of the roadmap: published-fail-closed is agent-
      // level, not lane-level. Simulation of a published agent must
      // fail-closed exactly like the chat lanes when zero rules exist.
      expect(SIMULATION).toMatch(
        /dispatchMcpToolCall\(\s*\{[\s\S]{0,1200}runtimeContext\s*,?\s*\}\)/,
      );
    });

    it("dispatchMcpToolCall carries approvalRequestId from the gate verdict", () => {
      // When the gate creates an `agsPendingPermissionRequests` row
      // and the dispatch goes through (operator pre-approved or
      // riskClass didn't require approval), the approval row id is
      // forwarded so the audit row links to it. Same shape as
      // chat-stream.ts:884.
      expect(SIMULATION).toMatch(
        /approvalRequestId:\s*\n?\s*runtimeVerdict\.approvalRequestId\s*\?\?\s*undefined/,
      );
    });
  });

  describe("dry-run semantics", () => {
    it("does NOT call awaitApprovalDecision (simulation surfaces, doesn't wait)", () => {
      // Dry-run means simulation reports "would have required
      // approval" via the trace + step verdict and continues. Awaiting
      // an operator decision would block the simulation indefinitely.
      // Lock the negative invariant so a future PR doesn't accidentally
      // import the resume helper into this lane.
      expect(SIMULATION).not.toMatch(/awaitApprovalDecision\s*\(/);
    });
  });

  describe("Phase 4.5 boundary scanner covers simulation.ts", () => {
    it("TOOL_DISPATCH_LANE_FILES includes simulation.ts", () => {
      // Locks the rename CHAT_LANE_FILES → TOOL_DISPATCH_LANE_FILES
      // and the addition of simulation.ts. R2 + R4 now enforce the
      // validator/gate-before-dispatch order in simulation too.
      expect(BOUNDARY_SCRIPT).toMatch(
        /TOOL_DISPATCH_LANE_FILES\s*=\s*\[[\s\S]{0,400}["']server\/agent-studio\/services\/simulation\.ts["']/,
      );
    });
  });
});
