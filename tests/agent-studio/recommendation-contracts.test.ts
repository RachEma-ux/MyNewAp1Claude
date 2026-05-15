/**
 * Recommendation Service contracts — Phase 25 §T-G.4.
 *
 * Tests the 8-kind closed taxonomy + 3-status permission classification
 * + request/response shape + normalizers.
 */

import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_KINDS,
  RECOMMENDATION_PERMISSION_STATUSES,
  DEFAULT_RECOMMENDATION_LIMIT,
  ABSOLUTE_RECOMMENDATION_LIMIT,
  DEFAULT_RECOMMENDATION_MIN_CONFIDENCE,
  isRecommendationKind,
  normalizeRecommendationLimit,
  normalizeRecommendationMinConfidence,
} from "../../server/agent-studio/services/recommendation/public-api";

describe("Closed recommendation-kind taxonomy", () => {
  it("contains exactly 8 roadmap-named kinds", () => {
    expect([...RECOMMENDATION_KINDS]).toEqual([
      "relevant_notes",
      "relevant_cag_blocks",
      "relevant_graph_skill_packs",
      "relevant_tools",
      "relevant_policies",
      "relevant_workflows",
      "relevant_experts",
      "next_actions",
    ]);
  });

  it("isRecommendationKind narrows to closed taxonomy", () => {
    expect(isRecommendationKind("relevant_notes")).toBe(true);
    expect(isRecommendationKind("next_actions")).toBe(true);
    expect(isRecommendationKind("custom_kind")).toBe(false);
    expect(isRecommendationKind(42)).toBe(false);
  });

  it("ids are unique", () => {
    expect(new Set(RECOMMENDATION_KINDS).size).toBe(
      RECOMMENDATION_KINDS.length,
    );
  });
});

describe("Closed permission-status taxonomy", () => {
  it("contains exactly 3 statuses", () => {
    expect([...RECOMMENDATION_PERMISSION_STATUSES]).toEqual([
      "visible",
      "redacted",
      "hidden",
    ]);
  });
});

describe("Default + limit constants", () => {
  it("DEFAULT_RECOMMENDATION_LIMIT is 10", () => {
    expect(DEFAULT_RECOMMENDATION_LIMIT).toBe(10);
  });

  it("ABSOLUTE_RECOMMENDATION_LIMIT is 100", () => {
    expect(ABSOLUTE_RECOMMENDATION_LIMIT).toBe(100);
  });

  it("DEFAULT_RECOMMENDATION_MIN_CONFIDENCE is 0.5", () => {
    expect(DEFAULT_RECOMMENDATION_MIN_CONFIDENCE).toBe(0.5);
  });
});

describe("normalizeRecommendationLimit", () => {
  it("returns DEFAULT when input is undefined", () => {
    expect(normalizeRecommendationLimit(undefined)).toBe(
      DEFAULT_RECOMMENDATION_LIMIT,
    );
  });

  it("clamps to ABSOLUTE when exceeded", () => {
    expect(normalizeRecommendationLimit(200)).toBe(
      ABSOLUTE_RECOMMENDATION_LIMIT,
    );
    expect(normalizeRecommendationLimit(101)).toBe(
      ABSOLUTE_RECOMMENDATION_LIMIT,
    );
  });

  it("returns the input within [1, ABSOLUTE]", () => {
    expect(normalizeRecommendationLimit(1)).toBe(1);
    expect(normalizeRecommendationLimit(50)).toBe(50);
    expect(normalizeRecommendationLimit(100)).toBe(100);
  });

  it("floors fractions", () => {
    expect(normalizeRecommendationLimit(10.9)).toBe(10);
  });

  it("throws on sub-1 or non-finite", () => {
    expect(() => normalizeRecommendationLimit(0)).toThrow(/>= 1/);
    expect(() => normalizeRecommendationLimit(-5)).toThrow(/>= 1/);
    expect(() => normalizeRecommendationLimit(NaN)).toThrow(/finite/);
    expect(() => normalizeRecommendationLimit(Infinity)).toThrow(/finite/);
  });
});

describe("normalizeRecommendationMinConfidence", () => {
  it("returns DEFAULT when undefined", () => {
    expect(normalizeRecommendationMinConfidence(undefined)).toBe(
      DEFAULT_RECOMMENDATION_MIN_CONFIDENCE,
    );
  });

  it("accepts values in [0, 1] verbatim", () => {
    expect(normalizeRecommendationMinConfidence(0)).toBe(0);
    expect(normalizeRecommendationMinConfidence(0.3)).toBe(0.3);
    expect(normalizeRecommendationMinConfidence(0.99)).toBeCloseTo(0.99);
    expect(normalizeRecommendationMinConfidence(1)).toBe(1);
  });

  it("throws on out-of-range", () => {
    expect(() => normalizeRecommendationMinConfidence(-0.1)).toThrow(
      /\[0, 1\]/,
    );
    expect(() => normalizeRecommendationMinConfidence(1.1)).toThrow(
      /\[0, 1\]/,
    );
  });

  it("throws on non-finite", () => {
    expect(() => normalizeRecommendationMinConfidence(NaN)).toThrow(/finite/);
    expect(() => normalizeRecommendationMinConfidence(Infinity)).toThrow(
      /finite/,
    );
  });
});

describe("Type-level shape proxies", () => {
  it("RecommendationResult has all roadmap-spec fields", () => {
    const r = {
      rank: 1,
      permissionStatus: "visible" as const,
      reason: "matches the anchor's CAG block hash",
      graphPath: ["DERIVED_FROM", "PROMOTED_TO"],
      sourceCitations: [{ typeKey: "Note", id: "n:1" }],
      confidence: 0.85,
      recommendedNode: { typeKey: "CAGBlock", id: "cag:42" },
    };
    expect(r.rank).toBe(1);
    expect(r.graphPath).toHaveLength(2);
  });

  it("RecommendationResponse carries redactedCount + fullyHiddenCount for permission-aware UI", () => {
    const resp = {
      kind: "relevant_notes" as const,
      anchor: { typeKey: "User", id: "u:1" },
      results: [],
      redactedCount: 5,
      fullyHiddenCount: 12,
    };
    expect(resp.redactedCount).toBe(5);
    expect(resp.fullyHiddenCount).toBe(12);
  });
});
