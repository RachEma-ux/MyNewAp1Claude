/**
 * LAYER 1 — Runtime Contract Tests
 *
 * Invariant: ONLY Catalog-approved + active entries are usable at runtime.
 *            Runtime authority is derived exclusively from Catalog state.
 *            No domain-level status grants runtime authority.
 *
 * Tested through: availability helpers, execution eligibility, state helpers
 */

import { describe, it, expect } from "vitest";
import { isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../server/catalog/availability";
import { getCatalogState } from "../../shared/catalog-state";
import { isCatalogExecutionEligible } from "../../shared/catalog-execution";

// ============================================================================
// Contract: Runtime availability is Catalog-authoritative
// ============================================================================

describe("Runtime Contract — Catalog Authority", () => {
  it("domain status alone does NOT grant runtime authority", () => {
    // A model with status="ready" in models table is NOT runtime-available
    // unless it also has a Catalog entry with active+approved
    // This is tested by verifying that getCatalogState(null) = not_imported
    const state = getCatalogState(null);
    expect(state.isAvailableForAppUse).toBe(false);
    expect(state.label).toBe("not_imported");
  });

  it("Catalog entry with active+approved IS runtime-available", () => {
    expect(isCatalogEntryAvailableForAppUse({
      status: "active",
      reviewState: "approved",
    })).toBe(true);
  });

  it("runtime uses CATALOG_AVAILABILITY_FILTERS for DB queries", () => {
    // The filters must contain exactly the required fields
    expect(CATALOG_AVAILABILITY_FILTERS).toEqual({
      status: "active",
      reviewState: "approved",
    });
  });

  it("getCatalogState.isAvailableForAppUse agrees with isCatalogEntryAvailableForAppUse", () => {
    const combinations = [
      { status: "active", reviewState: "approved" },
      { status: "active", reviewState: "needs_review" },
      { status: "active", reviewState: "rejected" },
      { status: "draft", reviewState: "approved" },
      { status: "draft", reviewState: "needs_review" },
      { status: "deprecated", reviewState: "approved" },
      { status: "disabled", reviewState: "approved" },
    ];

    for (const combo of combinations) {
      const stateResult = getCatalogState({ ...combo, tags: [] });
      const directResult = isCatalogEntryAvailableForAppUse(combo);
      expect(stateResult.isAvailableForAppUse).toBe(directResult);
    }
  });
});

// ============================================================================
// Contract: Agent execution has additional requirements beyond availability
// ============================================================================

describe("Runtime Contract — Agent Execution Eligibility", () => {
  it("agent execution requires: entryType=agent + active + approved + published + callable", () => {
    // Full valid config
    const valid = {
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    };
    expect(isCatalogExecutionEligible(valid)).toBe(true);

    // Remove each requirement one at a time
    expect(isCatalogExecutionEligible({ ...valid, entryType: "model" })).toBe(false);
    expect(isCatalogExecutionEligible({ ...valid, status: "draft" })).toBe(false);
    expect(isCatalogExecutionEligible({ ...valid, reviewState: "needs_review" })).toBe(false);
    expect(isCatalogExecutionEligible({ ...valid, tags: [] })).toBe(false);
    expect(isCatalogExecutionEligible({ ...valid, config: { callable: false } })).toBe(false);
  });

  it("execution eligibility is stricter than availability", () => {
    // Available but NOT execution-eligible (not an agent)
    const modelEntry = {
      entryType: "model",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    };
    expect(isCatalogEntryAvailableForAppUse(modelEntry)).toBe(true);
    expect(isCatalogExecutionEligible(modelEntry)).toBe(false);

    // Available but NOT execution-eligible (no published tag)
    const unpublished = {
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: [],
      config: { callable: true },
    };
    expect(isCatalogEntryAvailableForAppUse(unpublished)).toBe(true);
    expect(isCatalogExecutionEligible(unpublished)).toBe(false);
  });
});

// ============================================================================
// Contract: Catalog state label priority is consistent
// ============================================================================

describe("Runtime Contract — Label Priority", () => {
  it("rejected > deprecated > disabled > available > active > published > approved > candidate > not_imported", () => {
    // Rejected wins over everything
    expect(getCatalogState({ status: "active", reviewState: "rejected", tags: ["published"] }).label).toBe("rejected");

    // Deprecated wins over active
    expect(getCatalogState({ status: "deprecated", reviewState: "approved", tags: ["published"] }).label).toBe("deprecated");

    // Disabled wins over active
    expect(getCatalogState({ status: "disabled", reviewState: "approved", tags: ["published"] }).label).toBe("disabled");

    // Available = active + approved + published
    expect(getCatalogState({ status: "active", reviewState: "approved", tags: ["published"] }).label).toBe("available");

    // Active = active + approved (no published)
    expect(getCatalogState({ status: "active", reviewState: "approved", tags: [] }).label).toBe("active");

    // Published = draft + approved + published
    expect(getCatalogState({ status: "draft", reviewState: "approved", tags: ["published"] }).label).toBe("published");

    // Approved = draft + approved
    expect(getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate"] }).label).toBe("approved");

    // Candidate = draft + needs_review + candidate tag
    expect(getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] }).label).toBe("candidate");

    // Not imported = no meaningful state
    expect(getCatalogState({ status: "draft", reviewState: "needs_review", tags: [] }).label).toBe("not_imported");
  });
});
