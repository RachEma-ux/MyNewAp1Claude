/**
 * Recommendation response assembler — Phase 25 §T-G.8.
 *
 * Pure-function tests; no DB / no model execution / no GraphRAG.
 */

import { describe, it, expect } from "vitest";
import {
  assembleRecommendationResponse,
  REDACTED_RECOMMENDATION_REASON,
  REDACTED_RECOMMENDATION_NODE_TYPE_KEY,
  REDACTED_RECOMMENDATION_NODE_ID,
  type RecommendationCandidate,
  type RecommendationRequest,
} from "../../server/agent-studio/services/recommendation/public-api";

const baseRequest: RecommendationRequest = {
  kind: "relevant_notes",
  anchor: { typeKey: "user", id: "u:1" },
  workspaceId: 7,
};

function visibleCandidate(
  partial: Partial<RecommendationCandidate> & { confidence: number; id: string },
): RecommendationCandidate {
  return {
    permissionStatus: "visible",
    reason: `reason for ${partial.id}`,
    graphPath: ["authored", "tagged"],
    sourceCitations: [{ typeKey: "note", id: `note:${partial.id}` }],
    confidence: partial.confidence,
    recommendedNode: { typeKey: "note", id: partial.id },
    ...partial,
  };
}

function redactedCandidate(id: string, confidence: number): RecommendationCandidate {
  return {
    permissionStatus: "redacted",
    reason: "leaks workspace name — should be stripped",
    graphPath: ["authored"],
    sourceCitations: [{ typeKey: "note", id }],
    confidence,
    recommendedNode: { typeKey: "note", id },
  };
}

function hiddenCandidate(id: string, confidence: number): RecommendationCandidate {
  return {
    permissionStatus: "hidden",
    reason: "should never appear",
    graphPath: [],
    sourceCitations: [],
    confidence,
    recommendedNode: { typeKey: "note", id },
  };
}

describe("assembleRecommendationResponse — basic shape", () => {
  it("copies kind + anchor from the request", () => {
    const out = assembleRecommendationResponse([], { request: baseRequest });
    expect(out.kind).toBe("relevant_notes");
    expect(out.anchor).toEqual({ typeKey: "user", id: "u:1" });
  });

  it("empty input → empty results + zero counts", () => {
    const out = assembleRecommendationResponse([], { request: baseRequest });
    expect(out.results).toEqual([]);
    expect(out.redactedCount).toBe(0);
    expect(out.fullyHiddenCount).toBe(0);
  });
});

describe("permission-aware partitioning", () => {
  it("drops hidden candidates entirely and counts them in fullyHiddenCount", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        hiddenCandidate("h1", 0.95),
        hiddenCandidate("h2", 0.85),
      ],
      { request: baseRequest },
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].recommendedNode.id).toBe("v1");
    expect(out.fullyHiddenCount).toBe(2);
    expect(out.redactedCount).toBe(0);
  });

  it("surfaces redacted candidates with stripped reason / path / citations", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        redactedCandidate("r1", 0.85),
      ],
      { request: baseRequest },
    );
    expect(out.redactedCount).toBe(1);
    const redacted = out.results.find((r) => r.permissionStatus === "redacted")!;
    expect(redacted.reason).toBe(REDACTED_RECOMMENDATION_REASON);
    expect(redacted.graphPath).toEqual([]);
    expect(redacted.sourceCitations).toEqual([]);
    expect(redacted.recommendedNode).toEqual({
      typeKey: REDACTED_RECOMMENDATION_NODE_TYPE_KEY,
      id: REDACTED_RECOMMENDATION_NODE_ID,
    });
    // Confidence is preserved on the redacted entry — it's the only
    // signal the operator UI has to decide whether to surface the
    // "hidden by permission" banner with urgency.
    expect(redacted.confidence).toBe(0.85);
  });

  it("preserves visible reason / path / citations as-is", () => {
    const candidate = visibleCandidate({ id: "v1", confidence: 0.9 });
    const out = assembleRecommendationResponse([candidate], {
      request: baseRequest,
    });
    expect(out.results[0]).toMatchObject({
      reason: candidate.reason,
      graphPath: candidate.graphPath,
      sourceCitations: candidate.sourceCitations,
      recommendedNode: candidate.recommendedNode,
    });
  });
});

