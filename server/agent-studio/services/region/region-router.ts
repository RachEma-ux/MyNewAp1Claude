/**
 * Region router — pure routing decisions.
 *
 * V2 Phase MR-1 first slice. Composes:
 *   - `resolveWorkspaceRegion()` — returns the region a workspace
 *     should route to. Single-region MVP: always returns the
 *     primary. Multi-region (MR-2): consults a workspace ↔ region
 *     mapping table.
 *   - `assertSameRegion()` — pure guard that throws
 *     `CrossRegionAccessDeniedError` when a workspace tries to
 *     read from a non-pinned region (cross-region reads are
 *     denied unless the workspace is replicated).
 *
 * This module is the pure side; the actual db-binding-by-region
 * routing helper (acceptance criterion: "any `import { db }`
 * resolves via the region-routed connection helper") is wired in
 * MR-2 when the workspace ↔ region mapping ships.
 */

import {
  CrossRegionAccessDeniedError,
  type RegionRecord,
} from "./types.js";

/**
 * Pure router: given the available regions + a workspace's pinned
 * region key, return the region the request should route to.
 *
 * Returns null when no active region matches the workspace's pin
 * (operator must add a region row or move the workspace).
 */
export function resolveWorkspaceRegion(input: {
  readonly availableRegions: ReadonlyArray<RegionRecord>;
  readonly workspaceRegionKey: string | null;
}): RegionRecord | null {
  const active = input.availableRegions.filter((r) => r.isActive);
  if (active.length === 0) return null;
  if (input.workspaceRegionKey != null) {
    const pinned = active.find(
      (r) => r.regionKey === input.workspaceRegionKey,
    );
    if (pinned) return pinned;
    // Workspace is pinned to a region that doesn't exist (or is
    // inactive). Caller should treat this as a config error and
    // surface to the operator — return null so the call site can
    // throw a precise error.
    return null;
  }
  // No pin: route to the primary if there is one; otherwise the
  // first active region (deterministic by regionKey).
  return (
    active.find((r) => r.isPrimary) ??
    [...active].sort((a, b) => a.regionKey.localeCompare(b.regionKey))[0] ??
    null
  );
}

/**
 * Pure guard. Throws `CrossRegionAccessDeniedError` when the
 * workspace's pinned region differs from the region the caller
 * is attempting to access AND the workspace is not replicated.
 */
export function assertSameRegion(input: {
  readonly workspaceId: number;
  readonly workspaceRegionKey: string;
  readonly accessedRegionKey: string;
  readonly isReplicated?: boolean;
}): void {
  if (input.workspaceRegionKey === input.accessedRegionKey) return;
  if (input.isReplicated === true) return;
  throw new CrossRegionAccessDeniedError(
    input.workspaceRegionKey,
    input.accessedRegionKey,
    input.workspaceId,
  );
}
