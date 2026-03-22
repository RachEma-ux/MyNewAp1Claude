/**
 * Runtime Integration Tests — Unified Catalog State
 *
 * Validates the shared getCatalogState() helper returns consistent
 * state across all domains and lifecycle stages.
 */

import { describe, it, expect } from "vitest";
import { getCatalogState, getCatalogStateForDomainEntity, type CatalogStateResult } from "../../../shared/catalog-state";

// ============================================================================
// getCatalogState — Basic states
// ============================================================================

describe("getCatalogState — Lifecycle labels", () => {
  it("null entry returns not_imported", () => {
    const state = getCatalogState(null);
    expect(state.label).toBe("not_imported");
    expect(state.isCandidate).toBe(false);
    expect(state.isApproved).toBe(false);
    expect(state.isPublished).toBe(false);
    expect(state.isActive).toBe(false);
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("fresh candidate returns candidate", () => {
    const state = getCatalogState({
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });
    expect(state.label).toBe("candidate");
    expect(state.isCandidate).toBe(true);
    expect(state.isApproved).toBe(false);
  });

  it("approved draft returns approved", () => {
    const state = getCatalogState({
      status: "draft",
      reviewState: "approved",
      tags: ["candidate", "registered"],
    });
    expect(state.label).toBe("approved");
    expect(state.isApproved).toBe(true);
    expect(state.isActive).toBe(false);
  });

  it("published but not active returns published", () => {
    const state = getCatalogState({
      status: "draft",
      reviewState: "approved",
      tags: ["candidate", "registered", "published"],
    });
    expect(state.label).toBe("published");
    expect(state.isPublished).toBe(true);
    expect(state.isActive).toBe(false);
  });

  it("active + approved returns active", () => {
    const state = getCatalogState({
      status: "active",
      reviewState: "approved",
      tags: ["candidate", "registered"],
    });
    expect(state.label).toBe("active");
    expect(state.isActive).toBe(true);
    expect(state.isAvailableForAppUse).toBe(true);
  });

  it("active + approved + published returns available", () => {
    const state = getCatalogState({
      status: "active",
      reviewState: "approved",
      tags: ["candidate", "registered", "validated", "published"],
    });
    expect(state.label).toBe("available");
    expect(state.isActive).toBe(true);
    expect(state.isPublished).toBe(true);
    expect(state.isAvailableForAppUse).toBe(true);
  });

  it("rejected returns rejected regardless of status", () => {
    const state = getCatalogState({
      status: "active",
      reviewState: "rejected",
      tags: ["candidate"],
    });
    expect(state.label).toBe("rejected");
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("deprecated returns deprecated", () => {
    const state = getCatalogState({
      status: "deprecated",
      reviewState: "approved",
      tags: ["candidate", "registered", "published"],
    });
    expect(state.label).toBe("deprecated");
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("disabled returns disabled", () => {
    const state = getCatalogState({
      status: "disabled",
      reviewState: "approved",
      tags: ["candidate"],
    });
    expect(state.label).toBe("disabled");
    expect(state.isAvailableForAppUse).toBe(false);
  });
});

// ============================================================================
// isAvailableForAppUse — Consistency with availability.ts
// ============================================================================

describe("getCatalogState — Availability consistency", () => {
  it("isAvailableForAppUse = true ONLY when active + approved", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    const reviewStates = ["needs_review", "approved", "rejected"];

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        const state = getCatalogState({ status, reviewState, tags: [] });
        const expected = status === "active" && reviewState === "approved";
        expect(state.isAvailableForAppUse).toBe(expected);
      }
    }
  });
});

// ============================================================================
// getCatalogStateForDomainEntity — Wrapper
// ============================================================================

describe("getCatalogStateForDomainEntity", () => {
  it("delegates to getCatalogState", () => {
    const result = getCatalogStateForDomainEntity({
      status: "active",
      reviewState: "approved",
      tags: ["published"],
    });
    expect(result.label).toBe("available");
    expect(result.isAvailableForAppUse).toBe(true);
  });

  it("null returns not_imported", () => {
    const result = getCatalogStateForDomainEntity(null);
    expect(result.label).toBe("not_imported");
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("getCatalogState — Edge cases", () => {
  it("empty tags array doesn't crash", () => {
    const state = getCatalogState({ status: "active", reviewState: "approved", tags: [] });
    expect(state.isCandidate).toBe(false);
    expect(state.isPublished).toBe(false);
    expect(state.isAvailableForAppUse).toBe(true);
  });

  it("null tags treated as empty", () => {
    const state = getCatalogState({ status: "active", reviewState: "approved", tags: null });
    expect(state.isCandidate).toBe(false);
    expect(state.isAvailableForAppUse).toBe(true);
  });

  it("null status treated as non-active", () => {
    const state = getCatalogState({ status: null, reviewState: "approved", tags: [] });
    expect(state.isActive).toBe(false);
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("null reviewState treated as non-approved", () => {
    const state = getCatalogState({ status: "active", reviewState: null, tags: [] });
    expect(state.isApproved).toBe(false);
    expect(state.isAvailableForAppUse).toBe(false);
  });
});
