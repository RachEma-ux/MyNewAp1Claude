/**
 * HR Phase 9 Tests — Operationalization, Observability, and Maintainability
 *
 * Covers:
 * A. Nav drift detection against frozen baseline
 * B. Nav health summary and section completion stats
 * C. Dead-end detection and deferred analysis
 * D. Backend domain constant consistency
 * E. Observability event tracking (unit)
 * F. Maintainability helpers (implementation breakdown, domain validation)
 * G. Baseline integrity (frozen snapshot matches current config)
 * H. Phase 9 feature flags and version
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Nav Drift Detection Against Frozen Baseline
// ============================================================================

describe("HR Phase 9 — Drift Detection", () => {
  it("getNavConfigDigest returns correct shape", async () => {
    const { getNavConfigDigest } = await import("../../../client/src/config/hrNavConfigValidator");
    const digest = getNavConfigDigest();

    expect(digest.totalSections).toBeGreaterThan(0);
    expect(digest.totalItems).toBeGreaterThan(0);
    expect(digest.sectionIds).toBeInstanceOf(Array);
    expect(digest.sectionIds.length).toBe(digest.totalSections);
    expect(typeof digest.liveCount).toBe("number");
    expect(typeof digest.placeholderCount).toBe("number");
    expect(typeof digest.notStartedCount).toBe("number");
    expect(typeof digest.aliasCount).toBe("number");
    expect(typeof digest.maskingCount).toBe("number");
    expect(typeof digest.auditCount).toBe("number");
  });

  it("detectConfigDrift returns empty array when compared to current digest", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import(
      "../../../client/src/config/hrNavConfigValidator"
    );
    const current = getNavConfigDigest();
    const drifts = detectConfigDrift(current);
    expect(drifts).toHaveLength(0);
  });

  it("detectConfigDrift detects section count changes", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import(
      "../../../client/src/config/hrNavConfigValidator"
    );
    const baseline = { ...getNavConfigDigest(), totalSections: 10 };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.some((d) => d.includes("Section count changed"))).toBe(true);
  });

  it("detectConfigDrift detects item count changes", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import(
      "../../../client/src/config/hrNavConfigValidator"
    );
    const baseline = { ...getNavConfigDigest(), totalItems: 50 };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.some((d) => d.includes("Item count changed"))).toBe(true);
  });

  it("detectConfigDrift detects removed sections", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import(
      "../../../client/src/config/hrNavConfigValidator"
    );
    const baseline = {
      ...getNavConfigDigest(),
      sectionIds: [...getNavConfigDigest().sectionIds, "fake-section"],
    };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.some((d) => d.includes("Section removed: fake-section"))).toBe(true);
  });

  it("current config matches frozen baseline", async () => {
    const { getNavConfigDigest } = await import("../../../client/src/config/hrNavConfigValidator");
    const { HR_NAV_BASELINE } = await import("../../../client/src/config/hrNavBaseline");
    const current = getNavConfigDigest();

    expect(current.totalSections).toBe(HR_NAV_BASELINE.totalSections);
    expect(current.totalItems).toBe(HR_NAV_BASELINE.totalItems);
    expect(current.liveCount).toBe(HR_NAV_BASELINE.liveCount);
    expect(current.placeholderCount).toBe(HR_NAV_BASELINE.placeholderCount);
    expect(current.notStartedCount).toBe(HR_NAV_BASELINE.notStartedCount);
    expect(current.aliasCount).toBe(HR_NAV_BASELINE.aliasCount);
    expect(current.maskingCount).toBe(HR_NAV_BASELINE.maskingCount);
    expect(current.auditCount).toBe(HR_NAV_BASELINE.auditCount);
    expect(current.sectionIds).toEqual(HR_NAV_BASELINE.sectionIds);
  });

  it("checkBaselineDrift returns no drift against frozen baseline", async () => {
    const { checkBaselineDrift } = await import("../../../client/src/config/hrNavConfigValidator");
    const { HR_NAV_BASELINE } = await import("../../../client/src/config/hrNavBaseline");
    const result = checkBaselineDrift(HR_NAV_BASELINE);
    expect(result.drifted).toBe(false);
    expect(result.drifts).toHaveLength(0);
  });
});

// ============================================================================
// B. Nav Health Summary and Section Completion Stats
// ============================================================================

describe("HR Phase 9 — Health Summary", () => {
  it("getNavHealthSummary returns valid structure", async () => {
    const { getNavHealthSummary } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();

    expect(typeof summary.valid).toBe("boolean");
    expect(typeof summary.errorCount).toBe("number");
    expect(typeof summary.warningCount).toBe("number");
    expect(typeof summary.overallCompletionPct).toBe("number");
    expect(typeof summary.sectionsComplete).toBe("number");
    expect(typeof summary.sectionsPartial).toBe("number");
    expect(typeof summary.sectionsEmpty).toBe("number");
    expect(typeof summary.deadEndCount).toBe("number");
    expect(summary.sections).toBeInstanceOf(Array);
    expect(summary.sections).toHaveLength(13);
  });

  it("health summary reports valid=true (no errors)", async () => {
    const { getNavHealthSummary } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();
    expect(summary.valid).toBe(true);
    expect(summary.errorCount).toBe(0);
  });

  it("overall completion percentage is between 0 and 100", async () => {
    const { getNavHealthSummary } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();
    expect(summary.overallCompletionPct).toBeGreaterThanOrEqual(0);
    expect(summary.overallCompletionPct).toBeLessThanOrEqual(100);
  });

  it("section completion stats have correct totals", async () => {
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();
    expect(stats).toHaveLength(13);

    for (const stat of stats) {
      expect(stat.totalItems).toBeGreaterThan(0);
      expect(stat.liveItems + stat.placeholderItems + stat.notStartedItems).toBeLessThanOrEqual(stat.totalItems);
      expect(stat.completionPct).toBeGreaterThanOrEqual(0);
      expect(stat.completionPct).toBeLessThanOrEqual(100);
    }
  });

  it("time-attendance section is 100% complete", async () => {
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();
    const timeSection = stats.find((s) => s.sectionId === "time-attendance");
    expect(timeSection).toBeTruthy();
    expect(timeSection!.completionPct).toBe(100);
  });

  it("section baselines match current section item counts", async () => {
    const { HR_SECTION_BASELINES } = await import("../../../client/src/config/hrNavBaseline");
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();

    for (const stat of stats) {
      const baseline = HR_SECTION_BASELINES[stat.sectionId];
      expect(baseline, `Missing baseline for section ${stat.sectionId}`).toBeTruthy();
      expect(stat.totalItems).toBe(baseline.total);
      expect(stat.liveItems).toBe(baseline.live);
    }
  });
});

// ============================================================================
// C. Dead-End Detection and Deferred Analysis
// ============================================================================

describe("HR Phase 9 — Dead-End and Deferred Analysis", () => {
  it("getDeadEndItems returns empty for current config (no dead ends)", async () => {
    const { getDeadEndItems } = await import("../../../client/src/config/hrNavConfigValidator");
    const deadEnds = getDeadEndItems();
    expect(deadEnds).toHaveLength(0);
  });

  it("getSectionDeferredAnalysis returns 13 sections", async () => {
    const { getSectionDeferredAnalysis } = await import("../../../client/src/config/hrNavConfigValidator");
    const analysis = getSectionDeferredAnalysis();
    expect(analysis).toHaveLength(13);
  });

  it("time-attendance has zero deferred items", async () => {
    const { getSectionDeferredAnalysis } = await import("../../../client/src/config/hrNavConfigValidator");
    const analysis = getSectionDeferredAnalysis();
    const timeSection = analysis.find((s) => s.sectionId === "time-attendance");
    expect(timeSection).toBeTruthy();
    expect(timeSection!.deferredItems).toBe(0);
    expect(timeSection!.highDeferralRate).toBe(false);
  });

  it("sections with high deferral rate are identified", async () => {
    const { getSectionDeferredAnalysis } = await import("../../../client/src/config/hrNavConfigValidator");
    const analysis = getSectionDeferredAnalysis();
    const highDeferral = analysis.filter((s) => s.highDeferralRate);

    // Talent Acquisition has 5/6 deferred, Onboarding has 6/8 deferred
    expect(highDeferral.length).toBeGreaterThan(0);
    const taSection = highDeferral.find((s) => s.sectionId === "talent-acquisition");
    expect(taSection).toBeTruthy();
    expect(taSection!.deferredRatio).toBeGreaterThan(0.5);
  });

  it("deferred analysis deferredItemIds match nav config", async () => {
    const { getSectionDeferredAnalysis } = await import("../../../client/src/config/hrNavConfigValidator");
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const analysis = getSectionDeferredAnalysis();

    for (const sa of analysis) {
      const section = HR_NAV_CONFIG.sections.find((s) => s.id === sa.sectionId);
      expect(section).toBeTruthy();
      const notStarted = section!.items.filter((i) => i.implementationStatus === "not-started");
      expect(sa.deferredItemIds.length).toBe(notStarted.length);
    }
  });
});

// ============================================================================
// D. Backend Domain Constant Consistency
// ============================================================================

describe("HR Phase 9 — Backend Domain Consistency", () => {
  it("HR_BACKEND_DOMAINS has 14 entries matching the 14 sub-routers", async () => {
    const { HR_BACKEND_DOMAINS } = await import("../../../client/src/config/hrNavConfig");
    const domainValues = Object.values(HR_BACKEND_DOMAINS);
    expect(domainValues).toHaveLength(14);
  });

  it("all backendDomain values in nav config exist in HR_BACKEND_DOMAINS", async () => {
    const { findUnknownBackendDomains } = await import("../../../client/src/config/hrNavConfig");
    const unknowns = findUnknownBackendDomains();
    expect(unknowns).toHaveLength(0);
  });

  it("getReferencedBackendDomains returns domains actually used in config", async () => {
    const { getReferencedBackendDomains, HR_BACKEND_DOMAINS } = await import(
      "../../../client/src/config/hrNavConfig"
    );
    const referenced = getReferencedBackendDomains();
    const valid = new Set(Object.values(HR_BACKEND_DOMAINS));
    for (const domain of referenced) {
      expect(valid.has(domain as any), `Referenced domain '${domain}' not in HR_BACKEND_DOMAINS`).toBe(true);
    }
  });
});

// ============================================================================
// E. Observability Event Tracking (Unit)
// ============================================================================

describe("HR Phase 9 — Nav Observability", () => {
  it("trackNavEvent accumulates events in buffer", async () => {
    const obs = await import("../../../client/src/lib/hrNavObservability");
    obs.clearNavEvents();

    obs.trackSectionVisit("workforce-planning");
    obs.trackSectionVisit("time-attendance");
    obs.trackDeferredClick("talent-acquisition", "candidate-pipeline");
    obs.trackDeadEnd("fake-section");

    const buffer = obs.getNavEventBuffer();
    expect(buffer).toHaveLength(4);
    expect(buffer[0].type).toBe("section_visit");
    expect(buffer[2].type).toBe("deferred_click");
    expect(buffer[3].type).toBe("dead_end");
  });

  it("getNavEventSummary aggregates correctly", async () => {
    const obs = await import("../../../client/src/lib/hrNavObservability");
    obs.clearNavEvents();

    obs.trackSectionVisit("workforce-planning");
    obs.trackSectionVisit("workforce-planning");
    obs.trackSectionVisit("time-attendance");
    obs.trackDeferredClick("talent-acquisition", "candidate-pipeline");
    obs.trackDeferredClick("talent-acquisition", "candidate-pipeline");
    obs.trackDeferredClick("talent-acquisition", "offer-management");
    obs.trackDeadEnd("empty-section");
    obs.trackPermissionDenied("security-access");

    const summary = obs.getNavEventSummary();
    expect(summary.totalEvents).toBe(8);
    expect(summary.sectionVisits["workforce-planning"]).toBe(2);
    expect(summary.sectionVisits["time-attendance"]).toBe(1);
    expect(summary.deferredClicks["candidate-pipeline"]).toBe(2);
    expect(summary.deferredClicks["offer-management"]).toBe(1);
    expect(summary.deadEndCount).toBe(1);
    expect(summary.permissionDeniedCount).toBe(1);
  });

  it("getTopDeferredItems returns sorted results", async () => {
    const obs = await import("../../../client/src/lib/hrNavObservability");
    obs.clearNavEvents();

    obs.trackDeferredClick("ta", "item-a");
    obs.trackDeferredClick("ta", "item-a");
    obs.trackDeferredClick("ta", "item-a");
    obs.trackDeferredClick("ta", "item-b");
    obs.trackDeferredClick("ta", "item-b");
    obs.trackDeferredClick("ta", "item-c");

    const top = obs.getTopDeferredItems(2);
    expect(top).toHaveLength(2);
    expect(top[0].itemId).toBe("item-a");
    expect(top[0].clicks).toBe(3);
    expect(top[1].itemId).toBe("item-b");
    expect(top[1].clicks).toBe(2);
  });

  it("clearNavEvents resets the buffer", async () => {
    const obs = await import("../../../client/src/lib/hrNavObservability");
    obs.trackSectionVisit("test");
    obs.clearNavEvents();
    expect(obs.getNavEventBuffer()).toHaveLength(0);
  });
});

// ============================================================================
// F. Maintainability Helpers
// ============================================================================

describe("HR Phase 9 — Maintainability Helpers", () => {
  it("getImplementationBreakdown sums to total items", async () => {
    const { getImplementationBreakdown, getAllHrNavItems } = await import(
      "../../../client/src/config/hrNavConfig"
    );
    const breakdown = getImplementationBreakdown();
    const total = getAllHrNavItems().length;
    const sum = breakdown.live + breakdown.placeholder + breakdown.planned + breakdown["not-started"];
    expect(sum).toBe(total);
  });

  it("getImplementationBreakdown matches known counts", async () => {
    const { getImplementationBreakdown } = await import("../../../client/src/config/hrNavConfig");
    const breakdown = getImplementationBreakdown();
    expect(breakdown.live).toBe(32);
    expect(breakdown.placeholder).toBe(1);
    expect(breakdown["not-started"]).toBe(35);
  });

  it("countByBackedBy returns correct counts", async () => {
    const { countByBackedBy } = await import("../../../client/src/config/hrNavConfig");
    const counts = countByBackedBy();
    expect(counts["existing-page"]).toBe(32);
    expect(counts["tab-in-existing-page"]).toBe(1);
    expect(counts["not-yet-implemented"]).toBe(35);
  });
});

// ============================================================================
// G. Baseline Integrity
// ============================================================================

describe("HR Phase 9 — Baseline Integrity", () => {
  it("HR_NAV_BASELINE has all required fields", async () => {
    const { HR_NAV_BASELINE } = await import("../../../client/src/config/hrNavBaseline");
    expect(typeof HR_NAV_BASELINE.totalSections).toBe("number");
    expect(typeof HR_NAV_BASELINE.totalItems).toBe("number");
    expect(typeof HR_NAV_BASELINE.liveCount).toBe("number");
    expect(typeof HR_NAV_BASELINE.placeholderCount).toBe("number");
    expect(typeof HR_NAV_BASELINE.notStartedCount).toBe("number");
    expect(HR_NAV_BASELINE.sectionIds).toBeInstanceOf(Array);
    expect(typeof HR_NAV_BASELINE.aliasCount).toBe("number");
    expect(typeof HR_NAV_BASELINE.maskingCount).toBe("number");
    expect(typeof HR_NAV_BASELINE.auditCount).toBe("number");
  });

  it("HR_SECTION_BASELINES covers all 13 sections", async () => {
    const { HR_SECTION_BASELINES, HR_NAV_BASELINE } = await import(
      "../../../client/src/config/hrNavBaseline"
    );
    expect(Object.keys(HR_SECTION_BASELINES)).toHaveLength(HR_NAV_BASELINE.totalSections);

    for (const sectionId of HR_NAV_BASELINE.sectionIds) {
      expect(HR_SECTION_BASELINES[sectionId]).toBeTruthy();
      expect(typeof HR_SECTION_BASELINES[sectionId].total).toBe("number");
      expect(typeof HR_SECTION_BASELINES[sectionId].live).toBe("number");
    }
  });

  it("section baseline total items sum to global total items", async () => {
    const { HR_SECTION_BASELINES, HR_NAV_BASELINE } = await import(
      "../../../client/src/config/hrNavBaseline"
    );
    const totalFromSections = Object.values(HR_SECTION_BASELINES).reduce(
      (sum, s) => sum + s.total,
      0,
    );
    expect(totalFromSections).toBe(HR_NAV_BASELINE.totalItems);
  });

  it("section baseline live items sum to global live count", async () => {
    const { HR_SECTION_BASELINES, HR_NAV_BASELINE } = await import(
      "../../../client/src/config/hrNavBaseline"
    );
    const liveFromSections = Object.values(HR_SECTION_BASELINES).reduce(
      (sum, s) => sum + s.live,
      0,
    );
    // Live count in baseline doesn't include placeholder, but section baselines
    // only count implementationStatus=live
    expect(liveFromSections).toBe(HR_NAV_BASELINE.liveCount);
  });
});

// ============================================================================
// H. Phase 9 Feature Flags and Version
// ============================================================================

describe("HR Phase 9 — Feature Flags and Version", () => {
  it("router version is 9.0.0", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain('version: "9.0.0"');
  });

  it("navDriftDetection feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("navDriftDetection: true");
  });

  it("navHealthSummary feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("navHealthSummary: true");
  });

  it("navObservability feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("navObservability: true");
  });

  it("deferredItemTracking feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("deferredItemTracking: true");
  });

  it("prior phase feature flags remain intact", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("carbonSideNavRollout: true");
    expect(content).toContain("navConfigValidation: true");
    expect(content).toContain("backwardCompatAliases: true");
    expect(content).toContain("fullPermissionEnforcement: true");
    expect(content).toContain("roleAwareMasking: true");
  });
});
