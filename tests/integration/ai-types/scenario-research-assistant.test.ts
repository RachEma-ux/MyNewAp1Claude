/**
 * LAYER 4 — Cross-Domain Lifecycle: Internal Research Assistant (Scenario 2)
 *
 * Narrative: Research team creates an LLM, evaluates it, uses it only after
 * Catalog governance completes.
 * AI Types: Model → LLM → Agent (runtime blocked before Catalog authority)
 */

import { describe, it, expect } from "vitest";
import { isDeployable as isModelDeployable } from "../../../server/db/models";
import { getCatalogState } from "../../../shared/catalog-state";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse } from "../../../server/ai-types/availability";

describe("Scenario 2 — Internal Research Assistant Rollout", () => {

  // Step 1: Model exists as source-domain entity
  describe("Step 1 — Model Domain Entity", () => {
    it("model exists in domain with draft status", () => {
      expect(isModelDeployable({ status: "draft", name: "research-llm", displayName: "Research LLM", modelType: "llm" } as any)).toBe(false);
    });

    it("model becomes ready = deployable", () => {
      expect(isModelDeployable({ status: "ready", name: "research-llm", displayName: "Research LLM", modelType: "llm" } as any)).toBe(true);
    });
  });

  // Step 3: LLM becomes deployable
  describe("Step 3 — LLM Deployable", () => {
    it("LLM without catalog entry is not available for runtime", () => {
      const state = getCatalogState(null);
      expect(state.label).toBe("not_imported");
      expect(state.isAvailableForAppUse).toBe(false);
    });
  });

  // Steps 4-6: Catalog intake and lifecycle
  describe("Steps 4-6 — Catalog Intake and Approval", () => {
    it("LLM catalog candidate is not available", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate", "catalog-import"],
      });
      expect(state.isAvailableForAppUse).toBe(false);
    });

    it("approved LLM candidate is still not available (draft status)", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "approved",
        tags: ["candidate", "registered"],
      });
      expect(state.isApproved).toBe(true);
      expect(state.isAvailableForAppUse).toBe(false);
    });

    it("published + approved + activated = available", () => {
      const state = getCatalogState({
        status: "active",
        reviewState: "approved",
        tags: ["candidate", "registered", "published"],
      });
      expect(state.label).toBe("available");
      expect(state.isAvailableForAppUse).toBe(true);
    });
  });

  // Step 7: Runtime blocked before Catalog authority
  describe("Step 7 — Runtime Authority Gate", () => {
    it("runtime is BLOCKED before Catalog import", () => {
      expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "needs_review" })).toBe(false);
    });

    it("runtime is BLOCKED after import but before approval", () => {
      expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "needs_review" })).toBe(false);
    });

    it("runtime is BLOCKED after approval but before activation", () => {
      expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "approved" })).toBe(false);
    });

    it("runtime is ALLOWED only after activation + approval", () => {
      expect(isCatalogEntryAvailableForAppUse({ status: "active", reviewState: "approved" })).toBe(true);
    });
  });

  // Source selector vs Catalog selector separation
  describe("Selector Separation", () => {
    it("catalog-import mode filters deployable entities for intake", () => {
      // This verifies the contract that intake selectors show only
      // deployable entities, while app selectors show only Catalog-available
      const deployableModel = { status: "ready", name: "m", displayName: "M", modelType: "llm" };
      expect(isModelDeployable(deployableModel as any)).toBe(true);

      // But deployment readiness != Catalog availability
      const state = getCatalogState(null); // no catalog entry yet
      expect(state.isAvailableForAppUse).toBe(false);
    });
  });
});
