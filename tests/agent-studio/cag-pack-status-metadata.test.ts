/**
 * Phase G §T-G.40 — CAG pack-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CAG_PACK_STATUSES,
  CAG_PACK_STATUS_METADATA,
  getCagPackStatusMetadata,
} from "../../server/agent-studio/services/cag/types.js";

describe("CAG_PACK_STATUS_METADATA (T-G.40)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of CAG_PACK_STATUSES) {
      expect(CAG_PACK_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(CAG_PACK_STATUS_METADATA).length).toBe(
      CAG_PACK_STATUSES.length,
    );
  });

  it.each(CAG_PACK_STATUSES)(
    "%s has non-empty label + description + boolean compilable + boolean terminal",
    (s) => {
      const md = CAG_PACK_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.compilable).toBe("boolean");
      expect(typeof md.terminal).toBe("boolean");
    },
  );

  it.each(CAG_PACK_STATUSES)(
    "getCagPackStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getCagPackStatusMetadata(s)).toBe(CAG_PACK_STATUS_METADATA[s]);
    },
  );

  it("fresh is the only compilable status", () => {
    const compilable = CAG_PACK_STATUSES.filter(
      (s) => CAG_PACK_STATUS_METADATA[s].compilable,
    );
    expect(compilable).toEqual(["fresh"]);
  });

  it("archived + invalid are exactly the terminal statuses", () => {
    const terminal = new Set(
      CAG_PACK_STATUSES.filter((s) => CAG_PACK_STATUS_METADATA[s].terminal),
    );
    expect(terminal).toEqual(new Set(["archived", "invalid"]));
  });

  it("no status is simultaneously compilable AND terminal", () => {
    for (const s of CAG_PACK_STATUSES) {
      const md = CAG_PACK_STATUS_METADATA[s];
      expect(md.compilable && md.terminal).toBe(false);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of CAG_PACK_STATUSES) {
      labels.add(CAG_PACK_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(CAG_PACK_STATUSES.length);
  });
});
