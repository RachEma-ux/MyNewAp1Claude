/**
 * PSMDB — Dedicated DB Connection
 *
 * Connects to the `psmdb` database, separate from the main app DB.
 * Uses DATABASE_URL_PSMDB env var, falls back to replacing DB name in DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as psmSchema from "../../drizzle/tables/psmdb";

let _psmDb: ReturnType<typeof drizzle<typeof psmSchema>> | null = null;

const DEFAULT_PSM_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/psmdb")
  : "postgresql://localhost:5432/psmdb";

export function getPsmDb() {
  if (!_psmDb) {
    const url = process.env.DATABASE_URL_PSMDB || DEFAULT_PSM_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[PSMDB] Connecting to:", masked);
      _psmDb = drizzle(url, { schema: psmSchema });
      console.log("[PSMDB] Drizzle instance created");
    } catch (error) {
      console.error("[PSMDB] Connection failed:", error);
      _psmDb = null;
    }
  }
  return _psmDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetPsmDb() {
  _psmDb = null;
}
