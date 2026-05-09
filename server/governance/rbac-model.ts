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

/**
 * R8-c3 — read-only roles surfaced from `requireGovernedAction.checkCapability`'s
 * inline `["viewer", "auditor"]` fallback. These role names are NOT in
 * `GOVERNANCE_ROLES` (so `normalizeRole(role)` coerces them to "user"), but
 * the runtime denial logic still references them by raw string. This is a
 * known inconsistency: any "viewer"/"auditor" role assignment in the
 * `users.role` column (which is unconstrained `varchar(50)`) gets normalized
 * to "user" for permission lookup but treated as read-only in capability
 * checks. A complete fix requires either (a) adding these roles to
 * GOVERNANCE_ROLES with explicit permission sets + a migration constraining
 * `users.role` to the enum, or (b) removing the read-only fallback entirely.
 * For cycle-3 closure scope, this constant just lifts the inline list out
 * of `requireGovernedAction.ts` so callers reference one canonical source.
 */
export const READ_ONLY_ROLES: ReadonlySet<string> = new Set(["viewer", "auditor"]);

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
// R7-c3 — Coarse Capability → Role Map
// ============================================================================

/**
 * Bridges the coarse `<domain>.<verb>` capabilities used in
 * `config/governance/platform_action_registry.yaml` (e.g., `agent.manage`,
 * `knowledge.manage`, `pmt.manage` — 32 distinct values) to the explicit set
 * of roles that may hold each one. Cycle-3 audit
 * (`/sdcard/Download/GOVERNANCE_AUDIT_2026-05-08.md` §2.7) flagged the
 * coarse-vs-fine mismatch: `hasPermission` knows fine-grained
 * `PermissionAction` values like `agent.create` / `agent.execute`, but
 * the YAML's `agent.manage` isn't in that list, so `hasPermission` returns
 * false and `checkCapability` falls through to a permissive default.
 *
 * The map is consulted by `requireGovernedAction.checkCapability` BEFORE
 * the legacy permissive fallback. Default behavior: coarse-map results are
 * ADVISORY (audit-log breadcrumb on divergence). Setting the env var
 * `RBAC_ENFORCE_COARSE=true` (or `=1`) turns the map into a hard gate.
 *
 * Maintenance:
 *   - When YAML adds a new capability, this map must add an entry.
 *   - The `tests/governance/coarse-capability-coverage.test.ts` (R7-c3)
 *     enforces the invariant: every YAML `capability:` value must appear
 *     here.
 *
 * Conservative role assignments (preserving today's permissive behavior):
 *   - Operator and developer roles can perform domain `.manage` actions
 *     (matches the existing `ROLE_PERMISSIONS` operator/developer pattern).
 *   - User can perform `.use` capabilities + `collaboration.manage`
 *     (chat / message create are user-level operations).
 *   - System can perform a curated lifecycle subset.
 *   - governance_reviewer holds governance.* + audit.read.
 *   - admin bypasses via the early return in `checkCapability` and is
 *     not listed individually here.
 */
export const COARSE_CAPABILITY_ROLES: Record<string, ReadonlySet<GovernanceRole>> = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  "auth.session": new Set(["governance_reviewer", "operator", "developer", "user", "system"]),

  // ── Domain `.manage` capabilities (admin/operator/developer tier) ────────
  "agent.manage":         new Set(["operator", "developer"]),
  "agents.manage":        new Set(["operator", "developer"]),
  "knowledge.manage":     new Set(["operator", "developer"]),
  "workflow.manage":      new Set(["operator", "developer"]),
  "provider.manage":      new Set(["operator", "developer"]),
  "secret.manage":        new Set(["operator", "developer"]),
  "model.manage":         new Set(["operator", "developer"]),
  "embedding.manage":     new Set(["operator", "developer"]),
  "openRouter.manage":    new Set(["operator", "developer"]),
  "wiki.manage":          new Set(["operator", "developer"]),
  "document.manage":      new Set(["operator", "developer"]),
  "kgia.manage":          new Set(["operator", "developer"]),
  "bot.manage":           new Set(["operator", "developer"]),
  "catalog.manage":       new Set(["operator", "developer"]),
  "workspace.manage":     new Set(["operator", "developer"]),
  "ps.manage":            new Set(["operator", "developer"]),
  "pmt.manage":           new Set(["operator", "developer"]),
  "llm.manage":           new Set(["operator", "developer"]),
  "policy.manage":        new Set(["operator"]),
  "deploy.manage":        new Set(["operator"]),
  "module.manage":        new Set(["operator"]),
  "vectordb.manage":      new Set(["operator"]),
  "system.manage":        new Set([]), // admin-only; admin handled via early return
  "hr.manage":            new Set(["operator"]),
  "organization.manage":  new Set(["operator"]),
  "reporting.manage":     new Set(["operator"]),
  "governance.manage":    new Set(["governance_reviewer"]),

  // ── Collaboration & content (broader user access) ────────────────────────
  "collaboration.manage": new Set(["operator", "developer", "user"]),

  // ── `.use` capabilities (user-level) ─────────────────────────────────────
  "chat.use":             new Set(["operator", "developer", "user"]),
  "kgia.use":             new Set(["operator", "developer", "user"]),
  "inference.use":        new Set(["operator", "developer", "user"]),
  "openRouter.use":       new Set(["operator", "developer", "user"]),

  // ── `.view` capabilities (broader read access) ───────────────────────────
  "reporting.view":       new Set(["governance_reviewer", "operator", "developer", "user"]),
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
