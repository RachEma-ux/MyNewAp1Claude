/**
 * Item 58 — Advanced GraphRAG strategy selector contract test.
 *
 * Pins the precedence ladder + each per-mode selection path + the
 * fallback / malformed-input behavior.
 */

import { describe, it, expect } from "vitest";
import {
  pickGraphRagStrategy,
  PATH_KEYWORDS,
  NEIGHBORHOOD_KEYWORDS,
  GLOBAL_KEYWORDS,
  ALGORITHM_KEYWORDS,
} from "../../server/agent-studio/services/graph/retrieval/strategy-selector";

describe("Item 58 — pickGraphRagStrategy precedence ladder", () => {
  it("algorithm wins when both keyword + algorithmKey are present", () => {
    const out = pickGraphRagStrategy({
      query: "what nodes have the highest centrality?",
      algorithmKey: "betweenness",
    });
    expect(out.mode).toBe("graphrag_algorithm");
    expect(out.signals.algorithmSignal).toBe(true);
    expect(out.signals.hasAlgorithmKey).toBe(true);
    expect(out.reason).toContain("betweenness");
  });

  it("algorithm DOES NOT win when keyword present but algorithmKey absent", () => {
    const out = pickGraphRagStrategy({
      query: "what nodes have the highest centrality?",
      seedNodeId: "n1",
    });
    expect(out.mode).not.toBe("graphrag_algorithm");
  });

  it("shortest_path wins when path keyword + seed + target all present", () => {
    const out = pickGraphRagStrategy({
      query: "Trace from n1 to n9",
      seedNodeId: "n1",
      toNodeId: "n9",
    });
    expect(out.mode).toBe("graphrag_shortest_path");
    expect(out.signals.pathSignal).toBe(true);
  });

  it("shortest_path DOES NOT win without a target", () => {
    const out = pickGraphRagStrategy({
      query: "Trace from n1",
      seedNodeId: "n1",
    });
    expect(out.mode).not.toBe("graphrag_shortest_path");
  });

  it("neighborhood wins when keyword + seed are present", () => {
    const out = pickGraphRagStrategy({
      query: "What's connected to n1?",
      seedNodeId: "n1",
    });
    expect(out.mode).toBe("graphrag_neighborhood");
  });

  it("neighborhood wins when maxDepth>=2 + seed (without an explicit keyword)", () => {
    const out = pickGraphRagStrategy({
      query: "Tell me about n1",
      seedNodeId: "n1",
      maxDepth: 3,
    });
    expect(out.mode).toBe("graphrag_neighborhood");
    expect(out.reason).toContain("maxDepth>=2");
  });

  it("local wins as default for single-entity questions with a seed", () => {
    const out = pickGraphRagStrategy({
      query: "What is n1?",
      seedNodeId: "n1",
    });
    expect(out.mode).toBe("graphrag_local");
  });

  it("global wins when no seed is supplied", () => {
    const out = pickGraphRagStrategy({
      query: "What is n1?",
    });
    expect(out.mode).toBe("graphrag_global");
  });

  it("global wins when seed AND global signal both present", () => {
    const out = pickGraphRagStrategy({
      query: "Show me everything in the graph",
      seedNodeId: "n1",
    });
    expect(out.mode).toBe("graphrag_global");
  });

  it("neighborhood keyword without seed falls through to global (no malformed-input trap)", () => {
    const out = pickGraphRagStrategy({
      query: "What's connected to n1?",
    });
    expect(out.mode).toBe("graphrag_global");
  });
});

describe("Item 58 — keyword set integrity", () => {
  it("each keyword set is non-empty", () => {
    expect(PATH_KEYWORDS.length).toBeGreaterThan(0);
    expect(NEIGHBORHOOD_KEYWORDS.length).toBeGreaterThan(0);
    expect(GLOBAL_KEYWORDS.length).toBeGreaterThan(0);
    expect(ALGORITHM_KEYWORDS.length).toBeGreaterThan(0);
  });

  it("each keyword set has distinct values (no accidental dupes)", () => {
    for (const set of [
      PATH_KEYWORDS,
      NEIGHBORHOOD_KEYWORDS,
      GLOBAL_KEYWORDS,
      ALGORITHM_KEYWORDS,
    ]) {
      expect(new Set(set as readonly string[]).size).toBe(set.length);
    }
  });

  it("keyword sets are case-insensitive at the matcher level", () => {
    const upper = pickGraphRagStrategy({
      query: "SHOW ME EVERYTHING IN THE GRAPH",
    });
    expect(upper.mode).toBe("graphrag_global");
    const mixed = pickGraphRagStrategy({
      query: "What's CONNECTED to n1?",
      seedNodeId: "n1",
    });
    expect(mixed.mode).toBe("graphrag_neighborhood");
  });
});

describe("Item 58 — output shape contract", () => {
  it("every output has mode + reason + 7-field signals object", () => {
    const out = pickGraphRagStrategy({ query: "What is n1?", seedNodeId: "n1" });
    expect(out).toHaveProperty("mode");
    expect(out).toHaveProperty("reason");
    expect(out).toHaveProperty("signals");
    expect(Object.keys(out.signals).sort()).toEqual(
      [
        "algorithmSignal",
        "globalSignal",
        "hasAlgorithmKey",
        "hasSeed",
        "hasTarget",
        "neighborhoodSignal",
        "pathSignal",
      ].sort(),
    );
  });

  it("reason is operator-readable (>10 chars)", () => {
    const out = pickGraphRagStrategy({ query: "show me everything" });
    expect(out.reason.length).toBeGreaterThan(10);
  });
});
