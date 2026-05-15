/**
 * Phase 25 §T-G.18 — summarizeRecommendationCandidates lockstep.
 *
 * Pre-assemble diagnostic over raw candidate list. Companion to
 * `summarizeRecommendationResponse` (T-G.13 #1047) which operates on
 * the post-assemble response.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeRecommendationCandidates,
  type RecommendationCandidate,
} from "../../server/agent-studio/services/recommendation/public-api.js";

function build(
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    permissionStatus: "visible",
    reason: "test",
    graphPath: [],
    sourceCitations: [],
    confidence: 0.8,
    recommendedNode: { typeKey: "note", id: "n1" },
    ...overrides,
  };
}

describe("summarizeRecommendationCandidates (T-G.18)", () => {
  it("empty input → zeros + null stats", () => {
    const s = summarizeRecommendationCandidates([], 0.5);
    expect(s.totalCandidates).toBe(0);
    expect(s.belowConfidenceFloor).toBe(0);
    expect(s.aboveConfidenceFloor).toBe(0);
    expect(s.visible).toBe(0);
    expect(s.redacted).toBe(0);
    expect(s.fullyHidden).toBe(0);
    expect(s.meanConfidence).toBeNull();
    expect(s.minConfidence).toBeNull();
    expect(s.maxConfidence).toBeNull();
  });

  it("counts above/below confidence floor", () => {
    const s = summarizeRecommendationCandidates(
      [
        build({ confidence: 0.9 }),
        build({ confidence: 0.4 }),
        build({ confidence: 0.6 }),
        build({ confidence: 0.3 }),
      ],
      0.5,
    );
    expect(s.totalCandidates).toBe(4);
    expect(s.belowConfidenceFloor).toBe(2);
    expect(s.aboveConfidenceFloor).toBe(2);
  });

  it("classifies above-floor by permission status", () => {
    const s = summarizeRecommendationCandidates(
      [
        build({ confidence: 0.9, permissionStatus: "visible" }),
        build({ confidence: 0.8, permissionStatus: "redacted" }),
        build({ confidence: 0.7, permissionStatus: "hidden" }),
      ],
      0.5,
    );
    expect(s.visible).toBe(1);
    expect(s.redacted).toBe(1);
    expect(s.fullyHidden).toBe(1);
  });

  it("does NOT classify below-floor candidates by permission", () => {
    const s = summarizeRecommendationCandidates(
      [build({ confidence: 0.3, permissionStatus: "visible" })],
      0.5,
    );
    expect(s.visible).toBe(0);
    expect(s.belowConfidenceFloor).toBe(1);
  });

  it("computes mean/min/max across ALL candidates (including below-floor)", () => {
    const s = summarizeRecommendationCandidates(
      [
        build({ confidence: 0.2 }),
        build({ confidence: 0.5 }),
        build({ confidence: 0.9 }),
      ],
      0.4,
    );
    expect(s.minConfidence).toBeCloseTo(0.2, 6);
    expect(s.maxConfidence).toBeCloseTo(0.9, 6);
    expect(s.meanConfidence).toBeCloseTo((0.2 + 0.5 + 0.9) / 3, 6);
  });

  it("totalCandidates == above + below floor", () => {
    const s = summarizeRecommendationCandidates(
      [
        build({ confidence: 0.9 }),
        build({ confidence: 0.6 }),
        build({ confidence: 0.3 }),
      ],
      0.5,
    );
    expect(s.aboveConfidenceFloor + s.belowConfidenceFloor).toBe(
      s.totalCandidates,
    );
  });

  it("visible + redacted + fullyHidden == aboveConfidenceFloor", () => {
    const s = summarizeRecommendationCandidates(
      [
        build({ confidence: 0.9, permissionStatus: "visible" }),
        build({ confidence: 0.8, permissionStatus: "redacted" }),
        build({ confidence: 0.7, permissionStatus: "hidden" }),
        build({ confidence: 0.3, permissionStatus: "visible" }), // below floor
      ],
      0.5,
    );
    expect(s.visible + s.redacted + s.fullyHidden).toBe(s.aboveConfidenceFloor);
  });

  it("does not mutate input", () => {
    const input = [build({ confidence: 0.9 })];
    const before = JSON.parse(JSON.stringify(input));
    summarizeRecommendationCandidates(input, 0.5);
    expect(input).toEqual(before);
  });
});
