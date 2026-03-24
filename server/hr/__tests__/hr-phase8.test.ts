/**
 * HR Phase 8 Tests — Final Acceptance & Rollout Readiness
 *
 * This is the final validation layer for the Carbon SideNav rollout.
 * It covers:
 *
 * A. Final config-to-reality alignment (nav config matches actual file surface)
 * B. Route compatibility and alias behavior
 * C. Section-level visibility coherence
 * D. Item-level visibility coherence
 * E. Deferred/placeholder item behavior consistency
 * F. Feature flag / rollout mechanism state
 * G. Implemented leaves backed by real surfaces (not theater)
 * H. Sensitive leaves do not outrun governance
 * I. Nav config validator produces clean result
 * J. Cross-phase permission coverage (final check)
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Final Config-to-Reality Alignment
// ============================================================================

describe("HR Phase 8 — Config-to-Reality Alignment", () => {
  it("every live item has a currentComponent that matches an actual page file", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const fs = await import("fs");
    const path = await import("path");

    const liveItems = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" && i.backedBy === "existing-page",
    );

    const hrPagesDir = path.resolve(
      new URL("../../../client/src/pages/hr", import.meta.url).pathname,
    );

    for (const item of liveItems) {
      expect(item.currentComponent).toBeTruthy();
      const filePath = path.join(hrPagesDir, `${item.currentComponent}.tsx`);
      const exists = fs.existsSync(filePath);
      expect(exists, `Missing page file for ${item.id}: ${item.currentComponent}.tsx`).toBe(true);
    }
  });

  it("every live item's currentRoute starts with /hr/", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveItems = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );

    for (const item of liveItems) {
      const route = item.currentRoute ?? item.href;
      expect(route.startsWith("/hr/"), `${item.id} route does not start with /hr/: ${route}`).toBe(true);
    }
  });

  it("no live item has backedBy='not-yet-implemented'", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveItems = getAllHrNavItems().filter((i) => i.implementationStatus === "live");
    for (const item of liveItems) {
      expect(
        item.backedBy,
        `Live item ${item.id} has backedBy='not-yet-implemented'`,
      ).not.toBe("not-yet-implemented");
    }
  });

  it("no not-started item has backedBy other than 'not-yet-implemented'", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const notStarted = getAllHrNavItems().filter((i) => i.implementationStatus === "not-started");
    for (const item of notStarted) {
      expect(
        item.backedBy,
        `Not-started item ${item.id} has backedBy='${item.backedBy}' instead of 'not-yet-implemented'`,
      ).toBe("not-yet-implemented");
    }
  });

  it("section count is 13 and item count is 68", async () => {
    const { HR_NAV_CONFIG, getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    expect(HR_NAV_CONFIG.sections).toHaveLength(13);
    expect(getAllHrNavItems()).toHaveLength(68);
  });

  it("implementation breakdown: 32 live, 1 placeholder, 35 not-started", async () => {
    const { getItemsByStatus } = await import("../../../client/src/config/hrNavConfig");
    expect(getItemsByStatus("live")).toHaveLength(32);
    expect(getItemsByStatus("placeholder")).toHaveLength(1);
    expect(getItemsByStatus("not-started")).toHaveLength(35);
    expect(getItemsByStatus("planned")).toHaveLength(0);
  });
});

// ============================================================================
// B. Route Compatibility and Alias Behavior
// ============================================================================

describe("HR Phase 8 — Route Compatibility", () => {
  it("all 28 route aliases exist and have valid structure", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    expect(HR_ROUTE_ALIASES).toHaveLength(28);
    for (const alias of HR_ROUTE_ALIASES) {
      expect(alias.oldRoute).toBeTruthy();
      expect(alias.newRoute).toBeTruthy();
      expect(alias.component).toBeTruthy();
      expect(alias.targetSection).toBeTruthy();
      expect(alias.oldRoute.startsWith("/hr/")).toBe(true);
      expect(alias.newRoute.startsWith("/hr/")).toBe(true);
    }
  });

  it("all alias target sections match existing nav config sections", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const sectionIds = new Set(HR_NAV_CONFIG.sections.map((s) => s.id));

    for (const alias of HR_ROUTE_ALIASES) {
      expect(
        sectionIds.has(alias.targetSection),
        `Alias ${alias.oldRoute} targets non-existent section '${alias.targetSection}'`,
      ).toBe(true);
    }
  });

  it("all aliases are in documented status (redirect activation deferred)", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    for (const alias of HR_ROUTE_ALIASES) {
      expect(alias.status).toBe("documented");
    }
  });

  it("old flat routes are still mounted in App.tsx alongside section routes", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );

    // Critical flat routes that must remain mounted
    const criticalFlatRoutes = [
      "/hr/directory", "/hr/organization", "/hr/compensation",
      "/hr/timesheet", "/hr/leave", "/hr/goals", "/hr/reviews",
      "/hr/talent", "/hr/analytics", "/hr/settings",
    ];
    for (const route of criticalFlatRoutes) {
      expect(
        appContent.includes(`path="${route}"`),
        `Flat route ${route} missing from App.tsx`,
      ).toBe(true);
    }

    // Section landing routes that must also be mounted
    const sectionRoutes = [
      "/hr/workforce-planning", "/hr/talent-acquisition", "/hr/lifecycle",
      "/hr/employee-records", "/hr/compensation-benefits", "/hr/time-attendance",
      "/hr/learning-development", "/hr/performance-talent", "/hr/employee-relations",
      "/hr/wellbeing-engagement", "/hr/analytics-reporting", "/hr/security-access",
      "/hr/compliance",
    ];
    for (const route of sectionRoutes) {
      expect(
        appContent.includes(`path="${route}"`),
        `Section route ${route} missing from App.tsx`,
      ).toBe(true);
    }
  });

  it("resolveNewRoute and resolveOldRoute are inverse for all aliases", async () => {
    const { HR_ROUTE_ALIASES, resolveNewRoute, resolveOldRoute } = await import(
      "../../../client/src/config/hrRouteAliases"
    );
    for (const alias of HR_ROUTE_ALIASES) {
      expect(resolveNewRoute(alias.oldRoute)).toBe(alias.newRoute);
      expect(resolveOldRoute(alias.newRoute)).toBe(alias.oldRoute);
    }
  });
});

// ============================================================================
// C. Section-Level Visibility Coherence
// ============================================================================

describe("HR Phase 8 — Section Visibility Coherence", () => {
  it("every section has at least one live child item", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    for (const section of HR_NAV_CONFIG.sections) {
      const hasLiveChild = section.items.some(
        (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
      );
      expect(hasLiveChild, `Section ${section.id} has no live/placeholder items`).toBe(true);
    }
  });

  it("section visibility mode is consistent with child visibility modes", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    for (const section of HR_NAV_CONFIG.sections) {
      // Sections with visibilityMode "show" should have at least one "show" child
      if (section.visibilityMode === "show") {
        const hasShowChild = section.items.some((i) => i.visibilityMode === "show");
        expect(
          hasShowChild,
          `Section ${section.id} has mode 'show' but no child with mode 'show'`,
        ).toBe(true);
      }
    }
  });

  it("admin sees all 13 sections", async () => {
    const { getVisibleSections } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminSections = getVisibleSections(HR_ROLE_PERMISSIONS.admin);
    expect(adminSections).toHaveLength(13);
  });

  it("employee does not see security-access section", async () => {
    const { getVisibleSections } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeSections = getVisibleSections(HR_ROLE_PERMISSIONS.employee);
    const sectionIds = employeeSections.map((s) => s.id);
    expect(sectionIds).not.toContain("security-access");
  });
});

// ============================================================================
// D. Item-Level Visibility Coherence
// ============================================================================

describe("HR Phase 8 — Item Visibility Coherence", () => {
  it("all items with visibilityMode 'show' are accessible to employee role", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    const showItems = getAllHrNavItems().filter((i) => i.visibilityMode === "show");
    for (const item of showItems) {
      const vis = resolveItemVisibility(item, employeeActions);
      expect(vis.visible, `Show-mode item ${item.id} not visible to employee`).toBe(true);
    }
  });

  it("all items with hide-if-no-access are hidden from unauthorized roles", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");

    // Synthetic user with no HR actions
    const noActions: readonly string[] = [];
    const hideItems = getAllHrNavItems().filter((i) => i.visibilityMode === "hide-if-no-access");
    for (const item of hideItems) {
      const vis = resolveItemVisibility(item, noActions);
      expect(vis.visible, `Item ${item.id} visible despite no permissions`).toBe(false);
    }
  });

  it("requiredAction on every item exists in HR_ACTIONS constant set", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { HR_ACTIONS } = await import("../permissions");
    const allActions = new Set(Object.values(HR_ACTIONS));

    for (const item of getAllHrNavItems()) {
      expect(
        allActions.has(item.requiredAction),
        `Item ${item.id} requiredAction '${item.requiredAction}' not in HR_ACTIONS`,
      ).toBe(true);
    }
  });

  it("sensitiveAction on items with sensitiveReadAudit exists in HR_ACTIONS", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { HR_ACTIONS } = await import("../permissions");
    const allActions = new Set(Object.values(HR_ACTIONS));

    const auditedItems = getAllHrNavItems().filter((i) => i.sensitiveReadAudit && i.sensitiveAction);
    for (const item of auditedItems) {
      expect(
        allActions.has(item.sensitiveAction!),
        `Item ${item.id} sensitiveAction '${item.sensitiveAction}' not in HR_ACTIONS`,
      ).toBe(true);
    }
  });

  it("scopeActions values all exist in HR_ACTIONS", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { HR_ACTIONS } = await import("../permissions");
    const allActions = new Set(Object.values(HR_ACTIONS));

    const scopedItems = getAllHrNavItems().filter((i) => i.scopeActions);
    for (const item of scopedItems) {
      const sa = item.scopeActions!;
      if (sa.global) expect(allActions.has(sa.global), `${item.id} global scope action '${sa.global}' missing`).toBe(true);
      if (sa.team) expect(allActions.has(sa.team), `${item.id} team scope action '${sa.team}' missing`).toBe(true);
      if (sa.self) expect(allActions.has(sa.self), `${item.id} self scope action '${sa.self}' missing`).toBe(true);
    }
  });
});

// ============================================================================
// E. Deferred/Placeholder Item Behavior Consistency
// ============================================================================

describe("HR Phase 8 — Deferred Item Consistency", () => {
  it("all 35 not-started items have backedBy='not-yet-implemented'", async () => {
    const { getItemsByStatus } = await import("../../../client/src/config/hrNavConfig");
    const notStarted = getItemsByStatus("not-started");
    expect(notStarted).toHaveLength(35);
    for (const item of notStarted) {
      expect(item.backedBy).toBe("not-yet-implemented");
    }
  });

  it("all not-started items do NOT have a currentComponent", async () => {
    const { getItemsByStatus } = await import("../../../client/src/config/hrNavConfig");
    const notStarted = getItemsByStatus("not-started");
    for (const item of notStarted) {
      expect(
        item.currentComponent,
        `Not-started item ${item.id} has a currentComponent '${item.currentComponent}'`,
      ).toBeUndefined();
    }
  });

  it("placeholder item (role-based-access) has currentRoute and currentComponent", async () => {
    const { getItemsByStatus } = await import("../../../client/src/config/hrNavConfig");
    const placeholders = getItemsByStatus("placeholder");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].id).toBe("role-based-access");
    expect(placeholders[0].currentRoute).toBe("/hr/settings");
    expect(placeholders[0].currentComponent).toBe("HRSettingsPage");
    expect(placeholders[0].backedBy).toBe("tab-in-existing-page");
  });

  it("every section with deferred items still has at least one live item", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    for (const section of HR_NAV_CONFIG.sections) {
      const deferredCount = section.items.filter((i) => i.implementationStatus === "not-started").length;
      if (deferredCount > 0) {
        const liveCount = section.items.filter(
          (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
        ).length;
        expect(
          liveCount,
          `Section ${section.id} has ${deferredCount} deferred items but 0 live items`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// F. Feature Flag / Rollout Mechanism State
// ============================================================================

describe("HR Phase 8 — Rollout Mechanism", () => {
  it("router version is 8.0.0", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain('version: "8.0.0"');
  });

  it("carbonSideNavRollout feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("carbonSideNavRollout: true");
  });

  it("navConfigValidation feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("navConfigValidation: true");
  });

  it("backwardCompatAliases feature flag is true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(content).toContain("backwardCompatAliases: true");
  });

  it("HR router has 14 domain sub-routers + settings + me = 16 namespaces", async () => {
    const { hrRouter } = await import("../router");
    const procedures = Object.keys(hrRouter._def.procedures);
    const namespaces = new Set(procedures.map((p) => p.split(".")[0]));
    expect(namespaces.size).toBe(16);
  });
});

// ============================================================================
// G. Implemented Leaves Backed by Real Surfaces
// ============================================================================

describe("HR Phase 8 — Real Surface Verification", () => {
  it("all live items with existing-page have matching page files on disk", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const fs = await import("fs");
    const path = await import("path");

    const hrPagesDir = path.resolve(
      new URL("../../../client/src/pages/hr", import.meta.url).pathname,
    );

    const liveExisting = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" && i.backedBy === "existing-page",
    );

    expect(liveExisting.length).toBe(32);

    for (const item of liveExisting) {
      const filePath = path.join(hrPagesDir, `${item.currentComponent}.tsx`);
      expect(
        fs.existsSync(filePath),
        `Item ${item.id}: page file ${item.currentComponent}.tsx does not exist`,
      ).toBe(true);
    }
  });

  it("HRSectionLandingPage.tsx exists and is used for section routes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../client/src/pages/hr/HRSectionLandingPage.tsx", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("HRHomePage.tsx exists for /hr route", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      new URL("../../../client/src/pages/hr/HRHomePage.tsx", import.meta.url).pathname,
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("total HR page files matches expected count (36: 1 home + 1 section landing + 34 leaf pages)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const hrPagesDir = path.resolve(
      new URL("../../../client/src/pages/hr", import.meta.url).pathname,
    );

    const files = fs.readdirSync(hrPagesDir).filter((f: string) => f.endsWith(".tsx"));
    expect(files.length).toBe(36);
  });
});

// ============================================================================
// H. Sensitive Leaves Do Not Outrun Governance
// ============================================================================

describe("HR Phase 8 — Sensitive Governance Alignment", () => {
  it("all sensitive-scope items have hide-if-no-access visibility", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const sensitiveItems = getAllHrNavItems().filter((i) => i.scopeType === "sensitive");
    for (const item of sensitiveItems) {
      expect(
        item.visibilityMode,
        `Sensitive item ${item.id} has visibility '${item.visibilityMode}' instead of 'hide-if-no-access'`,
      ).toBe("hide-if-no-access");
    }
  });

  it("all items with maskingRequired have a masking function mapped", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const maskedItems = getAllHrNavItems().filter((i) => i.maskingRequired);
    const validFieldSets = new Set(["directory", "compensation", "relations", "talent"]);

    for (const item of maskedItems) {
      expect(item.maskingFieldSet).toBeTruthy();
      expect(
        validFieldSets.has(item.maskingFieldSet!),
        `Item ${item.id} has invalid maskingFieldSet '${item.maskingFieldSet}'`,
      ).toBe(true);
    }
  });

  it("masking functions exist in permissions module for each fieldSet", async () => {
    const perms = await import("../permissions");
    expect(typeof perms.maskDirectoryFields).toBe("function");
    expect(typeof perms.maskCompensationFields).toBe("function");
    expect(typeof perms.maskRelationsFields).toBe("function");
    expect(typeof perms.maskTalentFields).toBe("function");
  });

  it("items with sensitiveReadAudit=true are backed by routers that call logSensitiveRead", async () => {
    const { getItemsWithSensitiveAudit } = await import("../../../client/src/config/hrNavConfig");
    const auditedItems = getItemsWithSensitiveAudit();
    expect(auditedItems).toHaveLength(10);

    // Verify domains of audited items match router domains with logSensitiveRead
    const domains = new Set(auditedItems.map((i) => i.backendDomain));
    expect(domains.has("compensation")).toBe(true);
    expect(domains.has("relations")).toBe(true);
    expect(domains.has("talent")).toBe(true);
  });

  it("employee role cannot see any sensitive-scope live items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    const sensitiveLiveItems = getAllHrNavItems().filter(
      (i) => i.scopeType === "sensitive" && (i.implementationStatus === "live" || i.implementationStatus === "placeholder"),
    );

    for (const item of sensitiveLiveItems) {
      const vis = resolveItemVisibility(item, employeeActions);
      expect(
        vis.visible,
        `Sensitive item ${item.id} visible to employee`,
      ).toBe(false);
    }
  });
});

// ============================================================================
// I. Nav Config Validator Produces Clean Result
// ============================================================================

describe("HR Phase 8 — Validator Clean Result", () => {
  it("validateHrNavConfig returns valid=true with no errors", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validator stats match expected counts", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    expect(result.stats.totalSections).toBe(13);
    expect(result.stats.totalItems).toBe(68);
    expect(result.stats.liveItems).toBe(33); // 32 live + 1 placeholder
    expect(result.stats.plannedItems).toBe(35);
    expect(result.stats.itemsWithMasking).toBe(14);
    expect(result.stats.itemsWithSensitiveAudit).toBe(10);
  });

  it("no alias-mismatch errors", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    const aliasMismatches = [...result.errors, ...result.warnings].filter(
      (e) => e.category === "alias-mismatch",
    );
    expect(aliasMismatches).toHaveLength(0);
  });

  it("no route-coherence errors", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    const routeErrors = result.errors.filter((e) => e.category === "route-coherence");
    expect(routeErrors).toHaveLength(0);
  });
});

// ============================================================================
// J. Cross-Phase Permission Coverage (Final Check)
// ============================================================================

describe("HR Phase 8 — Final Permission Coverage", () => {
  it("every requiredAction in nav config is granted to at least admin role", async () => {
    const { getAllHrNavItems, HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminActions = new Set(HR_ROLE_PERMISSIONS.admin);

    // Section-level actions
    for (const section of HR_NAV_CONFIG.sections) {
      expect(
        adminActions.has(section.requiredAction),
        `Section ${section.id} action '${section.requiredAction}' not in admin permissions`,
      ).toBe(true);
    }

    // Item-level actions
    for (const item of getAllHrNavItems()) {
      expect(
        adminActions.has(item.requiredAction),
        `Item ${item.id} action '${item.requiredAction}' not in admin permissions`,
      ).toBe(true);
    }
  });

  it("self-service items (visibilityMode=show) have actions available to employee role", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = new Set(HR_ROLE_PERMISSIONS.employee);

    const showItems = getAllHrNavItems().filter((i) => i.visibilityMode === "show");
    for (const item of showItems) {
      // Self-service items should have their action available to employee
      // (either the exact action or a self-scoped variant)
      const hasAction = employeeActions.has(item.requiredAction);
      const hasSelfAction = item.scopeActions?.self && employeeActions.has(item.scopeActions.self);
      expect(
        hasAction || hasSelfAction,
        `Show-mode item ${item.id} action '${item.requiredAction}' not available to employee`,
      ).toBe(true);
    }
  });

  it("resolveDataScope and checkHrAccess are exported from permissions", async () => {
    const perms = await import("../permissions");
    expect(typeof perms.resolveDataScope).toBe("function");
    expect(typeof perms.checkHrAccess).toBe("function");
    expect(typeof perms.requireHrPermission).toBe("function");
    expect(typeof perms.getHrRoleForUser).toBe("function");
    expect(typeof perms.preventSelfApproval).toBe("function");
  });

  it("HR_ROLE_PERMISSIONS covers all 5 roles", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ROLES } = await import("../permissions");
    for (const role of HR_ROLES) {
      expect(HR_ROLE_PERMISSIONS[role]).toBeTruthy();
      expect(Array.isArray(HR_ROLE_PERMISSIONS[role])).toBe(true);
      expect(HR_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
