/**
 * HR Permissions — Role and capability constants for HR module
 */

import { TRPCError } from "@trpc/server";

export const HR_ROLES = ["employee", "manager", "hrbp", "admin", "workspace_admin"] as const;
export type HrRole = typeof HR_ROLES[number];

export const HR_ACTIONS = {
  DIRECTORY_READ: "hr.directory.read",
  DIRECTORY_READ_TEAM: "hr.directory.read.team",
  DIRECTORY_READ_SELF: "hr.directory.read.self",
  DIRECTORY_WRITE: "hr.directory.write",
  ORGANIZATION_READ: "hr.organization.read",
  ORGANIZATION_WRITE: "hr.organization.write",
  STAFFING_READ: "hr.staffing.read",
  STAFFING_ASSIGN: "hr.staffing.assign",
  STAFFING_END: "hr.staffing.end",
  STAFFING_EXPORT: "hr.staffing.export",
  RECRUITING_READ: "hr.recruiting.read",
  RECRUITING_WRITE: "hr.recruiting.write",
  RECRUITING_MANAGE: "hr.recruiting.manage",
  LIFECYCLE_READ: "hr.lifecycle.read",
  LIFECYCLE_WRITE: "hr.lifecycle.write",
  LIFECYCLE_MANAGE: "hr.lifecycle.manage",
  ONBOARDING_READ: "hr.onboarding.read",
  ONBOARDING_MANAGE: "hr.onboarding.manage",
  OFFBOARDING_READ: "hr.offboarding.read",
  OFFBOARDING_MANAGE: "hr.offboarding.manage",
  // Phase 3 — Workforce Operations
  TIME_READ: "hr.time.read",
  TIME_READ_SELF: "hr.time.read.self",
  TIME_READ_TEAM: "hr.time.read.team",
  TIME_WRITE: "hr.time.write",
  TIME_APPROVE: "hr.time.approve",
  LEAVE_READ: "hr.leave.read",
  LEAVE_READ_SELF: "hr.leave.read.self",
  LEAVE_WRITE: "hr.leave.write",
  LEAVE_APPROVE: "hr.leave.approve",
  OVERTIME_READ: "hr.overtime.read",
  OVERTIME_WRITE: "hr.overtime.write",
  OVERTIME_APPROVE: "hr.overtime.approve",
  SHIFT_READ: "hr.shift.read",
  SHIFT_WRITE: "hr.shift.write",
  SHIFT_MANAGE: "hr.shift.manage",
  LEARNING_READ: "hr.learning.read",
  LEARNING_READ_SELF: "hr.learning.read.self",
  LEARNING_WRITE: "hr.learning.write",
  LEARNING_MANAGE: "hr.learning.manage",
  CERTIFICATION_READ: "hr.certification.read",
  CERTIFICATION_WRITE: "hr.certification.write",
  CERTIFICATION_MANAGE: "hr.certification.manage",
  PERFORMANCE_READ: "hr.performance.read",
  PERFORMANCE_READ_SELF: "hr.performance.read.self",
  PERFORMANCE_WRITE: "hr.performance.write",
  PERFORMANCE_MANAGE: "hr.performance.manage",
  // Phase 4 — Compensation & Benefits
  COMPENSATION_READ: "hr.compensation.read",
  COMPENSATION_READ_SENSITIVE: "hr.compensation.read.sensitive",
  COMPENSATION_WRITE: "hr.compensation.write",
  COMPENSATION_MANAGE: "hr.compensation.manage",
  BENEFITS_READ: "hr.benefits.read",
  BENEFITS_WRITE: "hr.benefits.write",
  BENEFITS_MANAGE: "hr.benefits.manage",
  // Phase 4 — Employee Relations
  RELATIONS_READ: "hr.relations.read",
  RELATIONS_READ_SENSITIVE: "hr.relations.read.sensitive",
  RELATIONS_WRITE: "hr.relations.write",
  RELATIONS_MANAGE: "hr.relations.manage",
  POLICY_READ: "hr.policy.read",
  POLICY_WRITE: "hr.policy.write",
  POLICY_MANAGE: "hr.policy.manage",
  // Phase 4 — Well Being & Engagement
  ENGAGEMENT_READ: "hr.engagement.read",
  ENGAGEMENT_WRITE: "hr.engagement.write",
  ENGAGEMENT_MANAGE: "hr.engagement.manage",
  SURVEY_READ: "hr.survey.read",
  SURVEY_WRITE: "hr.survey.write",
  SURVEY_MANAGE: "hr.survey.manage",
  RECOGNITION_READ: "hr.recognition.read",
  RECOGNITION_WRITE: "hr.recognition.write",
  // Phase 4 — Compliance & Risk
  COMPLIANCE_READ: "hr.compliance.read",
  COMPLIANCE_WRITE: "hr.compliance.write",
  COMPLIANCE_MANAGE: "hr.compliance.manage",
  INCIDENT_READ: "hr.incident.read",
  INCIDENT_WRITE: "hr.incident.write",
  INCIDENT_MANAGE: "hr.incident.manage",
  RISK_READ: "hr.risk.read",
  RISK_WRITE: "hr.risk.write",
  RISK_MANAGE: "hr.risk.manage",
  // Phase 4 — Analytics & Reporting
  ANALYTICS_READ: "hr.analytics.read",
  ANALYTICS_WRITE: "hr.analytics.write",
  ANALYTICS_MANAGE: "hr.analytics.manage",
  // Phase 4 — Advanced Talent
  TALENT_READ: "hr.talent.read",
  TALENT_WRITE: "hr.talent.write",
  TALENT_MANAGE: "hr.talent.manage",
  SUCCESSION_READ: "hr.succession.read",
  SUCCESSION_WRITE: "hr.succession.write",
  SUCCESSION_MANAGE: "hr.succession.manage",
} as const;

