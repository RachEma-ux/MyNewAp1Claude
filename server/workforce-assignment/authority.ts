/**
 * Workforce Assignment Bridge — Temporary Authority Resolver
 *
 * ⚠️ TEMPORARY — OM MODULE NOT YET IMPLEMENTED
 *
 * This module provides a placeholder authority resolution hook.
 * When the Organization Management (OM) module is built, this must be replaced
 * with OM-derived organizational authority chain resolution.
 *
 * Current behavior:
 * - Returns a minimal authority record based on actor role
 * - Does NOT verify organizational hierarchy (OM does not exist yet)
 * - Marks all authority records as "transitional"
 *
 * Future behavior (when OM exists):
 * - Resolve actor's position in org hierarchy
 * - Verify actor has authority over the employee's org unit
 * - Verify actor has authority over the project's cost center
 * - Return a full authority chain with org unit path
 */

export interface AuthorityResolution {
  /** Whether authority was resolved (always true in transitional mode) */
  resolved: boolean;
  /** Authority source — "transitional" until OM is implemented */
  source: "transitional" | "om_hierarchy";
  /** Actor's authority level for this action */
  level: "role_based" | "org_unit_based" | "position_based";
  /** Authority chain metadata */
  chain: Record<string, unknown>;
  /** Warning if authority could not be fully verified */
  warning?: string;
}

/**
 * Resolve assignment authority for an actor.
 *
 * ⚠️ TEMPORARY: Returns role-based authority without OM verification.
 * This MUST be replaced when OM runtime is implemented.
 */
export function resolveAssignmentAuthority(params: {
  actorId: number;
  actorRole: string;
  employeeId: number;
  projectId: number;
}): AuthorityResolution {
  // Transitional: admin and hrbp roles are trusted for authority
  // In the future, OM will verify the actor's position in the org hierarchy
  const isAuthoritative = ["admin", "workspace_admin", "hrbp"].includes(params.actorRole);

  return {
    resolved: isAuthoritative,
    source: "transitional",
    level: "role_based",
    chain: {
      actorId: params.actorId,
      actorRole: params.actorRole,
      employeeId: params.employeeId,
      projectId: params.projectId,
      resolvedAt: new Date().toISOString(),
      _transitional: true,
      _omDependency: "Organization Management module not yet implemented. " +
        "Authority resolved via role-based fallback. Replace with OM hierarchy when available.",
    },
    warning: isAuthoritative
      ? undefined
      : `Actor role "${params.actorRole}" does not have authority for assignment approval. ` +
        `Required: admin, workspace_admin, or hrbp (transitional). ` +
        `Future: OM-based organizational authority.`,
  };
}
