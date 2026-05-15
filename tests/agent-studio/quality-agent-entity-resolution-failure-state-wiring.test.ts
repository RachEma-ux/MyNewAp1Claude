/**
 * Phase 22 §T-I.5 batch B.3 — Quality agent duplicate_entity → bridge.
 *
 * Source-scan structural test asserting the quality agent emits
 * `entity_resolution_conflict` when `duplicate_entity` scans produce
 * ≥1 finding.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const agentRunPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-quality/agent-run.ts",
);

describe("graph-quality agent-run is wired into the bridge", () => {
  const src = readFileSync(agentRunPath, "utf8");

  it("imports recordFailureStateEvent", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed entity_resolution_conflict kind", () => {
    expect(src).toContain('failureState: "entity_resolution_conflict"');
  });

  it("emits only when scanKind === 'duplicate_entity' AND findingsCount > 0", () => {
    expect(src).toMatch(
      /scanKind\s*===\s*"duplicate_entity"[\s\S]{0,200}result\.findingsCount\s*>\s*0/,
    );
  });

  it("metadata carries scanKind + scanId + findingsCount + agentRunId", () => {
    expect(src).toContain("scanKind,");
    expect(src).toContain("scanId: result.scanId");
    expect(src).toContain("findingsCount: result.findingsCount");
    expect(src).toContain("agentRunId,");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,800}\.catch/,
    );
  });
});
