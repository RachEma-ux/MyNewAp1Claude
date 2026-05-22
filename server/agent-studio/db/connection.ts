/**
 * ASDB — Agent Studio Dedicated DB Connection
 *
 * Phase 12.5: Agent Studio operates against its own PostgreSQL database
 * (`asdb`), separate from the main `mynewap1claude` app DB. This mirrors
 * the existing per-module pattern (wfdb, prmdb, psmdb, codedb).
 *
 * Why separate:
 *  - Data isolation: backups/restores don't touch the main app
 *  - Schema migration safety: drizzle-kit on the main DB no longer sees
 *    ags_* tables, eliminating the rename-prompt mess
 *  - Consistency with the 4 other per-module databases
 *
 * Connection resolution:
 *  - DATABASE_URL_ASDB env var (explicit override)
 *  - Else: replace the database name in DATABASE_URL with "asdb"
 *  - Else: postgresql://localhost:5432/asdb
 *
 * The connection is lazy — first call to getAsDb() creates the Drizzle
 * instance and caches it. Subsequent calls reuse the cache.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as agsSchema from "../../../drizzle/tables/agent-studio";
import { buildPoolWithErrorLogger } from "../../db/build-pool";

let _asDb: ReturnType<typeof drizzle<typeof agsSchema>> | null = null;

const DEFAULT_AS_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb")
  : "postgresql://localhost:5432/asdb";

/**
 * Lazy-init the ASDB Drizzle instance. Returns null on connection
 * failure so callers can handle the absence gracefully (e.g., the
 * existing repository.ts pattern that throws "ASDB not available").
 */
export function getAsDb() {
  if (!_asDb) {
    const url = process.env.DATABASE_URL_ASDB || DEFAULT_AS_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[ASDB] Connecting to:", masked);
      const pool = buildPoolWithErrorLogger(url, "ASDB");
      _asDb = drizzle(pool, { schema: agsSchema });
      console.log("[ASDB] Drizzle instance created");
    } catch (error) {
      console.error("[ASDB] Connection failed:", error);
      _asDb = null;
    }
  }
  return _asDb;
}

/**
 * Reset the cached connection. Used after seed/migration so the next
 * caller picks up a fresh client (rare; mainly for tests).
 */
export function resetAsDb() {
  _asDb = null;
}

/**
 * V1+ MR-3 caller migration shim. Workspace-aware accessor for
 * service-layer call sites that need to be multi-region-ready
 * WITHOUT becoming region-aware today.
 *
 * Phase 1 (PR #757): `workspaceId` is observed but unused; the shim
 * delegates to `getAsDb()`. Single-region operational baseline
 * preserved bit-for-bit.
 *
 * Phase 2 (PR-V1-150, this PR): once a region router is configured
 * via `configureRegionRouter()`, the shim consults the router and
 * returns a region-routed pool. Until the router is configured (or
 * single-region deployments that never call configure), behavior is
 * unchanged — falls back to `getAsDb()`.
 *
 * Late-binding via `configureRegionRouter` avoids a circular import
 * between `db/connection.ts` and `services/region/*` (which itself
 * imports `getAsDb` for the bootstrap handle).
 *
 * Returns null on connection failure (same contract as `getAsDb`).
 *
 * Why a shim and not direct `getDbForWorkspace`:
 *   `getDbForWorkspace` (from `services/region/connection-helper.ts`)
 *   requires the caller to pass `{ availableRegions, workspaceRegionKey }`
 *   pre-resolved. Wiring that at every call site is a heavyweight
 *   coupling change. The shim takes only `workspaceId` and performs
 *   the lookup internally. Callers don't become region-aware.
 */

type AsDbInstance = NonNullable<ReturnType<typeof getAsDb>>;

interface RegionRouter {
  /** Resolve workspaceId to a region-routed Drizzle instance, or
   *  null when the workspace has no pin / the cache is cold / the
   *  pin names an inactive region. Callers fall back to bootstrap. */
  readonly resolve: (workspaceId: number) => AsDbInstance | null;
}

let _regionRouter: RegionRouter | null = null;

/**
 * Wire a region router into the shim. Called once during boot by
 * the region-service module after the routing cache is warmed.
 *
 * Calling this with `null` removes the router (returns the shim to
 * Phase-1 delegate-to-`getAsDb` behavior). Useful for tests + for
 * operator-initiated "multi-region off" rollback scenarios.
 */
export function configureRegionRouter(router: RegionRouter | null): void {
  _regionRouter = router;
}

export function getAsDbForWorkspace(
  workspaceId: number | null | undefined,
): ReturnType<typeof getAsDb> {
  if (workspaceId == null) return getAsDb();
  if (!_regionRouter) return getAsDb();
  const routed = _regionRouter.resolve(workspaceId);
  if (routed) return routed;
  return getAsDb();
}
