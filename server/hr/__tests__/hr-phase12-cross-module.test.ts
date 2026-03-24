/**
 * Phase 12 — Cross-Module Navigation Validation Tests
 *
 * Proves the shared module-nav standard works across:
 * - HR (reference implementation)
 * - PM Central (Phase 11 pilot)
 * - Automation (Phase 12 Wave 1)
 *
 * Covers:
 * A. Shared contract compatibility across all adopted modules
 * B. Nav config structural integrity for each adopted module
 * C. Required stable metadata fields
 * D. Route-to-config consistency
 * E. Visibility metadata consistency
 * F. Adoption registry consistency
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Shared Contract Compatibility
// ============================================================================

describe("Phase 12 — Cross-Module Shared Contract", () => {
  it("HR nav config conforms to ModuleNavConfig shape", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    expect(HR_NAV_CONFIG.id).toBe("human-resources");
    expect(HR_NAV_CONFIG.label).toBeTruthy();
    expect(HR_NAV_CONFIG.baseRoute).toBe("/hr");
    expect(HR_NAV_CONFIG.sections.length).toBeGreaterThan(0);
  });

  it("PM Central nav config conforms to ModuleNavConfig shape", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    expect(PM_NAV_CONFIG.id).toBe("pm-central");
    expect(PM_NAV_CONFIG.label).toBeTruthy();
    expect(PM_NAV_CONFIG.baseRoute).toBe("/pm-central");
    expect(PM_NAV_CONFIG.sections.length).toBeGreaterThan(0);
  });

  it("Automation nav config conforms to ModuleNavConfig shape", async () => {
    const { AUTOMATION_NAV_CONFIG } = await import("../../../client/src/config/automationNavConfig");
    expect(AUTOMATION_NAV_CONFIG.id).toBe("automation");
    expect(AUTOMATION_NAV_CONFIG.label).toBeTruthy();
    expect(AUTOMATION_NAV_CONFIG.baseRoute).toBe("/automation");
    expect(AUTOMATION_NAV_CONFIG.sections.length).toBeGreaterThan(0);
  });

  it("all three module configs have unique IDs", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../../client/src/config/automationNavConfig");
    const ids = [HR_NAV_CONFIG.id, PM_NAV_CONFIG.id, AUTOMATION_NAV_CONFIG.id];
    expect(new Set(ids).size).toBe(3);
  });

  it("all three module configs have unique base routes", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../../client/src/config/automationNavConfig");
    const routes = [HR_NAV_CONFIG.baseRoute, PM_NAV_CONFIG.baseRoute, AUTOMATION_NAV_CONFIG.baseRoute];
    expect(new Set(routes).size).toBe(3);
  });
});

// ============================================================================
// B. Structural Integrity (shared validator)
// ============================================================================

describe("Phase 12 — Cross-Module Structural Validation", () => {
  it("shared validator passes for PM Central config", async () => {
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { validateModuleNavConfig } = await import("../../../client/src/navigation/moduleNavHelpers");
    const errors = validateModuleNavConfig(PM_NAV_CONFIG);
    const critical = errors.filter((e) => e.severity === "error");
    expect(critical).toHaveLength(0);
  });

  it("shared validator passes for Automation config", async () => {
    const { AUTOMATION_NAV_CONFIG } = await import("../../../client/src/config/automationNavConfig");
    const { validateModuleNavConfig } = await import("../../../client/src/navigation/moduleNavHelpers");
    const errors = validateModuleNavConfig(AUTOMATION_NAV_CONFIG);
    const critical = errors.filter((e) => e.severity === "error");
    expect(critical).toHaveLength(0);
  });
});

// ============================================================================
// C. Required Stable Metadata Fields
// ============================================================================

describe("Phase 12 — Stable Metadata Fields Across Modules", () => {
  const REQUIRED_ITEM_FIELDS = [
    "id", "label", "href", "section", "requiredAction",
    "scopeType", "visibilityMode", "backedBy", "backendDomain", "implementationStatus",
  ] as const;

  it("all HR items have required stable fields", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const items = getAllHrNavItems();
    for (const item of items) {
      for (const field of REQUIRED_ITEM_FIELDS) {
        expect(item[field], `HR item ${item.id} missing ${field}`).toBeTruthy();
      }
    }
  });

  it("all PM Central items have required stable fields", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    const items = getAllPmNavItems();
    for (const item of items) {
      for (const field of REQUIRED_ITEM_FIELDS) {
        expect(item[field], `PM item ${item.id} missing ${field}`).toBeTruthy();
      }
    }
  });

  it("all Automation items have required stable fields", async () => {
    const { getAllAutomationNavItems } = await import("../../../client/src/config/automationNavConfig");
    const items = getAllAutomationNavItems();
    for (const item of items) {
      for (const field of REQUIRED_ITEM_FIELDS) {
        expect(item[field], `Automation item ${item.id} missing ${field}`).toBeTruthy();
      }
    }
  });
});

// ============================================================================
// D. Route-to-Config Consistency
// ============================================================================

describe("Phase 12 — Route Consistency", () => {
  it("all live HR items have a resolved route starting with /hr/", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveItems = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of liveItems) {
      const route = item.currentRoute ?? item.href;
      expect(route, `HR item ${item.id} missing route`).toBeTruthy();
      expect(route!.startsWith("/hr/"), `HR item ${item.id} route "${route}" should start with /hr/`).toBe(true);
    }
  });

  it("all live PM Central items have routes starting with /pm-central/", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    const liveItems = getAllPmNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of liveItems) {
      const route = item.currentRoute ?? item.href;
      expect(route, `PM item ${item.id} missing route`).toBeTruthy();
      expect(route!.startsWith("/pm-central/"), `PM item ${item.id} route "${route}" should start with /pm-central/`).toBe(true);
    }
  });

  it("all live Automation items have routes starting with /automation/", async () => {
    const { getAllAutomationNavItems } = await import("../../../client/src/config/automationNavConfig");
    const liveItems = getAllAutomationNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of liveItems) {
      const route = item.currentRoute ?? item.href;
      expect(route, `Automation item ${item.id} missing route`).toBeTruthy();
      expect(route!.startsWith("/automation/"), `Automation item ${item.id} route "${route}" should start with /automation/`).toBe(true);
    }
  });

  it("no route prefix collisions between adopted modules", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../../client/src/config/automationNavConfig");
    const prefixes = [HR_NAV_CONFIG.baseRoute, PM_NAV_CONFIG.baseRoute, AUTOMATION_NAV_CONFIG.baseRoute];
    for (let i = 0; i < prefixes.length; i++) {
      for (let j = i + 1; j < prefixes.length; j++) {
        expect(prefixes[i].startsWith(prefixes[j])).toBe(false);
        expect(prefixes[j].startsWith(prefixes[i])).toBe(false);
      }
    }
  });
});

// ============================================================================
// E. Visibility Metadata Consistency
// ============================================================================

describe("Phase 12 — Visibility Metadata", () => {
  const VALID_VISIBILITY = ["show", "hide-if-no-access", "show-disabled", "redirect-to-parent"];
  const VALID_SCOPE = ["self", "team", "all", "sensitive", "mixed"];
  const VALID_BACKED_BY = ["existing-page", "new-page", "tab-in-existing-page", "not-yet-implemented"];
  const VALID_STATUS = ["live", "placeholder", "planned", "not-started"];

  async function checkItems(items: any[], moduleLabel: string) {
    for (const item of items) {
      expect(VALID_VISIBILITY).toContain(item.visibilityMode);
      expect(VALID_SCOPE).toContain(item.scopeType);
      expect(VALID_BACKED_BY).toContain(item.backedBy);
      expect(VALID_STATUS).toContain(item.implementationStatus);
    }
  }

  it("HR items use valid enum values", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    await checkItems(getAllHrNavItems(), "HR");
  });

  it("PM Central items use valid enum values", async () => {
    const { getAllPmNavItems } = await import("../../../client/src/config/pmNavConfig");
    await checkItems(getAllPmNavItems(), "PM Central");
  });

  it("Automation items use valid enum values", async () => {
    const { getAllAutomationNavItems } = await import("../../../client/src/config/automationNavConfig");
    await checkItems(getAllAutomationNavItems(), "Automation");
  });
});

// ============================================================================
// F. Adoption Registry Consistency
// ============================================================================

describe("Phase 12 — Adoption Registry", () => {
  it("registry contains entries for all adopted modules", async () => {
    const { MODULE_NAV_REGISTRY, getAdoptedModules } = await import(
      "../../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    expect(adopted.length).toBe(3);
    expect(adopted.find((m) => m.moduleId === "human-resources")).toBeTruthy();
    expect(adopted.find((m) => m.moduleId === "pm-central")).toBeTruthy();
    expect(adopted.find((m) => m.moduleId === "automation")).toBeTruthy();
  });

  it("registry adopted modules have navConfigExists: true", async () => {
    const { getAdoptedModules } = await import("../../../client/src/navigation/moduleNavRegistry");
    for (const m of getAdoptedModules()) {
      expect(m.navConfigExists, `${m.moduleId} navConfigExists should be true`).toBe(true);
      expect(m.navConfigPath, `${m.moduleId} navConfigPath should be set`).toBeTruthy();
    }
  });

  it("registry adopted modules have governancePackExists: true", async () => {
    const { getAdoptedModules } = await import("../../../client/src/navigation/moduleNavRegistry");
    for (const m of getAdoptedModules()) {
      expect(m.governancePackExists, `${m.moduleId} governancePackExists should be true`).toBe(true);
    }
  });

  it("registry module IDs are unique", async () => {
    const { MODULE_NAV_REGISTRY } = await import("../../../client/src/navigation/moduleNavRegistry");
    const ids = MODULE_NAV_REGISTRY.map((m) => m.moduleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adoption summary counts are correct", async () => {
    const { getAdoptionSummary } = await import("../../../client/src/navigation/moduleNavRegistry");
    const summary = getAdoptionSummary();
    expect(summary.adoptedModules).toBe(3);
    expect(summary.adoptionCounts.reference).toBe(1);
    expect(summary.adoptionCounts.pilot).toBe(1);
    expect(summary.adoptionCounts["wave-1"]).toBe(1);
    expect(summary.totalModules).toBeGreaterThan(3);
    expect(summary.adoptionRate).toBeGreaterThan(0);
  });

  it("Automation is correctly registered as wave-1", async () => {
    const { getModuleById } = await import("../../../client/src/navigation/moduleNavRegistry");
    const automation = getModuleById("automation");
    expect(automation).toBeTruthy();
    expect(automation!.adoptionStatus).toBe("wave-1");
    expect(automation!.adoptionPhase).toBe(12);
    expect(automation!.baseRoute).toBe("/automation");
  });

  it("HR is correctly registered as reference", async () => {
    const { getModuleById } = await import("../../../client/src/navigation/moduleNavRegistry");
    const hr = getModuleById("human-resources");
    expect(hr).toBeTruthy();
    expect(hr!.adoptionStatus).toBe("reference");
  });

  it("PM Central is correctly registered as pilot", async () => {
    const { getModuleById } = await import("../../../client/src/navigation/moduleNavRegistry");
    const pm = getModuleById("pm-central");
    expect(pm).toBeTruthy();
    expect(pm!.adoptionStatus).toBe("pilot");
  });
});
