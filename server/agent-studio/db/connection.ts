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
