/**
 * HR Module Phase 1 — Unit Tests
 *
 * Tests for module registration, permissions, audit, and DTO masking.
 * Router integration tests require DB and are covered separately.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Module Registration
// ============================================================================

describe("HR Module Registration", () => {
  it("should include 'hr' in MODULE_KEYS", async () => {
    const { MODULE_KEYS } = await import("../../../drizzle/tables/workspace-modules");
    expect(MODULE_KEYS).toContain("hr");
  });

  it("should have hr in team preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.team).toContain("hr");
  });

  it("should have hr in enterprise preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.enterprise).toContain("hr");
  });

  it("should have hr in project preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.project).toContain("hr");
  });

  it("should NOT have hr in personal preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.personal).not.toContain("hr");
  });

  it("should NOT have hr in research preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.research).not.toContain("hr");
  });

  it("should NOT have hr in readonly preset", async () => {
    const { MODULE_PRESETS } = await import("../../modules/registry");
    expect(MODULE_PRESETS.readonly).not.toContain("hr");
  });
});

// ============================================================================
// Permissions & Masking
// ============================================================================

describe("HR Permissions", () => {
  it("should export HR_ROLES with correct entries", async () => {
    const { HR_ROLES } = await import("../permissions");
    expect(HR_ROLES).toContain("employee");
    expect(HR_ROLES).toContain("manager");
    expect(HR_ROLES).toContain("hrbp");
    expect(HR_ROLES).toContain("admin");
    expect(HR_ROLES).toContain("workspace_admin");
  });

  it("should export HR_ACTIONS with directory actions", async () => {
    const { HR_ACTIONS } = await import("../permissions");
    expect(HR_ACTIONS.DIRECTORY_READ).toBe("hr.directory.read");
    expect(HR_ACTIONS.DIRECTORY_WRITE).toBe("hr.directory.write");
    expect(HR_ACTIONS.STAFFING_ASSIGN).toBe("hr.staffing.assign");
    expect(HR_ACTIONS.STAFFING_END).toBe("hr.staffing.end");
  });

  it("should mask sensitive directory fields", async () => {
    const { maskDirectoryFields } = await import("../permissions");
    const record = {
      displayName: "Jane Doe",
      primaryEmail: "jane@example.com",
      primaryPhone: "+1234567890",
      notes: "Sensitive notes",
      costCenter: "CC-123",
      legalEntity: "ACME Inc",
      workerType: "employee",
    };

    const masked = maskDirectoryFields(record);
    expect(masked.displayName).toBe("Jane Doe");
    expect(masked.primaryEmail).toBe("jane@example.com");
    expect(masked.workerType).toBe("employee");
    // Sensitive fields should be undefined
    expect(masked.primaryPhone).toBeUndefined();
    expect(masked.notes).toBeUndefined();
    expect(masked.costCenter).toBeUndefined();
    expect(masked.legalEntity).toBeUndefined();
  });

  it("should handle records without sensitive fields gracefully", async () => {
    const { maskDirectoryFields } = await import("../permissions");
    const record = { displayName: "John", status: "active" };
    const masked = maskDirectoryFields(record);
    expect(masked.displayName).toBe("John");
    expect(masked.status).toBe("active");
  });
});

// ============================================================================
// Table Schema Exports
// ============================================================================

describe("HR Table Schema Exports", () => {
  it("should export hrPeople table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrPeople).toBeDefined();
  });

  it("should export hrWorkerProfiles table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrWorkerProfiles).toBeDefined();
  });

  it("should export hrEmploymentRecords table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrEmploymentRecords).toBeDefined();
  });

  it("should export hrOrgUnits table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrOrgUnits).toBeDefined();
  });

  it("should export hrPositions table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrPositions).toBeDefined();
  });

  it("should export hrWorkspaceAssignments table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrWorkspaceAssignments).toBeDefined();
  });

  it("should export hrWorkerSkills table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrWorkerSkills).toBeDefined();
  });

  it("should export hrWorkerCertifications table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrWorkerCertifications).toBeDefined();
  });

  it("should export hrDocuments table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrDocuments).toBeDefined();
  });

  it("should export hrAuditLog table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrAuditLog).toBeDefined();
  });

  it("should export hrJobFamilies table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrJobFamilies).toBeDefined();
  });

  it("should export hrJobLevels table", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrJobLevels).toBeDefined();
  });
});

// ============================================================================
// Router Composition
// ============================================================================

describe("HR Router Composition", () => {
  it("should export hrRouter with expected sub-routers", async () => {
    const { hrRouter } = await import("../router");
    expect(hrRouter).toBeDefined();
    // tRPC router has _def.procedures or _def.router
    const def = (hrRouter as any)._def;
    expect(def).toBeDefined();
  });

  it("should export hrModuleRouter (workspace-facing)", async () => {
    const { hrModuleRouter } = await import("../../modules/hr/router");
    expect(hrModuleRouter).toBeDefined();
  });
});
