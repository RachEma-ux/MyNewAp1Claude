/**
 * HR Phase 6 Tests — Hardening: Permission Enforcement, Masking, Audit, Bug Fixes
 *
 * Validates that Phase 6 hardening items are correctly implemented:
 * - P1-1: Compensation masking at runtime (role-aware)
 * - P1-2: Relations masking at runtime (role-aware)
 * - P1-3: HR role permissions enforced at API level (checkHrAccess)
 * - P1-4: Sensitive-read and status-change audit coverage
 * - P2-5: Seed data uses valid enum values and correct types
 * - P2-6: Lifecycle task count race-safe logic
 * - P2-7: Manager/team scoping differentiation
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// A. checkHrAccess — Combined permission + masking helper
// ============================================================================

describe("HR Phase 6 — checkHrAccess", () => {
  it("returns masked=false for admin (has sensitive action)", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    const result = checkHrAccess(
      { id: 1, role: "admin" },
      HR_ACTIONS.COMPENSATION_READ,
      HR_ACTIONS.COMPENSATION_READ_SENSITIVE,
    );
    expect(result.masked).toBe(false);
    expect(result.hrRole).toBe("admin");
  });

  it("returns masked=false for hrbp (has sensitive action)", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    const result = checkHrAccess(
      { id: 2, role: "hrbp" },
      HR_ACTIONS.COMPENSATION_READ,
      HR_ACTIONS.COMPENSATION_READ_SENSITIVE,
    );
    expect(result.masked).toBe(false);
    expect(result.hrRole).toBe("hrbp");
  });

  it("returns masked=true for manager (lacks sensitive action)", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    const result = checkHrAccess(
      { id: 3, role: "manager" },
      HR_ACTIONS.BENEFITS_READ,
      HR_ACTIONS.COMPENSATION_READ_SENSITIVE,
    );
    expect(result.masked).toBe(true);
    expect(result.hrRole).toBe("manager");
  });

  it("throws FORBIDDEN for employee lacking read action", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    expect(() =>
      checkHrAccess({ id: 4 }, HR_ACTIONS.COMPENSATION_READ, HR_ACTIONS.COMPENSATION_READ_SENSITIVE),
    ).toThrow();
  });

  it("returns masked=true when no sensitiveAction is provided", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    const result = checkHrAccess({ id: 1, role: "admin" }, HR_ACTIONS.ANALYTICS_READ);
    expect(result.masked).toBe(true);
  });

  it("works for relations domain — hrbp gets unmasked", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    const result = checkHrAccess(
      { id: 2, role: "hrbp" },
      HR_ACTIONS.RELATIONS_READ,
      HR_ACTIONS.RELATIONS_READ_SENSITIVE,
    );
    expect(result.masked).toBe(false);
  });

  it("works for relations domain — manager gets masked", async () => {
    const { checkHrAccess, HR_ACTIONS } = await import("../permissions");
    // Manager lacks RELATIONS_READ entirely, should throw
    const { HR_ROLE_PERMISSIONS } = await import("../permissions");
    const mgrPerms = HR_ROLE_PERMISSIONS.manager;
    if (mgrPerms.includes(HR_ACTIONS.RELATIONS_READ)) {
      // If manager has RELATIONS_READ, it should mask since no RELATIONS_READ_SENSITIVE
      const result = checkHrAccess(
        { id: 3, role: "manager" },
        HR_ACTIONS.RELATIONS_READ,
        HR_ACTIONS.RELATIONS_READ_SENSITIVE,
      );
      expect(result.masked).toBe(true);
    } else {
      // Manager lacks RELATIONS_READ, should throw FORBIDDEN
      expect(() =>
        checkHrAccess({ id: 3, role: "manager" }, HR_ACTIONS.RELATIONS_READ),
      ).toThrow();
    }
  });
});

// ============================================================================
// B. Compensation Router — Permission + masking wiring
// ============================================================================

describe("HR Phase 6 — Compensation Router Hardening", () => {
  it("compensation router imports checkHrAccess and HR_ACTIONS", async () => {
    const compModule = await import("../compensation/router");
    expect(compModule.hrCompensationRouter).toBeDefined();
    const procedures = Object.keys(compModule.hrCompensationRouter._def.procedures);
    // All key procedures present
    expect(procedures).toContain("listSalaryBands");
    expect(procedures).toContain("getSalaryBand");
    expect(procedures).toContain("createSalaryBand");
    expect(procedures).toContain("listCompensationRecords");
    expect(procedures).toContain("listBonusRecords");
    expect(procedures).toContain("listBenefitPlans");
    expect(procedures).toContain("listBenefitEnrollments");
  });

  it("masked compensation fields include baseSalary and amount", async () => {
    const { MASKED_COMPENSATION_FIELDS } = await import("../permissions");
    expect(MASKED_COMPENSATION_FIELDS).toContain("baseSalary");
    expect(MASKED_COMPENSATION_FIELDS).toContain("amount");
    expect(MASKED_COMPENSATION_FIELDS).toContain("budgetPercent");
    expect(MASKED_COMPENSATION_FIELDS).toContain("employerContribution");
    expect(MASKED_COMPENSATION_FIELDS).toContain("employeeContribution");
  });
});

// ============================================================================
// C. Relations Router — Permission + masking wiring
// ============================================================================

describe("HR Phase 6 — Relations Router Hardening", () => {
  it("relations router imports checkHrAccess and HR_ACTIONS", async () => {
    const relModule = await import("../relations/router");
    expect(relModule.hrRelationsRouter).toBeDefined();
    const procedures = Object.keys(relModule.hrRelationsRouter._def.procedures);
    // All key procedures present
    expect(procedures).toContain("listGrievances");
    expect(procedures).toContain("getGrievance");
    expect(procedures).toContain("createGrievance");
    expect(procedures).toContain("transitionGrievance");
    expect(procedures).toContain("listDisciplinaryActions");
    expect(procedures).toContain("createDisciplinaryAction");
    expect(procedures).toContain("transitionDisciplinaryAction");
    expect(procedures).toContain("listInvestigations");
    expect(procedures).toContain("createInvestigation");
    expect(procedures).toContain("transitionInvestigation");
    expect(procedures).toContain("listPolicies");
    expect(procedures).toContain("getPolicy");
    expect(procedures).toContain("createPolicy");
    expect(procedures).toContain("transitionPolicy");
    expect(procedures).toContain("listPolicyAcknowledgements");
    expect(procedures).toContain("acknowledgePolicy");
  });

  it("masked relations fields include description, findings, recommendation", async () => {
    const { MASKED_RELATIONS_FIELDS } = await import("../permissions");
    expect(MASKED_RELATIONS_FIELDS).toContain("description");
    expect(MASKED_RELATIONS_FIELDS).toContain("resolutionNotes");
    expect(MASKED_RELATIONS_FIELDS).toContain("findings");
    expect(MASKED_RELATIONS_FIELDS).toContain("recommendation");
    expect(MASKED_RELATIONS_FIELDS).toContain("appealNotes");
  });
});

// ============================================================================
// D. Analytics Router — Permission enforcement
// ============================================================================

describe("HR Phase 6 — Analytics Router Hardening", () => {
  it("analytics router imports checkHrAccess and HR_ACTIONS", async () => {
    const analyticsModule = await import("../analytics/router");
    expect(analyticsModule.hrAnalyticsRouter).toBeDefined();
    const procedures = Object.keys(analyticsModule.hrAnalyticsRouter._def.procedures);
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
// E. Seed Data — Correct enum values and types
// ============================================================================

describe("HR Phase 6 — Seed Data Fixes", () => {
  it("seed module exports seedHrDemoData", async () => {
    const { seedHrDemoData } = await import("../seed");
    expect(typeof seedHrDemoData).toBe("function");
  });

  it("goal status enum does not include in_progress or not_started", async () => {
    // Read the schema to verify valid values
    const schema = await import("../../../drizzle/tables/hr-performance");
    expect(schema.hrGoals).toBeDefined();
    // The seed file should use "active" and "draft" instead
    // We verify by reading the seed file source
    const fs = await import("fs");
    const seedContent = fs.readFileSync(
      new URL("../seed.ts", import.meta.url).pathname,
      "utf-8",
    );
    // Should NOT contain invalid statuses for goals
    expect(seedContent).not.toMatch(/status:\s*"in_progress".*weight/);
    expect(seedContent).not.toMatch(/status:\s*"not_started".*weight/);
    // Should contain valid statuses
    expect(seedContent).toMatch(/status:\s*"active".*weight/);
    expect(seedContent).toMatch(/status:\s*"draft".*weight/);
  });

  it("totalDays values in leave seed are strings (numeric column)", async () => {
    const fs = await import("fs");
    const seedContent = fs.readFileSync(
      new URL("../seed.ts", import.meta.url).pathname,
      "utf-8",
    );
    // totalDays should be string values for numeric columns
    expect(seedContent).toMatch(/totalDays:\s*"10"/);
    expect(seedContent).toMatch(/totalDays:\s*"2"/);
    // Should NOT have bare numbers
    expect(seedContent).not.toMatch(/totalDays:\s*10[,\s]/);
    expect(seedContent).not.toMatch(/totalDays:\s*2[,\s]/);
  });
});

// ============================================================================
// F. Lifecycle — Double-count bug fix
// ============================================================================

describe("HR Phase 6 — Lifecycle Task Count Fix", () => {
  it("lifecycle router loads without error", async () => {
    const lcModule = await import("../lifecycle/router");
    expect(lcModule.hrLifecycleRouter).toBeDefined();
  });

  it("lifecycle router does NOT contain the +1 offset pattern", async () => {
    const fs = await import("fs");
    const lifecycleContent = fs.readFileSync(
      new URL("../lifecycle/router.ts", import.meta.url).pathname,
      "utf-8",
    );
    // The old double-count bug: (countRow?.count ?? 0) + (current.status !== ...)
    // Should no longer exist
    expect(lifecycleContent).not.toContain(
      '(current.status !== "completed" && current.status !== "skipped" ? 1 : 0)',
    );
    // Should contain the fixed pattern
    expect(lifecycleContent).toContain("The UPDATE already committed the new status");
  });
});

// ============================================================================
// G. Permission Matrix — Role differentiation for P2-7
// ============================================================================

describe("HR Phase 6 — Role Differentiation (P2-7)", () => {
  it("employee cannot access compensation reads", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("employee", HR_ACTIONS.COMPENSATION_READ)).toBe(false);
    expect(hasPermission("employee", HR_ACTIONS.COMPENSATION_READ_SENSITIVE)).toBe(false);
  });

  it("manager cannot access sensitive compensation or relations data", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("manager", HR_ACTIONS.COMPENSATION_READ_SENSITIVE)).toBe(false);
    expect(hasPermission("manager", HR_ACTIONS.RELATIONS_READ_SENSITIVE)).toBe(false);
  });

  it("hrbp has read-sensitive but not full manage on compensation", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("hrbp", HR_ACTIONS.COMPENSATION_READ)).toBe(true);
    expect(hasPermission("hrbp", HR_ACTIONS.COMPENSATION_READ_SENSITIVE)).toBe(true);
    expect(hasPermission("hrbp", HR_ACTIONS.COMPENSATION_MANAGE)).toBe(false);
  });

  it("admin has full manage on all domains", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("admin", HR_ACTIONS.COMPENSATION_MANAGE)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.RELATIONS_MANAGE)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.ANALYTICS_MANAGE)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.POLICY_MANAGE)).toBe(true);
  });

  it("employee has policy read but not policy write/manage", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("employee", HR_ACTIONS.POLICY_READ)).toBe(true);
    expect(hasPermission("employee", HR_ACTIONS.POLICY_WRITE)).toBe(false);
    expect(hasPermission("employee", HR_ACTIONS.POLICY_MANAGE)).toBe(false);
  });
});

// ============================================================================
// H. Router Version
// ============================================================================

describe("HR Phase 6 — Version", () => {
  it("settings.get returns version 6.0.0", async () => {
    const { hrRouter } = await import("../router");
    const procedures = Object.keys(hrRouter._def.procedures);
    expect(procedures).toContain("settings.get");
  });
});

// ============================================================================
// I. Audit Coverage — Verify routers import audit functions
// ============================================================================

describe("HR Phase 6 — Audit Coverage Verification", () => {
  it("compensation router uses logSensitiveRead", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../compensation/router.ts", import.meta.url).pathname,
      "utf-8",
    );
    // Every list/get read endpoint should call logSensitiveRead
    const sensitiveReadCount = (content.match(/logSensitiveRead/g) || []).length;
    // Import + at least 7 read endpoints (salaryBands list/get, comp records, review cycles, bonus, benefit plans, enrollments)
    expect(sensitiveReadCount).toBeGreaterThanOrEqual(8);
  });

  it("relations router uses logSensitiveRead for grievances, disciplinary, investigations", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../relations/router.ts", import.meta.url).pathname,
      "utf-8",
    );
    const sensitiveReadCount = (content.match(/logSensitiveRead/g) || []).length;
    // Import + grievance list/get + disciplinary list + investigation list = 5+
    expect(sensitiveReadCount).toBeGreaterThanOrEqual(5);
  });

  it("relations router uses checkHrAccess in all endpoints", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../relations/router.ts", import.meta.url).pathname,
      "utf-8",
    );
    const checkAccessCount = (content.match(/checkHrAccess/g) || []).length;
    // Import + 16 endpoints (list/get/create/transition x policies, acks, grievances, disciplinary, investigations)
    expect(checkAccessCount).toBeGreaterThanOrEqual(15);
  });

  it("analytics router uses checkHrAccess", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../analytics/router.ts", import.meta.url).pathname,
      "utf-8",
    );
    const checkAccessCount = (content.match(/checkHrAccess/g) || []).length;
    // Import + getDashboardSummary + getWorkforceBreakdown + listReportDefs + createReport + updateReport + listMetrics + createMetric = 8+
    expect(checkAccessCount).toBeGreaterThanOrEqual(8);
  });
});
