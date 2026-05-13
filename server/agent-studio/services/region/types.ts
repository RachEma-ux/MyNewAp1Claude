/**
 * Region service — contracts.
 *
 * V2 Phase MR-1 first slice. Region routing surface for the
 * eventual multi-region deployment; single-region MVP exposes
 * the API but defers the actual workspace → region mapping.
 *
 * Closed taxonomy: there isn't one — `regionKey` is a free-form
 * operator-supplied slug. The active set is filtered at runtime.
 */

export interface RegionRecord {
  readonly id: number;
  readonly regionKey: string;
  readonly name: string;
  readonly postgresUri: string;
  readonly neo4jUri: string | null;
  readonly credentialBindingId: string | null;
  readonly isPrimary: boolean;
  readonly isActive: boolean;
  readonly settings: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterRegionInput {
  readonly regionKey: string;
  readonly name: string;
  readonly postgresUri: string;
  readonly neo4jUri?: string;
  readonly credentialBindingId?: string;
  readonly isPrimary?: boolean;
  readonly settings?: Record<string, unknown>;
}

export class RegionNotFoundError extends Error {
  readonly code = "region_not_found";
  constructor(identifier: string | number) {
    super(`Region not found: ${String(identifier)}`);
    this.name = "RegionNotFoundError";
  }
}

export class RegionRouterUnavailableError extends Error {
  readonly code = "region_router_unavailable";
  constructor(reason: string) {
    super(`Region router unavailable: ${reason}`);
    this.name = "RegionRouterUnavailableError";
  }
}

export class CrossRegionAccessDeniedError extends Error {
  readonly code = "cross_region_access_denied";
  constructor(
    readonly fromRegion: string,
    readonly toRegion: string,
    readonly workspaceId: number,
  ) {
    super(
      `Workspace ${workspaceId} is pinned to "${fromRegion}"; cross-region read against "${toRegion}" denied.`,
    );
    this.name = "CrossRegionAccessDeniedError";
  }
}
