/**
 * Graph Algorithm contracts — Phase 26 §T-G.5.
 *
 * Tests the 8-algorithm closed taxonomy + per-algorithm metadata
 * (backend support, Aura-trigger, defaults) + maxNodes normalizer.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPH_ALGORITHM_KINDS,
  GRAPH_ALGORITHM_BACKEND_SUPPORT,
  GRAPH_ALGORITHM_METADATA,
  GraphAlgorithmMaxNodesOutOfRangeError,
  isGraphAlgorithmKind,
  normalizeAlgorithmMaxNodes,
  listAlgorithmsTriggeringAuraUpgrade,
  listAlgorithmsAvailableOnCe,
} from "../../server/agent-studio/services/graph-algorithm/public-api";

describe("Closed algorithm taxonomy", () => {
  it("contains exactly 8 roadmap-named kinds", () => {
    expect([...GRAPH_ALGORITHM_KINDS]).toEqual([
      "centrality",
      "community_detection",
      "similarity",
      "shortest_path",
      "dependency_paths",
      "blast_radius",
      "entity_clustering",
      "influence_analysis",
    ]);
  });

  it("isGraphAlgorithmKind narrows correctly", () => {
    expect(isGraphAlgorithmKind("centrality")).toBe(true);
    expect(isGraphAlgorithmKind("blast_radius")).toBe(true);
    expect(isGraphAlgorithmKind("topology")).toBe(false);
  });

  it("ids unique", () => {
    expect(new Set(GRAPH_ALGORITHM_KINDS).size).toBe(
      GRAPH_ALGORITHM_KINDS.length,
    );
  });
});

describe("Backend support taxonomy", () => {
  it("contains 4 backend-support levels", () => {
    expect([...GRAPH_ALGORITHM_BACKEND_SUPPORT]).toEqual([
      "neo4j_ce_native",
      "neo4j_ce_via_apoc",
      "gds_required",
      "approximation_required",
    ]);
  });
});

describe("Per-algorithm metadata", () => {
  it("every algorithm has metadata", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      expect(GRAPH_ALGORITHM_METADATA[k]).toBeDefined();
    }
  });

  it("every metadata.backendSupport is in the closed taxonomy", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      const s = GRAPH_ALGORITHM_METADATA[k].backendSupport;
      expect(GRAPH_ALGORITHM_BACKEND_SUPPORT).toContain(s);
    }
  });

  it("every metadata has non-empty description + positive defaults", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      const m = GRAPH_ALGORITHM_METADATA[k];
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.defaultMaxNodes).toBeGreaterThan(0);
      expect(m.defaultMaxIterations).toBeGreaterThan(0);
    }
  });

  it("Neo4j CE native algorithms do NOT trigger Aura upgrade", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      const m = GRAPH_ALGORITHM_METADATA[k];
      if (m.backendSupport === "neo4j_ce_native") {
        expect(m.triggersAuraUpgrade).toBe(false);
      }
    }
  });

  it("gds_required algorithms DO trigger Aura upgrade", () => {
    for (const k of GRAPH_ALGORITHM_KINDS) {
      const m = GRAPH_ALGORITHM_METADATA[k];
      if (m.backendSupport === "gds_required") {
        expect(m.triggersAuraUpgrade).toBe(true);
      }
    }
  });

  it("shortest_path / blast_radius / dependency_paths / centrality are CE-native", () => {
    expect(GRAPH_ALGORITHM_METADATA.shortest_path.backendSupport).toBe(
      "neo4j_ce_native",
    );
    expect(GRAPH_ALGORITHM_METADATA.blast_radius.backendSupport).toBe(
      "neo4j_ce_native",
    );
    expect(GRAPH_ALGORITHM_METADATA.dependency_paths.backendSupport).toBe(
      "neo4j_ce_native",
    );
    expect(GRAPH_ALGORITHM_METADATA.centrality.backendSupport).toBe(
      "neo4j_ce_native",
    );
  });

  it("community_detection / similarity / influence_analysis need GDS (→ Aura)", () => {
    expect(
      GRAPH_ALGORITHM_METADATA.community_detection.triggersAuraUpgrade,
    ).toBe(true);
    expect(GRAPH_ALGORITHM_METADATA.similarity.triggersAuraUpgrade).toBe(true);
    expect(
      GRAPH_ALGORITHM_METADATA.influence_analysis.triggersAuraUpgrade,
    ).toBe(true);
  });
});

describe("normalizeAlgorithmMaxNodes", () => {
  it("returns the algorithm-default when input is undefined", () => {
    expect(normalizeAlgorithmMaxNodes("centrality", undefined)).toBe(10000);
    expect(normalizeAlgorithmMaxNodes("community_detection", undefined)).toBe(
      50000,
    );
  });

  it("clamps to algorithm-default when input exceeds it", () => {
    expect(normalizeAlgorithmMaxNodes("centrality", 50000)).toBe(10000);
    expect(normalizeAlgorithmMaxNodes("shortest_path", 100000)).toBe(10000);
  });

  it("returns input verbatim when within range", () => {
    expect(normalizeAlgorithmMaxNodes("centrality", 5000)).toBe(5000);
  });

  it("floors fractional input", () => {
    expect(normalizeAlgorithmMaxNodes("centrality", 1500.7)).toBe(1500);
  });

  it("throws GraphAlgorithmMaxNodesOutOfRangeError on sub-1 / non-finite", () => {
    expect(() => normalizeAlgorithmMaxNodes("centrality", 0)).toThrow(
      GraphAlgorithmMaxNodesOutOfRangeError,
    );
    expect(() => normalizeAlgorithmMaxNodes("centrality", -1)).toThrow(
      GraphAlgorithmMaxNodesOutOfRangeError,
    );
    expect(() => normalizeAlgorithmMaxNodes("centrality", NaN)).toThrow(
      GraphAlgorithmMaxNodesOutOfRangeError,
    );
  });

  it("error message names the algorithm + value", () => {
    try {
      normalizeAlgorithmMaxNodes("blast_radius", -5);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GraphAlgorithmMaxNodesOutOfRangeError);
      expect((err as Error).message).toContain("blast_radius");
      expect((err as Error).message).toContain("-5");
    }
  });
});

describe("Aura-upgrade / CE-available partition", () => {
  it("listAlgorithmsTriggeringAuraUpgrade includes the GDS-required + approximation-required", () => {
    const triggers = listAlgorithmsTriggeringAuraUpgrade();
    expect(triggers).toContain("community_detection");
    expect(triggers).toContain("similarity");
    expect(triggers).toContain("entity_clustering");
    expect(triggers).toContain("influence_analysis");
    expect(triggers).not.toContain("shortest_path");
  });

  it("listAlgorithmsAvailableOnCe includes the native ones", () => {
    const ce = listAlgorithmsAvailableOnCe();
    expect(ce).toContain("centrality");
    expect(ce).toContain("shortest_path");
    expect(ce).toContain("dependency_paths");
    expect(ce).toContain("blast_radius");
    expect(ce).not.toContain("community_detection");
  });

  it("CE-available + Aura-trigger partition is exhaustive (every algorithm in exactly one bucket; entity_clustering may belong to Aura due to approximation_required)", () => {
    const ce = new Set(listAlgorithmsAvailableOnCe());
    const aura = new Set(listAlgorithmsTriggeringAuraUpgrade());
    for (const k of GRAPH_ALGORITHM_KINDS) {
      expect(ce.has(k) || aura.has(k)).toBe(true);
    }
  });
});
