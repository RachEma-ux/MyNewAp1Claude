/**
 * Phase 22 §T-I.40 — Graph-correction rejected → bridge.
 *
 * Source-scan structural test asserting `decide()` emits
 * `graph_correction_rejected` when the decision is `"rejected"` and
 * NOT for approve / revision_requested / withdrawn paths.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const lifecyclePath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-correction/lifecycle.ts",
);

describe("graph-correction lifecycle is wired into the bridge", () => {
  const src = readFileSync(lifecyclePath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed graph_correction_rejected kind", () => {
    expect(src).toContain('failureState: "graph_correction_rejected"');
  });

  it("emits only when decision === 'rejected'", () => {
    expect(src).toMatch(
      /input\.decision\s*===\s*"rejected"[\s\S]{0,400}recordFailureStateEvent/,
    );
  });

  it("does NOT emit on approve / revision_requested / withdrawn paths", () => {
    // approveCorrectionProposal / requestRevisionForProposal /
    // withdrawCorrectionProposal funnel through `decide` / a sibling
    // helper. Make sure no recordFailureStateEvent call appears inside
    // the approve / revision branch by structural search: there should
    // be EXACTLY ONE call to recordFailureStateEvent in this file.
    const calls = src.match(/recordFailureStateEvent\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("metadata carries proposal identity, proposer kind, decider, rationale flag, priorStatus", () => {
    expect(src).toContain("proposalId: input.proposalId");
    expect(src).toContain("proposalKind: current.proposalKind");
    expect(src).toContain("targetTypeKey: current.targetTypeKey");
    expect(src).toContain("targetId: current.targetId");
    expect(src).toContain("decidedByUserId: input.decidedByUserId");
    expect(src).toContain("hasRationale: input.rationale");
    expect(src).toContain("priorStatus: current.status");
  });

  it("sourceKind names the lifecycle reject path", () => {
    expect(src).toContain('sourceKind: "graph-correction.lifecycle.reject"');
  });

  it("sourceId stringifies the proposal id", () => {
    expect(src).toContain("sourceId: String(input.proposalId)");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    // Match the void recordFailureStateEvent(...) ... .catch(() => {})
    // envelope. Allow any content between (the metadata block runs
    // long).
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,1200}\.catch/,
    );
  });
});
