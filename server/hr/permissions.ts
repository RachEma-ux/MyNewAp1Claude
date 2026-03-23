/**
 * HR Permissions — Role/capability constants, persistent role resolution,
 * self/team scope enforcement, field masking, and runtime permission checks.
 *
 * Phase 7 Governance Hardening:
 * - Persistent HR role resolution via hr_role_assignments table
 * - Self-scope enforcement helpers (employee sees own data only)
 * - Team-scope enforcement helpers (manager sees direct reports only)
 * - Improved masking (null instead of undefined)
 * - Self-approval prevention for sensitive actions
 */

import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";

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

/** Fields that should be masked in talent/performance responses for non-privileged users */
export const MASKED_TALENT_FIELDS = [
  "retentionRisk",
  "developmentAreas",
  "developmentNeeds",
  "nineBoxPosition",
  "readinessForPromotion",
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
// Field Masking Utilities (Phase 7 — uses null instead of undefined)
// ============================================================================

/**
 * Generic field masker — sets specified fields to null.
 */
function maskFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[],
): T {
  const masked = { ...record };
  for (const field of fields) {
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = null;
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

/** Strip sensitive talent fields for non-privileged users. */
export function maskTalentFields<T extends Record<string, unknown>>(record: T): T {
  return maskFields(record, MASKED_TALENT_FIELDS);
}

// ============================================================================
// Persistent HR Role Resolution (Phase 7)
// ============================================================================

/** Cache for HR role lookups — cleared every 60s */
const roleCache = new Map<number, { role: HrRole; ts: number }>();
const ROLE_CACHE_TTL = 60_000;

/**
 * Resolve the HR role for a user. Checks:
 * 1. Platform admin → HR admin
 * 2. hr_role_assignments table (persistent mapping)
 * 3. Fallback: employee
 */
export async function getHrRoleForUser(user: { id: number; role?: string }): Promise<HrRole> {
  // Platform admin always maps to HR admin
  if (user.role === "admin") return "admin";

  // Check cache
  const cached = roleCache.get(user.id);
  if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) {
    return cached.role;
  }

  // Query persistent role assignments
  const db = getDb();
  if (db) {
    try {
      const { hrRoleAssignments } = await import("../../drizzle/schema");
      const rows = await db
        .select({ hrRole: hrRoleAssignments.hrRole })
        .from(hrRoleAssignments)
        .where(
          and(
            eq(hrRoleAssignments.userId, user.id),
            eq(hrRoleAssignments.isActive, true),
          ),
        )
        .limit(5);

      if (rows.length > 0) {
        // Pick highest-privilege role: admin > workspace_admin > hrbp > manager > employee
        const priority: Record<string, number> = { admin: 5, workspace_admin: 4, hrbp: 3, manager: 2, employee: 1 };
        let bestRole: HrRole = "employee";
        let bestPriority = 0;
        for (const row of rows) {
          const p = priority[row.hrRole] ?? 0;
          if (p > bestPriority) {
            bestPriority = p;
            bestRole = row.hrRole as HrRole;
          }
        }
        roleCache.set(user.id, { role: bestRole, ts: Date.now() });
        return bestRole;
      }
    } catch {
      // Table may not exist yet — fall through to string matching
    }
  }

  // Fallback: map from platform role string (backwards compatibility)
  if (user.role === "workspace_admin") return "workspace_admin";
  if (user.role === "hrbp") return "hrbp";
  if (user.role === "manager") return "manager";

  const result: HrRole = "employee";
  roleCache.set(user.id, { role: result, ts: Date.now() });
  return result;
}

/**
 * Synchronous fallback for getHrRoleForUser when async is not possible.
 * Uses cache or falls back to platform role string.
 */
export function getHrRoleForUserSync(user: { id: number; role?: string }): HrRole {
  if (user.role === "admin") return "admin";
  const cached = roleCache.get(user.id);
  if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) return cached.role;
  if (user.role === "workspace_admin") return "workspace_admin";
  if (user.role === "hrbp") return "hrbp";
  if (user.role === "manager") return "manager";
  return "employee";
}

// ============================================================================
// Runtime Permission Enforcement
// ============================================================================

/**
 * Enforce an HR permission check. Throws FORBIDDEN if the caller's
 * HR role does not include the requested action.
 */
