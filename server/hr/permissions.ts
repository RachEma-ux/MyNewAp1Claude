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
} as const;

/** Fields that should be masked in public directory responses */
export const MASKED_DIRECTORY_FIELDS = [
  "primaryPhone",
  "notes",
  "costCenter",
  "legalEntity",
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
