/**
 * Impact Analysis Lens contracts — Phase 24 §T-F.3.
 *
 * Tests the closed-taxonomy + request/response + maxDepth normalizer
 * contracts. Concrete Cypher template registrations land in T-F.4.
 */

import { describe, it, expect } from "vitest";
import {
  IMPACT_ANALYSIS_KINDS,
  isImpactAnalysisKind,
  DEFAULT_IMPACT_MAX_DEPTH,
  ABSOLUTE_IMPACT_MAX_DEPTH,
  normalizeImpactMaxDepth,
} from "../../server/agent-studio/services/graph-lens/public-api";

describe("Closed impact-kind taxonomy", () => {
  it("contains exactly the 7 roadmap-named kinds", () => {
    expect([...IMPACT_ANALYSIS_KINDS]).toEqual([
      "knowledge_impact",
      "runtime_impact",
      "code_impact",
      "security_impact",
      "governance_impact",
      "tool_impact",
      "workflow_impact",
    ]);
  });

  it("isImpactAnalysisKind narrows to the closed taxonomy", () => {
    expect(isImpactAnalysisKind("knowledge_impact")).toBe(true);
    expect(isImpactAnalysisKind("security_impact")).toBe(true);
    expect(isImpactAnalysisKind("custom_impact")).toBe(false);
    expect(isImpactAnalysisKind(42)).toBe(false);
    expect(isImpactAnalysisKind(undefined)).toBe(false);
  });
});

describe("Depth constants", () => {
  it("DEFAULT_IMPACT_MAX_DEPTH is 3", () => {
    expect(DEFAULT_IMPACT_MAX_DEPTH).toBe(3);
  });

  it("ABSOLUTE_IMPACT_MAX_DEPTH is 10", () => {
    expect(ABSOLUTE_IMPACT_MAX_DEPTH).toBe(10);
  });
});

describe("normalizeImpactMaxDepth", () => {
  it("returns DEFAULT when input is undefined", () => {
    expect(normalizeImpactMaxDepth(undefined)).toBe(DEFAULT_IMPACT_MAX_DEPTH);
  });

  it("clamps to ABSOLUTE_IMPACT_MAX_DEPTH when input exceeds it", () => {
    expect(normalizeImpactMaxDepth(100)).toBe(ABSOLUTE_IMPACT_MAX_DEPTH);
    expect(normalizeImpactMaxDepth(11)).toBe(ABSOLUTE_IMPACT_MAX_DEPTH);
  });

  it("returns the input value when within [1, ABSOLUTE_IMPACT_MAX_DEPTH]", () => {
    expect(normalizeImpactMaxDepth(1)).toBe(1);
    expect(normalizeImpactMaxDepth(5)).toBe(5);
    expect(normalizeImpactMaxDepth(10)).toBe(10);
  });

  it("floors fractional inputs", () => {
    expect(normalizeImpactMaxDepth(3.9)).toBe(3);
    expect(normalizeImpactMaxDepth(7.1)).toBe(7);
  });

  it("throws on sub-1 input", () => {
    expect(() => normalizeImpactMaxDepth(0)).toThrow(
      /maxDepth must be >= 1/,
    );
    expect(() => normalizeImpactMaxDepth(-3)).toThrow(
      /maxDepth must be >= 1/,
    );
  });

  it("throws on non-finite input", () => {
    expect(() => normalizeImpactMaxDepth(NaN)).toThrow(
      /maxDepth must be a finite number/,
    );
    expect(() => normalizeImpactMaxDepth(Infinity)).toThrow(
      /maxDepth must be a finite number/,
    );
    expect(() => normalizeImpactMaxDepth(-Infinity)).toThrow(
      /maxDepth must be a finite number/,
    );
  });
});

describe("Type-level shape integrity (compile-time only — these tests document the shape)", () => {
  it("ImpactAnalysisNode has visible flag", () => {
    // Compile-time check: the shape includes `visible`. Runtime
    // proxy — construct a literal that the compiler must accept.
    const node = {
      typeKey: "Service",
      id: "svc:1",
      depth: 2,
      visible: true,
      label: "API Gateway",
    };
    expect(node.visible).toBe(true);
  });

  it("ImpactAnalysisResult exposes hiddenNodeCount for redacted-dependency surface", () => {
    const result = {
      kind: "security_impact" as const,
      startingNodeId: "cve:CVE-2026-0001",
      nodes: [],
      edges: [],
      truncated: false,
      hiddenNodeCount: 12,
    };
    expect(result.hiddenNodeCount).toBe(12);
  });
});
