/**
 * Phase 24 §T-F.14 — impact-analysis kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  IMPACT_ANALYSIS_KIND_METADATA,
  getImpactAnalysisKindMetadata,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

const KINDS = [
  "knowledge_impact",
  "runtime_impact",
  "code_impact",
  "security_impact",
  "governance_impact",
  "tool_impact",
  "workflow_impact",
] as const;

describe("IMPACT_ANALYSIS_KIND_METADATA (T-F.14)", () => {
  it("has metadata for every closed-taxonomy kind", () => {
    for (const k of KINDS) {
      expect(IMPACT_ANALYSIS_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals KINDS.length", () => {
    expect(Object.keys(IMPACT_ANALYSIS_KIND_METADATA).length).toBe(
      KINDS.length,
    );
  });

  it.each(KINDS)("%s has non-empty label + description", (kind) => {
    const m = IMPACT_ANALYSIS_KIND_METADATA[kind];
    expect(m.label.length).toBeGreaterThan(2);
    expect(m.description.length).toBeGreaterThan(20);
  });

  it.each(KINDS)(
    "getImpactAnalysisKindMetadata(%s) returns the table entry",
    (kind) => {
      expect(getImpactAnalysisKindMetadata(kind)).toBe(
        IMPACT_ANALYSIS_KIND_METADATA[kind],
      );
    },
  );

  it("every metadata key matches a KINDS entry (no orphans)", () => {
    const registered = new Set<string>(KINDS);
    for (const key of Object.keys(IMPACT_ANALYSIS_KIND_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
