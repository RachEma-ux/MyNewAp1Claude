/**
 * Region routing bridge — V2 Phase MR-1 Phase-2 third slice (cutover).
 *
 * Wires the in-process region cache (#900) into the MR-3 shim
 * `getAsDbForWorkspace` (#757) via the late-binding hook
 * `configureRegionRouter` (PR-V1-150). The bridge is the single
 * point where these two halves meet:
 *
 *   workspace-region-cache → bridge → db/connection.ts shim
 *
 * Why a separate file:
 *   - `db/connection.ts` cannot import from `services/region/*`
 *     directly (those modules import `getAsDb` from connection.ts —
 *     circular import). Late-binding via `configureRegionRouter`
 *     breaks the cycle.
 *   - Tests can install / uninstall the router without touching
 *     either the shim or the cache.
 *
 * Operational sequence in boot:
 *   1. Boot calls `warmRegionRoutingCache()` to load active regions
 *      + pins from ASDB.
 *   2. Boot calls `installRegionRouter()`. The shim now consults
 *      the cache for every `getAsDbForWorkspace(workspaceId)` call.
 *   3. Subsequent pin / region writes invalidate the cache; an
 *      operator-initiated re-warm (or the periodic warmer) reloads.
 *
 * Single-region operational baseline preserved:
 *   - If `installRegionRouter` is never called: shim falls back to
 *     `getAsDb()` (the Phase-1 behavior).
 *   - If `installRegionRouter` is called but cache is cold: the
 *     cache returns null → shim falls back to `getAsDb()`.
 *   - If the cache has only the primary region: shim resolves to a
 *     region-routed pool that happens to point at the same Postgres
 *     URI as the bootstrap handle. No behavior change for callers.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 *   - Postgres = source of truth. The bridge only routes connections;
 *     it does not own data.
 */

import { configureRegionRouter } from "../../db/connection.js";
import { getDbForRegion } from "./connection-helper.js";
import { getCachedRegionForWorkspace } from "./workspace-region-cache.js";

/**
 * Install the bridge. The shim's region-router slot is filled with
 * a closure that combines the cache lookup with the per-region pool
 * resolver. Idempotent.
 */
export function installRegionRouter(): void {
  configureRegionRouter({
    resolve: (workspaceId) => {
      const region = getCachedRegionForWorkspace(workspaceId);
      if (!region) return null;
      const db = getDbForRegion(region);
      return db ?? null;
    },
  });
}

/**
 * Uninstall the bridge — returns the shim to Phase-1
 * delegate-to-`getAsDb` behavior. Used by tests and by the operator
 * "multi-region off" rollback toggle.
 */
export function uninstallRegionRouter(): void {
  configureRegionRouter(null);
}
