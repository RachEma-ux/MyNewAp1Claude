/**
 * Phase 23 §T-D.12 — quality proposal-kind metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_PROPOSAL_KINDS,
  QUALITY_PROPOSAL_KIND_METADATA,
  isQualityProposalKind,
  getQualityProposalKindMetadata,
  FINDING_CLASS_TO_PROPOSAL_KIND,
  proposalKindForFinding,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

describe("QUALITY_PROPOSAL_KIND_METADATA (T-D.12)", () => {
  it("has metadata for every closed-taxonomy proposal kind", () => {
    for (const k of QUALITY_PROPOSAL_KINDS) {
      expect(QUALITY_PROPOSAL_KIND_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(QUALITY_PROPOSAL_KIND_METADATA).length).toBe(
      QUALITY_PROPOSAL_KINDS.length,
    );
  });

  it.each(QUALITY_PROPOSAL_KINDS)(
    "%s has non-empty label + description + valid automationClass + boolean mutatesGraph",
    (k) => {
      const m = QUALITY_PROPOSAL_KIND_METADATA[k];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(30);
      expect([
        "one_click_safe",
        "review_required",
        "investigation_only",
      ]).toContain(m.automationClass);
      expect(typeof m.mutatesGraph).toBe("boolean");
    },
  );

  it.each(QUALITY_PROPOSAL_KINDS)(
    "getQualityProposalKindMetadata(%s) returns table entry",
    (k) => {
      expect(getQualityProposalKindMetadata(k)).toBe(
        QUALITY_PROPOSAL_KIND_METADATA[k],
      );
    },
  );

  it("isQualityProposalKind narrows correctly", () => {
    for (const k of QUALITY_PROPOSAL_KINDS) {
      expect(isQualityProposalKind(k)).toBe(true);
    }
    expect(isQualityProposalKind("not_a_kind")).toBe(false);
    expect(isQualityProposalKind(null)).toBe(false);
    expect(isQualityProposalKind(123)).toBe(false);
  });

  it("every mapped FINDING_CLASS_TO_PROPOSAL_KIND value is a closed-taxonomy kind", () => {
    for (const proposalKind of Object.values(FINDING_CLASS_TO_PROPOSAL_KIND)) {
      expect(QUALITY_PROPOSAL_KINDS).toContain(proposalKind);
    }
  });

  it("review_self_loop fallback is in the closed taxonomy", () => {
    expect(QUALITY_PROPOSAL_KINDS).toContain("review_self_loop");
    expect(proposalKindForFinding("self_loop")).toBe("review_self_loop");
  });

  it("investigation_only proposals do not mutate the graph", () => {
    for (const k of QUALITY_PROPOSAL_KINDS) {
      const m = QUALITY_PROPOSAL_KIND_METADATA[k];
      if (m.automationClass === "investigation_only") {
        expect(m.mutatesGraph).toBe(false);
      }
    }
  });

  it("one_click_safe and review_required proposals all mutate the graph", () => {
    for (const k of QUALITY_PROPOSAL_KINDS) {
      const m = QUALITY_PROPOSAL_KIND_METADATA[k];
      if (
        m.automationClass === "one_click_safe" ||
        m.automationClass === "review_required"
      ) {
        expect(m.mutatesGraph).toBe(true);
      }
    }
  });

  it("every automationClass has at least one proposal kind", () => {
    const used = new Set<string>();
    for (const k of QUALITY_PROPOSAL_KINDS) {
      used.add(QUALITY_PROPOSAL_KIND_METADATA[k].automationClass);
    }
    expect(used.has("one_click_safe")).toBe(true);
    expect(used.has("review_required")).toBe(true);
    expect(used.has("investigation_only")).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of QUALITY_PROPOSAL_KINDS) {
      labels.add(QUALITY_PROPOSAL_KIND_METADATA[k].label);
    }
    expect(labels.size).toBe(QUALITY_PROPOSAL_KINDS.length);
  });
});
