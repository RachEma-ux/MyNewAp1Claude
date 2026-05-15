/**
 * Phase 23 §T-D.9 — quality-finding severity ordering helpers.
 *
 * Mirror of T-G.12 (#1045) security-graph severity helpers, applied to
 * the 4-key QUALITY_FINDING_SEVERITIES taxonomy.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_FINDING_SEVERITIES,
  qualitySeverityRank,
  compareQualitySeverity,
  sortQualityFindingsBySeverityDesc,
  getMostSevereQualityFinding,
  type QualityFindingSeverity,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

describe("quality-finding severity helpers (T-D.9)", () => {
  describe("qualitySeverityRank", () => {
    it("returns 0..3 monotone", () => {
      expect(qualitySeverityRank("low")).toBe(0);
      expect(qualitySeverityRank("medium")).toBe(1);
      expect(qualitySeverityRank("high")).toBe(2);
      expect(qualitySeverityRank("critical")).toBe(3);
    });

    it.each(QUALITY_FINDING_SEVERITIES)(
      "round-trips %s through QUALITY_FINDING_SEVERITIES",
      (s) => {
        expect(QUALITY_FINDING_SEVERITIES[qualitySeverityRank(s)]).toBe(s);
      },
    );
  });

  describe("compareQualitySeverity", () => {
    it("ascending Array.sort use", () => {
      const arr: QualityFindingSeverity[] = ["critical", "low", "high", "medium"];
      const sorted = [...arr].sort(compareQualitySeverity);
      expect(sorted).toEqual(["low", "medium", "high", "critical"]);
    });

    it("0 for equal", () => {
      expect(compareQualitySeverity("high", "high")).toBe(0);
    });

    it("negative when a < b", () => {
      expect(compareQualitySeverity("low", "critical")).toBeLessThan(0);
    });

    it("positive when a > b", () => {
      expect(compareQualitySeverity("critical", "low")).toBeGreaterThan(0);
    });
  });

  describe("sortQualityFindingsBySeverityDesc", () => {
    it("critical first, low last", () => {
      const items = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
        { id: "c", sev: "medium" as const },
      ];
      const sorted = sortQualityFindingsBySeverityDesc(items, (x) => x.sev);
      expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
    });

    it("stable for ties", () => {
      const items = [
        { id: "x1", sev: "high" as const },
        { id: "x2", sev: "high" as const },
      ];
      const sorted = sortQualityFindingsBySeverityDesc(items, (x) => x.sev);
      expect(sorted.map((x) => x.id)).toEqual(["x1", "x2"]);
    });

    it("non-mutating", () => {
      const items = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
      ];
      const before = [...items];
      sortQualityFindingsBySeverityDesc(items, (x) => x.sev);
      expect(items).toEqual(before);
    });

    it("empty → empty", () => {
      expect(
        sortQualityFindingsBySeverityDesc(
          [],
          (x: { sev: QualityFindingSeverity }) => x.sev,
        ),
      ).toEqual([]);
    });
  });

  describe("getMostSevereQualityFinding", () => {
    it("returns critical when present", () => {
      const items = [
        { id: "a", sev: "low" as const },
        { id: "b", sev: "critical" as const },
      ];
      expect(getMostSevereQualityFinding(items, (x) => x.sev)?.id).toBe("b");
    });

    it("first-tie wins", () => {
      const items = [
        { id: "first", sev: "high" as const },
        { id: "second", sev: "high" as const },
      ];
      expect(getMostSevereQualityFinding(items, (x) => x.sev)?.id).toBe(
        "first",
      );
    });

    it("undefined for empty", () => {
      expect(
        getMostSevereQualityFinding(
          [],
          (x: { sev: QualityFindingSeverity }) => x.sev,
        ),
      ).toBeUndefined();
    });

    it("returns lone item when single", () => {
      const items = [{ id: "solo", sev: "low" as const }];
      expect(getMostSevereQualityFinding(items, (x) => x.sev)?.id).toBe("solo");
    });
  });
});
