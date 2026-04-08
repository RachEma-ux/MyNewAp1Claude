/**
 * Runtime Integration Tests — Governance Authority Enforcement
 *
 * Validates that:
 *   1. The availability authority cannot be bypassed
 *   2. The CATALOG_AVAILABILITY_FILTERS constant is the single source of truth
 *   3. The availability check functions are consistent with each other
 *   4. Edge cases are handled correctly (null, undefined, empty string)
 *   5. Governance violations always fail
 */

import { describe, it, expect } from "vitest";
import {
  checkCatalogAvailability,
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
  type CatalogAvailabilityInput,
  type CatalogAvailabilityResult,
} from "../../../server/ai-types/availability";

// ============================================================================
// Authority Consistency
// ============================================================================

describe("Governance Authority — Consistency", () => {
  it("CATALOG_AVAILABILITY_FILTERS matches isCatalogEntryAvailableForAppUse logic", () => {
    const entry: CatalogAvailabilityInput = {
      status: CATALOG_AVAILABILITY_FILTERS.status,
      reviewState: CATALOG_AVAILABILITY_FILTERS.reviewState,
    };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);
    expect(checkCatalogAvailability(entry).available).toBe(true);
  });

  it("both functions agree on every possible state combination", () => {
    const statuses = ["draft", "active", "deprecated", "disabled", "validating", "publishing", null, ""];
    const reviewStates = ["needs_review", "approved", "rejected", null, ""];

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        const entry = { status, reviewState } as CatalogAvailabilityInput;
        const boolResult = isCatalogEntryAvailableForAppUse(entry);
        const fullResult = checkCatalogAvailability(entry);

        expect(boolResult).toBe(fullResult.available);
      }
    }
  });

  it("checkCatalogAvailability always returns reasons when not available", () => {
    const statuses = ["draft", "active", "deprecated", "disabled", null, ""];
    const reviewStates = ["needs_review", "approved", "rejected", null, ""];

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        const entry = { status, reviewState } as CatalogAvailabilityInput;
        const result = checkCatalogAvailability(entry);

        if (!result.available) {
          expect(result.reasons.length).toBeGreaterThan(0);
        } else {
          expect(result.reasons).toEqual([]);
        }
      }
    }
  });
});

// ============================================================================
// Edge Cases — Null / Undefined / Empty
// ============================================================================

describe("Governance Authority — Edge cases", () => {
  it("null status is NOT available", () => {
    const entry = { status: null, reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("null reviewState is NOT available", () => {
    const entry = { status: "active", reviewState: null };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("both null is NOT available", () => {
    const entry = { status: null, reviewState: null };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
    const result = checkCatalogAvailability(entry);
    expect(result.reasons.length).toBe(2);
  });

  it("empty string status is NOT available", () => {
    const entry = { status: "", reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("empty string reviewState is NOT available", () => {
    const entry = { status: "active", reviewState: "" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("transient statuses (validating, publishing) are NOT available", () => {
    for (const transient of ["validating", "publishing"]) {
      const entry = { status: transient, reviewState: "approved" };
      expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
    }
  });
});

// ============================================================================
// Bypass Prevention — Governance Cannot Be Circumvented
// ============================================================================

describe("Governance Authority — Bypass prevention", () => {
  it("cannot become available by setting only status", () => {
    const entry = { status: "active", reviewState: "needs_review" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("cannot become available by setting only reviewState", () => {
    const entry = { status: "draft", reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("there is exactly one state combination that is available", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    const reviewStates = ["needs_review", "approved", "rejected"];

    let availableCount = 0;
    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        if (isCatalogEntryAvailableForAppUse({ status, reviewState })) {
          availableCount++;
        }
      }
    }

    expect(availableCount).toBe(1); // Only active+approved
  });

  it("the single available combination matches CATALOG_AVAILABILITY_FILTERS", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    const reviewStates = ["needs_review", "approved", "rejected"];

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        const isAvailable = isCatalogEntryAvailableForAppUse({ status, reviewState });
        const matchesFilter =
          status === CATALOG_AVAILABILITY_FILTERS.status &&
          reviewState === CATALOG_AVAILABILITY_FILTERS.reviewState;
        expect(isAvailable).toBe(matchesFilter);
      }
    }
  });
});

// ============================================================================
// Lifecycle Transition Safety
// ============================================================================

describe("Governance Authority — Lifecycle transitions", () => {
  it("deprecating an active entry removes availability", () => {
    const entry = { status: "active", reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    entry.status = "deprecated";
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("disabling an active entry removes availability", () => {
    const entry = { status: "active", reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    entry.status = "disabled";
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("rejecting an approved entry removes availability", () => {
    const entry = { status: "active", reviewState: "approved" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    entry.reviewState = "rejected";
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("re-approving a rejected entry restores availability (if still active)", () => {
    const entry = { status: "active", reviewState: "rejected" };
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);

    entry.reviewState = "approved";
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);
  });
});
