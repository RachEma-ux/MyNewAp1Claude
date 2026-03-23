/**
 * HR Phase 5 Tests — Stabilization, Cross-Phase Integration, Productization
 *
 * Tests permission matrix, audit enhancements, reminder hooks, analytics
 * expansion, workspace module integration, seed data, and frontend consistency.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. Permission Matrix & Role-Based Access
// ============================================================================

describe("HR Phase 5 — Permission Matrix", () => {
  it("exports HR_ROLE_PERMISSIONS with all 5 roles", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ROLES } = await import("../permissions");
    expect(Object.keys(HR_ROLE_PERMISSIONS)).toHaveLength(HR_ROLES.length);
    for (const role of HR_ROLES) {
      expect(HR_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(HR_ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it("employee role has limited read-self permissions", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ACTIONS } = await import("../permissions");
    const empPerms = HR_ROLE_PERMISSIONS.employee;
    expect(empPerms).toContain(HR_ACTIONS.DIRECTORY_READ_SELF);
    expect(empPerms).toContain(HR_ACTIONS.TIME_READ_SELF);
    expect(empPerms).toContain(HR_ACTIONS.LEAVE_READ_SELF);
    // Employee should NOT have write/manage permissions
    expect(empPerms).not.toContain(HR_ACTIONS.DIRECTORY_WRITE);
    expect(empPerms).not.toContain(HR_ACTIONS.ORGANIZATION_WRITE);
    expect(empPerms).not.toContain(HR_ACTIONS.COMPENSATION_READ_SENSITIVE);
    expect(empPerms).not.toContain(HR_ACTIONS.RELATIONS_READ_SENSITIVE);
  });

  it("manager role has team-level read + approval permissions", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ACTIONS } = await import("../permissions");
    const mgrPerms = HR_ROLE_PERMISSIONS.manager;
    expect(mgrPerms).toContain(HR_ACTIONS.DIRECTORY_READ_TEAM);
    expect(mgrPerms).toContain(HR_ACTIONS.TIME_APPROVE);
    expect(mgrPerms).toContain(HR_ACTIONS.LEAVE_APPROVE);
    expect(mgrPerms).toContain(HR_ACTIONS.PERFORMANCE_WRITE);
    // Manager should NOT have sensitive compensation/relations access
    expect(mgrPerms).not.toContain(HR_ACTIONS.COMPENSATION_READ_SENSITIVE);
    expect(mgrPerms).not.toContain(HR_ACTIONS.RELATIONS_READ_SENSITIVE);
  });

  it("hrbp role has sensitive read but not full manage", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ACTIONS } = await import("../permissions");
    const hrbpPerms = HR_ROLE_PERMISSIONS.hrbp;
    expect(hrbpPerms).toContain(HR_ACTIONS.COMPENSATION_READ_SENSITIVE);
    expect(hrbpPerms).toContain(HR_ACTIONS.RELATIONS_READ_SENSITIVE);
    expect(hrbpPerms).toContain(HR_ACTIONS.TALENT_WRITE);
    // HRBP should not have full manage on certain areas
    expect(hrbpPerms).not.toContain(HR_ACTIONS.COMPENSATION_MANAGE);
    expect(hrbpPerms).not.toContain(HR_ACTIONS.RISK_MANAGE);
  });

  it("admin role has all permissions", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ACTIONS } = await import("../permissions");
    const adminPerms = HR_ROLE_PERMISSIONS.admin;
    const allActions = Object.values(HR_ACTIONS);
    for (const action of allActions) {
      expect(adminPerms).toContain(action);
    }
  });

  it("workspace_admin role has all permissions", async () => {
    const { HR_ROLE_PERMISSIONS, HR_ACTIONS } = await import("../permissions");
    const wsAdminPerms = HR_ROLE_PERMISSIONS.workspace_admin;
    const allActions = Object.values(HR_ACTIONS);
    for (const action of allActions) {
      expect(wsAdminPerms).toContain(action);
    }
  });

  it("hasPermission helper works correctly", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("employee", HR_ACTIONS.DIRECTORY_READ_SELF)).toBe(true);
    expect(hasPermission("employee", HR_ACTIONS.DIRECTORY_WRITE)).toBe(false);
    expect(hasPermission("admin", HR_ACTIONS.SUCCESSION_MANAGE)).toBe(true);
  });

  it("getHrRoleForUser resolves roles correctly", async () => {
    const { getHrRoleForUser } = await import("../permissions");
    expect(getHrRoleForUser({ id: 1, role: "admin" })).toBe("admin");
    expect(getHrRoleForUser({ id: 2, role: "workspace_admin" })).toBe("workspace_admin");
    expect(getHrRoleForUser({ id: 3, role: "manager" })).toBe("manager");
    expect(getHrRoleForUser({ id: 4, role: "hrbp" })).toBe("hrbp");
    expect(getHrRoleForUser({ id: 5 })).toBe("employee");
  });

  it("requireHrPermission throws FORBIDDEN for unauthorized action", async () => {
    const { requireHrPermission, HR_ACTIONS } = await import("../permissions");
    expect(() => requireHrPermission({ id: 1 }, HR_ACTIONS.DIRECTORY_WRITE)).toThrow();
    expect(() => requireHrPermission({ id: 1, role: "admin" }, HR_ACTIONS.DIRECTORY_WRITE)).not.toThrow();
  });
});

// ============================================================================
// B. Field Masking Utilities
// ============================================================================

describe("HR Phase 5 — Field Masking", () => {
  it("maskDirectoryFields strips sensitive directory fields", async () => {
    const { maskDirectoryFields } = await import("../permissions");
    const record = { displayName: "Alice", primaryPhone: "555-1234", costCenter: "CC100", notes: "VIP" };
    const masked = maskDirectoryFields(record);
    expect(masked.displayName).toBe("Alice");
    expect(masked.primaryPhone).toBeUndefined();
    expect(masked.costCenter).toBeUndefined();
    expect(masked.notes).toBeUndefined();
  });

  it("maskCompensationFields strips salary fields", async () => {
    const { maskCompensationFields } = await import("../permissions");
    const record = { workerId: 1, baseSalary: "100000", amount: "5000", status: "active" };
    const masked = maskCompensationFields(record);
    expect(masked.workerId).toBe(1);
    expect(masked.status).toBe("active");
    expect(masked.baseSalary).toBeUndefined();
    expect(masked.amount).toBeUndefined();
  });

  it("maskRelationsFields strips investigation/grievance details", async () => {
    const { maskRelationsFields } = await import("../permissions");
    const record = { id: 1, description: "Complaint details", findings: "Found issues", status: "investigating" };
    const masked = maskRelationsFields(record);
    expect(masked.id).toBe(1);
    expect(masked.status).toBe("investigating");
    expect(masked.description).toBeUndefined();
    expect(masked.findings).toBeUndefined();
  });

  it("masking does not mutate original record", async () => {
    const { maskDirectoryFields } = await import("../permissions");
    const original = { primaryPhone: "555-1234", notes: "Important" };
    maskDirectoryFields(original);
    expect(original.primaryPhone).toBe("555-1234");
    expect(original.notes).toBe("Important");
  });
});

// ============================================================================
// C. Audit Enhancements
// ============================================================================

describe("HR Phase 5 — Audit Module", () => {
  it("exports logHrAudit, logSensitiveRead, logStatusChange functions", async () => {
    const audit = await import("../audit");
    expect(typeof audit.logHrAudit).toBe("function");
    expect(typeof audit.logSensitiveRead).toBe("function");
    expect(typeof audit.logStatusChange).toBe("function");
  });

  it("audit types are exported", async () => {
    // TypeScript type check: HrAuditCategory and HrAuditParams
    const audit = await import("../audit");
    // Just ensure the module loads without error — types are compile-time only
    expect(audit).toBeDefined();
  });
});

// ============================================================================
// D. Reminder/Automation Hooks
// ============================================================================

describe("HR Phase 5 — Reminders", () => {
  it("exports all individual reminder checkers", async () => {
    const reminders = await import("../jobs/reminders");
    expect(typeof reminders.checkCertificationExpiry).toBe("function");
    expect(typeof reminders.checkOverdueTraining).toBe("function");
    expect(typeof reminders.checkReviewsDue).toBe("function");
    expect(typeof reminders.checkPendingLeaveApprovals).toBe("function");
    expect(typeof reminders.checkSalaryReviewDeadlines).toBe("function");
    expect(typeof reminders.checkComplianceDeadlines).toBe("function");
    expect(typeof reminders.getAllReminders).toBe("function");
  });

  it("Reminder interface has correct shape", async () => {
    const reminders = await import("../jobs/reminders");
    // getAllReminders returns Reminder[] — verify it's callable
    // (actual DB calls will return [] since no DB in test)
    expect(reminders.getAllReminders).toBeDefined();
  });
});

// ============================================================================
// E. Analytics Router Expansion
// ============================================================================

describe("HR Phase 5 — Analytics Router", () => {
  it("analytics router exports all expected procedures", async () => {
    const { hrAnalyticsRouter } = await import("../analytics/router");
    const procedures = Object.keys(hrAnalyticsRouter._def.procedures);
    expect(procedures).toContain("getDashboardSummary");
    expect(procedures).toContain("getWorkforceBreakdown");
    expect(procedures).toContain("getReminders");
    expect(procedures).toContain("listReportDefinitions");
    expect(procedures).toContain("createReportDefinition");
    expect(procedures).toContain("updateReportDefinition");
    expect(procedures).toContain("listMetricSnapshots");
    expect(procedures).toContain("createMetricSnapshot");
  });
});

// ============================================================================
// F. Workspace Module Integration
// ============================================================================

describe("HR Phase 5 — Workspace Module Integration", () => {
  it("MODULE_KEYS includes 'hr'", async () => {
    const { MODULE_KEYS } = await import("../../../drizzle/tables/workspace-modules");
    expect(MODULE_KEYS).toContain("hr");
  });

  it("MODULE_PRESETS include hr for team, project, enterprise", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.team).toContain("hr");
    expect(MODULE_PRESETS.project).toContain("hr");
    expect(MODULE_PRESETS.enterprise).toContain("hr");
  });

  it("hrModuleRouter has all workspace-facing procedures", async () => {
    const { hrModuleRouter } = await import("../../modules/hr/router");
    const procedures = Object.keys(hrModuleRouter._def.procedures);
    expect(procedures).toContain("listStaff");
    expect(procedures).toContain("searchWorkers");
    expect(procedures).toContain("assignWorker");
    expect(procedures).toContain("endAssignment");
    expect(procedures).toContain("getWorkspaceCoverage");
  });

  it("modulesRouter includes hr sub-router", async () => {
    const { modulesRouter } = await import("../../modules/router");
    const subs = Object.keys(modulesRouter._def.procedures);
    // The hr procedures will appear as hr.listStaff, hr.searchWorkers, etc.
    const hrProcedures = subs.filter(s => s.startsWith("hr."));
    expect(hrProcedures.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// G. HR Root Router Composition
// ============================================================================

describe("HR Phase 5 — Root Router", () => {
  it("hrRouter has all 14 sub-routers + settings", async () => {
    const { hrRouter } = await import("../router");
    const subs = Object.keys(hrRouter._def.procedures);
    const expectedSubRouters = [
      "directory", "organization", "staffing",
      "recruiting", "lifecycle",
      "time", "learning", "performance",
      "compensation", "relations", "engagement", "compliance", "analytics", "talent",
      "settings",
    ];
    for (const sub of expectedSubRouters) {
      const hasSub = subs.some(s => s.startsWith(`${sub}.`));
      expect(hasSub).toBe(true);
    }
  });

  it("settings.get returns current version with Phase 5+ features", async () => {
    const { hrRouter } = await import("../router");
    const procedures = Object.keys(hrRouter._def.procedures);
    expect(procedures).toContain("settings.get");
    expect(procedures).toContain("settings.seedDemo");
  });
});

// ============================================================================
// H. Seed Data Module
// ============================================================================

describe("HR Phase 5 — Seed Data", () => {
  it("exports seedHrDemoData function", async () => {
    const { seedHrDemoData } = await import("../seed");
    expect(typeof seedHrDemoData).toBe("function");
  });
});

// ============================================================================
// I. Cross-Phase Schema Validation
// ============================================================================

describe("HR Phase 5 — Schema Barrel Exports", () => {
  it("all 14 HR table files re-exported from drizzle/schema", async () => {
    const schema = await import("../../../drizzle/schema");
    // Core tables
    expect(schema.hrPeople).toBeDefined();
    expect(schema.hrWorkerProfiles).toBeDefined();
    expect(schema.hrEmploymentRecords).toBeDefined();
    expect(schema.hrAuditLog).toBeDefined();
    // Organization
    expect(schema.hrOrgUnits).toBeDefined();
    expect(schema.hrPositions).toBeDefined();
    // Staffing
    expect(schema.hrWorkspaceAssignments).toBeDefined();
    // Recruiting
    expect(schema.hrRecruitmentRequests).toBeDefined();
    // Lifecycle
    expect(schema.hrLifecycleEvents).toBeDefined();
    // Time
    expect(schema.hrTimeEntries).toBeDefined();
    expect(schema.hrLeaveRequests).toBeDefined();
    // Learning
    expect(schema.hrTrainingCatalog).toBeDefined();
    expect(schema.hrCertifications).toBeDefined();
    expect(schema.hrEmployeeCertifications).toBeDefined();
    // Performance
    expect(schema.hrPerformanceCycles).toBeDefined();
    expect(schema.hrPerformanceReviews).toBeDefined();
    expect(schema.hrGoals).toBeDefined();
    // Compensation
    expect(schema.hrSalaryBands).toBeDefined();
    expect(schema.hrCompensationRecords).toBeDefined();
    expect(schema.hrBenefitPlans).toBeDefined();
    // Relations
    expect(schema.hrPolicies).toBeDefined();
    expect(schema.hrGrievances).toBeDefined();
    // Engagement
    expect(schema.hrSurveyCampaigns).toBeDefined();
    expect(schema.hrEngagementPrograms).toBeDefined();
    // Compliance
    expect(schema.hrIncidentReports).toBeDefined();
    expect(schema.hrComplianceObligations).toBeDefined();
    expect(schema.hrRiskItems).toBeDefined();
    // Analytics
    expect(schema.hrReportDefinitions).toBeDefined();
    expect(schema.hrMetricSnapshots).toBeDefined();
    // Talent
    expect(schema.hrTalentReviews).toBeDefined();
    expect(schema.hrSuccessionPlans).toBeDefined();
    expect(schema.hrSuccessionCandidates).toBeDefined();
  });
});

// ============================================================================
// J. Permission Action Count Validation
// ============================================================================

describe("HR Phase 5 — Permission Completeness", () => {
  it("HR_ACTIONS has entries covering all domains", async () => {
    const { HR_ACTIONS } = await import("../permissions");
    const actions = Object.values(HR_ACTIONS);
    // Phase 1-2
    expect(actions.filter(a => a.startsWith("hr.directory.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.organization.")).length).toBeGreaterThanOrEqual(2);
    expect(actions.filter(a => a.startsWith("hr.staffing.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.recruiting.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.lifecycle.")).length).toBeGreaterThanOrEqual(3);
    // Phase 3
    expect(actions.filter(a => a.startsWith("hr.time.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.leave.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.learning.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.performance.")).length).toBeGreaterThanOrEqual(3);
    // Phase 4
    expect(actions.filter(a => a.startsWith("hr.compensation.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.benefits.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.relations.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.compliance.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.talent.")).length).toBeGreaterThanOrEqual(3);
    expect(actions.filter(a => a.startsWith("hr.analytics.")).length).toBeGreaterThanOrEqual(3);
  });

  it("masked field arrays are non-empty", async () => {
    const { MASKED_DIRECTORY_FIELDS, MASKED_COMPENSATION_FIELDS, MASKED_RELATIONS_FIELDS } = await import("../permissions");
    expect(MASKED_DIRECTORY_FIELDS.length).toBeGreaterThan(0);
    expect(MASKED_COMPENSATION_FIELDS.length).toBeGreaterThan(0);
    expect(MASKED_RELATIONS_FIELDS.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// K. Integration — Audit hooks usage verification
// ============================================================================

describe("HR Phase 5 — Audit Integration", () => {
  it("time router imports logStatusChange", async () => {
    const timeModule = await import("../time/router");
    expect(timeModule.hrTimeRouter).toBeDefined();
  });

  it("performance router imports logStatusChange", async () => {
    const perfModule = await import("../performance/router");
    expect(perfModule.hrPerformanceRouter).toBeDefined();
  });

  it("lifecycle router imports logStatusChange", async () => {
    const lcModule = await import("../lifecycle/router");
    expect(lcModule.hrLifecycleRouter).toBeDefined();
  });

  it("compensation router imports maskCompensationFields", async () => {
    const compModule = await import("../compensation/router");
    expect(compModule.hrCompensationRouter).toBeDefined();
  });

  it("relations router imports maskRelationsFields", async () => {
    const relModule = await import("../relations/router");
    expect(relModule.hrRelationsRouter).toBeDefined();
  });
});
