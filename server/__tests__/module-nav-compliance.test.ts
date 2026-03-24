/**
 * Module Nav Compliance Validation — Phase 13
 *
 * Machine-checkable enforcement of the module-nav standard.
 * Runs as part of `npm test` (vitest) to detect drift or missing mandatory pieces.
 *
 * What this checks:
 * A. Registry integrity — all adopted modules have required fields
 * B. Adopted modules have canonical nav configs that pass structural validation
 * C. Adopted modules have governance packs
 * D. Compliance status consistency — compliant modules actually satisfy requirements
 * E. Exception coverage — partially compliant and legacy modules have exception entries
 * F. Cross-module contract consistency — no ID/route collisions
 * G. HR reference implementation preserved
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Registry Integrity
// ============================================================================

describe("Module Nav Compliance — Registry Integrity", () => {
  it("registry has at least 3 adopted modules", async () => {
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    expect(adopted.length).toBeGreaterThanOrEqual(3);
  });

  it("every registry entry has required identification fields", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    for (const entry of MODULE_NAV_REGISTRY) {
      expect(entry.moduleId, `Entry missing moduleId`).toBeTruthy();
      expect(entry.label, `${entry.moduleId} missing label`).toBeTruthy();
      expect(entry.baseRoute, `${entry.moduleId} missing baseRoute`).toBeTruthy();
      expect(entry.adoptionStatus, `${entry.moduleId} missing adoptionStatus`).toBeTruthy();
    }
  });

  it("every registry entry has Phase 13 compliance fields", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    for (const entry of MODULE_NAV_REGISTRY) {
      expect(entry.complianceStatus, `${entry.moduleId} missing complianceStatus`).toBeTruthy();
      expect(entry.exceptionStatus, `${entry.moduleId} missing exceptionStatus`).toBeTruthy();
      expect(
        entry.validationPasses === true || entry.validationPasses === false || entry.validationPasses === null,
        `${entry.moduleId} validationPasses must be boolean or null`,
      ).toBe(true);
    }
  });

  it("no duplicate module IDs in registry", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const ids = MODULE_NAV_REGISTRY.map((m) => m.moduleId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("no duplicate base routes in registry", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const routes = MODULE_NAV_REGISTRY.map((m) => m.baseRoute);
    const uniqueRoutes = new Set(routes);
    expect(uniqueRoutes.size).toBe(routes.length);
  });
});

// ============================================================================
// B. Adopted Modules Pass Structural Validation
// ============================================================================

describe("Module Nav Compliance — Structural Validation", () => {
  it("HR nav config passes shared validation with zero errors", async () => {
    const { validateModuleNavConfig } = await import(
      "../../client/src/navigation/moduleNavHelpers"
    );
    const { HR_NAV_CONFIG } = await import(
      "../../client/src/config/hrNavConfig"
    );
    const errors = validateModuleNavConfig(HR_NAV_CONFIG);
    const blockers = errors.filter((e) => e.severity === "error");
    expect(blockers, "HR nav config has blocking validation errors").toHaveLength(0);
  });

  it("PM Central nav config passes shared validation with zero errors", async () => {
    const { validateModuleNavConfig } = await import(
      "../../client/src/navigation/moduleNavHelpers"
    );
    const { PM_NAV_CONFIG } = await import(
      "../../client/src/config/pmNavConfig"
    );
    const errors = validateModuleNavConfig(PM_NAV_CONFIG);
    const blockers = errors.filter((e) => e.severity === "error");
    expect(blockers, "PM Central nav config has blocking validation errors").toHaveLength(0);
  });

  it("Automation nav config passes shared validation with zero errors", async () => {
    const { validateModuleNavConfig } = await import(
      "../../client/src/navigation/moduleNavHelpers"
    );
    const { AUTOMATION_NAV_CONFIG } = await import(
      "../../client/src/config/automationNavConfig"
    );
    const errors = validateModuleNavConfig(AUTOMATION_NAV_CONFIG);
    const blockers = errors.filter((e) => e.severity === "error");
    expect(blockers, "Automation nav config has blocking validation errors").toHaveLength(0);
  });
});

// ============================================================================
// C. Adopted Modules Have Governance Packs
// ============================================================================

describe("Module Nav Compliance — Governance Packs", () => {
  it("all adopted modules claim governance pack exists", async () => {
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    for (const mod of adopted) {
      expect(
        mod.governancePackExists,
        `${mod.moduleId} claims no governance pack`,
      ).toBe(true);
    }
  });

  it("all adopted modules claim nav config exists", async () => {
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    for (const mod of adopted) {
      expect(
        mod.navConfigExists,
        `${mod.moduleId} claims no nav config`,
      ).toBe(true);
    }
  });

  it("adopted modules with navConfigPath have non-empty paths", async () => {
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    for (const mod of adopted) {
      expect(
        mod.navConfigPath,
        `${mod.moduleId} has no navConfigPath`,
      ).toBeTruthy();
    }
  });
});

// ============================================================================
// D. Compliance Status Consistency
// ============================================================================

describe("Module Nav Compliance — Status Consistency", () => {
  it("compliant modules have navConfig + governance pack + validation passing", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const compliant = MODULE_NAV_REGISTRY.filter(
      (m) => m.complianceStatus === "compliant",
    );
    for (const mod of compliant) {
      expect(mod.navConfigExists, `Compliant ${mod.moduleId} missing nav config`).toBe(true);
      expect(mod.governancePackExists, `Compliant ${mod.moduleId} missing governance pack`).toBe(true);
      expect(mod.validationPasses, `Compliant ${mod.moduleId} validation should pass`).toBe(true);
    }
  });

  it("partially-compliant modules have navConfig and validation passing", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const partial = MODULE_NAV_REGISTRY.filter(
      (m) => m.complianceStatus === "partially-compliant",
    );
    for (const mod of partial) {
      expect(mod.navConfigExists, `Partially-compliant ${mod.moduleId} missing nav config`).toBe(true);
      expect(mod.validationPasses, `Partially-compliant ${mod.moduleId} validation should pass`).toBe(true);
    }
  });

  it("exempt modules are legacy, deferred, or not-applicable", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const exempt = MODULE_NAV_REGISTRY.filter(
      (m) => m.complianceStatus === "exempt",
    );
    for (const mod of exempt) {
      expect(
        ["legacy", "deferred", "not-applicable"].includes(mod.adoptionStatus),
        `Exempt ${mod.moduleId} has unexpected adoptionStatus: ${mod.adoptionStatus}`,
      ).toBe(true);
    }
  });

  it("no adopted module is marked non-compliant (would be a blocking failure)", async () => {
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    for (const mod of adopted) {
      expect(
        mod.complianceStatus,
        `Adopted ${mod.moduleId} is non-compliant — blocking failure`,
      ).not.toBe("non-compliant");
    }
  });
});

// ============================================================================
// E. Exception Coverage
// ============================================================================

describe("Module Nav Compliance — Exception Coverage", () => {
  it("partially-compliant modules have active exception status", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const partial = MODULE_NAV_REGISTRY.filter(
      (m) => m.complianceStatus === "partially-compliant",
    );
    for (const mod of partial) {
      expect(
        mod.exceptionStatus,
        `Partially-compliant ${mod.moduleId} should have active exceptions`,
      ).toBe("active");
      expect(
        mod.exceptionIds && mod.exceptionIds.length > 0,
        `Partially-compliant ${mod.moduleId} should have exception IDs`,
      ).toBe(true);
    }
  });

  it("legacy modules have active exception status", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const legacy = MODULE_NAV_REGISTRY.filter(
      (m) => m.adoptionStatus === "legacy",
    );
    for (const mod of legacy) {
      expect(
        mod.exceptionStatus,
        `Legacy ${mod.moduleId} should have active exception`,
      ).toBe("active");
    }
  });

  it("not-applicable modules have not-required exception status", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const na = MODULE_NAV_REGISTRY.filter(
      (m) => m.adoptionStatus === "not-applicable",
    );
    for (const mod of na) {
      expect(
        mod.exceptionStatus,
        `N/A ${mod.moduleId} should have not-required exception status`,
      ).toBe("not-required");
    }
  });
});

// ============================================================================
// F. Cross-Module Contract Consistency
// ============================================================================

describe("Module Nav Compliance — Cross-Module Consistency", () => {
  it("adopted module configs have non-overlapping module IDs", async () => {
    const { HR_NAV_CONFIG } = await import("../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../client/src/config/automationNavConfig");

    const ids = [HR_NAV_CONFIG.id, PM_NAV_CONFIG.id, AUTOMATION_NAV_CONFIG.id];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("adopted module configs have non-overlapping base routes", async () => {
    const { HR_NAV_CONFIG } = await import("../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../client/src/config/automationNavConfig");

    const routes = [HR_NAV_CONFIG.baseRoute, PM_NAV_CONFIG.baseRoute, AUTOMATION_NAV_CONFIG.baseRoute];
    const uniqueRoutes = new Set(routes);
    expect(uniqueRoutes.size).toBe(routes.length);
  });

  it("no base route is a prefix of another (prevents routing conflicts)", async () => {
    const { HR_NAV_CONFIG } = await import("../../client/src/config/hrNavConfig");
    const { PM_NAV_CONFIG } = await import("../../client/src/config/pmNavConfig");
    const { AUTOMATION_NAV_CONFIG } = await import("../../client/src/config/automationNavConfig");

    const routes = [HR_NAV_CONFIG.baseRoute, PM_NAV_CONFIG.baseRoute, AUTOMATION_NAV_CONFIG.baseRoute];
    for (let i = 0; i < routes.length; i++) {
      for (let j = 0; j < routes.length; j++) {
        if (i !== j) {
          expect(
            routes[j].startsWith(routes[i] + "/"),
            `${routes[j]} is a sub-path of ${routes[i]}`,
          ).toBe(false);
        }
      }
    }
  });
});

// ============================================================================
// G. HR Reference Implementation Preserved
// ============================================================================

describe("Module Nav Compliance — HR Reference Preserved", () => {
  it("HR is registered with reference status", async () => {
    const { getModuleById } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const hr = getModuleById("human-resources");
    expect(hr).toBeDefined();
    expect(hr!.adoptionStatus).toBe("reference");
  });

  it("HR is compliant", async () => {
    const { getModuleById } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const hr = getModuleById("human-resources");
    expect(hr!.complianceStatus).toBe("compliant");
  });

  it("HR nav config has expected structure (13 sections, 68+ items)", async () => {
    const { HR_NAV_CONFIG, getAllHrNavItems } = await import(
      "../../client/src/config/hrNavConfig"
    );
    expect(HR_NAV_CONFIG.sections.length).toBe(13);
    expect(getAllHrNavItems().length).toBeGreaterThanOrEqual(68);
  });

  it("HR validation passes", async () => {
    const { getModuleById } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const hr = getModuleById("human-resources");
    expect(hr!.validationPasses).toBe(true);
  });
});