export async function requireHrPermission(
  user: { id: number; role?: string },
  action: string,
): Promise<HrRole> {
  const hrRole = await getHrRoleForUser(user);
  if (!hasPermission(hrRole, action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `HR permission denied: ${action}`,
    });
  }
  return hrRole;
}

/**
 * Check HR access and determine masking requirement in one call.
 */
export async function checkHrAccess(
  user: { id: number; role?: string },
  readAction: string,
  sensitiveAction?: string,
): Promise<{ masked: boolean; hrRole: HrRole }> {
  const hrRole = await getHrRoleForUser(user);
  if (!hasPermission(hrRole, readAction)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `HR permission denied: ${readAction}`,
    });
  }
  const masked = sensitiveAction ? !hasPermission(hrRole, sensitiveAction) : true;
  return { masked, hrRole };
}

// ============================================================================
// Self-Scope & Team-Scope Enforcement (Phase 7)
// ============================================================================

/**
 * Resolve the worker ID for a platform user.
 * Used for self-scope enforcement — links auth user to HR worker profile.
 */
export async function getWorkerIdForUser(userId: number): Promise<number | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const { hrRoleAssignments } = await import("../../drizzle/schema");
    const [row] = await db
      .select({ workerId: hrRoleAssignments.workerId })
      .from(hrRoleAssignments)
      .where(
        and(
          eq(hrRoleAssignments.userId, userId),
          eq(hrRoleAssignments.isActive, true),
        ),
      )
      .limit(1);
    return row?.workerId ?? null;
  } catch {
    return null;
  }
}

/**
 * Get direct report worker IDs for a manager.
 * Used for team-scope enforcement — manager sees only their team.
 */
export async function getTeamWorkerIds(managerWorkerId: number): Promise<number[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const { hrWorkerProfiles } = await import("../../drizzle/schema");
    const rows = await db
      .select({ id: hrWorkerProfiles.id })
      .from(hrWorkerProfiles)
      .where(eq(hrWorkerProfiles.managerWorkerId, managerWorkerId));
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * Determine the scope of data a user should see for a given action.
 * Returns:
 * - { scope: "all" } — user can see all records (hrbp/admin)
 * - { scope: "team", workerIds: [...] } — manager sees team only
 * - { scope: "self", workerId: N } — employee sees own data only
 * - { scope: "none" } — no access
 */
export async function resolveDataScope(
  user: { id: number; role?: string },
  globalAction: string,
  teamAction?: string,
  selfAction?: string,
): Promise<
  | { scope: "all" }
  | { scope: "team"; workerIds: number[] }
  | { scope: "self"; workerId: number }
  | { scope: "none" }
> {
  const hrRole = await getHrRoleForUser(user);

  // Global access (hrbp, admin, workspace_admin)
  if (hasPermission(hrRole, globalAction)) {
    return { scope: "all" };
  }

  // Team access (manager)
  if (teamAction && hasPermission(hrRole, teamAction)) {
    const selfWorkerId = await getWorkerIdForUser(user.id);
    if (selfWorkerId) {
      const teamIds = await getTeamWorkerIds(selfWorkerId);
      // Manager sees team + self
      return { scope: "team", workerIds: [...teamIds, selfWorkerId] };
    }
    return { scope: "none" };
  }

  // Self access (employee)
  if (selfAction && hasPermission(hrRole, selfAction)) {
    const selfWorkerId = await getWorkerIdForUser(user.id);
    if (selfWorkerId) {
      return { scope: "self", workerId: selfWorkerId };
    }
    return { scope: "none" };
  }

  return { scope: "none" };
}

// ============================================================================
// Self-Approval Prevention (Phase 7)
// ============================================================================

/**
 * Prevent self-approval for sensitive HR actions.
 * Throws FORBIDDEN if the actor is approving their own record.
 */
export function preventSelfApproval(
  actorUserId: number,
  targetWorkerId: number | undefined,
  actorWorkerId: number | null,
  actionLabel: string,
): void {
  if (actorWorkerId && targetWorkerId && actorWorkerId === targetWorkerId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Self-approval not permitted for ${actionLabel}`,
    });
  }
}

// ============================================================================
// Worker Status State Machine (Phase 7)
// ============================================================================

export const WORKER_STATUS_FLOW: Record<string, string[]> = {
  active: ["on_leave", "suspended", "terminated", "inactive"],
  on_leave: ["active", "terminated"],
  suspended: ["active", "terminated"],
  inactive: ["active", "terminated"],
  terminated: [],
};
