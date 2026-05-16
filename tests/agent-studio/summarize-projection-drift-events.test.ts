/**
 * Phase G §T-G.67 — `summarizeProjectionDriftEvents` lockstep.
 *
 * 23rd instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  DRIFT_CLASS_SEVERITIES,
  summarizeProjectionDriftEvents,
  type SummarizeProjectionDriftEventsInput,
} from "../../server/agent-studio/services/graph/projection/projection-drift-event-summary.js";
import {
  DRIFT_CLASSES,
  DRIFT_CLASS_METADATA,
} from "../../server/agent-studio/services/graph/projection/drift-detector.js";

const FROZEN_NOW = new Date("2026-05-16T12:00:00Z");

function makeRow(
  overrides: Partial<SummarizeProjectionDriftEventsInput> = {},
): SummarizeProjectionDriftEventsInput {
  return {
    driftClass: "missing_in_neo4j",
    remediatedAt: null,
    detectedAt: FROZEN_NOW,
    ...overrides,
  };
}

describe("DRIFT_CLASS_SEVERITIES — closed-taxonomy invariant", () => {
  it("contains exactly 2 values (warning/critical)", () => {
    expect(DRIFT_CLASS_SEVERITIES.length).toBe(2);
    expect(new Set(DRIFT_CLASS_SEVERITIES)).toEqual(
      new Set(["warning", "critical"]),
    );
  });

  it("matches metadata severity values", () => {
    const fromMetadata = new Set(
      DRIFT_CLASSES.map((c) => DRIFT_CLASS_METADATA[c].severity),
    );
    expect(new Set(DRIFT_CLASS_SEVERITIES)).toEqual(fromMetadata);
  });
});

describe("summarizeProjectionDriftEvents — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeProjectionDriftEvents([]);
    expect(s.total).toBe(0);
    expect(s.unknownDriftClassCount).toBe(0);
    expect(s.remediatedCount).toBe(0);
    expect(s.unresolvedCount).toBe(0);
    expect(s.remediationRate).toBeNull();
    expect(s.securityRelevantCount).toBe(0);
    expect(s.ageStats).toBeNull();
  });

  it("byDriftClass + bySeverity zero-filled", () => {
    const s = summarizeProjectionDriftEvents([]);
    for (const c of DRIFT_CLASSES) expect(s.byDriftClass[c]).toBe(0);
    for (const sev of DRIFT_CLASS_SEVERITIES)
      expect(s.bySeverity[sev]).toBe(0);
  });
});

describe("summarizeProjectionDriftEvents — class + severity partition", () => {
  it("counts each closed class correctly", () => {
    const s = summarizeProjectionDriftEvents(
      DRIFT_CLASSES.map((c) => makeRow({ driftClass: c })),
    );
    for (const c of DRIFT_CLASSES) expect(s.byDriftClass[c]).toBe(1);
  });

  it("severity counts mirror metadata mapping", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ driftClass: "permission_leak" }),
      makeRow({ driftClass: "missing_in_neo4j" }),
      makeRow({ driftClass: "missing_in_neo4j" }),
      makeRow({ driftClass: "stale_version" }),
    ]);
    expect(s.bySeverity.critical).toBe(1); // permission_leak
    expect(s.bySeverity.warning).toBe(3); // missing×2 + stale
  });

  it("securityRelevantCount counts permission_leak only", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ driftClass: "permission_leak" }),
      makeRow({ driftClass: "missing_in_neo4j" }),
      makeRow({ driftClass: "extra_in_neo4j" }),
    ]);
    expect(s.securityRelevantCount).toBe(1);
  });
});

describe("summarizeProjectionDriftEvents — remediation rate", () => {
  it("null when no metadata-known rows", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ driftClass: "unknown_class" }),
    ]);
    expect(s.remediationRate).toBeNull();
  });

  it("100% when all remediated", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ remediatedAt: FROZEN_NOW }),
      makeRow({ remediatedAt: FROZEN_NOW }),
    ]);
    expect(s.remediationRate).toBe(100);
  });

  it("50% when half remediated", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ remediatedAt: FROZEN_NOW }),
      makeRow({ remediatedAt: null }),
    ]);
    expect(s.remediationRate).toBe(50);
  });
});

describe("summarizeProjectionDriftEvents — schema drift", () => {
  it("unknown driftClass counted via separate axis", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ driftClass: "missing_in_neo4j" }),
      makeRow({ driftClass: "future_unknown_class" }),
    ]);
    expect(s.unknownDriftClassCount).toBe(1);
    expect(s.byDriftClass.missing_in_neo4j).toBe(1);
    // Unknown doesn't bucket into byDriftClass at all.
    let sum = 0;
    for (const c of DRIFT_CLASSES) sum += s.byDriftClass[c];
    expect(sum).toBe(1);
  });

  it("unknown rows don't contribute to remediation rate", () => {
    const s = summarizeProjectionDriftEvents([
      makeRow({ driftClass: "missing_in_neo4j", remediatedAt: FROZEN_NOW }),
      makeRow({ driftClass: "garbage", remediatedAt: FROZEN_NOW }),
    ]);
    // remediated 1 / settled 1 = 100% (unknown not counted)
    expect(s.remediationRate).toBe(100);
    expect(s.remediatedCount).toBe(1);
    expect(s.unresolvedCount).toBe(0);
  });
});

describe("summarizeProjectionDriftEvents — age stats", () => {
  it("computes ages with injected clock", () => {
    const s = summarizeProjectionDriftEvents(
      [
        makeRow({
          detectedAt: new Date(FROZEN_NOW.getTime() - 1000),
        }),
        makeRow({
          detectedAt: new Date(FROZEN_NOW.getTime() - 5000),
        }),
      ],
      { now: FROZEN_NOW },
    );
    expect(s.ageStats!.count).toBe(2);
    expect(s.ageStats!.min).toBe(1000);
    expect(s.ageStats!.max).toBe(5000);
  });
});
