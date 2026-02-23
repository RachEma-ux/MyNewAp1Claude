/**
 * Extended RBAC Model — Governance Bible CGT v2, Section 5
 *
 * Defines the full role hierarchy, permission matrix, and
 * separation-of-duty constraints required by the governance standard.
 *
 * Roles: admin, governance_reviewer, operator, developer, user, system
 */

// ============================================================================
// Role Definitions
// ============================================================================

export const GOVERNANCE_ROLES = [
  "admin",
  "governance_reviewer",
  "operator",
  "developer",
  "user",
  "system",
] as const;

export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

// ============================================================================
// Permission Actions
// ============================================================================

export const PERMISSION_ACTIONS = [
  // Lifecycle
  "lifecycle.submit",
  "lifecycle.register",
  "lifecycle.validate",
  "lifecycle.publish",
  "lifecycle.recall",
  // Provider
  "provider.create",
  "provider.update",
  "provider.delete",
  "provider.connect",
  // Agent
  "agent.create",
  "agent.promote",
  "agent.execute",
  "agent.delete",
  // Workflow
  "workflow.create",
  "workflow.execute",
  "workflow.publish",
  "workflow.delete",
  // Policy
  "policy.create",
  "policy.update",
  "policy.delete",
  "policy.activate",
  // Secret
  "secret.create",
  "secret.read",
  "secret.update",
  "secret.delete",
  // Audit
  "audit.read",
  "audit.export",
  // Governance
  "governance.review",
  "governance.override",
  "governance.drift.read",
  "governance.self_check",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

// ============================================================================
// Role → Permission Matrix
// ============================================================================

const ROLE_PERMISSIONS: Record<GovernanceRole, Set<PermissionAction>> = {
  admin: new Set(PERMISSION_ACTIONS), // Admin has all permissions

  governance_reviewer: new Set<PermissionAction>([
    "lifecycle.validate",
    "lifecycle.publish",
    "lifecycle.recall",
    "governance.review",
    "governance.drift.read",
    "governance.self_check",
    "audit.read",
    "audit.export",
    "policy.create",
    "policy.update",
    "policy.activate",
  ]),

  operator: new Set<PermissionAction>([
    "lifecycle.submit",
    "lifecycle.register",
    "provider.create",
    "provider.update",
    "provider.connect",
    "workflow.create",
    "workflow.execute",
    "agent.create",
    "agent.execute",
    "secret.create",
    "secret.read",
    "secret.update",
    "audit.read",
    "governance.drift.read",
  ]),

  developer: new Set<PermissionAction>([
    "lifecycle.submit",
    "provider.create",
    "agent.create",
    "agent.execute",
    "workflow.create",
    "workflow.execute",
    "secret.create",
    "secret.read",
    "audit.read",
  ]),

  user: new Set<PermissionAction>([
    "agent.execute",
    "workflow.execute",
    "audit.read",
  ]),

  system: new Set<PermissionAction>([
    "lifecycle.submit",
    "lifecycle.register",
    "lifecycle.validate",
    "lifecycle.publish",
    "agent.execute",
    "workflow.execute",
    "governance.self_check",
    "governance.drift.read",
    "audit.read",
  ]),
};

// ============================================================================
// Separation of Duty Constraints
// ============================================================================

/**
 * Actions that must NOT be performed by the same actor
 * on the same target within a single lifecycle.
 */
export const SEPARATION_OF_DUTY: Array<[PermissionAction, PermissionAction]> = [
  ["lifecycle.submit", "lifecycle.validate"],
  ["lifecycle.submit", "lifecycle.publish"],
  ["lifecycle.validate", "lifecycle.publish"],
];

// ============================================================================
// RBAC Functions
// ============================================================================

/**
 * Check if a role has permission for an action
 */
export function hasPermission(role: string, action: PermissionAction): boolean {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  return permissions.has(action);
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: string): PermissionAction[] {
  const normalizedRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return [];
  return Array.from(permissions);
}

/**
 * Check if role is a valid governance role
 */
export function isValidRole(role: string): role is GovernanceRole {
  return GOVERNANCE_ROLES.includes(role as GovernanceRole);
}

/**
 * Normalize role string to GovernanceRole.
 * Maps legacy roles to governance roles:
 *   "admin" → "admin"
 *   "user" → "user"
 *   anything else → "user" (deny-by-default)
 */
export function normalizeRole(role: string): GovernanceRole {
  if (isValidRole(role)) return role;
  // Legacy mapping
  if (role === "admin") return "admin";
  return "user"; // deny-by-default: unknown roles get minimal permissions
}

/**
 * Check separation of duty: whether an actor who performed actionA
 * can also perform actionB on the same target.
 */
export function checkSeparationOfDuty(
  actionA: PermissionAction,
  actionB: PermissionAction
): boolean {
  for (const [a, b] of SEPARATION_OF_DUTY) {
    if ((actionA === a && actionB === b) || (actionA === b && actionB === a)) {
      return false; // Violates separation of duty
    }
  }
  return true;
}

/**
 * Get the minimum role required for an action
 */
export function getMinimumRole(action: PermissionAction): GovernanceRole {
  // Check roles from least privileged to most privileged
  const roleOrder: GovernanceRole[] = [
    "user",
    "developer",
    "operator",
    "governance_reviewer",
    "admin",
  ];

  for (const role of roleOrder) {
    if (ROLE_PERMISSIONS[role].has(action)) {
      return role;
    }
  }

  return "admin"; // Default: require admin
}