/** Fields that should be masked in public directory responses */
export const MASKED_DIRECTORY_FIELDS = [
  "primaryPhone",
  "notes",
  "costCenter",
  "legalEntity",
] as const;

/** Fields that should be masked in compensation responses for non-privileged users */
export const MASKED_COMPENSATION_FIELDS = [
  "baseSalary",
  "amount",
  "budgetPercent",
  "employerContribution",
  "employeeContribution",
] as const;

/** Fields that should be masked in employee relations responses for non-privileged users */
export const MASKED_RELATIONS_FIELDS = [
  "description",
  "resolutionNotes",
  "findings",
  "recommendation",
  "appealNotes",
] as const;

// ============================================================================
// Phase 5 — Role → Permission Matrix
// ============================================================================

/** Maps each HR role to the set of actions it can perform */
export const HR_ROLE_PERMISSIONS: Record<HrRole, readonly string[]> = {
  employee: [
    HR_ACTIONS.DIRECTORY_READ_SELF,
    HR_ACTIONS.TIME_READ_SELF,
    HR_ACTIONS.TIME_WRITE,
    HR_ACTIONS.LEAVE_READ_SELF,
    HR_ACTIONS.LEAVE_WRITE,
    HR_ACTIONS.LEARNING_READ_SELF,
    HR_ACTIONS.CERTIFICATION_READ,
    HR_ACTIONS.PERFORMANCE_READ_SELF,
    HR_ACTIONS.BENEFITS_READ,
    HR_ACTIONS.POLICY_READ,
    HR_ACTIONS.ENGAGEMENT_READ,
    HR_ACTIONS.SURVEY_READ,
    HR_ACTIONS.RECOGNITION_READ,
  ],
  manager: [
    HR_ACTIONS.DIRECTORY_READ_TEAM,
    HR_ACTIONS.DIRECTORY_READ_SELF,
    HR_ACTIONS.TIME_READ_TEAM,
    HR_ACTIONS.TIME_READ_SELF,
    HR_ACTIONS.TIME_WRITE,
    HR_ACTIONS.TIME_APPROVE,
    HR_ACTIONS.LEAVE_READ,
    HR_ACTIONS.LEAVE_WRITE,
    HR_ACTIONS.LEAVE_APPROVE,
    HR_ACTIONS.OVERTIME_READ,
    HR_ACTIONS.OVERTIME_APPROVE,
    HR_ACTIONS.SHIFT_READ,
    HR_ACTIONS.LEARNING_READ,
    HR_ACTIONS.CERTIFICATION_READ,
    HR_ACTIONS.PERFORMANCE_READ,
    HR_ACTIONS.PERFORMANCE_WRITE,
    HR_ACTIONS.BENEFITS_READ,
    HR_ACTIONS.POLICY_READ,
    HR_ACTIONS.ENGAGEMENT_READ,
    HR_ACTIONS.SURVEY_READ,
    HR_ACTIONS.RECOGNITION_READ,
    HR_ACTIONS.RECOGNITION_WRITE,
    HR_ACTIONS.TALENT_READ,
  ],
  hrbp: [
    HR_ACTIONS.DIRECTORY_READ,
    HR_ACTIONS.DIRECTORY_WRITE,
    HR_ACTIONS.ORGANIZATION_READ,
    HR_ACTIONS.STAFFING_READ,
    HR_ACTIONS.RECRUITING_READ,
    HR_ACTIONS.RECRUITING_WRITE,
    HR_ACTIONS.LIFECYCLE_READ,
    HR_ACTIONS.LIFECYCLE_WRITE,
    HR_ACTIONS.ONBOARDING_READ,
    HR_ACTIONS.ONBOARDING_MANAGE,
    HR_ACTIONS.OFFBOARDING_READ,
    HR_ACTIONS.OFFBOARDING_MANAGE,
    HR_ACTIONS.TIME_READ,
    HR_ACTIONS.TIME_APPROVE,
    HR_ACTIONS.LEAVE_READ,
    HR_ACTIONS.LEAVE_APPROVE,
    HR_ACTIONS.OVERTIME_READ,
    HR_ACTIONS.OVERTIME_APPROVE,
    HR_ACTIONS.SHIFT_READ,
    HR_ACTIONS.SHIFT_WRITE,
    HR_ACTIONS.LEARNING_READ,
    HR_ACTIONS.LEARNING_WRITE,
    HR_ACTIONS.CERTIFICATION_READ,
    HR_ACTIONS.CERTIFICATION_WRITE,
    HR_ACTIONS.PERFORMANCE_READ,
    HR_ACTIONS.PERFORMANCE_WRITE,
    HR_ACTIONS.COMPENSATION_READ,
    HR_ACTIONS.COMPENSATION_READ_SENSITIVE,
    HR_ACTIONS.BENEFITS_READ,
    HR_ACTIONS.BENEFITS_WRITE,
    HR_ACTIONS.RELATIONS_READ,
    HR_ACTIONS.RELATIONS_READ_SENSITIVE,
    HR_ACTIONS.RELATIONS_WRITE,
    HR_ACTIONS.POLICY_READ,
    HR_ACTIONS.POLICY_WRITE,
    HR_ACTIONS.ENGAGEMENT_READ,
    HR_ACTIONS.ENGAGEMENT_WRITE,
    HR_ACTIONS.SURVEY_READ,
    HR_ACTIONS.SURVEY_WRITE,
    HR_ACTIONS.RECOGNITION_READ,
    HR_ACTIONS.RECOGNITION_WRITE,
    HR_ACTIONS.COMPLIANCE_READ,
    HR_ACTIONS.INCIDENT_READ,
    HR_ACTIONS.INCIDENT_WRITE,
    HR_ACTIONS.RISK_READ,
    HR_ACTIONS.ANALYTICS_READ,
    HR_ACTIONS.TALENT_READ,
    HR_ACTIONS.TALENT_WRITE,
    HR_ACTIONS.SUCCESSION_READ,
  ],
  admin: Object.values(HR_ACTIONS),
  workspace_admin: Object.values(HR_ACTIONS),
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: HrRole, action: string): boolean {
  return HR_ROLE_PERMISSIONS[role].includes(action);
}

