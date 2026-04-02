/**
 * PRMDB — Dedicated DB Connection
 *
 * Connects to the `prmdb` database, separate from the main app DB.
 * Uses DATABASE_URL_PRMDB env var, falls back to replacing DB name in DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as prmSchema from "../../drizzle/tables/prmdb";

let _prmDb: ReturnType<typeof drizzle<typeof prmSchema>> | null = null;

const DEFAULT_PRM_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/prmdb")
  : "postgresql://localhost:5432/prmdb";

export function getPrmDb() {
  if (!_prmDb) {
    const url = process.env.DATABASE_URL_PRMDB || DEFAULT_PRM_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[PRMDB] Connecting to:", masked);
      _prmDb = drizzle(url, { schema: prmSchema });
      console.log("[PRMDB] Drizzle instance created");
    } catch (error) {
      console.error("[PRMDB] Connection failed:", error);
      _prmDb = null;
    }
  }
  return _prmDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetPrmDb() {
  _prmDb = null;
}