describe("confidence floor filtering", () => {
  it("drops candidates strictly below minConfidence before classification", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        visibleCandidate({ id: "v2", confidence: 0.4 }), // below default 0.5
        redactedCandidate("r1", 0.3), // below threshold — should NOT contribute to redactedCount
        hiddenCandidate("h1", 0.2), // below threshold — should NOT contribute to fullyHiddenCount
      ],
      { request: baseRequest },
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].recommendedNode.id).toBe("v1");
    expect(out.redactedCount).toBe(0);
    expect(out.fullyHiddenCount).toBe(0);
  });

  it("explicit minConfidence override is honored", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        visibleCandidate({ id: "v2", confidence: 0.6 }),
      ],
      {
        request: { ...baseRequest, minConfidence: 0.7 },
      },
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].recommendedNode.id).toBe("v1");
  });

  it("equality at the floor passes (>=, not >)", () => {
    const out = assembleRecommendationResponse(
      [visibleCandidate({ id: "v1", confidence: 0.5 })],
      { request: baseRequest },
    );
    expect(out.results).toHaveLength(1);
  });
});

describe("sort + truncate semantics", () => {
  it("sorts by confidence desc and assigns 1-based rank", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v3", confidence: 0.7 }),
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        visibleCandidate({ id: "v2", confidence: 0.8 }),
      ],
      { request: baseRequest },
    );
    expect(out.results.map((r) => r.recommendedNode.id)).toEqual([
      "v1",
      "v2",
      "v3",
    ]);
    expect(out.results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("visible-before-redacted tie-breaker on equal confidence", () => {
    const out = assembleRecommendationResponse(
      [
        redactedCandidate("r1", 0.8),
        visibleCandidate({ id: "v1", confidence: 0.8 }),
      ],
      { request: baseRequest },
    );
    expect(out.results[0].permissionStatus).toBe("visible");
    expect(out.results[1].permissionStatus).toBe("redacted");
  });

  it("truncates to the request's limit; counts reflect ALL above-floor candidates", () => {
    const out = assembleRecommendationResponse(
      [
        visibleCandidate({ id: "v1", confidence: 0.9 }),
        visibleCandidate({ id: "v2", confidence: 0.8 }),
        redactedCandidate("r1", 0.7),
        redactedCandidate("r2", 0.65),
        hiddenCandidate("h1", 0.6),
      ],
      { request: { ...baseRequest, limit: 2 } },
    );
    expect(out.results).toHaveLength(2);
    // Counts are NOT post-truncation — they're partition totals over
    // all above-floor candidates, so the UI's "N hidden by permission"
    // banner is accurate regardless of limit.
    expect(out.redactedCount).toBe(2);
    expect(out.fullyHiddenCount).toBe(1);
  });

  it("limit defaults to DEFAULT_RECOMMENDATION_LIMIT (10) when undefined", () => {
    const candidates = Array.from({ length: 15 }, (_, i) =>
      visibleCandidate({ id: `v${i}`, confidence: 0.9 - i * 0.01 }),
    );
    const out = assembleRecommendationResponse(candidates, {
      request: baseRequest,
    });
    expect(out.results).toHaveLength(10);
  });
});

describe("kind passthrough", () => {
  it("kind is copied from request, not inferred from candidates", () => {
    const out = assembleRecommendationResponse(
      [visibleCandidate({ id: "v1", confidence: 0.9 })],
      { request: { ...baseRequest, kind: "next_actions" } },
    );
    expect(out.kind).toBe("next_actions");
  });
});
