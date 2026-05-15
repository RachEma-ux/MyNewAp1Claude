/**
 * Phase 22 §T-I.5 batch B.1 — Graph-agent answer-incomplete → bridge.
 *
 * Source-scan structural test asserting the graph-agent engine emits
 * `graph_agent_answer_incomplete` ONLY for the two budget-exhaustion
 * termination reasons (`max_iterations` / `wall_clock_budget`).
 * Clean convergence (`planner_stop` / `planner_answer`) and contract
 * violations (`invalid_action`) do NOT emit.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const enginePath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-agent/engine.ts",
);

describe("graph-agent engine is wired into the failure-state bridge", () => {
  const src = readFileSync(enginePath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed graph_agent_answer_incomplete kind", () => {
    expect(src).toContain('failureState: "graph_agent_answer_incomplete"');
  });

  it("emits ONLY for the two budget-exhaustion termination reasons", () => {
    // The gate is: terminationReason === max_iterations || wall_clock_budget
    expect(src).toMatch(
      /terminationReason\s*===\s*"max_iterations"[\s\S]{0,200}terminationReason\s*===\s*"wall_clock_budget"/,
    );
  });

  it("clean convergence reasons (planner_stop / planner_answer) are NOT in the emit gate", () => {
    // Find the failureState declaration, then check the surrounding
    // ~600 chars: planner_stop / planner_answer must not appear as
    // part of the emit condition. (They may appear elsewhere in the
    // file — only the gate's textual neighborhood matters here.)
    const idx = src.indexOf('failureState: "graph_agent_answer_incomplete"');
    expect(idx).toBeGreaterThan(-1);
    const gateNeighborhood = src.slice(Math.max(0, idx - 600), idx);
    expect(gateNeighborhood).not.toContain('"planner_stop"');
    expect(gateNeighborhood).not.toContain('"planner_answer"');
  });

  it("metadata carries terminationReason + plannerCallCount + retrievalModes + workspaceId", () => {
    expect(src).toContain("terminationReason: loopResult.terminationReason");
    expect(src).toContain("plannerCallCount: loopResult.plannerCallCount");
    expect(src).toContain("retrievalModes,");
    expect(src).toContain("workspaceId: runtime.workspaceId");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,800}\.catch/,
    );
  });
});
