/**
 * Phase 25 §T-G.3 — Security severity ordering helpers.
 *
 * Locks the comparator + sort-desc + most-severe utilities against
 * the closed `SECURITY_FINDING_SEVERITIES` taxonomy. Pure function
 * tests; no DB / dispatcher / openrouter.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_FINDING_SEVERITIES,
  severityRank,
  compareSecuritySeverity,
  sortBySeverityDesc,
  getMostSevereItem,
  type SecurityFindingSeverity,
} from "../../server/agent-studio/services/security-graph/public-api.js";

describe("security-graph severity helpers", () => {
  describe("severityRank", () => {
    it("returns 0..4 monotonically increasing", () => {
      expect(severityRank("informational")).toBe(0);
      expect(severityRank("low")).toBe(1);
      expect(severityRank("medium")).toBe(2);
      expect(severityRank("high")).toBe(3);
      expect(severityRank("critical")).toBe(4);
    });

    it.each(SECURITY_FINDING_SEVERITIES)(
      "round-trips through the taxonomy for %s",
      (s) => {
        const rank = severityRank(s);
        expect(SECURITY_FINDING_SEVERITIES[rank]).toBe(s);
      },
    );
  });

  describe("compareSecuritySeverity", () => {
    it("returns negative when a < b", () => {
      expect(compareSecuritySeverity("low", "high")).toBeLessThan(0);
      expect(compareSecuritySeverity("informational", "critical")).toBeLessThan(0);
    });

    it("returns positive when a > b", () => {
      expect(compareSecuritySeverity("critical", "medium")).toBeGreaterThan(0);
    });

    it("returns 0 for equal severities", () => {
      expect(compareSecuritySeverity("medium", "medium")).toBe(0);
    });

    it("sorts ascending via Array.sort directly", () => {
      const arr: SecurityFindingSeverity[] = [
        "critical",
        "low",
        "high",
        "informational",
      ];
      const sorted = [...arr].sort(compareSecuritySeverity);
      expect(sorted).toEqual(["informational", "low", "high", "critical"]);
    });
  });

  describe("sortBySeverityDesc", () => {
    it("returns critical first, informational last", () => {
      const items = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
        { id: "c", sev: "medium" as const },
        { id: "d", sev: "informational" as const },
      ];
      const sorted = sortBySeverityDesc(items, (x) => x.sev);
      expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    });

    it("preserves input order for ties (stable)", () => {
      const items = [
        { id: "x1", sev: "high" as const },
        { id: "x2", sev: "high" as const },
        { id: "x3", sev: "high" as const },
      ];
      const sorted = sortBySeverityDesc(items, (x) => x.sev);
      expect(sorted.map((x) => x.id)).toEqual(["x1", "x2", "x3"]);
    });

    it("does not mutate the input array", () => {
      const input = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
      ];
      const before = [...input];
      sortBySeverityDesc(input, (x) => x.sev);
      expect(input).toEqual(before);
    });

    it("returns empty array unchanged", () => {
      expect(sortBySeverityDesc([], (x: { sev: SecurityFindingSeverity }) => x.sev)).toEqual([]);
    });
  });

  describe("getMostSevereItem", () => {
    it("returns the critical when present", () => {
      const items = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
        { id: "c", sev: "medium" as const },
      ];
      expect(getMostSevereItem(items, (x) => x.sev)?.id).toBe("b");
    });

    it("returns the first occurrence on ties", () => {
      const items = [
        { id: "first", sev: "high" as const },
        { id: "second", sev: "high" as const },
      ];
      expect(getMostSevereItem(items, (x) => x.sev)?.id).toBe("first");
    });

    it("returns undefined for empty input", () => {
      expect(
        getMostSevereItem([], (x: { sev: SecurityFindingSeverity }) => x.sev),
      ).toBeUndefined();
    });

    it("returns the lone item when single-item input", () => {
      const items = [{ id: "solo", sev: "informational" as const }];
      expect(getMostSevereItem(items, (x) => x.sev)?.id).toBe("solo");
    });

    it("does not mutate input", () => {
      const input = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
      ];
      const before = [...input];
      getMostSevereItem(input, (x) => x.sev);
      expect(input).toEqual(before);
    });
  });
});
