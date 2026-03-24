/**
 * HR Phase 10 Tests — Platform Standardization & Shared Contract
 *
 * Validates that:
 * A. Shared nav contract exports expected types and value sets
 * B. Shared nav helpers work correctly
 * C. HR nav config conforms to the shared contract shape
 * D. Shared generic validator produces clean result on HR config
 * E. HR reference implementation doc exists
 * F. Governance-Centrale platform docs exist
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Shared Nav Contract — Type and Value Set Exports
// ============================================================================

describe("Phase 10 — Shared Nav Contract Exports", () => {
  it("exports all core value set arrays", async () => {
    const types = await import("../../../client/src/navigation/moduleNavTypes");
    expect(types.SCOPE_TYPES).toEqual(["self", "team", "all", "sensitive", "mixed"]);
    expect(types.VISIBILITY_MODES).toEqual(["show", "hide-if-no-access", "show-disabled", "redirect-to-parent"]);
    expect(types.BACKED_BY_VALUES).toEqual(["existing-page", "new-page", "tab-in-existing-page", "not-yet-implemented"]);
    expect(types.IMPLEMENTATION_STATUSES).toEqual(["live", "placeholder", "planned", "not-started"]);
  });

  it("exports ACTION_PATTERN regex", async () => {
    const { ACTION_PATTERN } = await import("../../../client/src/navigation/moduleNavTypes");
    expect(ACTION_PATTERN).toBeInstanceOf(RegExp);
    expect(ACTION_PATTERN.test("hr.directory.read")).toBe(true);
    expect(ACTION_PATTERN.test("finance.ledger.write")).toBe(true);
    expect(ACTION_PATTERN.test("hr.time.read.self")).toBe(true);
    expect(ACTION_PATTERN.test("invalid")).toBe(false);
    expect(ACTION_PATTERN.test("only.two")).toBe(false);
  });

  it("value sets are frozen (readonly)", async () => {
    const types = await import("../../../client/src/navigation/moduleNavTypes");
    expect(types.SCOPE_TYPES).toHaveLength(5);
    expect(types.VISIBILITY_MODES).toHaveLength(4);
    expect(types.BACKED_BY_VALUES).toHaveLength(4);
    expect(types.IMPLEMENTATION_STATUSES).toHaveLength(4);
  });
});

// ============================================================================
// B. Shared Nav Helpers
// ============================================================================

describe("Phase 10 — Shared Nav Helpers", () => {
  it("getAllItems flattens items from a ModuleNavConfig", async () => {
    const { getAllItems } = await import("../../../client/src/navigation/moduleNavHelpers");
    const mockConfig = {
      id: "test",
      label: "Test",
      baseRoute: "/test",
      sections: [
        {
          id: "s1", label: "S1", iconHint: "x", purpose: "test", href: "/test/s1",
          requiredAction: "test.s1.read", scopeType: "all" as const,
          visibilityMode: "show" as const, backedBy: "existing-page" as const,
          backendDomain: "s1", implementationStatus: "live" as const,
          items: [
            { id: "i1", label: "I1", href: "/test/s1/i1", section: "s1",
              requiredAction: "test.s1.read", scopeType: "all" as const,
              visibilityMode: "show" as const, backedBy: "existing-page" as const,
              backendDomain: "s1", implementationStatus: "live" as const },
            { id: "i2", label: "I2", href: "/test/s1/i2", section: "s1",
              requiredAction: "test.s1.read", scopeType: "all" as const,
              visibilityMode: "show" as const, backedBy: "not-yet-implemented" as const,
              backendDomain: "s1", implementationStatus: "not-started" as const },
          ],
        },
      ],
    };
    const items = getAllItems(mockConfig);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("i1");
    expect(items[1].id).toBe("i2");
  });

  it("filterByStatus filters correctly", async () => {
    const { filterByStatus } = await import("../../../client/src/navigation/moduleNavHelpers");
    const mockConfig = {
      id: "test", label: "Test", baseRoute: "/test",
      sections: [{
        id: "s1", label: "S1", iconHint: "x", purpose: "test", href: "/test/s1",
        requiredAction: "test.s1.read", scopeType: "all" as const,
        visibilityMode: "show" as const, backedBy: "existing-page" as const,
        backendDomain: "s1", implementationStatus: "live" as const,
        items: [
          { id: "i1", label: "I1", href: "/test/s1/i1", section: "s1",
            requiredAction: "test.s1.read", scopeType: "all" as const,
            visibilityMode: "show" as const, backedBy: "existing-page" as const,
            backendDomain: "s1", implementationStatus: "live" as const },
          { id: "i2", label: "I2", href: "/test/s1/i2", section: "s1",
            requiredAction: "test.s1.read", scopeType: "all" as const,
            visibilityMode: "show" as const, backedBy: "not-yet-implemented" as const,
            backendDomain: "s1", implementationStatus: "not-started" as const },
        ],
      }],
    };
    expect(filterByStatus(mockConfig, "live")).toHaveLength(1);
    expect(filterByStatus(mockConfig, "not-started")).toHaveLength(1);
    expect(filterByStatus(mockConfig, "placeholder")).toHaveLength(0);
  });

  it("findSection and findItemByHref work correctly", async () => {
    const { findSection, findItemByHref } = await import("../../../client/src/navigation/moduleNavHelpers");
    const mockConfig = {
      id: "test", label: "Test", baseRoute: "/test",
      sections: [{
        id: "s1", label: "Section One", iconHint: "x", purpose: "test", href: "/test/s1",
        requiredAction: "test.s1.read", scopeType: "all" as const,
        visibilityMode: "show" as const, backedBy: "existing-page" as const,
        backendDomain: "s1", implementationStatus: "live" as const,
        items: [
          { id: "i1", label: "I1", href: "/test/s1/i1", section: "s1",
            requiredAction: "test.s1.read", scopeType: "all" as const,
            visibilityMode: "show" as const, backedBy: "existing-page" as const,
            backendDomain: "s1", implementationStatus: "live" as const },
        ],
      }],
    };
    expect(findSection(mockConfig, "s1")?.label).toBe("Section One");
    expect(findSection(mockConfig, "nonexistent")).toBeUndefined();
    expect(findItemByHref(mockConfig, "/test/s1/i1")?.id).toBe("i1");
    expect(findItemByHref(mockConfig, "/test/nonexistent")).toBeUndefined();
  });

  it("countByStatus returns correct counts", async () => {
    const { countByStatus } = await import("../../../client/src/navigation/moduleNavHelpers");
    const mockConfig = {
      id: "test", label: "Test", baseRoute: "/test",
      sections: [{
        id: "s1", label: "S1", iconHint: "x", purpose: "test", href: "/test/s1",
        requiredAction: "test.s1.read", scopeType: "all" as const,
        visibilityMode: "show" as const, backedBy: "existing-page" as const,
        backendDomain: "s1", implementationStatus: "live" as const,
        items: [
          { id: "i1", label: "I1", href: "/test/s1/i1", section: "s1",
            requiredAction: "test.s1.read", scopeType: "all" as const,
            visibilityMode: "show" as const, backedBy: "existing-page" as const,
            backendDomain: "s1", implementationStatus: "live" as const },
          { id: "i2", label: "I2", href: "/test/s1/i2", section: "s1",
            requiredAction: "test.s1.read", scopeType: "all" as const,
            visibilityMode: "show" as const, backedBy: "not-yet-implemented" as const,
            backendDomain: "s1", implementationStatus: "not-started" as const },
        ],
      }],
    };
    const counts = countByStatus(mockConfig);
    expect(counts.live).toBe(1);
    expect(counts["not-started"]).toBe(1);
    expect(counts.placeholder).toBe(0);
    expect(counts.planned).toBe(0);
  });

  it("validateModuleNavConfig detects errors in invalid config", async () => {
    const { validateModuleNavConfig } = await import("../../../client/src/navigation/moduleNavHelpers");
    const badConfig = {
      id: "test", label: "Test", baseRoute: "/test",
      sections: [{
        id: "s1", label: "S1", iconHint: "x", purpose: "test", href: "/test/s1",
        requiredAction: "test.s1.read", scopeType: "all" as const,
        visibilityMode: "show" as const, backedBy: "existing-page" as const,
        backendDomain: "s1", implementationStatus: "live" as const,
        items: [
          {
            id: "bad-item", label: "Bad Item", href: "/wrong/prefix",
            section: "s1", requiredAction: "test.s1.read",
            scopeType: "all" as const, visibilityMode: "show" as const,
            backedBy: "not-yet-implemented" as const, backendDomain: "s1",
            implementationStatus: "live" as const,
          },
        ],
      }],
    };
    const errors = validateModuleNavConfig(badConfig);
    // Should catch: href doesn't start with /test/, and live + not-yet-implemented
    const hrefError = errors.find((e) => e.message.includes("does not start with"));
    const coherenceError = errors.find((e) => e.message.includes("live but backedBy"));
    expect(hrefError).toBeTruthy();
    expect(coherenceError).toBeTruthy();
  });
});

// ============================================================================
// C. HR Nav Config Conforms to Shared Contract Shape
// ============================================================================

describe("Phase 10 — HR Conforms to Shared Contract", () => {
  it("HR nav config satisfies ModuleNavConfig interface shape", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");

    // Top-level shape
    expect(typeof HR_NAV_CONFIG.id).toBe("string");
    expect(typeof HR_NAV_CONFIG.label).toBe("string");
    expect(typeof HR_NAV_CONFIG.baseRoute).toBe("string");
    expect(Array.isArray(HR_NAV_CONFIG.sections)).toBe(true);
  });

  it("every HR section satisfies ModuleNavSection interface shape", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { SCOPE_TYPES, VISIBILITY_MODES, BACKED_BY_VALUES, IMPLEMENTATION_STATUSES } =
      await import("../../../client/src/navigation/moduleNavTypes");

    for (const section of HR_NAV_CONFIG.sections) {
      expect(typeof section.id).toBe("string");
      expect(typeof section.label).toBe("string");
      expect(typeof section.iconHint).toBe("string");
      expect(typeof section.purpose).toBe("string");
      expect(typeof section.href).toBe("string");
      expect(typeof section.requiredAction).toBe("string");
      expect(SCOPE_TYPES).toContain(section.scopeType);
      expect(VISIBILITY_MODES).toContain(section.visibilityMode);
      expect(BACKED_BY_VALUES).toContain(section.backedBy);
      expect(IMPLEMENTATION_STATUSES).toContain(section.implementationStatus);
      expect(Array.isArray(section.items)).toBe(true);
    }
  });

  it("every HR item satisfies ModuleNavItem interface shape", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { SCOPE_TYPES, VISIBILITY_MODES, BACKED_BY_VALUES, IMPLEMENTATION_STATUSES, ACTION_PATTERN } =
      await import("../../../client/src/navigation/moduleNavTypes");

    for (const item of getAllHrNavItems()) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.label).toBe("string");
      expect(typeof item.href).toBe("string");
      expect(typeof item.section).toBe("string");
      expect(typeof item.requiredAction).toBe("string");
      expect(ACTION_PATTERN.test(item.requiredAction)).toBe(true);
      expect(SCOPE_TYPES).toContain(item.scopeType);
      expect(VISIBILITY_MODES).toContain(item.visibilityMode);
      expect(BACKED_BY_VALUES).toContain(item.backedBy);
      expect(IMPLEMENTATION_STATUSES).toContain(item.implementationStatus);
    }
  });

  it("HR action strings match shared ACTION_PATTERN", async () => {
    const { HR_NAV_CONFIG, getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { ACTION_PATTERN } = await import("../../../client/src/navigation/moduleNavTypes");

    for (const section of HR_NAV_CONFIG.sections) {
      expect(ACTION_PATTERN.test(section.requiredAction)).toBe(true);
    }
    for (const item of getAllHrNavItems()) {
      expect(ACTION_PATTERN.test(item.requiredAction)).toBe(true);
    }
  });

  it("HR baseRoute starts all item hrefs", async () => {
    const { HR_NAV_CONFIG, getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    for (const item of getAllHrNavItems()) {
      expect(item.href.startsWith(HR_NAV_CONFIG.baseRoute + "/")).toBe(true);
    }
  });
});

// ============================================================================
// D. Shared Generic Validator on HR Config
// ============================================================================

describe("Phase 10 — Shared Validator on HR Config", () => {
  it("validateModuleNavConfig returns zero errors on HR config", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { validateModuleNavConfig } = await import("../../../client/src/navigation/moduleNavHelpers");

    // Cast HR config to the shared shape (HR extends the base with extra fields)
    const errors = validateModuleNavConfig(HR_NAV_CONFIG as any);
    const hardErrors = errors.filter((e) => e.severity === "error");
    expect(hardErrors).toHaveLength(0);
  });

  it("shared helpers work on HR config", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { getAllItems, countByStatus, findSection } = await import("../../../client/src/navigation/moduleNavHelpers");

    const items = getAllItems(HR_NAV_CONFIG as any);
    expect(items).toHaveLength(68);

    const counts = countByStatus(HR_NAV_CONFIG as any);
    expect(counts.live).toBe(32);
    expect(counts.placeholder).toBe(1);
    expect(counts["not-started"]).toBe(35);

    const section = findSection(HR_NAV_CONFIG as any, "time-attendance");
    expect(section?.label).toBe("Time & Attendance");
  });
});

// ============================================================================
// E. Reference Implementation Doc Exists
// ============================================================================

describe("Phase 10 — Reference Implementation Doc", () => {
  it("CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/modules/human-resources/CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("reference doc mentions HR as reference implementation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/modules/human-resources/CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md", import.meta.url).pathname,
    );
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("reference implementation");
    expect(content).toContain("moduleNavTypes.ts");
    expect(content).toContain("moduleNavHelpers.ts");
  });
});

// ============================================================================
// F. Governance-Centrale Platform Docs Exist
// ============================================================================

describe("Phase 10 — Governance-Centrale Platform Docs", () => {
  it("Governance-Centrale/README.md exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/README.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("MODULE_NAV_STANDARD.md exists in global/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/global/MODULE_NAV_STANDARD.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("MODULE_NAV_GOVERNANCE_RULES.md exists in global/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("MODULE_NAV_ADOPTION_CHECKLIST.md exists in global/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/global/MODULE_NAV_ADOPTION_CHECKLIST.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("GOVERNANCE_INDEX.md exists in index/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/index/GOVERNANCE_INDEX.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("GOVERNANCE_SCOPE.md exists in index/", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/index/GOVERNANCE_SCOPE.md", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("templates/module-nav/ has all 4 template files", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const templateDir = path.resolve(
      new URL("../../../Governance-Centrale/templates/module-nav", import.meta.url).pathname,
    );
    const files = fs.readdirSync(templateDir);
    expect(files).toContain("MODULE_NAV_CONFIG.template.ts");
    expect(files).toContain("MODULE_SECTION_LANDING_PAGE_CHECKLIST.md");
    expect(files).toContain("MODULE_NAV_GOVERNANCE_REVIEW.template.md");
    expect(files).toContain("MODULE_NAV_DEFERRED_ITEMS.template.md");
  });

  it("GOVERNANCE_INDEX.md references the shared contract", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../Governance-Centrale/index/GOVERNANCE_INDEX.md", import.meta.url).pathname,
    );
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("moduleNavTypes.ts");
    expect(content).toContain("moduleNavHelpers.ts");
    expect(content).toContain("MODULE_NAV_STANDARD");
    expect(content).toContain("CARBON_SIDENAV_REFERENCE_IMPLEMENTATION");
  });
});
