/**
 * WfDB — Dedicated DB Connection
 *
 * Connects to the `wfdb` database, separate from the main app DB.
 * Uses DATABASE_URL_WFDB env var, falls back to replacing DB name in DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as wfSchema from "../../drizzle/tables/wfdb";

let _wfDb: ReturnType<typeof drizzle<typeof wfSchema>> | null = null;

const DEFAULT_WF_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/wfdb")
  : "postgresql://localhost:5432/wfdb";

export function getWfDb() {
  if (!_wfDb) {
    const url = process.env.DATABASE_URL_WFDB || DEFAULT_WF_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[WfDB] Connecting to:", masked);
      _wfDb = drizzle(url, { schema: wfSchema });
      console.log("[WfDB] Drizzle instance created");
    } catch (error) {
      console.error("[WfDB] Connection failed:", error);
      _wfDb = null;
    }
  }
  return _wfDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetWfDb() {
  _wfDb = null;
}
