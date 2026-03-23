/**
 * HR Permissions — Role and capability constants for HR module
 */

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

/**
 * Strip sensitive fields from a directory DTO for public consumers.
 */
export function maskDirectoryFields<T extends Record<string, unknown>>(record: T): T {
  const masked = { ...record };
  for (const field of MASKED_DIRECTORY_FIELDS) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = undefined;
    }
  }
  return masked;
}
