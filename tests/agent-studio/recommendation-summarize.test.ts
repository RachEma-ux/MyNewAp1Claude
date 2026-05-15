/**
 * Phase 25 §T-G.13 — summarizeRecommendationResponse lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeRecommendationResponse,
  type RecommendationResponse,
  type RecommendationResult,
} from "../../server/agent-studio/services/recommendation/public-api.js";

function buildResult(
  overrides: Partial<RecommendationResult> = {},
): RecommendationResult {
  return {
    rank: 1,
    permissionStatus: "visible",
    reason: "test",
    graphPath: [],
    sourceCitations: [],
    confidence: 0.8,
    recommendedNode: { typeKey: "note", id: "n1" },
    ...overrides,
  };
}

function buildResponse(
  results: RecommendationResult[],
  overrides: Partial<RecommendationResponse> = {},
): RecommendationResponse {
  return {
    kind: "relevant_notes",
    anchor: { typeKey: "note", id: "anchor" },
    results,
    redactedCount: results.filter((r) => r.permissionStatus === "redacted").length,
    fullyHiddenCount: 0,
    ...overrides,
  };
}

describe("summarizeRecommendationResponse (T-G.13)", () => {
  it("returns zero counts + null stats for empty results", () => {
    const s = summarizeRecommendationResponse(buildResponse([]));
    expect(s.total).toBe(0);
    expect(s.visible).toBe(0);
    expect(s.redacted).toBe(0);
    expect(s.fullyHidden).toBe(0);
    expect(s.meanConfidenceVisible).toBeNull();
    expect(s.minConfidenceVisible).toBeNull();
    expect(s.maxConfidenceVisible).toBeNull();
  });

  it("computes mean / min / max across visible only", () => {
    const s = summarizeRecommendationResponse(
      buildResponse([
        buildResult({ rank: 1, confidence: 0.9 }),
        buildResult({ rank: 2, confidence: 0.6 }),
        buildResult({ rank: 3, confidence: 0.7 }),
      ]),
    );
    expect(s.total).toBe(3);
    expect(s.visible).toBe(3);
    expect(s.redacted).toBe(0);
    expect(s.meanConfidenceVisible).toBeCloseTo((0.9 + 0.6 + 0.7) / 3, 6);
    expect(s.minConfidenceVisible).toBeCloseTo(0.6, 6);
    expect(s.maxConfidenceVisible).toBeCloseTo(0.9, 6);
  });

  it("excludes redacted from confidence stats but counts them", () => {
    const s = summarizeRecommendationResponse(
      buildResponse([
        buildResult({ rank: 1, confidence: 0.9 }),
        buildResult({
          rank: 2,
          permissionStatus: "redacted",
          confidence: 0.99,
        }),
        buildResult({ rank: 3, confidence: 0.7 }),
      ]),
    );
    expect(s.total).toBe(3);
    expect(s.visible).toBe(2);
    expect(s.redacted).toBe(1);
    expect(s.meanConfidenceVisible).toBeCloseTo((0.9 + 0.7) / 2, 6);
    expect(s.minConfidenceVisible).toBeCloseTo(0.7, 6);
    expect(s.maxConfidenceVisible).toBeCloseTo(0.9, 6);
  });

  it("returns null confidence stats when zero visible (all redacted)", () => {
    const s = summarizeRecommendationResponse(
      buildResponse([
        buildResult({ permissionStatus: "redacted", confidence: 0.99 }),
        buildResult({ permissionStatus: "redacted", confidence: 0.5 }),
      ]),
    );
    expect(s.total).toBe(2);
    expect(s.visible).toBe(0);
    expect(s.redacted).toBe(2);
    expect(s.meanConfidenceVisible).toBeNull();
    expect(s.minConfidenceVisible).toBeNull();
    expect(s.maxConfidenceVisible).toBeNull();
  });

  it("mirrors fullyHidden from the response", () => {
    const s = summarizeRecommendationResponse(
      buildResponse([buildResult()], { fullyHiddenCount: 7 }),
    );
    expect(s.fullyHidden).toBe(7);
  });

  it("total equals visible + redacted (excluding fullyHidden which isn't in results)", () => {
    const s = summarizeRecommendationResponse(
      buildResponse([
        buildResult({ rank: 1 }),
        buildResult({ rank: 2, permissionStatus: "redacted" }),
        buildResult({ rank: 3 }),
      ]),
    );
    expect(s.total).toBe(3);
    expect(s.visible + s.redacted).toBe(s.total);
  });

  it("does not mutate the input response", () => {
    const results = [buildResult({ rank: 1 })];
    const response = buildResponse(results);
    const beforeResults = [...response.results];
    summarizeRecommendationResponse(response);
    expect(response.results).toEqual(beforeResults);
  });
});
