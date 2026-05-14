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
      _asDb = drizzle(url, { schema: agsSchema });
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
 * Phase 1 (this PR): `workspaceId` is observed but unused; the shim
 * delegates to `getAsDb()`. Single-region operational baseline is
 * preserved bit-for-bit — see
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Phase 2 (follow-up): once the workspace→region lookup table is
 * wired, this shim consults the region helper and routes accordingly.
 * Single-region deployments still get the existing behavior; multi-
 * region deployments route the workspace's writes to its home region.
 *
 * Returns null on connection failure (same contract as `getAsDb`).
 *
 * Why a shim and not direct `getDbForWorkspace`:
 *   `getDbForWorkspace` (from `services/region/connection-helper.ts`)
 *   requires the caller to pass `{ availableRegions, workspaceRegionKey }`
 *   pre-resolved. Wiring that at every call site is a heavyweight
 *   coupling change. The shim takes only `workspaceId` and performs
 *   the lookup internally (Phase 2). Callers don't become region-aware.
 */
export function getAsDbForWorkspace(
  workspaceId: number | null | undefined,
): ReturnType<typeof getAsDb> {
  // Phase 1 — observe + delegate. Future phase consults the region
  // helper. We accept `workspaceId` as nullable because some callers
  // (e.g. createVault with optional workspaceId on the input schema)
  // can't always supply one. Phase 2 will treat null/undefined as
  // "use the default region" rather than throwing.
  void workspaceId;
  return getAsDb();
}
