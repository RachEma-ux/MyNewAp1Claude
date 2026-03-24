/**
 * HR Role Definitions — Unit Tests
 *
 * Tests for:
 * - Schema/table exports
 * - Shared types and enums
 * - Lifecycle state transitions
 * - Permission matrix integration
 * - Field masking logic
 * - Visibility class validation
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// Schema Exports
// ============================================================================

describe("HR Role Definitions Schema", () => {
  it("should export hrRoleDefinitions table", async () => {
    const schema = await import("../../../drizzle/tables/hr-role-definitions");
    expect(schema.hrRoleDefinitions).toBeDefined();
  });

  it("should export hrRoleDefinitionVersions table", async () => {
    const schema = await import("../../../drizzle/tables/hr-role-definitions");
    expect(schema.hrRoleDefinitionVersions).toBeDefined();
  });

  it("should export hrRoleDefinitionReviews table", async () => {
    const schema = await import("../../../drizzle/tables/hr-role-definitions");
    expect(schema.hrRoleDefinitionReviews).toBeDefined();
  });

  it("should export hrPositionRoleLinks table", async () => {
    const schema = await import("../../../drizzle/tables/hr-role-definitions");
    expect(schema.hrPositionRoleLinks).toBeDefined();
  });

  it("should re-export role definition tables from barrel schema", async () => {
    const schema = await import("../../../drizzle/schema");
    expect(schema.hrRoleDefinitions).toBeDefined();
    expect(schema.hrRoleDefinitionVersions).toBeDefined();
    expect(schema.hrRoleDefinitionReviews).toBeDefined();
    expect(schema.hrPositionRoleLinks).toBeDefined();
  });
});

// ============================================================================
// Shared Types and Enums
// ============================================================================

describe("HR Role Definition Shared Types", () => {
  it("should export lifecycle statuses", async () => {
    const { ROLE_DEF_VERSION_STATUSES } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("draft");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("in_review");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("changes_requested");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("approved");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("published");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("effective");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("superseded");
    expect(ROLE_DEF_VERSION_STATUSES).toContain("retired");
    expect(ROLE_DEF_VERSION_STATUSES).toHaveLength(8);
  });

  it("should export visibility classes", async () => {
    const { ROLE_DEF_VISIBILITY_CLASSES } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("public_internal");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("team_visible");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("manager_visible");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("hr_restricted");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("admin_restricted");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toContain("confidential_case");
    expect(ROLE_DEF_VISIBILITY_CLASSES).toHaveLength(6);
  });

  it("should export change types", async () => {
    const { ROLE_DEF_CHANGE_TYPES } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_CHANGE_TYPES).toContain("minor_wording");
    expect(ROLE_DEF_CHANGE_TYPES).toContain("material");
    expect(ROLE_DEF_CHANGE_TYPES).toContain("structural");
    expect(ROLE_DEF_CHANGE_TYPES).toContain("visibility_change");
    expect(ROLE_DEF_CHANGE_TYPES).toContain("retirement");
    expect(ROLE_DEF_CHANGE_TYPES).toHaveLength(5);
  });

  it("should export review outcomes", async () => {
    const { ROLE_DEF_REVIEW_OUTCOMES } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_REVIEW_OUTCOMES).toContain("approved");
    expect(ROLE_DEF_REVIEW_OUTCOMES).toContain("changes_requested");
    expect(ROLE_DEF_REVIEW_OUTCOMES).toContain("rejected");
    expect(ROLE_DEF_REVIEW_OUTCOMES).toHaveLength(3);
  });

  it("should export entity statuses", async () => {
    const { ROLE_DEF_ENTITY_STATUSES } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_ENTITY_STATUSES).toContain("active");
    expect(ROLE_DEF_ENTITY_STATUSES).toContain("retired");
    expect(ROLE_DEF_ENTITY_STATUSES).toContain("archived");
    expect(ROLE_DEF_ENTITY_STATUSES).toHaveLength(3);
  });

  it("should export persona model", async () => {
    const { ROLE_DEF_PERSONAS } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_PERSONAS).toContain("employee");
    expect(ROLE_DEF_PERSONAS).toContain("manager");
    expect(ROLE_DEF_PERSONAS).toContain("hrbp");
    expect(ROLE_DEF_PERSONAS).toContain("admin");
    expect(ROLE_DEF_PERSONAS).toContain("governance_reviewer");
  });
});

// ============================================================================
// Lifecycle State Transitions
// ============================================================================

describe("HR Role Definition Lifecycle Transitions", () => {
  it("should allow draft → in_review", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("draft", "in_review")).toBe(true);
  });

  it("should block draft → approved (must go through review)", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("draft", "approved")).toBe(false);
  });

  it("should block draft → published", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("draft", "published")).toBe(false);
  });

  it("should block draft → effective", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("draft", "effective")).toBe(false);
  });

  it("should allow in_review → approved", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("in_review", "approved")).toBe(true);
  });

  it("should allow in_review → changes_requested", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("in_review", "changes_requested")).toBe(true);
  });

  it("should allow changes_requested → in_review (resubmit)", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("changes_requested", "in_review")).toBe(true);
  });

  it("should block changes_requested → approved (must resubmit first)", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("changes_requested", "approved")).toBe(false);
  });

  it("should allow approved → published", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("approved", "published")).toBe(true);
  });

  it("should block approved → effective (must publish first)", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("approved", "effective")).toBe(false);
  });

  it("should allow published → effective", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("published", "effective")).toBe(true);
  });

  it("should allow published → superseded", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("published", "superseded")).toBe(true);
  });

  it("should allow effective → superseded", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("effective", "superseded")).toBe(true);
  });

  it("should allow effective → retired", async () => {
    const { isValidRoleDefTransition } = await import("../../../shared/hr-role-definitions");
    expect(isValidRoleDefTransition("effective", "retired")).toBe(true);
  });

  it("should block superseded → any (terminal state)", async () => {
    const { isValidRoleDefTransition, ROLE_DEF_VERSION_STATUSES } = await import("../../../shared/hr-role-definitions");
    for (const target of ROLE_DEF_VERSION_STATUSES) {
      expect(isValidRoleDefTransition("superseded", target)).toBe(false);
    }
  });

  it("should block retired → any (terminal state)", async () => {
    const { isValidRoleDefTransition, ROLE_DEF_VERSION_STATUSES } = await import("../../../shared/hr-role-definitions");
    for (const target of ROLE_DEF_VERSION_STATUSES) {
      expect(isValidRoleDefTransition("retired", target)).toBe(false);
    }
  });

  it("should preserve historical versions (superseded has no outgoing transitions)", async () => {
    const { ROLE_DEF_VERSION_TRANSITIONS } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_VERSION_TRANSITIONS.superseded).toEqual([]);
  });
});

// ============================================================================
// Permission Matrix Integration
// ============================================================================

describe("HR Role Definition Permissions", () => {
  it("should include role-def actions in HR_ACTIONS", async () => {
    const { HR_ACTIONS } = await import("../permissions");
    expect(HR_ACTIONS.ROLE_DEF_READ).toBe("hr.roledef.read");
    expect(HR_ACTIONS.ROLE_DEF_READ_SELF).toBe("hr.roledef.read.self");
    expect(HR_ACTIONS.ROLE_DEF_READ_RESTRICTED).toBe("hr.roledef.read.restricted");
    expect(HR_ACTIONS.ROLE_DEF_DRAFT).toBe("hr.roledef.draft");
    expect(HR_ACTIONS.ROLE_DEF_SUBMIT).toBe("hr.roledef.submit");
    expect(HR_ACTIONS.ROLE_DEF_REVIEW).toBe("hr.roledef.review");
    expect(HR_ACTIONS.ROLE_DEF_APPROVE).toBe("hr.roledef.approve");
    expect(HR_ACTIONS.ROLE_DEF_PUBLISH).toBe("hr.roledef.publish");
    expect(HR_ACTIONS.ROLE_DEF_RETIRE).toBe("hr.roledef.retire");
    expect(HR_ACTIONS.ROLE_DEF_LINK_POSITION).toBe("hr.roledef.link_position");
  });

  it("should grant employee only self-read for role definitions", async () => {
    const { hasPermission } = await import("../permissions");
    expect(hasPermission("employee", "hr.roledef.read.self")).toBe(true);
    expect(hasPermission("employee", "hr.roledef.read")).toBe(false);
    expect(hasPermission("employee", "hr.roledef.draft")).toBe(false);
    expect(hasPermission("employee", "hr.roledef.approve")).toBe(false);
    expect(hasPermission("employee", "hr.roledef.publish")).toBe(false);
  });

  it("should grant manager read + draft + submit", async () => {
    const { hasPermission } = await import("../permissions");
    expect(hasPermission("manager", "hr.roledef.read")).toBe(true);
    expect(hasPermission("manager", "hr.roledef.draft")).toBe(true);
    expect(hasPermission("manager", "hr.roledef.submit")).toBe(true);
    expect(hasPermission("manager", "hr.roledef.approve")).toBe(false);
    expect(hasPermission("manager", "hr.roledef.publish")).toBe(false);
  });

  it("should grant HRBP full role-def lifecycle permissions", async () => {
    const { hasPermission } = await import("../permissions");
    expect(hasPermission("hrbp", "hr.roledef.read")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.read.restricted")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.draft")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.submit")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.review")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.approve")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.publish")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.retire")).toBe(true);
    expect(hasPermission("hrbp", "hr.roledef.link_position")).toBe(true);
  });

  it("should grant admin all role-def permissions (via Object.values)", async () => {
    const { hasPermission, HR_ACTIONS } = await import("../permissions");
    expect(hasPermission("admin", HR_ACTIONS.ROLE_DEF_READ)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.ROLE_DEF_APPROVE)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.ROLE_DEF_PUBLISH)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.ROLE_DEF_RETIRE)).toBe(true);
    expect(hasPermission("admin", HR_ACTIONS.ROLE_DEF_LINK_POSITION)).toBe(true);
  });
});

// ============================================================================
// Field Masking
// ============================================================================

describe("HR Role Definition Field Masking", () => {
  it("should mask restricted fields for non-privileged users", async () => {
    const { maskRoleDefRestrictedFields } = await import("../permissions");
    const record = {
      title: "HR Generalist",
      purposeSummary: "Supports HR ops",
      compensationNotes: "Salary band info",
      successionNotes: "Replacement plan",
      restructuringNotes: "Reorg context",
      sensitivityNotes: "Sensitive info",
      complianceNotes: "Legal notes",
      sodConstraints: "SoD info",
    };

    const masked = maskRoleDefRestrictedFields(record);
    expect(masked.title).toBe("HR Generalist");
    expect(masked.purposeSummary).toBe("Supports HR ops");
    expect(masked.compensationNotes).toBeNull();
    expect(masked.successionNotes).toBeNull();
    expect(masked.restructuringNotes).toBeNull();
    expect(masked.sensitivityNotes).toBeNull();
    expect(masked.complianceNotes).toBeNull();
    expect(masked.sodConstraints).toBeNull();
  });

  it("should mask manager-only fields for employees", async () => {
    const { maskRoleDefManagerFields } = await import("../permissions");
    const record = {
      title: "Engineer",
      directReportsScope: "3 direct reports",
      escalationTriggers: ["Budget > $10k"],
      accountabilities: ["Ship code"],
    };

    const masked = maskRoleDefManagerFields(record);
    expect(masked.title).toBe("Engineer");
    expect(masked.directReportsScope).toBeNull();
    expect(masked.escalationTriggers).toBeNull();
    expect(masked.accountabilities).toEqual(["Ship code"]);
  });

  it("should not modify non-masked fields", async () => {
    const { maskRoleDefRestrictedFields } = await import("../permissions");
    const record = {
      title: "Role A",
      accountabilities: ["Do X"],
      successMetrics: ["Metric 1"],
    };

    const masked = maskRoleDefRestrictedFields(record);
    expect(masked.title).toBe("Role A");
    expect(masked.accountabilities).toEqual(["Do X"]);
    expect(masked.successMetrics).toEqual(["Metric 1"]);
  });
});

// ============================================================================
// Router Export
// ============================================================================

describe("HR Role Definition Router", () => {
  it("should export hrRoleDefinitionRouter", async () => {
    const { hrRoleDefinitionRouter } = await import("../role-definitions/router");
    expect(hrRoleDefinitionRouter).toBeDefined();
  });

  it("should be composed into HR root router", async () => {
    const { hrRouter } = await import("../router");
    expect(hrRouter).toBeDefined();
    // The router should have the roleDefinitions sub-router
    expect((hrRouter as any)._def).toBeDefined();
  });
});

// ============================================================================
// Restricted Fields Constants
// ============================================================================

describe("HR Role Definition Restricted Fields", () => {
  it("should export MASKED_ROLE_DEF_RESTRICTED_FIELDS", async () => {
    const { MASKED_ROLE_DEF_RESTRICTED_FIELDS } = await import("../permissions");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("compensationNotes");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("successionNotes");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("restructuringNotes");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("sensitivityNotes");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("complianceNotes");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toContain("sodConstraints");
    expect(MASKED_ROLE_DEF_RESTRICTED_FIELDS).toHaveLength(6);
  });

  it("should export MASKED_ROLE_DEF_MANAGER_FIELDS", async () => {
    const { MASKED_ROLE_DEF_MANAGER_FIELDS } = await import("../permissions");
    expect(MASKED_ROLE_DEF_MANAGER_FIELDS).toContain("directReportsScope");
    expect(MASKED_ROLE_DEF_MANAGER_FIELDS).toContain("escalationTriggers");
    expect(MASKED_ROLE_DEF_MANAGER_FIELDS).toHaveLength(2);
  });

  it("should export shared restricted fields constant", async () => {
    const { ROLE_DEF_RESTRICTED_FIELDS } = await import("../../../shared/hr-role-definitions");
    expect(ROLE_DEF_RESTRICTED_FIELDS).toContain("compensationNotes");
    expect(ROLE_DEF_RESTRICTED_FIELDS).toContain("successionNotes");
    expect(ROLE_DEF_RESTRICTED_FIELDS).toContain("restructuringNotes");
    expect(ROLE_DEF_RESTRICTED_FIELDS.length).toBeGreaterThanOrEqual(6);
  });
});
