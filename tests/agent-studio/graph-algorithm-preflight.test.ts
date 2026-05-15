/**
 * Graph Algorithm pre-flight + maxIterations normalizer — Phase 26 §T-G.9.
 *
 * Pure-function tests; no DB / no GDS / no Aura.
 */

import { describe, it, expect } from "vitest";
import {
  preflightAlgorithmRequest,
  normalizeAlgorithmMaxIterations,
  GraphAlgorithmMaxIterationsOutOfRangeError,
  GRAPH_ALGORITHM_METADATA,
  type GraphAlgorithmRequest,
} from "../../server/agent-studio/services/graph-algorithm/public-api";

function req(
  overrides: Partial<GraphAlgorithmRequest> &
    Pick<GraphAlgorithmRequest, "kind">,
): GraphAlgorithmRequest {
  return {
    workspaceId: 7,
    scopeId: "lens:rag:1",
    ...overrides,
  };
}

describe("normalizeAlgorithmMaxIterations", () => {
  it("undefined → per-algorithm default", () => {
    expect(normalizeAlgorithmMaxIterations("centrality", undefined)).toBe(20);
    expect(normalizeAlgorithmMaxIterations("influence_analysis", undefined)).toBe(
      30,
    );
    expect(normalizeAlgorithmMaxIterations("shortest_path", undefined)).toBe(1);
  });

  it("input clamped to the per-algorithm default ceiling", () => {
    expect(normalizeAlgorithmMaxIterations("centrality", 100)).toBe(20);
    expect(normalizeAlgorithmMaxIterations("influence_analysis", 99)).toBe(30);
  });

  it("floors fractional inputs", () => {
    expect(normalizeAlgorithmMaxIterations("centrality", 5.9)).toBe(5);
  });

  it("throws on < 1", () => {
    expect(() => normalizeAlgorithmMaxIterations("centrality", 0)).toThrow(
      GraphAlgorithmMaxIterationsOutOfRangeError,
    );
    expect(() => normalizeAlgorithmMaxIterations("centrality", -3)).toThrow(
      GraphAlgorithmMaxIterationsOutOfRangeError,
    );
  });

  it("throws on non-finite", () => {
    expect(() =>
      normalizeAlgorithmMaxIterations("centrality", Number.NaN),
    ).toThrow(GraphAlgorithmMaxIterationsOutOfRangeError);
    expect(() =>
      normalizeAlgorithmMaxIterations("centrality", Number.POSITIVE_INFINITY),
    ).toThrow(GraphAlgorithmMaxIterationsOutOfRangeError);
  });
});

describe("preflightAlgorithmRequest — CE-native decisions", () => {
  it("centrality → runnable_on_ce_native (no Aura)", () => {
    const out = preflightAlgorithmRequest(req({ kind: "centrality" }));
    expect(out.decision).toBe("runnable_on_ce_native");
    expect(out.auraUpgradeRequired).toBe(false);
  });

  it("shortest_path → runnable_on_ce_native", () => {
    const out = preflightAlgorithmRequest(req({ kind: "shortest_path" }));
    expect(out.decision).toBe("runnable_on_ce_native");
  });

  it("dependency_paths + blast_radius → runnable_on_ce_native", () => {
    expect(
      preflightAlgorithmRequest(req({ kind: "dependency_paths" })).decision,
    ).toBe("runnable_on_ce_native");
    expect(
      preflightAlgorithmRequest(req({ kind: "blast_radius" })).decision,
    ).toBe("runnable_on_ce_native");
  });
});

describe("preflightAlgorithmRequest — Aura-gated decisions", () => {
  it("community_detection → requires_aura_upgrade", () => {
    const out = preflightAlgorithmRequest(req({ kind: "community_detection" }));
    expect(out.decision).toBe("requires_aura_upgrade");
    expect(out.auraUpgradeRequired).toBe(true);
  });

  it("similarity + influence_analysis → requires_aura_upgrade", () => {
    expect(
      preflightAlgorithmRequest(req({ kind: "similarity" })).decision,
    ).toBe("requires_aura_upgrade");
    expect(
      preflightAlgorithmRequest(req({ kind: "influence_analysis" })).decision,
    ).toBe("requires_aura_upgrade");
  });
});

describe("preflightAlgorithmRequest — approximation path", () => {
  it("entity_clustering → runnable_via_approximation (no Aura but warned)", () => {
    const out = preflightAlgorithmRequest(req({ kind: "entity_clustering" }));
    expect(out.decision).toBe("runnable_via_approximation");
    // entity_clustering still triggers an Aura upgrade per the
    // metadata table (`triggersAuraUpgrade: true`) because the
    // approximation is acceptable for MVP but full quality needs GDS.
    // The decision class is "runnable_via_approximation" (not aura
    // upgrade required) — these are independent signals.
    expect(out.auraUpgradeRequired).toBe(false);
  });
});

describe("preflightAlgorithmRequest — resolved bounds", () => {
  it("returns clamped maxNodes when input exceeds default", () => {
    const out = preflightAlgorithmRequest(
      req({ kind: "centrality", maxNodes: 999999 }),
    );
    expect(out.resolvedMaxNodes).toBe(
      GRAPH_ALGORITHM_METADATA["centrality"].defaultMaxNodes,
    );
  });

  it("returns clamped maxIterations when input exceeds default", () => {
    const out = preflightAlgorithmRequest(
      req({ kind: "influence_analysis", maxIterations: 99999 }),
    );
    expect(out.resolvedMaxIterations).toBe(
      GRAPH_ALGORITHM_METADATA["influence_analysis"].defaultMaxIterations,
    );
  });

  it("fills defaults when both bounds omitted", () => {
    const out = preflightAlgorithmRequest(req({ kind: "community_detection" }));
    expect(out.resolvedMaxNodes).toBe(
      GRAPH_ALGORITHM_METADATA["community_detection"].defaultMaxNodes,
    );
    expect(out.resolvedMaxIterations).toBe(
      GRAPH_ALGORITHM_METADATA["community_detection"].defaultMaxIterations,
    );
  });

  it("decision classes form a stable closed taxonomy across all 8 kinds", () => {
    const allowed = new Set<string>([
      "runnable_on_ce_native",
      "runnable_on_ce_via_apoc",
      "runnable_via_approximation",
      "requires_aura_upgrade",
    ]);
    for (const kind of Object.keys(
      GRAPH_ALGORITHM_METADATA,
    ) as Array<keyof typeof GRAPH_ALGORITHM_METADATA>) {
      const out = preflightAlgorithmRequest(req({ kind }));
      expect(allowed.has(out.decision)).toBe(true);
    }
  });
});

describe("preflightAlgorithmRequest — input validation", () => {
  it("throws on sub-1 maxNodes", () => {
    expect(() =>
      preflightAlgorithmRequest(req({ kind: "centrality", maxNodes: 0 })),
    ).toThrow();
  });

  it("throws on sub-1 maxIterations", () => {
    expect(() =>
      preflightAlgorithmRequest(
        req({ kind: "centrality", maxIterations: 0 }),
      ),
    ).toThrow(GraphAlgorithmMaxIterationsOutOfRangeError);
  });
});
