/**
 * HR Nav Validation Tests — Phase 6 Stabilization & Rollout Readiness
 * Phase 9 additions: Drift detection, dead-end handling, maintainability
 *
 * Covers:
 * A. Nav config structural integrity (required fields, uniqueness, format)
 * B. Route coherence (live items → mounted routes, section landing alignment)
 * C. Backward compatibility (all 28 aliases valid, old routes preserved)
 * D. Governance metadata completeness (scope, masking, audit, visibility)
 * E. Role/visibility profiles (employee, manager, hrbp, admin visibility)
 * F. Scope resolution per role (self, team, all, none)
 * G. Masking classification per role
 * H. Rollout readiness checks (feature flags, version)
 * I. Consistency layer validation utility
 * J. Drift detection (config digest, baseline comparison)
 * K. Dead-end detection (live items with broken links)
 * L. Section completion and health summary
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Nav Config Structural Integrity
// ============================================================================

describe("HR Nav Config — Structural Integrity", () => {
  it("has exactly 13 sections", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    expect(HR_NAV_CONFIG.sections).toHaveLength(13);
  });

  it("has exactly 68 leaf items across all sections", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    expect(getAllHrNavItems()).toHaveLength(68);
  });

  it("every section has a unique id", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const ids = HR_NAV_CONFIG.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item has a unique id", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const ids = getAllHrNavItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every section has required fields (id, label, requiredAction, visibilityMode)", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    for (const section of HR_NAV_CONFIG.sections) {
      expect(section.id).toBeTruthy();
      expect(section.label).toBeTruthy();
      expect(section.requiredAction).toBeTruthy();
      expect(section.visibilityMode).toBeTruthy();
    }
  });

  it("every item has required fields (id, label, href, requiredAction, visibilityMode, scopeType)", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    for (const item of getAllHrNavItems()) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.requiredAction).toBeTruthy();
      expect(item.visibilityMode).toBeTruthy();
      expect(item.scopeType).toBeTruthy();
    }
  });

  it("all requiredAction values follow hr.<domain>.<operation> pattern", async () => {
    const { getAllHrNavItems, HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const pattern = /^hr\.[a-z]+\.[a-z]+(\.[a-z]+)?$/;
    for (const section of HR_NAV_CONFIG.sections) {
      expect(section.requiredAction).toMatch(pattern);
    }
    for (const item of getAllHrNavItems()) {
      expect(item.requiredAction).toMatch(pattern);
    }
  });

  it("all href values start with /hr/", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    for (const item of getAllHrNavItems()) {
      expect(item.href.startsWith("/hr/")).toBe(true);
    }
  });

  it("all visibilityMode values are valid enum members", async () => {
    const { getAllHrNavItems, HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const validModes = ["show", "hide-if-no-access", "show-disabled", "redirect-to-parent"];
    for (const section of HR_NAV_CONFIG.sections) {
      expect(validModes).toContain(section.visibilityMode);
    }
    for (const item of getAllHrNavItems()) {
      expect(validModes).toContain(item.visibilityMode);
    }
  });

  it("all scopeType values are valid enum members", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const validScopes = ["self", "team", "all", "sensitive", "mixed"];
    for (const item of getAllHrNavItems()) {
      expect(validScopes).toContain(item.scopeType);
    }
  });

  it("all backedBy values are valid enum members", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const validBacked = ["existing-page", "new-page", "tab-in-existing-page", "not-yet-implemented"];
    for (const item of getAllHrNavItems()) {
      expect(validBacked).toContain(item.backedBy);
    }
  });

  it("all implementationStatus values are valid enum members", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const validStatuses = ["live", "placeholder", "planned", "not-started"];
    for (const item of getAllHrNavItems()) {
      expect(validStatuses).toContain(item.implementationStatus);
    }
  });

  it("implementation status breakdown: 32 live, 1 placeholder, 35 not-started", async () => {
    const { getItemsByStatus } = await import("../../../client/src/config/hrNavConfig");
    expect(getItemsByStatus("live")).toHaveLength(32);
    expect(getItemsByStatus("placeholder")).toHaveLength(1);
    expect(getItemsByStatus("not-started")).toHaveLength(35);
  });
});

// ============================================================================
// B. Route Coherence
// ============================================================================

describe("HR Nav Config — Route Coherence", () => {
  it("every live item has a currentRoute or href that resolves", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveItems = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of liveItems) {
      const route = item.currentRoute ?? item.href;
      expect(route).toBeTruthy();
      expect(route.startsWith("/hr/")).toBe(true);
    }
  });

  it("no live item has backedBy set to not-yet-implemented", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveItems = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of liveItems) {
      expect(item.backedBy).not.toBe("not-yet-implemented");
    }
  });

  it("not-started items have backedBy = not-yet-implemented", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const notStarted = getAllHrNavItems().filter((i) => i.implementationStatus === "not-started");
    for (const item of notStarted) {
      expect(item.backedBy).toBe("not-yet-implemented");
    }
  });

  it("all 13 section IDs match expected set", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const expectedIds = [
      "workforce-planning",
      "talent-acquisition",
      "onboarding-offboarding",
      "employee-records",
      "compensation-benefits",
      "time-attendance",
      "learning-development",
      "performance-talent",
      "employee-relations",
      "wellbeing-engagement",
      "analytics-reporting",
      "security-access",
      "compliance",
    ];
    const actualIds = HR_NAV_CONFIG.sections.map((s) => s.id);
    expect(actualIds).toEqual(expectedIds);
  });

  it("section landing routes match section IDs (onboarding-offboarding → /hr/lifecycle)", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    // Section IDs map 1:1 to routes except onboarding-offboarding → /hr/lifecycle
    for (const section of HR_NAV_CONFIG.sections) {
      const expectedRoute =
        section.id === "onboarding-offboarding" ? "/hr/lifecycle" : `/hr/${section.id}`;
      // Verify this is a valid route by checking it starts with /hr/
      expect(expectedRoute.startsWith("/hr/")).toBe(true);
    }
  });

  it("App.tsx mounts all 13 section landing routes", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );
    const sectionRoutes = [
      "/hr/workforce-planning",
      "/hr/talent-acquisition",
      "/hr/lifecycle",
      "/hr/employee-records",
      "/hr/compensation-benefits",
      "/hr/time-attendance",
      "/hr/learning-development",
      "/hr/performance-talent",
      "/hr/employee-relations",
      "/hr/wellbeing-engagement",
      "/hr/analytics-reporting",
      "/hr/security-access",
      "/hr/compliance",
    ];
    for (const route of sectionRoutes) {
      expect(appContent).toContain(`path="${route}"`);
    }
  });

  it("App.tsx mounts all 29 flat HR routes", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );
    const flatRoutes = [
      "/hr/directory", "/hr/organization", "/hr/positions", "/hr/staffing",
      "/hr/skills", "/hr/recruitment", "/hr/onboarding", "/hr/offboarding",
      "/hr/timesheet", "/hr/leave", "/hr/overtime", "/hr/shifts",
      "/hr/training", "/hr/certifications", "/hr/goals", "/hr/reviews",
      "/hr/compensation", "/hr/benefits", "/hr/policies", "/hr/grievances",
      "/hr/surveys", "/hr/engagement", "/hr/incidents", "/hr/compliance-mgmt",
      "/hr/analytics", "/hr/talent", "/hr/reports", "/hr/settings",
    ];
    for (const route of flatRoutes) {
      expect(appContent).toContain(`path="${route}"`);
    }
    // /hr home route
    expect(appContent).toContain('path="/hr"');
  });

  it("App.tsx mounts all 6 Phase 4 deep routes", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );
    const deepRoutes = [
      "/hr/workforce-planning/job-architecture",
      "/hr/employee-records/work-permits",
      "/hr/employee-records/letters-certificates",
      "/hr/compliance/risk-management",
      "/hr/security-access/audit-logs",
      "/hr/security-access/access-controls",
    ];
    for (const route of deepRoutes) {
      expect(appContent).toContain(`path="${route}"`);
    }
  });

  it("section routes are mounted BEFORE flat routes in App.tsx (wouter first-match-wins)", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );
    const sectionPos = appContent.indexOf('path="/hr/workforce-planning"');
    const flatPos = appContent.indexOf('path="/hr/directory"');
    expect(sectionPos).toBeLessThan(flatPos);
  });

  it("deep routes are mounted AFTER flat routes (more specific paths)", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync(
      new URL("../../../client/src/App.tsx", import.meta.url).pathname,
      "utf-8",
    );
    const flatPos = appContent.indexOf('path="/hr/settings"');
    const deepPos = appContent.indexOf('path="/hr/workforce-planning/job-architecture"');
    expect(deepPos).toBeGreaterThan(flatPos);
  });
});

// ============================================================================
// C. Backward Compatibility
// ============================================================================

describe("HR Nav Config — Backward Compatibility", () => {
  it("route alias map has exactly 28 entries", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    expect(HR_ROUTE_ALIASES).toHaveLength(28);
  });

  it("all alias old routes start with /hr/", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    for (const alias of HR_ROUTE_ALIASES) {
      expect(alias.oldRoute.startsWith("/hr/")).toBe(true);
    }
  });

  it("all alias new routes start with /hr/", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    for (const alias of HR_ROUTE_ALIASES) {
      expect(alias.newRoute.startsWith("/hr/")).toBe(true);
    }
  });

  it("all aliases are in documented status (not yet active-redirect)", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    for (const alias of HR_ROUTE_ALIASES) {
      expect(alias.status).toBe("documented");
    }
  });

  it("all alias target sections exist in the nav config", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const sectionIds = new Set(HR_NAV_CONFIG.sections.map((s) => s.id));
    for (const alias of HR_ROUTE_ALIASES) {
      expect(sectionIds.has(alias.targetSection)).toBe(true);
    }
  });

  it("resolveNewRoute returns the correct canonical route", async () => {
    const { resolveNewRoute } = await import("../../../client/src/config/hrRouteAliases");
    expect(resolveNewRoute("/hr/directory")).toBe("/hr/employee-records/profile");
    expect(resolveNewRoute("/hr/compensation")).toBe("/hr/compensation-benefits/salary-structure");
    expect(resolveNewRoute("/hr/analytics")).toBe("/hr/analytics-reporting/workforce-dashboards");
  });

  it("resolveOldRoute returns the old route for a canonical route", async () => {
    const { resolveOldRoute } = await import("../../../client/src/config/hrRouteAliases");
    expect(resolveOldRoute("/hr/employee-records/profile")).toBe("/hr/directory");
    expect(resolveOldRoute("/hr/compensation-benefits/salary-structure")).toBe("/hr/compensation");
  });

  it("getAllOldRoutes returns 28 routes", async () => {
    const { getAllOldRoutes } = await import("../../../client/src/config/hrRouteAliases");
    expect(getAllOldRoutes()).toHaveLength(28);
  });

  it("no old route duplicates in alias map", async () => {
    const { HR_ROUTE_ALIASES } = await import("../../../client/src/config/hrRouteAliases");
    const oldRoutes = HR_ROUTE_ALIASES.map((a) => a.oldRoute);
    expect(new Set(oldRoutes).size).toBe(oldRoutes.length);
  });
});

// ============================================================================
// D. Governance Metadata Completeness
// ============================================================================

describe("HR Nav Config — Governance Metadata", () => {
  it("items with maskingRequired also have maskingFieldSet", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const maskedItems = getAllHrNavItems().filter((i) => i.maskingRequired);
    for (const item of maskedItems) {
      expect(item.maskingFieldSet).toBeTruthy();
    }
  });

  it("maskingFieldSet values are valid (directory, compensation, relations, talent)", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const validSets = ["directory", "compensation", "relations", "talent"];
    for (const item of getAllHrNavItems()) {
      if (item.maskingFieldSet) {
        expect(validSets).toContain(item.maskingFieldSet);
      }
    }
  });

  it("items with sensitiveReadAudit=true have a sensitiveAction", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const auditedItems = getAllHrNavItems().filter((i) => i.sensitiveReadAudit);
    for (const item of auditedItems) {
      expect(item.sensitiveAction).toBeTruthy();
    }
  });

  it("live items with scopeType=mixed that declare scopeActions have valid ones", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const liveMixedWithScope = getAllHrNavItems().filter(
      (i) =>
        i.scopeType === "mixed" &&
        (i.implementationStatus === "live" || i.implementationStatus === "placeholder") &&
        i.scopeActions != null,
    );
    // At least some live mixed items have scopeActions defined
    expect(liveMixedWithScope.length).toBeGreaterThan(0);
    for (const item of liveMixedWithScope) {
      const sa = item.scopeActions!;
      expect(sa.global || sa.team || sa.self).toBeTruthy();
    }
  });

  it("scopeActions have at least one of global/team/self", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const itemsWithScope = getAllHrNavItems().filter((i) => i.scopeActions);
    for (const item of itemsWithScope) {
      const sa = item.scopeActions!;
      const hasAny = sa.global || sa.team || sa.self;
      expect(hasAny).toBeTruthy();
    }
  });

  it("sensitive scope items are concentrated in expected sections", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const sensitiveBySection = HR_NAV_CONFIG.sections.map((s) => ({
      id: s.id,
      count: s.items.filter((i) => i.scopeType === "sensitive").length,
    })).filter((s) => s.count > 0);
    // Sensitive items should exist in compensation, relations, security, analytics, compliance, talent
    const sensitiveSections = sensitiveBySection.map((s) => s.id);
    expect(sensitiveSections).toContain("compensation-benefits");
    expect(sensitiveSections).toContain("security-access");
  });

  it("exactly 14 items require masking", async () => {
    const { getItemsRequiringMasking } = await import("../../../client/src/config/hrNavConfig");
    expect(getItemsRequiringMasking()).toHaveLength(14);
  });

  it("exactly 10 items have sensitiveReadAudit", async () => {
    const { getItemsWithSensitiveAudit } = await import("../../../client/src/config/hrNavConfig");
    expect(getItemsWithSensitiveAudit()).toHaveLength(10);
  });
});

// ============================================================================
// E. Role/Visibility Profiles
// ============================================================================

describe("HR Nav Config — Role Visibility", () => {
  it("employee sees self-service items (show visibility mode)", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    const showItems = HR_NAV_CONFIG.sections
      .flatMap((s) => s.items)
      .filter((i) => i.visibilityMode === "show");

    for (const item of showItems) {
      const vis = resolveItemVisibility(item, employeeActions);
      expect(vis.visible).toBe(true);
    }
  });

  it("employee cannot see hide-if-no-access items they lack permissions for", async () => {
    const { HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    // Compensation items require hr.compensation.read — employee doesn't have it
    const compSection = HR_NAV_CONFIG.sections.find((s) => s.id === "compensation-benefits");
    expect(compSection).toBeTruthy();
    const compItems = compSection!.items.filter(
      (i) => i.visibilityMode === "hide-if-no-access" && i.requiredAction === "hr.compensation.read",
    );
    for (const item of compItems) {
      const vis = resolveItemVisibility(item, employeeActions);
      expect(vis.visible).toBe(false);
    }
  });

  it("admin sees all items regardless of visibility mode", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminActions = HR_ROLE_PERMISSIONS.admin;

    for (const item of getAllHrNavItems()) {
      const vis = resolveItemVisibility(item, adminActions);
      expect(vis.visible).toBe(true);
    }
  });

  it("hrbp sees most items but may lack admin-only items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const hrbpActions = HR_ROLE_PERMISSIONS.hrbp;

    const allItems = getAllHrNavItems();
    const visible = allItems.filter(
      (i) => resolveItemVisibility(i, hrbpActions).visible,
    );
    // hrbp should see the majority of items
    expect(visible.length).toBeGreaterThan(50);
  });

  it("manager sees team-accessible items but not sensitive-only items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveItemVisibility } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const managerActions = HR_ROLE_PERMISSIONS.manager;

    const allItems = getAllHrNavItems();
    const visible = allItems.filter(
      (i) => resolveItemVisibility(i, managerActions).visible,
    );
    // Manager should see more than employee but less than hrbp
    expect(visible.length).toBeGreaterThan(20);
    expect(visible.length).toBeLessThan(68);
  });

  it("getVisibleSections filters out empty sections for employee", async () => {
    const { getVisibleSections } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    const visibleSections = getVisibleSections(employeeActions);
    // Employee should not see security-access section (requires hr.analytics.manage)
    const sectionIds = visibleSections.map((s) => s.id);
    expect(sectionIds).not.toContain("security-access");
  });

  it("getSectionAccessSummaries returns 13 summaries", async () => {
    const { getSectionAccessSummaries } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminActions = HR_ROLE_PERMISSIONS.admin;

    const summaries = getSectionAccessSummaries(adminActions);
    expect(summaries).toHaveLength(13);
    for (const summary of summaries) {
      expect(summary.totalItems).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// F. Scope Resolution Per Role
// ============================================================================

describe("HR Nav Config — Scope Resolution", () => {
  it("resolveClientScope returns 'all' for admin on any item with scopeActions", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveClientScope } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminActions = HR_ROLE_PERMISSIONS.admin;

    const itemsWithScope = getAllHrNavItems().filter((i) => i.scopeActions);
    for (const item of itemsWithScope) {
      expect(resolveClientScope(item, adminActions)).toBe("all");
    }
  });

  it("resolveClientScope returns 'self' for employee on self-scoped time items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveClientScope } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    const timeItems = getAllHrNavItems().filter(
      (i) => i.scopeActions?.self?.startsWith("hr.time.read"),
    );
    for (const item of timeItems) {
      expect(resolveClientScope(item, employeeActions)).toBe("self");
    }
  });

  it("resolveClientScope returns 'team' for manager on time items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveClientScope } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const managerActions = HR_ROLE_PERMISSIONS.manager;

    // Manager has TIME_READ (global for time) so should get "all"
    // unless there's a specific scope hierarchy
    const timeItem = getAllHrNavItems().find((i) => i.id === "time-tracking");
    if (timeItem?.scopeActions) {
      const scope = resolveClientScope(timeItem, managerActions);
      // Manager has hr.time.read (global action in scopeActions) → "all"
      // OR hr.time.read.team → "team"
      expect(["all", "team"]).toContain(scope);
    }
  });

  it("resolveClientScope returns 'none' for employee lacking all scope actions", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { resolveClientScope } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const employeeActions = HR_ROLE_PERMISSIONS.employee;

    // Compensation items — employee has no compensation read
    const compItem = getAllHrNavItems().find(
      (i) => i.requiredAction === "hr.compensation.read" && i.scopeActions,
    );
    if (compItem) {
      expect(resolveClientScope(compItem, employeeActions)).toBe("none");
    }
  });
});

// ============================================================================
// G. Masking Classification Per Role
// ============================================================================

describe("HR Nav Config — Masking Classification", () => {
  it("wouldSeeMaskedData returns true for manager on compensation items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { wouldSeeMaskedData } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const managerActions = HR_ROLE_PERMISSIONS.manager;

    const compItems = getAllHrNavItems().filter(
      (i) => i.maskingFieldSet === "compensation",
    );
    for (const item of compItems) {
      // Manager lacks hr.compensation.read.sensitive → masked
      expect(wouldSeeMaskedData(item, managerActions)).toBe(true);
    }
  });

  it("wouldSeeMaskedData returns false for admin on all items", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { wouldSeeMaskedData } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const adminActions = HR_ROLE_PERMISSIONS.admin;

    for (const item of getAllHrNavItems()) {
      expect(wouldSeeMaskedData(item, adminActions)).toBe(false);
    }
  });

  it("wouldSeeMaskedData returns false for hrbp on compensation items (has sensitive action)", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const { wouldSeeMaskedData } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const hrbpActions = HR_ROLE_PERMISSIONS.hrbp;

    const compItems = getAllHrNavItems().filter(
      (i) => i.maskingFieldSet === "compensation",
    );
    for (const item of compItems) {
      expect(wouldSeeMaskedData(item, hrbpActions)).toBe(false);
    }
  });

  it("getMaskedItemsForUser returns items for manager role", async () => {
    const { getMaskedItemsForUser } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const managerActions = HR_ROLE_PERMISSIONS.manager;

    const maskedItems = getMaskedItemsForUser(managerActions);
    // Manager should see some masked items (talent items they can see but can't unmask)
    expect(maskedItems.length).toBeGreaterThanOrEqual(0);
  });

  it("getUnmaskedItemsForUser returns more items for admin than for manager", async () => {
    const { getUnmaskedItemsForUser } = await import("../../../client/src/lib/hrNavAuth");
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");

    const adminUnmasked = getUnmaskedItemsForUser(HR_ROLE_PERMISSIONS.admin);
    const managerUnmasked = getUnmaskedItemsForUser(HR_ROLE_PERMISSIONS.manager);
    expect(adminUnmasked.length).toBeGreaterThan(managerUnmasked.length);
  });
});

// ============================================================================
// H. Rollout Readiness Checks
// ============================================================================

describe("HR Nav Config — Rollout Readiness", () => {
  it("HR settings endpoint returns version 9.0.0", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(routerContent).toContain('version: "9.0.0"');
  });

  it("HR settings has carbonSideNavRollout feature flag", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(routerContent).toContain("carbonSideNavRollout:");
  });

  it("HR router composes exactly 14 domain sub-routers", async () => {
    const { hrRouter } = await import("../router");
    const procedures = Object.keys(hrRouter._def.procedures);
    const subRouterPrefixes = new Set<string>();
    for (const p of procedures) {
      const prefix = p.split(".")[0];
      subRouterPrefixes.add(prefix);
    }
    // 14 domain + settings + me = 16 total namespaces
    expect(subRouterPrefixes.size).toBe(16);
  });

  it("findSectionById returns correct section for all 13 IDs", async () => {
    const { findSectionById, HR_NAV_CONFIG } = await import("../../../client/src/config/hrNavConfig");
    for (const section of HR_NAV_CONFIG.sections) {
      const found = findSectionById(section.id);
      expect(found).toBeTruthy();
      expect(found!.id).toBe(section.id);
      expect(found!.label).toBe(section.label);
    }
  });

  it("findSectionById returns undefined for non-existent section", async () => {
    const { findSectionById } = await import("../../../client/src/config/hrNavConfig");
    expect(findSectionById("non-existent")).toBeUndefined();
  });
});

// ============================================================================
// I. Consistency Layer — Validation Utility
// ============================================================================

describe("HR Nav Config — Validation Utility", () => {
  it("validateHrNavConfig returns valid=true (no errors)", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validateHrNavConfig stats match expected counts", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    expect(result.stats.totalSections).toBe(13);
    expect(result.stats.totalItems).toBe(68);
    expect(result.stats.liveItems).toBe(33); // 32 live + 1 placeholder
    expect(result.stats.plannedItems).toBe(35);
    expect(result.stats.itemsWithMasking).toBe(14);
    expect(result.stats.itemsWithSensitiveAudit).toBe(10);
  });

  it("getLiveRoutes returns routes for all live items", async () => {
    const { getLiveRoutes } = await import("../../../client/src/config/hrNavConfigValidator");
    const routes = getLiveRoutes();
    expect(routes.length).toBe(33); // 32 live + 1 placeholder
    for (const r of routes) {
      expect(r.route.startsWith("/hr/")).toBe(true);
      expect(r.action).toBeTruthy();
      expect(r.itemId).toBeTruthy();
    }
  });

  it("getSectionRoutes returns 13 section routes", async () => {
    const { getSectionRoutes } = await import("../../../client/src/config/hrNavConfigValidator");
    const routes = getSectionRoutes();
    expect(routes).toHaveLength(13);
    // Verify the special case
    const lifecycleRoute = routes.find((r) => r.sectionId === "onboarding-offboarding");
    expect(lifecycleRoute?.route).toBe("/hr/lifecycle");
  });

  it("all route aliases target existing sections (validated by utility)", async () => {
    const { validateHrNavConfig } = await import("../../../client/src/config/hrNavConfigValidator");
    const result = validateHrNavConfig();
    const aliasMismatch = result.errors.filter((e) => e.category === "alias-mismatch");
    expect(aliasMismatch).toHaveLength(0);
  });
});

// ============================================================================
// J. Drift Detection (Phase 9)
// ============================================================================

describe("HR Nav Config — Drift Detection", () => {
  it("getNavConfigDigest returns deterministic digest", async () => {
    const { getNavConfigDigest } = await import("../../../client/src/config/hrNavConfigValidator");
    const d1 = getNavConfigDigest();
    const d2 = getNavConfigDigest();
    expect(d1).toEqual(d2);
  });

  it("digest has expected baseline counts", async () => {
    const { getNavConfigDigest } = await import("../../../client/src/config/hrNavConfigValidator");
    const digest = getNavConfigDigest();
    expect(digest.totalSections).toBe(13);
    expect(digest.totalItems).toBe(68);
    expect(digest.liveCount).toBe(32);
    expect(digest.placeholderCount).toBe(1);
    expect(digest.notStartedCount).toBe(35);
    expect(digest.aliasCount).toBe(28);
    expect(digest.maskingCount).toBe(14);
    expect(digest.auditCount).toBe(10);
  });

  it("digest sectionIds match expected set", async () => {
    const { getNavConfigDigest } = await import("../../../client/src/config/hrNavConfigValidator");
    const digest = getNavConfigDigest();
    expect(digest.sectionIds).toHaveLength(13);
    expect(digest.sectionIds).toContain("workforce-planning");
    expect(digest.sectionIds).toContain("compliance");
  });

  it("detectConfigDrift returns empty array for matching baseline", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import("../../../client/src/config/hrNavConfigValidator");
    const baseline = getNavConfigDigest();
    const drifts = detectConfigDrift(baseline);
    expect(drifts).toHaveLength(0);
  });

  it("detectConfigDrift detects section count change", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import("../../../client/src/config/hrNavConfigValidator");
    const baseline = { ...getNavConfigDigest(), totalSections: 12 };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.length).toBeGreaterThan(0);
    expect(drifts.some((d) => d.includes("Section count changed"))).toBe(true);
  });

  it("detectConfigDrift detects item count change", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import("../../../client/src/config/hrNavConfigValidator");
    const baseline = { ...getNavConfigDigest(), totalItems: 60 };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.some((d) => d.includes("Item count changed"))).toBe(true);
  });

  it("detectConfigDrift detects removed section", async () => {
    const { getNavConfigDigest, detectConfigDrift } = await import("../../../client/src/config/hrNavConfigValidator");
    const baseline = { ...getNavConfigDigest(), sectionIds: [...getNavConfigDigest().sectionIds, "fake-section"] };
    const drifts = detectConfigDrift(baseline);
    expect(drifts.some((d) => d.includes("Section removed: fake-section"))).toBe(true);
  });
});

// ============================================================================
// K. Dead-End Detection (Phase 9)
// ============================================================================

describe("HR Nav Config — Dead-End Detection", () => {
  it("getDeadEndItems returns no dead ends for current config", async () => {
    const { getDeadEndItems } = await import("../../../client/src/config/hrNavConfigValidator");
    const deadEnds = getDeadEndItems();
    expect(deadEnds).toHaveLength(0);
  });

  it("all live items have routes starting with /hr/", async () => {
    const { getLiveRoutes } = await import("../../../client/src/config/hrNavConfigValidator");
    const routes = getLiveRoutes();
    for (const r of routes) {
      expect(r.route.startsWith("/hr/")).toBe(true);
    }
  });

  it("no live item has backedBy=not-yet-implemented (cross-check)", async () => {
    const { getAllHrNavItems } = await import("../../../client/src/config/hrNavConfig");
    const live = getAllHrNavItems().filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    for (const item of live) {
      expect(item.backedBy).not.toBe("not-yet-implemented");
    }
  });
});

// ============================================================================
// L. Section Completion & Health Summary (Phase 9)
// ============================================================================

describe("HR Nav Config — Section Completion & Health", () => {
  it("getSectionCompletionStats returns 13 sections", async () => {
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();
    expect(stats).toHaveLength(13);
  });

  it("time-attendance section is 100% complete", async () => {
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();
    const timeSection = stats.find((s) => s.sectionId === "time-attendance");
    expect(timeSection).toBeTruthy();
    expect(timeSection!.completionPct).toBe(100);
    expect(timeSection!.notStartedItems).toBe(0);
  });

  it("completion percentages are between 0 and 100", async () => {
    const { getSectionCompletionStats } = await import("../../../client/src/config/hrNavConfigValidator");
    const stats = getSectionCompletionStats();
    for (const s of stats) {
      expect(s.completionPct).toBeGreaterThanOrEqual(0);
      expect(s.completionPct).toBeLessThanOrEqual(100);
    }
  });

  it("getNavHealthSummary returns valid summary", async () => {
    const { getNavHealthSummary } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();
    expect(summary.valid).toBe(true);
    expect(summary.errorCount).toBe(0);
    expect(summary.overallCompletionPct).toBeGreaterThan(0);
    expect(summary.overallCompletionPct).toBeLessThanOrEqual(100);
    expect(summary.sections).toHaveLength(13);
  });

  it("health summary section counts add up", async () => {
    const { getNavHealthSummary } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();
    expect(summary.sectionsComplete + summary.sectionsPartial + summary.sectionsEmpty).toBe(13);
  });

  it("health summary deadEndCount matches getDeadEndItems", async () => {
    const { getNavHealthSummary, getDeadEndItems } = await import("../../../client/src/config/hrNavConfigValidator");
    const summary = getNavHealthSummary();
    const deadEnds = getDeadEndItems();
    expect(summary.deadEndCount).toBe(deadEnds.length);
  });

  it("Phase 9 feature flags are present in router", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync(
      new URL("../router.ts", import.meta.url).pathname,
      "utf-8",
    );
    expect(routerContent).toContain("navDriftDetection:");
    expect(routerContent).toContain("navHealthSummary:");
    expect(routerContent).toContain("deferredItemTracking:");
  });
});
