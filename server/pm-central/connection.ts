/**
 * PMDB — Dedicated DB Connection
 *
 * Connects to the `pmdb` database, separate from the main app DB.
 * Uses DATABASE_URL_PMDB env var, falls back to replacing the DB name
 * in DATABASE_URL with `/pmdb`.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as pmSchema from "../../drizzle/tables/pmdb";

let _pmDb: ReturnType<typeof drizzle<typeof pmSchema>> | null = null;

const DEFAULT_PM_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/pmdb")
  : "postgresql://localhost:5432/pmdb";

export function getPmDb() {
  if (!_pmDb) {
    const url = process.env.DATABASE_URL_PMDB || DEFAULT_PM_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[PMDB] Connecting to:", masked);
      _pmDb = drizzle(url, { schema: pmSchema });
      console.log("[PMDB] Drizzle instance created");
    } catch (error) {
      console.error("[PMDB] Connection failed:", error);
      _pmDb = null;
    }
  }
  return _pmDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetPmDb() {
  _pmDb = null;
}
