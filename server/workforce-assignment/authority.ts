/**
 * Workforce Assignment Bridge — Authority Resolver
 *
 * Now integrates with the OM module when available.
 * Falls back to role-based authority when OM structure is not defined.
 *
 * Resolution order:
 * 1. If OM structure exists for the workspace → resolve via OM hierarchy
 * 2. If no OM structure → fall back to role-based (admin/hrbp/workspace_admin)
 */

import { resolveOmAuthority, type OmAuthorityResolution } from "../organization-management/authority";

export interface AuthorityResolution {
  /** Whether authority was resolved */
  resolved: boolean;
  /** Authority source — "om_hierarchy" when OM is available, "transitional" otherwise */
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
 * Delegates to OM authority resolver when OM structure exists.
 * Falls back to role-based authority otherwise.
 */
export async function resolveAssignmentAuthority(params: {
  actorId: number;
  actorRole: string;
  employeeId: number;
  projectId: number;
  workspaceId?: number;
}): Promise<AuthorityResolution> {
  // If workspaceId is available, try OM-based resolution
  if (params.workspaceId) {
    try {
      const omResult: OmAuthorityResolution = await resolveOmAuthority({
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        actorRole: params.actorRole,
      });

      return {
        resolved: omResult.resolved,
        source: omResult.source,
        level: omResult.level,
        chain: {
          actorId: params.actorId,
          actorRole: params.actorRole,
          employeeId: params.employeeId,
          projectId: params.projectId,
          resolvedAt: new Date().toISOString(),
          omChain: omResult.chain,
          _transitional: omResult.source === "transitional",
        },
        warning: omResult.warning,
      };
    } catch {
      // If OM resolution fails, fall through to role-based
    }
  }

  // Role-based fallback (backward-compatible)
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
      _omIntegration: "OM module available but workspaceId not provided or resolution failed. " +
        "Using role-based fallback.",
    },
    warning: isAuthoritative
      ? undefined
      : `Actor role "${params.actorRole}" does not have authority for assignment approval. ` +
        `Required: admin, workspace_admin, or hrbp (transitional).`,
  };
}
