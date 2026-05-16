/**
 * Phase G §T-G.41 — CAG pack-event-severity metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_PACK_EVENT_SEVERITIES,
  CAG_PACK_EVENT_SEVERITY_METADATA,
  getCagPackEventSeverityMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_PACK_EVENT_SEVERITY_METADATA (T-G.41)", () => {
  it("has metadata for every closed-taxonomy severity", () => {
    for (const s of CAG_PACK_EVENT_SEVERITIES) {
      expect(CAG_PACK_EVENT_SEVERITY_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_PACK_EVENT_SEVERITY_METADATA).length).toBe(
      CAG_PACK_EVENT_SEVERITIES.length,
    );
  });

  it.each(CAG_PACK_EVENT_SEVERITIES)(
    "%s has non-empty label + description + valid rank + boolean requiresTriage",
    (s) => {
      const md = CAG_PACK_EVENT_SEVERITY_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2]).toContain(md.rank);
      expect(typeof md.requiresTriage).toBe("boolean");
    },
  );

  it.each(CAG_PACK_EVENT_SEVERITIES)(
    "getCagPackEventSeverityMetadata(%s) returns table entry",
    (s) => {
      expect(getCagPackEventSeverityMetadata(s)).toBe(
        CAG_PACK_EVENT_SEVERITY_METADATA[s],
      );
    },
  );

  it("rank order matches declaration order (info=0 → error=2)", () => {
    CAG_PACK_EVENT_SEVERITIES.forEach((s, idx) => {
      expect(CAG_PACK_EVENT_SEVERITY_METADATA[s].rank).toBe(idx);
    });
  });

  it("rank is unique across severities", () => {
    const ranks = new Set<number>();
    for (const s of CAG_PACK_EVENT_SEVERITIES) {
      ranks.add(CAG_PACK_EVENT_SEVERITY_METADATA[s].rank);
    }
    expect(ranks.size).toBe(CAG_PACK_EVENT_SEVERITIES.length);
  });

  it("error is the only severity requiring triage", () => {
    const triage = CAG_PACK_EVENT_SEVERITIES.filter(
      (s) => CAG_PACK_EVENT_SEVERITY_METADATA[s].requiresTriage,
    );
    expect(triage).toEqual(["error"]);
  });

  it("requiresTriage implies rank ≥ 2", () => {
    for (const s of CAG_PACK_EVENT_SEVERITIES) {
      const md = CAG_PACK_EVENT_SEVERITY_METADATA[s];
      if (md.requiresTriage) {
        expect(md.rank).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of CAG_PACK_EVENT_SEVERITIES) {
      labels.add(CAG_PACK_EVENT_SEVERITY_METADATA[s].label);
    }
    expect(labels.size).toBe(CAG_PACK_EVENT_SEVERITIES.length);
  });
});
