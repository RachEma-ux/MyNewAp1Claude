/**
 * LAYER 4 — Cross-Domain Lifecycle: Provider Rotation (Scenario 3)
 *
 * Narrative: Infra team rotates from old provider to new approved provider.
 * App consumers must only see Catalog-available provider.
 * AI Types: Providers, Models, LLMs
 */

import { describe, it, expect } from "vitest";
import { getCatalogState } from "../../../shared/catalog-state";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../../server/catalog/availability";

describe("Scenario 3 — Provider Rotation / Infra Upgrade", () => {

  // Provider A: exists but NOT active/approved
  describe("Provider A — Not Available", () => {
    it("provider A with draft status is not available for app use", () => {
      const providerA = getCatalogState({
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate"],
      });
      expect(providerA.isAvailableForAppUse).toBe(false);
    });

    it("provider A deprecated is not available", () => {
      const providerA = getCatalogState({
        status: "deprecated",
        reviewState: "approved",
        tags: ["candidate", "published"],
      });
      expect(providerA.isAvailableForAppUse).toBe(false);
      expect(providerA.label).toBe("deprecated");
    });
  });

  // Provider B: active + approved = available
  describe("Provider B — Catalog-Available", () => {
    it("provider B with active+approved IS available for app use", () => {
      const providerB = getCatalogState({
        status: "active",
        reviewState: "approved",
        tags: ["candidate", "published"],
      });
      expect(providerB.isAvailableForAppUse).toBe(true);
      expect(providerB.label).toBe("available");
    });
  });

  // App selectors expose only Provider B
  describe("App Selector Filtering", () => {
    it("CATALOG_AVAILABILITY_FILTERS selects only active+approved entries", () => {
      const entries = [
        { id: 1, status: "deprecated", reviewState: "approved", name: "provider-a" },
        { id: 2, status: "active", reviewState: "approved", name: "provider-b" },
        { id: 3, status: "draft", reviewState: "needs_review", name: "provider-c" },
      ];

      const available = entries.filter(
        (e) => e.status === CATALOG_AVAILABILITY_FILTERS.status &&
               e.reviewState === CATALOG_AVAILABILITY_FILTERS.reviewState
      );

      expect(available.length).toBe(1);
      expect(available[0].name).toBe("provider-b");
    });
  });

  // Chat/runtime rejects Provider A
  describe("Runtime Rejection", () => {
    it("deprecated provider is rejected by availability check", () => {
      const result = checkCatalogAvailability({ status: "deprecated", reviewState: "approved" });
      expect(result.available).toBe(false);
      expect(result.reasons.some((r) => r.includes("deprecated"))).toBe(true);
    });

    it("inactive provider is rejected by availability check", () => {
      const result = checkCatalogAvailability({ status: "draft", reviewState: "approved" });
      expect(result.available).toBe(false);
    });
  });

  // No stale/duplicate provider linkage
  describe("No Stale Linkage", () => {
    it("catalog state correctly identifies inactive providers", () => {
      const staleProvider = getCatalogState({
        status: "disabled",
        reviewState: "approved",
        tags: ["candidate"],
      });
      expect(staleProvider.label).toBe("disabled");
      expect(staleProvider.isAvailableForAppUse).toBe(false);
    });
  });
});
