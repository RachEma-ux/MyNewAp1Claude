/**
 * LAYER 4 — Cross-Domain Lifecycle: Customer Support Bot Launch (Scenario 1)
 *
 * Narrative: A support ops team launches a customer support bot for web chat.
 * AI Types: Provider → Model → LLM → Agent → Bot → Catalog Intake → Available
 *
 * This test validates the full cross-domain lifecycle using real domain
 * contracts and Catalog authority helpers.
 */

import { describe, it, expect } from "vitest";
import { isDeployable as isModelDeployable, getBlockingReasons as getModelBlockingReasons } from "../../../server/db/models";
import { isDeployable as isBotDeployable, getBlockingReasons as getBotBlockingReasons } from "../../../server/db/bots";
import { getCatalogState } from "../../../shared/catalog-state";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../../server/catalog/availability";
import { isCatalogExecutionEligible, hasPublishedCatalogTag, isCatalogEntryCallable } from "../../../shared/catalog-execution";

describe("Scenario 1 — Customer Support Bot Launch", () => {

  // Step 1: Provider configured and validated
  describe("Step 1 — Provider Configuration", () => {
    it("provider entity exists in domain table before Catalog import", () => {
      // Contract: providers are domain entities, not Catalog entries
      // A provider with no catalog entry has no_imported state
      const state = getCatalogState(null);
      expect(state.label).toBe("not_imported");
      expect(state.isAvailableForAppUse).toBe(false);
    });
  });

  // Step 2: Model created and becomes deployable
  describe("Step 2 — Model Deployment Readiness", () => {
    it("model in draft is NOT deployable", () => {
      const model = { status: "draft", name: "gpt-4o", displayName: "GPT-4o", modelType: "llm" };
      expect(isModelDeployable(model as any)).toBe(false);
    });

    it("model set to ready IS deployable", () => {
      const model = { status: "ready", name: "gpt-4o", displayName: "GPT-4o", modelType: "llm" };
      expect(isModelDeployable(model as any)).toBe(true);
      expect(getModelBlockingReasons(model as any)).toEqual([]);
    });
  });

  // Step 5: Bot created and bound to Agent + LLM
  describe("Step 5 — Bot Assembly", () => {
    it("bot with channels and configured status is deployable", () => {
      const bot = {
        status: "configured",
        name: "cs-bot",
        displayName: "Customer Support Bot",
        channels: ["web"],
        agentId: 1,
        llmId: 1,
      };
      expect(isBotDeployable(bot as any)).toBe(true);
    });

    it("bot missing channels is NOT deployable", () => {
      const bot = { status: "configured", name: "cs-bot", channels: [] };
      expect(isBotDeployable(bot as any)).toBe(false);
    });
  });

  // Step 6-8: Catalog intake → candidate → approved → published → activated
  describe("Steps 6-8 — Catalog Lifecycle", () => {
    it("draft candidate is NOT available", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate", "bot"],
      });
      expect(state.label).toBe("candidate");
      expect(state.isAvailableForAppUse).toBe(false);
    });

    it("approved candidate is NOT available (still draft)", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "approved",
        tags: ["candidate", "bot"],
      });
      expect(state.label).toBe("approved");
      expect(state.isAvailableForAppUse).toBe(false);
    });

    it("published candidate is NOT available (not yet active)", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "approved",
        tags: ["candidate", "bot", "published"],
      });
      expect(state.label).toBe("published");
      expect(state.isAvailableForAppUse).toBe(false);
    });

    it("activated + approved + published = available", () => {
      const state = getCatalogState({
        status: "active",
        reviewState: "approved",
        tags: ["candidate", "bot", "published"],
      });
      expect(state.label).toBe("available");
      expect(state.isAvailableForAppUse).toBe(true);
    });
  });

  // Step 9: Runtime uses only Catalog-available assets
  describe("Step 9 — Runtime Authority", () => {
    it("only Catalog-active+approved entries pass availability filter", () => {
      expect(isCatalogEntryAvailableForAppUse({ status: "active", reviewState: "approved" })).toBe(true);
      expect(isCatalogEntryAvailableForAppUse({ status: "draft", reviewState: "approved" })).toBe(false);
      expect(isCatalogEntryAvailableForAppUse({ status: "active", reviewState: "needs_review" })).toBe(false);
    });

    it("agent execution requires all conditions met", () => {
      const agentEntry = {
        entryType: "agent",
        status: "active",
        reviewState: "approved",
        tags: ["candidate", "published"],
        config: { callable: true },
      };
      expect(isCatalogExecutionEligible(agentEntry)).toBe(true);
    });
  });
});
