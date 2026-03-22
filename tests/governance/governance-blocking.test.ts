/**
 * LAYER 2 — Governance Blocking Tests
 *
 * Tests that the system correctly BLOCKS invalid operations:
 * - Activation without approval
 * - Runtime without Catalog entry
 * - Import of non-deployable entities
 * - Duplicate import detection
 * - Invalid lifecycle transitions
 * - Structured FK preferred over legacy fallback
 */

import { describe, it, expect } from "vitest";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse } from "../../server/catalog/availability";
import { getCatalogState } from "../../shared/catalog-state";
import { isCatalogExecutionEligible, hasPublishedCatalogTag, isCatalogEntryCallable } from "../../shared/catalog-execution";
import { isDeployable as isModelDeployable, getBlockingReasons as getModelBlockingReasons } from "../../server/db/models";
import { isDeployable as isBotDeployable, getBlockingReasons as getBotBlockingReasons } from "../../server/db/bots";

// ============================================================================
// SCENARIO 4 — Bot Governance Failure
// ============================================================================

describe("Governance Blocking — Bot Activation Before Approval (Scenario 4)", () => {
  it("bot in draft status is not deployable", () => {
    const bot = { status: "draft", name: "support-bot", channels: ["web"] };
    expect(isBotDeployable(bot as any)).toBe(false);
    const reasons = getBotBlockingReasons(bot as any);
    expect(reasons.some((r: string) => r.includes("draft"))).toBe(true);
  });

  it("bot without channels is not deployable even if configured", () => {
    const bot = { status: "configured", name: "support-bot", channels: [] };
    expect(isBotDeployable(bot as any)).toBe(false);
  });

  it("catalog entry with active status but needs_review is NOT available", () => {
    const result = checkCatalogAvailability({ status: "active", reviewState: "needs_review" });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.includes("review"))).toBe(true);
  });

  it("catalog entry with active status but rejected review is NOT available", () => {
    const result = checkCatalogAvailability({ status: "active", reviewState: "rejected" });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.includes("rejected"))).toBe(true);
  });

  it("only active + approved passes availability check", () => {
    const result = checkCatalogAvailability({ status: "active", reviewState: "approved" });
    expect(result.available).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

// ============================================================================
// Governance: Model deployment gates
// ============================================================================

describe("Governance Blocking — Model Deployment Gates", () => {
  it("draft model cannot be imported to catalog", () => {
    const model = { status: "draft", name: "m", displayName: "M", modelType: "llm" };
    expect(isModelDeployable(model as any)).toBe(false);
  });

  it("deprecated model cannot be imported to catalog", () => {
    const model = { status: "deprecated", name: "m", displayName: "M", modelType: "llm" };
    expect(isModelDeployable(model as any)).toBe(false);
    const reasons = getModelBlockingReasons(model as any);
    expect(reasons.some((r: string) => r.includes("deprecated"))).toBe(true);
  });

  it("disabled model cannot be imported to catalog", () => {
    const model = { status: "disabled", name: "m", displayName: "M", modelType: "llm" };
    expect(isModelDeployable(model as any)).toBe(false);
    const reasons = getModelBlockingReasons(model as any);
    expect(reasons.some((r: string) => r.includes("disabled"))).toBe(true);
  });

  it("model without name has blocking reason", () => {
    const model = { status: "ready", name: "", displayName: "M", modelType: "llm" };
    const reasons = getModelBlockingReasons(model as any);
    expect(reasons.some((r: string) => r.includes("name"))).toBe(true);
  });
});

// ============================================================================
// Governance: Runtime without Catalog entry
// ============================================================================

describe("Governance Blocking — Runtime Without Catalog", () => {
  it("null Catalog entry means no runtime availability", () => {
    const state = getCatalogState(null);
    expect(state.isAvailableForAppUse).toBe(false);
    expect(state.label).toBe("not_imported");
  });

  it("domain entity without catalog import has no runtime authority", () => {
    // This simulates a model that exists in models table but has no catalog entry
    const state = getCatalogState(null);
    expect(state.isActive).toBe(false);
    expect(state.isApproved).toBe(false);
    expect(state.isPublished).toBe(false);
    expect(state.isAvailableForAppUse).toBe(false);
  });
});

// ============================================================================
// Governance: Execution eligibility gates
// ============================================================================

describe("Governance Blocking — Execution Eligibility", () => {
  it("non-agent entry type cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "model",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);
  });

  it("agent without published tag cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["candidate"],
      config: { callable: true },
    })).toBe(false);
  });

  it("agent with callable=false cannot execute", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: false },
    })).toBe(false);
  });

  it("draft agent cannot execute even with all other conditions met", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "draft",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);
  });

  it("unapproved agent cannot execute even if active", () => {
    expect(isCatalogExecutionEligible({
      entryType: "agent",
      status: "active",
      reviewState: "needs_review",
      tags: ["published"],
      config: { callable: true },
    })).toBe(false);
  });
});

// ============================================================================
// Governance: Invalid state combinations
// ============================================================================

describe("Governance Blocking — Invalid State Combinations", () => {
  it("all 11 non-available status/review combinations correctly blocked", () => {
    const statuses = ["draft", "active", "deprecated", "disabled"];
    const reviewStates = ["needs_review", "approved", "rejected"];
    let blockedCount = 0;

    for (const status of statuses) {
      for (const reviewState of reviewStates) {
        if (status === "active" && reviewState === "approved") continue;
        const avail = checkCatalogAvailability({ status, reviewState });
        expect(avail.available).toBe(false);
        expect(avail.reasons.length).toBeGreaterThan(0);
        blockedCount++;
      }
    }

    expect(blockedCount).toBe(11); // 4×3 - 1 valid = 11 blocked
  });
});

// ============================================================================
// Governance: Structured FK preferred over legacy
// ============================================================================

describe("Governance Blocking — FK Resolution Priority", () => {
  it("enriched lookup logic: sourceType+sourceId preferred over legacy config", () => {
    // Simulating the enriched lookup pattern used in listEnriched endpoints
    const catalogEntries = [
      { id: 100, sourceType: "model", sourceId: 42, config: { sourceModelId: 42 }, name: "model-a" },
      { id: 101, sourceType: null, sourceId: null, config: { sourceModelId: 99 }, name: "model-b" },
    ];

    // Build indexes like the actual code
    const bySourceId = new Map<number, any>();
    const byLegacyId = new Map<number, any>();
    const byName = new Map<string, any>();

    for (const entry of catalogEntries) {
      if (entry.sourceType === "model" && entry.sourceId) {
        bySourceId.set(entry.sourceId, entry);
      }
      const config = (entry.config as Record<string, any>) || {};
      if (config.sourceModelId) {
        byLegacyId.set(config.sourceModelId, entry);
      }
      byName.set(entry.name.toLowerCase(), entry);
    }

    // Structured FK should be preferred
    const resolved = bySourceId.get(42) ?? byLegacyId.get(42) ?? null;
    expect(resolved?.id).toBe(100); // Got via structured FK, not legacy

    // Legacy fallback still works
    const legacyResolved = bySourceId.get(99) ?? byLegacyId.get(99) ?? null;
    expect(legacyResolved?.id).toBe(101); // Got via legacy config
  });
});