// ============================================================================
// Field Masking Utilities
// ============================================================================

/**
 * Generic field masker — strips specified fields from a record.
 */
function maskFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[],
): T {
  const masked = { ...record };
  for (const field of fields) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = undefined;
    }
  }
  return masked;
}

/** Strip sensitive fields from a directory DTO for public consumers. */
export function maskDirectoryFields<T extends Record<string, unknown>>(record: T): T {
  return maskFields(record, MASKED_DIRECTORY_FIELDS);
}

/** Strip sensitive compensation fields for non-privileged users. */
export function maskCompensationFields<T extends Record<string, unknown>>(record: T): T {
  return maskFields(record, MASKED_COMPENSATION_FIELDS);
}

/** Strip sensitive relations fields for non-privileged users. */
export function maskRelationsFields<T extends Record<string, unknown>>(record: T): T {
  return maskFields(record, MASKED_RELATIONS_FIELDS);
}

// ============================================================================
// Runtime Permission Enforcement
// ============================================================================

/**
 * Resolve the HR role for a user. Maps platform role to HR role.
 * Wire to a dedicated user→HR-role mapping table in a future phase.
 */
export function getHrRoleForUser(user: { id: number; role?: string }): HrRole {
  if (user.role === "admin") return "admin";
  if (user.role === "workspace_admin") return "workspace_admin";
  if (user.role === "hrbp") return "hrbp";
  if (user.role === "manager") return "manager";
  return "employee";
}

/**
 * Enforce an HR permission check. Throws FORBIDDEN if the caller's
 * HR role does not include the requested action.
 */
export function requireHrPermission(
  user: { id: number; role?: string },
  action: string,
): void {
  const hrRole = getHrRoleForUser(user);
  if (!hasPermission(hrRole, action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `HR permission denied: ${action}`,
    });
  }
}
