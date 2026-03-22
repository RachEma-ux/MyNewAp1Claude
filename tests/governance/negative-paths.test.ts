/**
 * LAYER 7 — Negative Path Tests (Mandatory)
 *
 * These tests prove the system CORRECTLY REJECTS invalid operations.
 * Each test documents a specific bypass attempt that must fail.
 */

import { describe, it, expect } from "vitest";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../server/catalog/availability";
import { getCatalogState } from "../../shared/catalog-state";
import { isCatalogExecutionEligible, hasPublishedCatalogTag, isCatalogEntryCallable } from "../../shared/catalog-execution";
import { isDeployable as isModelDeployable } from "../../server/db/models";
import { isDeployable as isBotDeployable } from "../../server/db/bots";

// ============================================================================
// Negative: Draft asset shown in app selector → must fail
// ============================================================================

describe("Negative Path — Draft Asset in App Selector", () => {
  it("draft+needs_review entry is NOT available for app use", () => {
    expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "needs_review" })).toBe(false);
  });

  it("draft+approved entry is NOT available for app use", () => {
    expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "approved" })).toBe(false);
  });

  it("getCatalogState for draft returns non-available state", () => {
    const state = getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] });
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("CATALOG_AVAILABILITY_FILTERS would exclude draft entries in DB query", () => {
    const draftEntry = { status: "draft", reviewState: "approved" };
    const matches = draftEntry.status === CATALOG_AVAILABILITY_FILTERS.status &&
                    draftEntry.reviewState === CATALOG_AVAILABILITY_FILTERS.reviewState;
    expect(matches).toBe(false);
  });
});

// ============================================================================
// Negative: Blocked asset selected for Catalog intake → must fail
// ============================================================================

describe("Negative Path — Blocked Asset for Catalog Intake", () => {
  it("draft model is blocked from catalog import", () => {
    expect(isModelDeployable({ status: "draft", name: "m", displayName: "M", modelType: "llm" } as any)).toBe(false);
  });

  it("deprecated model is blocked from catalog import", () => {
    expect(isModelDeployable({ status: "deprecated", name: "m", displayName: "M", modelType: "llm" } as any)).toBe(false);
  });

  it("bot without channels is blocked from catalog import", () => {
    expect(isBotDeployable({ status: "configured", name: "b", channels: [] } as any)).toBe(false);
  });

  it("archived bot is blocked from catalog import", () => {
    expect(isBotDeployable({ status: "archived", name: "b", channels: ["web"] } as any)).toBe(false);
  });
});

// ============================================================================
// Negative: Rejected candidate activated → must fail
// ============================================================================

describe("Negative Path — Rejected Candidate Activation", () => {
  it("rejected entry is NEVER available regardless of status", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    for (const status of statuses) {
      expect(isCatalogEntryAvailableForAppUse({ status, reviewState: "rejected" })).toBe(false);
    }
  });

  it("rejected entry has correct blocking reasons", () => {
    const result = checkCatalogAvailability({ status: "active", reviewState: "rejected" });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.includes("rejected"))).toBe(true);
  });

  it("getCatalogState labels rejected entries correctly", () => {
    const state = getCatalogState({ status: "active", reviewState: "rejected", tags: ["candidate", "published"] });
    expect(state.label).toBe("rejected");
    expect(state.isAvailableForAppUse).toBe(false);
  });
});

// ============================================================================
// Negative: Inactive provider used in chat → must fail
// ============================================================================

describe("Negative Path — Inactive Provider in Chat", () => {
  it("deprecated provider fails availability check", () => {
    const result = checkCatalogAvailability({ status: "deprecated", reviewState: "approved" });
    expect(result.available).toBe(false);
  });

  it("disabled provider fails availability check", () => {
    const result = checkCatalogAvailability({ status: "disabled", reviewState: "approved" });
    expect(result.available).toBe(false);
  });

  it("draft provider fails availability check", () => {
    const result = checkCatalogAvailability({ status: "draft", reviewState: "approved" });
    expect(result.available).toBe(false);
  });

  it("provider with needs_review fails availability check", () => {
    const result = checkCatalogAvailability({ status: "active", reviewState: "needs_review" });
    expect(result.available).toBe(false);
  });
});

// ============================================================================
// Negative: Direct domain route simulates Catalog availability → must fail
// ============================================================================

describe("Negative Path — Domain Cannot Simulate Catalog Availability", () => {
  it("domain-level deployable status does NOT equal Catalog availability", () => {
    // A model can be "ready" (deployable) but NOT Catalog-available
    const modelDeployable = isModelDeployable({ status: "ready", name: "m", displayName: "M", modelType: "llm" } as any);
    expect(modelDeployable).toBe(true);

    // But without a Catalog entry, it's not available for app use
    const catalogState = getCatalogState(null);
    expect(catalogState.isAvailableForAppUse).toBe(false);
  });

  it("domain deployable + Catalog draft = still NOT available", () => {
    const catalogState = getCatalogState({
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });
    expect(catalogState.isAvailableForAppUse).toBe(false);
  });
});

// ============================================================================
// Negative: Agent execution without proper eligibility → must fail
// ============================================================================

describe("Negative Path — Agent Execution Eligibility", () => {
  it("non-agent type cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "bot", status: "active", reviewState: "approved",
      tags: ["published"], config: { callable: true },
    })).toBe(false);
  });

  it("agent without published tag cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent", status: "active", reviewState: "approved",
      tags: [], config: { callable: true },
    })).toBe(false);
  });

  it("agent with callable=false cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent", status: "active", reviewState: "approved",
      tags: ["published"], config: { callable: false },
    })).toBe(false);
  });

  it("agent with null config cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent", status: "active", reviewState: "approved",
      tags: ["published"], config: null,
    })).toBe(false);
  });
});

// ============================================================================
// Negative: Null/undefined edge cases
// ============================================================================

describe("Negative Path — Edge Cases", () => {
  it("null tags treated as empty — no crash", () => {
    const state = getCatalogState({ status: "active", reviewState: "approved", tags: null });
    expect(state.isCandidate).toBe(false);
    expect(state.isPublished).toBe(false);
    // Still available because tags don't affect availability
    expect(state.isAvailableForAppUse).toBe(true);
  });

  it("null status = not active = not available", () => {
    const state = getCatalogState({ status: null, reviewState: "approved", tags: [] });
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("null reviewState = not approved = not available", () => {
    const state = getCatalogState({ status: "active", reviewState: null, tags: [] });
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("hasPublishedCatalogTag handles null/undefined", () => {
    expect(hasPublishedCatalogTag(null)).toBe(false);
    expect(hasPublishedCatalogTag(undefined)).toBe(false);
    expect(hasPublishedCatalogTag([])).toBe(false);
  });

  it("isCatalogEntryCallable handles null/undefined", () => {
    expect(isCatalogEntryCallable(null)).toBe(false);
    expect(isCatalogEntryCallable(undefined)).toBe(false);
    expect(isCatalogEntryCallable({})).toBe(false);
  });
});
