/**
 * Phase 22 §T-I.5 batch A.3 — Safety filter → failure-state bridge wiring.
 *
 * Source-scan structural test asserting the retrieval router emits one
 * `retrieval_safety_filter_blocked_content` event per retrieval call when
 * the safety filter pruned ≥1 block (NOT per-block — too noisy).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/retrieval/retrieval-router.ts",
);

describe("retrieval-router.ts is wired into the failure-state bridge", () => {
  const src = readFileSync(routerPath, "utf8");

  it("imports recordFailureStateEvent", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed retrieval_safety_filter_blocked_content kind", () => {
    expect(src).toContain(
      'failureState: "retrieval_safety_filter_blocked_content"',
    );
  });

  it("emits only when filtered.events.length > 0 (no-emission-on-empty)", () => {
    expect(src).toMatch(
      /filtered\.events\.length > 0[\s\S]{0,400}recordFailureStateEvent/,
    );
  });

  it("aggregates per-call (one event per retrieval, not per block)", () => {
    expect(src).toContain("reasonCounts");
    expect(src).toContain("blockedCount: filtered.events.length");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,800}\.catch/,
    );
  });

  it("metadata carries mode + workspaceId + totalCandidates for triage", () => {
    expect(src).toContain("mode: input.mode");
    expect(src).toContain("workspaceId: input.runtime.workspaceId");
    expect(src).toContain("totalCandidates: rawBlocks.length");
  });
});
