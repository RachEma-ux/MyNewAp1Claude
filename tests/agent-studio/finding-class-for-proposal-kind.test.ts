/**
 * Phase 23 §T-D.10 — findingClassForProposalKind lockstep.
 *
 * Inverse of `proposalKindForFinding`. Tests both directions of the
 * mapping round-trip.
 */

import { describe, it, expect } from "vitest";
import {
  FINDING_CLASS_TO_PROPOSAL_KIND,
  proposalKindForFinding,
  findingClassForProposalKind,
} from "../../server/agent-studio/services/graph-quality/public-api.js";

describe("findingClassForProposalKind (T-D.10)", () => {
  it("returns null for unmapped proposal kinds", () => {
    expect(findingClassForProposalKind("totally_made_up_proposal")).toBeNull();
  });

  it("returns null for review_* fallback kinds", () => {
    // `proposalKindForFinding("self_loop")` returns `review_self_loop`
    // because self_loop is intentionally NOT in the mapping table.
    expect(findingClassForProposalKind("review_self_loop")).toBeNull();
  });

  it.each(Object.entries(FINDING_CLASS_TO_PROPOSAL_KIND))(
    "round-trips %s → %s → %s",
    (findingClass, proposalKind) => {
      expect(proposalKindForFinding(findingClass)).toBe(proposalKind);
      expect(findingClassForProposalKind(proposalKind)).toBe(findingClass);
    },
  );

  it("returns null for empty string", () => {
    expect(findingClassForProposalKind("")).toBeNull();
  });

  it("matches FIRST occurrence when multiple finding classes map to same proposal kind", () => {
    // Currently the mapping is 1:1 by design, so this test just
    // documents the order-preserving lookup contract — if the mapping
    // ever becomes many-to-one, the inverse returns the first hit by
    // Object.entries iteration order.
    const allMapped = Object.entries(FINDING_CLASS_TO_PROPOSAL_KIND);
    for (const [klass, kind] of allMapped) {
      expect(findingClassForProposalKind(kind)).toBe(klass);
    }
  });
});
