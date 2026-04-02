/**
 * CODEDB — Dedicated DB Connection
 *
 * Connects to the `codedb` database, separate from the main app DB.
 * Uses DATABASE_URL_CODEDB env var, falls back to replacing DB name in DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as codeSchema from "../../drizzle/tables/codedb";

let _codeDb: ReturnType<typeof drizzle<typeof codeSchema>> | null = null;

const DEFAULT_CODE_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/codedb")
  : "postgresql://localhost:5432/codedb";

export function getCodeDb() {
  if (!_codeDb) {
    const url = process.env.DATABASE_URL_CODEDB || DEFAULT_CODE_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[CODEDB] Connecting to:", masked);
      _codeDb = drizzle(url, { schema: codeSchema });
      console.log("[CODEDB] Drizzle instance created");
    } catch (error) {
      console.error("[CODEDB] Connection failed:", error);
      _codeDb = null;
    }
  }
  return _codeDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetCodeDb() {
  _codeDb = null;
}
