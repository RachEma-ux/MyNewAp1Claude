/**
 * Cross-Module Nav Standard Validation Tests — Phase 11
 *
 * Proves that the shared module-nav standard works across at least 2 modules:
 * - HR (reference implementation)
 * - PM Central (Phase 11 pilot)
 *
 * Covers:
 * A. Shared contract compatibility — both modules use the same base types
 * B. PM Central structural integrity — config shape, field completeness
 * C. PM Central validation — validator produces clean results
 * D. Cross-module consistency — naming conventions, route namespacing
 * E. Sidebar integration — both configs are importable and renderable
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Shared Contract Compatibility
// ============================================================================

describe("Cross-Module — Shared Contract Compatibility", () => {
  it("HR and PM Central both export ModuleNavConfig-compatible configs", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");

    // Both have the required top-level fields
    expect(HR_NAV_CONFIG.id).toBeTruthy();
    expect(HR_NAV_CONFIG.label).toBeTruthy();
    expect(HR_NAV_CONFIG.baseRoute).toBeTruthy();
    expect(HR_NAV_CONFIG.sections).toBeDefined();

    expect(PM_NAV_CONFIG.id).toBeTruthy();
    expect(PM_NAV_CONFIG.label).toBeTruthy();
    expect(PM_NAV_CONFIG.baseRoute).toBeTruthy();
    expect(PM_NAV_CONFIG.sections).toBeDefined();
  });

  it("both configs have non-overlapping module IDs", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");

    expect(HR_NAV_CONFIG.id).not.toBe(PM_NAV_CONFIG.id);
  });

  it("both configs have non-overlapping base routes", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");

    expect(HR_NAV_CONFIG.baseRoute).not.toBe(PM_NAV_CONFIG.baseRoute);
    // No prefix overlap — HR routes don't start with PM's base and vice versa
    expect(HR_NAV_CONFIG.baseRoute.startsWith(PM_NAV_CONFIG.baseRoute)).toBe(false);
    expect(PM_NAV_CONFIG.baseRoute.startsWith(HR_NAV_CONFIG.baseRoute)).toBe(false);
  });

  it("shared validateModuleNavConfig works for both HR and PM Central", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { validateModuleNavConfig } = await import("../../../client/src/config/moduleNavTypes");

    // Validate HR config (will have some warnings due to HR-specific patterns, but no errors)
    const hrResult = validateModuleNavConfig(HR_NAV_CONFIG);
    expect(hrResult.valid).toBe(true);
    expect(hrResult.errors).toHaveLength(0);

    // Validate PM Central config
    const pmResult = validateModuleNavConfig(PM_NAV_CONFIG);
    expect(pmResult.valid).toBe(true);
    expect(pmResult.errors).toHaveLength(0);
  });

  it("both configs use the same enum values for shared fields", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { getAllModuleNavItems } = await import("../../../client/src/config/moduleNavTypes");

    const validScopeTypes = new Set(["self", "team", "all", "sensitive", "mixed"]);
    const validVisibilityModes = new Set(["show", "hide-if-no-access", "show-disabled", "redirect-to-parent"]);
    const validBackedBy = new Set(["existing-page", "new-page", "tab-in-existing-page", "not-yet-implemented"]);
    const validStatus = new Set(["live", "placeholder", "planned", "not-started"]);

    // Check HR items
    for (const item of getAllModuleNavItems(HR_NAV_CONFIG as any)) {
      expect(validScopeTypes.has(item.scopeType)).toBe(true);
      expect(validVisibilityModes.has(item.visibilityMode)).toBe(true);
      expect(validBackedBy.has(item.backedBy)).toBe(true);
      expect(validStatus.has(item.implementationStatus)).toBe(true);
    }

    // Check PM Central items
    for (const item of getAllModuleNavItems(PM_NAV_CONFIG)) {
      expect(validScopeTypes.has(item.scopeType)).toBe(true);
      expect(validVisibilityModes.has(item.visibilityMode)).toBe(true);
      expect(validBackedBy.has(item.backedBy)).toBe(true);
      expect(validStatus.has(item.implementationStatus)).toBe(true);
    }
  });
});

// ============================================================================
// B. PM Central Structural Integrity
// ============================================================================

describe("PM Central Nav Config — Structural Integrity", () => {
  it("has exactly 8 sections", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    expect(PM_NAV_CONFIG.sections).toHaveLength(8);
  });

  it("has exactly 12 leaf items across all sections", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    expect(getAllPmNavItems()).toHaveLength(12);
  });

  it("every section has a unique id", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const ids = PM_NAV_CONFIG.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item has a unique id", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    const ids = getAllPmNavItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every section has required fields", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    for (const section of PM_NAV_CONFIG.sections) {
      expect(section.id).toBeTruthy();
      expect(section.label).toBeTruthy();
      expect(section.href).toBeTruthy();
      expect(section.requiredAction).toBeTruthy();
      expect(section.visibilityMode).toBeTruthy();
      expect(section.scopeType).toBeTruthy();
      expect(section.backendDomain).toBeTruthy();
      expect(section.implementationStatus).toBeTruthy();
    }
  });

  it("every item has required fields", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    for (const item of getAllPmNavItems()) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.requiredAction).toBeTruthy();
      expect(item.scopeType).toBeTruthy();
      expect(item.visibilityMode).toBeTruthy();
      expect(item.backedBy).toBeTruthy();
      expect(item.backendDomain).toBeTruthy();
      expect(item.implementationStatus).toBeTruthy();
    }
  });

  it("all items use pm.* action namespace", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    for (const item of getAllPmNavItems()) {
      expect(item.requiredAction).toMatch(/^pm\./);
    }
  });

  it("all item hrefs start with /pm-central/", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    for (const item of getAllPmNavItems()) {
      expect(item.href).toMatch(/^\/pm-central\//);
    }
  });

  it("all sections have at least one item", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    for (const section of PM_NAV_CONFIG.sections) {
      expect(section.items.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================================================
// C. PM Central Validator
// ============================================================================

describe("PM Central Nav Config — Validator", () => {
  it("produces a clean validation result (zero errors)", async () => {
    const { validatePmNavConfig } = await import("../../../client/src/config/pmNavConfigValidator");
    const result = validatePmNavConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("stats reflect the correct counts", async () => {
    const { validatePmNavConfig } = await import("../../../client/src/config/pmNavConfigValidator");
    const result = validatePmNavConfig();
    expect(result.stats.totalSections).toBe(8);
    expect(result.stats.totalItems).toBe(12);
    expect(result.stats.liveItems).toBe(12); // All PM Central items are live
    expect(result.stats.plannedItems).toBe(0);
  });

  it("getPmLiveRoutes returns all 12 items", async () => {
    const { getPmLiveRoutes } = await import("../../../client/src/config/pmNavConfigValidator");
    const routes = getPmLiveRoutes();
    expect(routes).toHaveLength(12);
    for (const r of routes) {
      expect(r.route).toBeTruthy();
      expect(r.action).toMatch(/^pm\./);
    }
  });

  it("getPmSectionRoutes returns all 8 sections", async () => {
    const { getPmSectionRoutes } = await import("../../../client/src/config/pmNavConfigValidator");
    const sections = getPmSectionRoutes();
    expect(sections).toHaveLength(8);
  });
});

// ============================================================================
// D. Cross-Module Consistency
// ============================================================================

describe("Cross-Module — Naming and Namespace Consistency", () => {
  it("HR uses hr.* namespace, PM Central uses pm.* namespace — no overlap", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");

    const hrActions = new Set(getAllHrNavItems().map((i) => i.requiredAction));
    const pmActions = new Set(getAllPmNavItems().map((i) => i.requiredAction));

    // No intersection
    for (const action of hrActions) {
      expect(pmActions.has(action)).toBe(false);
    }
  });

  it("no item ID overlap between HR and PM Central", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");

    const hrIds = new Set(getAllHrNavItems().map((i) => i.id));
    const pmIds = new Set(getAllPmNavItems().map((i) => i.id));

    for (const id of hrIds) {
      expect(pmIds.has(id)).toBe(false);
    }
  });

  it("no section ID overlap between HR and PM Central", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");

    const hrSectionIds = new Set(HR_NAV_CONFIG.sections.map((s) => s.id));
    const pmSectionIds = new Set(PM_NAV_CONFIG.sections.map((s) => s.id));

    for (const id of hrSectionIds) {
      expect(pmSectionIds.has(id)).toBe(false);
    }
  });

  it("no route overlap between HR and PM Central item hrefs", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");

    const hrHrefs = new Set(getAllHrNavItems().map((i) => i.href));
    const pmHrefs = new Set(getAllPmNavItems().map((i) => i.href));

    for (const href of hrHrefs) {
      expect(pmHrefs.has(href)).toBe(false);
    }
  });
});

// ============================================================================
// E. PM Central — All Items Backed by Existing Pages
// ============================================================================

describe("PM Central Nav Config — Implementation Status", () => {
  it("all 12 items are live (100% implementation)", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    const items = getAllPmNavItems();
    const liveCount = items.filter((i) => i.implementationStatus === "live").length;
    expect(liveCount).toBe(12);
  });

  it("all items are backed by existing pages", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    const items = getAllPmNavItems();
    const existingCount = items.filter((i) => i.backedBy === "existing-page").length;
    expect(existingCount).toBe(12);
  });

  it("all live items have a currentRoute", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    for (const item of getAllPmNavItems()) {
      expect(item.currentRoute).toBeTruthy();
    }
  });

  it("all live items have a currentComponent", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    for (const item of getAllPmNavItems()) {
      expect(item.currentComponent).toBeTruthy();
    }
  });
});
