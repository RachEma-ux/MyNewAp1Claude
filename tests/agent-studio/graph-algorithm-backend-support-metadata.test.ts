/**
 * Phase 26 §T-G.28 — graph-algorithm backend-support metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_ALGORITHM_BACKEND_SUPPORT,
  GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA,
  getGraphAlgorithmBackendSupportMetadata,
} from "../../server/agent-studio/services/graph-algorithm/public-api.js";

describe("GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA (T-G.28)", () => {
  it("has metadata for every closed-taxonomy support level", () => {
    for (const s of GRAPH_ALGORITHM_BACKEND_SUPPORT) {
      expect(GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals GRAPH_ALGORITHM_BACKEND_SUPPORT.length", () => {
    expect(
      Object.keys(GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA).length,
    ).toBe(GRAPH_ALGORITHM_BACKEND_SUPPORT.length);
  });

  it.each(GRAPH_ALGORITHM_BACKEND_SUPPORT)(
    "%s has non-empty label + description + boolean runsOnCe",
    (level) => {
      const m = GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA[level];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect(typeof m.runsOnCe).toBe("boolean");
    },
  );

  it.each(GRAPH_ALGORITHM_BACKEND_SUPPORT)(
    "getGraphAlgorithmBackendSupportMetadata(%s) returns table entry",
    (level) => {
      expect(getGraphAlgorithmBackendSupportMetadata(level)).toBe(
        GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA[level],
      );
    },
  );

  it("runsOnCe matches the implicit CE/Aura split", () => {
    expect(
      GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA.neo4j_ce_native.runsOnCe,
    ).toBe(true);
    expect(
      GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA.neo4j_ce_via_apoc.runsOnCe,
    ).toBe(true);
    expect(
      GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA.gds_required.runsOnCe,
    ).toBe(false);
    expect(
      GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA.approximation_required
        .runsOnCe,
    ).toBe(false);
  });

  it("every metadata key maps to a backend-support entry", () => {
    const registered = new Set<string>(GRAPH_ALGORITHM_BACKEND_SUPPORT);
    for (const key of Object.keys(GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA)) {
      expect(registered.has(key)).toBe(true);
    }
  });
});
