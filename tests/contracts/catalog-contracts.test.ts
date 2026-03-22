/**
 * LAYER 1 — Catalog Contract Tests
 *
 * Invariant: Catalog OWNS intake, candidate creation, review, publish, activate.
 *            Source domains import INTO Catalog — Catalog does NOT pull FROM domains.
 *            Approval, publishing, activation gates are enforced.
 *
 * Tested through: shared helpers, DB functions, router exports
 */

import { describe, it, expect } from "vitest";
import { getCatalogState, type CatalogStateResult } from "../../shared/catalog-state";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../server/catalog/availability";
import { isCatalogExecutionEligible, hasPublishedCatalogTag, isCatalogEntryCallable } from "../../shared/catalog-execution";

// ============================================================================
// Contract: Catalog state derivation is consistent and deterministic
// ============================================================================

describe("Catalog Contract — State Derivation", () => {
  it("null entry always returns not_imported", () => {
    const state = getCatalogState(null);
    expect(state.label).toBe("not_imported");
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("candidate tag required for candidate label", () => {
    const withTag = getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] });
    expect(withTag.label).toBe("candidate");

    const withoutTag = getCatalogState({ status: "draft", reviewState: "needs_review", tags: [] });
    expect(withoutTag.label).toBe("not_imported");
  });

  it("approved requires reviewState=approved", () => {
    const approved = getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate"] });
    expect(approved.isApproved).toBe(true);
    expect(approved.label).toBe("approved");

    const notApproved = getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] });
    expect(notApproved.isApproved).toBe(false);
  });

  it("published requires published tag", () => {
    const published = getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate", "published"] });
    expect(published.isPublished).toBe(true);
    expect(published.label).toBe("published");
  });

  it("active requires status=active", () => {
    const active = getCatalogState({ status: "active", reviewState: "approved", tags: [] });
    expect(active.isActive).toBe(true);
    expect(active.label).toBe("active");
  });

  it("available = active + approved + published", () => {
    const available = getCatalogState({ status: "active", reviewState: "approved", tags: ["published"] });
    expect(available.label).toBe("available");
    expect(available.isAvailableForAppUse).toBe(true);
  });

  it("rejected overrides all other states", () => {
    const rejected = getCatalogState({ status: "active", reviewState: "rejected", tags: ["published"] });
    expect(rejected.label).toBe("rejected");
    expect(rejected.isAvailableForAppUse).toBe(false);
  });

  it("deprecated overrides active state", () => {
    const deprecated = getCatalogState({ status: "deprecated", reviewState: "approved", tags: ["published"] });
    expect(deprecated.label).toBe("deprecated");
    expect(deprecated.isAvailableForAppUse).toBe(false);
  });

  it("disabled overrides active state", () => {
    const disabled = getCatalogState({ status: "disabled", reviewState: "approved", tags: ["published"] });
    expect(disabled.label).toBe("disabled");
    expect(disabled.isAvailableForAppUse).toBe(false);
  });
});

// ============================================================================
// Contract: Availability rule is singular and authoritative
// ============================================================================

describe("Catalog Contract — Availability Authority", () => {
  it("CATALOG_AVAILABILITY_FILTERS defines exactly status=active, reviewState=approved", () => {
    expect(CATALOG_AVAILABILITY_FILTERS.status).toBe("active");
    expect(CATALOG_AVAILABILITY_FILTERS.reviewState).toBe("approved");
    expect(Object.keys(CATALOG_AVAILABILITY_FILTERS)).toEqual(["status", "reviewState"]);
  });

  it("isCatalogEntryAvailableForAppUse matches CATALOG_AVAILABILITY_FILTERS", () => {
    // The boolean shortcut must agree with the filter constants
    expect(isCatalogEntryAvailableForAppUse({ status: "active", reviewState: "approved" })).toBe(true);
    expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "approved" })).toBe(false);
    expect(isCatalogEntryAvailableForAppUse({ status: "active", reviewState: "needs_review" })).toBe(false);
  });

  it("checkCatalogAvailability returns reasons for every blocking condition", () => {
    const bothBlocked = checkCatalogAvailability({ status: "draft", reviewState: "needs_review" });
    expect(bothBlocked.available).toBe(false);
    expect(bothBlocked.reasons.length).toBe(2);

    const statusBlocked = checkCatalogAvailability({ status: "deprecated", reviewState: "approved" });
    expect(statusBlocked.available).toBe(false);
    expect(statusBlocked.reasons.length).toBe(1);

    const reviewBlocked = checkCatalogAvailability({ status: "active", reviewState: "rejected" });
    expect(reviewBlocked.available).toBe(false);
    expect(reviewBlocked.reasons.length).toBe(1);

    const available = checkCatalogAvailability({ status: "active", reviewState: "approved" });
    expect(available.available).toBe(true);
    expect(available.reasons).toEqual([]);
  });

  it("exhaustive 4×3 matrix: exactly ONE valid combination", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    const reviewStates = ["needs_review", "approved", "rejected"];
    let validCount = 0;

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        const result = isCatalogEntryAvailableForAppUse({ status, reviewState });
        if (result) validCount++;
      }
    }

    expect(validCount).toBe(1); // ONLY active+approved
  });
});

// ============================================================================
// Contract: Catalog execution eligibility gates
// ============================================================================

describe("Catalog Contract — Execution Eligibility", () => {
  it("hasPublishedCatalogTag checks for published in tags array", () => {
    expect(hasPublishedCatalogTag(["published"])).toBe(true);
    expect(hasPublishedCatalogTag(["candidate", "published"])).toBe(true);
    expect(hasPublishedCatalogTag(["candidate"])).toBe(false);
    expect(hasPublishedCatalogTag([])).toBe(false);
    expect(hasPublishedCatalogTag(null)).toBe(false);
    expect(hasPublishedCatalogTag(undefined)).toBe(false);
  });

  it("isCatalogEntryCallable requires callable=true in config", () => {
    expect(isCatalogEntryCallable({ callable: true })).toBe(true);
    expect(isCatalogEntryCallable({ callable: false })).toBe(false);
    expect(isCatalogEntryCallable({})).toBe(false);
    expect(isCatalogEntryCallable(null)).toBe(false);
    expect(isCatalogEntryCallable(undefined)).toBe(false);
  });

  it("isCatalogExecutionEligible requires all 4 conditions", () => {
    // All conditions met
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    })).toBe(true);

    // Missing entryType=agent
    expect(isCatalogExecutionEligible({
      entryType: "model",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);

    // Missing active status
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "draft",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);

    // Missing approval
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "needs_review",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);

    // Missing published tag
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["candidate"],
      config: { callable: true },
    })).toBe(false);

    // Missing callable
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: false },
    })).toBe(false);
  });
});

// ============================================================================
// Contract: Catalog DB functions exist and follow patterns
// ============================================================================

describe("Catalog Contract — DB Functions", () => {
  it("catalog DB module exports all required CRUD operations", async () => {
    const catalog = await import("../../server/db/catalog");
    expect(typeof catalog.getCatalogEntries).toBe("function");
    expect(typeof catalog.getCatalogEntryById).toBe("function");
    expect(typeof catalog.createCatalogEntry).toBe("function");
    expect(typeof catalog.updateCatalogEntry).toBe("function");
    expect(typeof catalog.approveCatalogEntry).toBe("function");
    expect(typeof catalog.deleteCatalogEntry).toBe("function");
    expect(typeof catalog.createPublishBundle).toBe("function");
    expect(typeof catalog.getActiveBundleForEntry).toBe("function");
    expect(typeof catalog.createCatalogAuditEvent).toBe("function");
  });
});
