/**
 * Phase G §T-G.47 — Promotion-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PROMOTION_STATUSES,
  PROMOTION_STATUS_METADATA,
  getPromotionStatusMetadata,
} from "../../server/agent-studio/services/promotion/lifecycle.js";

describe("PROMOTION_STATUS_METADATA (T-G.47)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of PROMOTION_STATUSES) {
      expect(PROMOTION_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(PROMOTION_STATUS_METADATA).length).toBe(
      PROMOTION_STATUSES.length,
    );
  });

  it.each(PROMOTION_STATUSES)(
    "%s has non-empty label + description + boolean terminal + boolean producedActiveVersion",
    (s) => {
      const md = PROMOTION_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.terminal).toBe("boolean");
      expect(typeof md.producedActiveVersion).toBe("boolean");
    },
  );

  it.each(PROMOTION_STATUSES)(
    "getPromotionStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getPromotionStatusMetadata(s)).toBe(PROMOTION_STATUS_METADATA[s]);
    },
  );

  it("approved + rejected + rolled_back are exactly the terminal statuses", () => {
    const terminal = new Set(
      PROMOTION_STATUSES.filter((s) => PROMOTION_STATUS_METADATA[s].terminal),
    );
    expect(terminal).toEqual(new Set(["approved", "rejected", "rolled_back"]));
  });

  it("approved is the only status that produced an active version", () => {
    const produced = PROMOTION_STATUSES.filter(
      (s) => PROMOTION_STATUS_METADATA[s].producedActiveVersion,
    );
    expect(produced).toEqual(["approved"]);
  });

  it("producedActiveVersion implies terminal", () => {
    for (const s of PROMOTION_STATUSES) {
      const md = PROMOTION_STATUS_METADATA[s];
      if (md.producedActiveVersion) {
        expect(md.terminal).toBe(true);
      }
    }
  });

  it("pending + validating + in_review are exactly the non-terminal statuses", () => {
    const nonTerminal = new Set(
      PROMOTION_STATUSES.filter(
        (s) => !PROMOTION_STATUS_METADATA[s].terminal,
      ),
    );
    expect(nonTerminal).toEqual(new Set(["pending", "validating", "in_review"]));
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of PROMOTION_STATUSES) {
      labels.add(PROMOTION_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(PROMOTION_STATUSES.length);
  });
});
