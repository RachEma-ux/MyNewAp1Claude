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
 * H. File-existence verification — nav configs and governance packs exist on disk
 * I. Exception ID cross-reference — exception IDs reference real registry entries
 * J. Adoption summary counts — registry helpers produce consistent counts
 * K. Phase 14 scaffolding and template coherence — templates and workflow docs exist
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

// ============================================================================
// H. File-Existence Verification
// ============================================================================

describe("Module Nav Compliance — File-Existence Verification", () => {
  it("adopted modules have nav config files on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    for (const mod of adopted) {
      if (mod.navConfigPath) {
        const fullPath = path.join(repoRoot, mod.navConfigPath);
        expect(
          fs.existsSync(fullPath),
          `${mod.moduleId} nav config file missing on disk: ${mod.navConfigPath}`,
        ).toBe(true);
      }
    }
  });

  it("adopted modules have governance pack README on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    for (const mod of adopted) {
      if (mod.governancePackPath) {
        const readmePath = path.join(repoRoot, mod.governancePackPath, "README.md");
        expect(
          fs.existsSync(readmePath),
          `${mod.moduleId} governance pack README missing: ${readmePath}`,
        ).toBe(true);
      }
    }
  });

  it("adopted modules have governance profile on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { getAdoptedModules } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const adopted = getAdoptedModules();
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    for (const mod of adopted) {
      if (mod.governancePackPath) {
        const profilePath = path.join(repoRoot, mod.governancePackPath, "MODULE_GOVERNANCE_PROFILE.md");
        expect(
          fs.existsSync(profilePath),
          `${mod.moduleId} governance profile missing: ${profilePath}`,
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// I. Exception ID Cross-Reference
// ============================================================================

describe("Module Nav Compliance — Exception Cross-Reference", () => {
  // Known exception IDs from the exception registry (MODULE_NAV_EXCEPTION_REGISTRY.md)
  const VALID_EXCEPTION_IDS = [
    "EX-001", "EX-002", "EX-003", "EX-004",
    "EX-005", "EX-006", "EX-007", "EX-008",
  ];

  it("all exception IDs in registry reference valid exception entries", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    for (const mod of MODULE_NAV_REGISTRY) {
      if (mod.exceptionIds) {
        for (const exId of mod.exceptionIds) {
          expect(
            VALID_EXCEPTION_IDS.includes(exId),
            `${mod.moduleId} references unknown exception ID: ${exId}`,
          ).toBe(true);
        }
      }
    }
  });

  it("modules with active exception status have exception IDs", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const active = MODULE_NAV_REGISTRY.filter((m) => m.exceptionStatus === "active");
    for (const mod of active) {
      expect(
        mod.exceptionIds && mod.exceptionIds.length > 0,
        `${mod.moduleId} has active exception status but no exception IDs`,
      ).toBe(true);
    }
  });

  it("modules with not-required exception status have no exception IDs", async () => {
    const { MODULE_NAV_REGISTRY } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const notRequired = MODULE_NAV_REGISTRY.filter((m) => m.exceptionStatus === "not-required");
    for (const mod of notRequired) {
      expect(
        !mod.exceptionIds || mod.exceptionIds.length === 0,
        `${mod.moduleId} has not-required exception status but has exception IDs`,
      ).toBe(true);
    }
  });
});

// ============================================================================
// J. Adoption Summary Counts
// ============================================================================

describe("Module Nav Compliance — Summary Consistency", () => {
  it("adoption summary counts match registry entries", async () => {
    const { MODULE_NAV_REGISTRY, getAdoptionSummary } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const summary = getAdoptionSummary();
    expect(summary.totalModules).toBe(MODULE_NAV_REGISTRY.length);
    expect(summary.adoptedModules).toBeGreaterThanOrEqual(3);
    expect(summary.adoptionRate).toBeGreaterThan(0);
  });

  it("compliance counts match registry entries", async () => {
    const { MODULE_NAV_REGISTRY, countByComplianceStatus } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const counts = countByComplianceStatus();
    const total = counts.compliant + counts["partially-compliant"] + counts.exempt + counts["non-compliant"];
    expect(total).toBe(MODULE_NAV_REGISTRY.length);
  });

  it("no non-compliant modules exist", async () => {
    const { countByComplianceStatus } = await import(
      "../../client/src/navigation/moduleNavRegistry"
    );
    const counts = countByComplianceStatus();
    expect(counts["non-compliant"]).toBe(0);
  });
});

// ============================================================================
// K. Phase 14 — Scaffolding & Template Coherence
// ============================================================================

describe("Module Nav Compliance — Scaffolding & Templates (Phase 14)", () => {
  const PHASE_14_WORKFLOW_DOCS = [
    "Governance-Centrale/global/MODULE_NAV_WORKFLOW.md",
    "Governance-Centrale/global/MODULE_NAV_DECISION_TREE.md",
    "Governance-Centrale/global/MODULE_NAV_HANDOFF_GUIDE.md",
    "Governance-Centrale/global/MODULE_NAV_COMMON_FAILURES.md",
    "Governance-Centrale/global/MODULE_NAV_OPERATING_CHECKLIST.md",
  ];

  const PHASE_14_TEMPLATES = [
    "Governance-Centrale/templates/module-nav/MODULE_NAV_ADOPTION_ENTRY.template.md",
    "Governance-Centrale/templates/module-nav/MODULE_NAV_EXCEPTION_ENTRY.template.md",
    "Governance-Centrale/templates/module-nav/MODULE_NAV_VALIDATION_CHECKLIST.md",
    "Governance-Centrale/templates/module-nav/MODULE_NAV_PR_REVIEW_CHECKLIST.md",
    "Governance-Centrale/templates/module-nav/MODULE_NAV_ROLLOUT_PLAN.template.md",
  ];

  it("all Phase 14 workflow docs exist on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    for (const doc of PHASE_14_WORKFLOW_DOCS) {
      const fullPath = path.join(repoRoot, doc);
      expect(
        fs.existsSync(fullPath),
        `Phase 14 workflow doc missing: ${doc}`,
      ).toBe(true);
    }
  });

  it("all Phase 14 templates exist on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    for (const tmpl of PHASE_14_TEMPLATES) {
      const fullPath = path.join(repoRoot, tmpl);
      expect(
        fs.existsSync(fullPath),
        `Phase 14 template missing: ${tmpl}`,
      ).toBe(true);
    }
  });

  it("scaffolding script exists on disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    const scriptPath = path.join(repoRoot, "scripts/scaffold-module-nav.ts");
    expect(
      fs.existsSync(scriptPath),
      "Scaffolding script missing: scripts/scaffold-module-nav.ts",
    ).toBe(true);
  });

  it("nav config template exists and imports shared types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
    const templatePath = path.join(
      repoRoot,
      "Governance-Centrale/templates/module-nav/MODULE_NAV_CONFIG.template.ts",
    );
    const content = fs.readFileSync(templatePath, "utf-8");
    expect(content).toContain("moduleNavTypes");
  });
});
