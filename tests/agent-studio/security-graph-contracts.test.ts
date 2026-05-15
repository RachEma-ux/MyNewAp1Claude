/**
 * Security Graph contracts — Phase 25 §T-G.3.
 *
 * Tests the 10-type closed taxonomy, canonical CVE→Exposure path,
 * CVSS-to-severity bucketing, and permission-scope defaults.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_GRAPH_NODE_TYPES,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
  SECURITY_FINDING_SEVERITIES,
  SECURITY_FINDINGS_VIEW_PERMISSION_KEY,
  SECURITY_GRAPH_DEFAULT_PERMISSION_SCOPE,
  isSecurityGraphNodeType,
  isSecurityFindingSeverity,
  cvssScoreToSeverity,
} from "../../server/agent-studio/services/security-graph/public-api";

describe("Closed security-graph node-type taxonomy", () => {
  it("contains exactly the 10 roadmap-named types", () => {
    expect([...SECURITY_GRAPH_NODE_TYPES]).toEqual([
      "cve",
      "security_finding",
      "component",
      "package",
      "service",
      "environment",
      "owner",
      "customer_exposure",
      "policy",
      "control",
    ]);
  });

  it("isSecurityGraphNodeType narrows to closed taxonomy", () => {
    expect(isSecurityGraphNodeType("cve")).toBe(true);
    expect(isSecurityGraphNodeType("customer_exposure")).toBe(true);
    expect(isSecurityGraphNodeType("custom_type")).toBe(false);
    expect(isSecurityGraphNodeType(42)).toBe(false);
  });

  it("ids are unique", () => {
    expect(new Set(SECURITY_GRAPH_NODE_TYPES).size).toBe(
      SECURITY_GRAPH_NODE_TYPES.length,
    );
  });
});

describe("Canonical CVE → CustomerExposure impact path", () => {
  it("matches the roadmap-named 7-step traversal", () => {
    expect([...SECURITY_GRAPH_CANONICAL_IMPACT_PATH]).toEqual([
      "cve",
      "package",
      "component",
      "service",
      "environment",
      "owner",
      "customer_exposure",
    ]);
  });

  it("starts at cve and ends at customer_exposure", () => {
    expect(SECURITY_GRAPH_CANONICAL_IMPACT_PATH[0]).toBe("cve");
    expect(
      SECURITY_GRAPH_CANONICAL_IMPACT_PATH[
        SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length - 1
      ],
    ).toBe("customer_exposure");
  });

  it("every step is a valid node type", () => {
    for (const step of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      expect(isSecurityGraphNodeType(step)).toBe(true);
    }
  });
});

describe("Closed severity taxonomy + CVSS bucketing", () => {
  it("contains exactly 5 NVD-aligned buckets", () => {
    expect([...SECURITY_FINDING_SEVERITIES]).toEqual([
      "informational",
      "low",
      "medium",
      "high",
      "critical",
    ]);
  });

  it("isSecurityFindingSeverity narrows correctly", () => {
    expect(isSecurityFindingSeverity("critical")).toBe(true);
    expect(isSecurityFindingSeverity("informational")).toBe(true);
    expect(isSecurityFindingSeverity("unknown")).toBe(false);
  });

  it.each([
    [0, "informational"],
    [0.1, "low"],
    [1, "low"],
    [3.9, "low"],
    [4.0, "medium"],
    [5, "medium"],
    [6.9, "medium"],
    [7.0, "high"],
    [8, "high"],
    [8.9, "high"],
    [9.0, "critical"],
    [9.9, "critical"],
    [10.0, "critical"],
  ])("cvssScoreToSeverity(%f) === %s", (score, expected) => {
    expect(cvssScoreToSeverity(score)).toBe(expected);
  });

  it("throws on out-of-range scores", () => {
    expect(() => cvssScoreToSeverity(-1)).toThrow(/in \[0, 10\]/);
    expect(() => cvssScoreToSeverity(11)).toThrow(/in \[0, 10\]/);
  });

  it("throws on non-finite scores", () => {
    expect(() => cvssScoreToSeverity(NaN)).toThrow(/finite number/);
    expect(() => cvssScoreToSeverity(Infinity)).toThrow(/finite number/);
  });
});

describe("Permission scope defaults", () => {
  it("SECURITY_FINDINGS_VIEW_PERMISSION_KEY is the canonical permission key", () => {
    expect(SECURITY_FINDINGS_VIEW_PERMISSION_KEY).toBe(
      "security_findings_view",
    );
  });

  it("default permission scope is approver_only (NOT workspace_public)", () => {
    expect(SECURITY_GRAPH_DEFAULT_PERMISSION_SCOPE).toBe("approver_only");
  });
});
