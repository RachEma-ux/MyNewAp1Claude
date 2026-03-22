/**
 * LAYER 4 — Cross-Domain Lifecycle: Bot Governance Failure (Scenario 4)
 *
 * Narrative: Team attempts to activate a bot before approval.
 * System must block the transition, audit must persist.
 * AI Types: Bot, Agent, LLM
 */

import { describe, it, expect } from "vitest";
import { isDeployable as isBotDeployable, getBlockingReasons as getBotBlockingReasons } from "../../../server/db/bots";
import { getCatalogState } from "../../../shared/catalog-state";
import { checkCatalogAvailability } from "../../../server/catalog/availability";

describe("Scenario 4 — Bot Governance Failure", () => {

  // Step 1: Bot is created
  describe("Step 1 — Bot Created", () => {
    it("bot starts in draft status", () => {
      const bot = { status: "draft", name: "cs-bot", channels: [] };
      expect(isBotDeployable(bot as any)).toBe(false);
    });
  });

  // Step 2: Candidate exists
  describe("Step 2 — Catalog Candidate", () => {
    it("candidate entry in draft+needs_review state", () => {
      const state = getCatalogState({
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate", "bot"],
      });
      expect(state.label).toBe("candidate");
      expect(state.isAvailableForAppUse).toBe(false);
    });
  });

  // Step 3: Team tries to activate before approval → BLOCKED
  describe("Step 3 — Activation Before Approval BLOCKED", () => {
    it("active status with needs_review is NOT available", () => {
      const result = checkCatalogAvailability({
        status: "active",
        reviewState: "needs_review",
      });
      expect(result.available).toBe(false);
      expect(result.reasons.length).toBe(1);
      expect(result.reasons[0]).toContain("review");
    });

    it("active status with rejected review is NOT available", () => {
      const result = checkCatalogAvailability({
        status: "active",
        reviewState: "rejected",
      });
      expect(result.available).toBe(false);
      expect(result.reasons[0]).toContain("rejected");
    });

    it("getCatalogState confirms blocked state", () => {
      // Active but not approved — should NOT show as available
      const state = getCatalogState({
        status: "active",
        reviewState: "needs_review",
        tags: ["candidate"],
      });
      expect(state.isAvailableForAppUse).toBe(false);
      expect(state.label).toBe("active"); // label says active, but isAvailableForAppUse is false
      expect(state.isApproved).toBe(false);
    });
  });

  // Step 4: System blocks transition
  describe("Step 4 — Transition Blocked", () => {
    it("blocking reasons explain why bot cannot be imported", () => {
      const draftBot = { status: "draft", name: "cs-bot", channels: [] };
      const reasons = getBotBlockingReasons(draftBot as any);
      expect(reasons.length).toBeGreaterThan(0);
    });

    it("all 11 invalid status/review combinations are blocked", () => {
      const statuses = ["draft", "active", "deprecated", "disabled"];
      const reviews = ["needs_review", "approved", "rejected"];

      for (const status of statuses) {
        for (const reviewState of reviews) {
          if (status === "active" && reviewState === "approved") continue;
          const result = checkCatalogAvailability({ status, reviewState });
          expect(result.available).toBe(false);
        }
      }
    });
  });

  // Step 6: After approval, activation succeeds
  describe("Step 6 — Correct Lifecycle", () => {
    it("approved + activated = available", () => {
      const result = checkCatalogAvailability({
        status: "active",
        reviewState: "approved",
      });
      expect(result.available).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("full lifecycle state progression is correct", () => {
      // Draft → candidate
      expect(getCatalogState({ status: "draft", reviewState: "needs_review", tags: ["candidate"] }).label).toBe("candidate");

      // Approved → approved
      expect(getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate"] }).label).toBe("approved");

      // Published → published
      expect(getCatalogState({ status: "draft", reviewState: "approved", tags: ["candidate", "published"] }).label).toBe("published");

      // Activated → available
      expect(getCatalogState({ status: "active", reviewState: "approved", tags: ["candidate", "published"] }).label).toBe("available");
    });
  });
});
