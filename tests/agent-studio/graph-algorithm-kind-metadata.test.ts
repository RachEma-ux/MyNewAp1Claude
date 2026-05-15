/**
 * Phase 25 §T-G.31 — graph-algorithm kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_ALGORITHM_KINDS,
  GRAPH_ALGORITHM_KIND_METADATA,
  GRAPH_ALGORITHM_CATEGORIES,
  getGraphAlgorithmKindMetadata,
} from "../../server/agent-studio/services/graph-algorithm/public-api.js";

describe("GRAPH_ALGORITHM_KIND_METADATA (T-G.31)", () => {
  it("has metadata for every closed-taxonomy algorithm kind", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      expect(GRAPH_ALGORITHM_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals GRAPH_ALGORITHM_KINDS.length", () => {
    expect(Object.keys(GRAPH_ALGORITHM_KIND_METADATA).length).toBe(
      GRAPH_ALGORITHM_KINDS.length,
    );
  });

  it.each(GRAPH_ALGORITHM_KINDS)(
    "%s has non-empty label + operatorIntent + closed-taxonomy category",
    (k) => {
      const m = GRAPH_ALGORITHM_KIND_METADATA[k];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.operatorIntent.length).toBeGreaterThan(30);
      expect(GRAPH_ALGORITHM_CATEGORIES).toContain(m.category);
    },
  );

  it.each(GRAPH_ALGORITHM_KINDS)(
    "getGraphAlgorithmKindMetadata(%s) returns table entry",
    (k) => {
      expect(getGraphAlgorithmKindMetadata(k)).toBe(
        GRAPH_ALGORITHM_KIND_METADATA[k],
      );
    },
  );

  it("every category has at least one algorithm assigned", () => {
    const used = new Set<string>();
    for (const k of GRAPH_ALGORITHM_KINDS) {
      used.add(GRAPH_ALGORITHM_KIND_METADATA[k].category);
    }
    for (const c of GRAPH_ALGORITHM_CATEGORIES) {
      expect(used.has(c)).toBe(true);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of GRAPH_ALGORITHM_KINDS) {
      labels.add(GRAPH_ALGORITHM_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(GRAPH_ALGORITHM_KINDS.length);
  });
});
