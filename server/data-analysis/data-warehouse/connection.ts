/**
 * Data Warehouse — Dedicated DB Connection
 *
 * Connects to the `datawarehouse` database, separate from the main app DB.
 * Uses DATABASE_URL_DW env var, falls back to localhost:5432/datawarehouse.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as dwSchema from "../../../drizzle/tables/data-warehouse";

let _dwDb: ReturnType<typeof drizzle<typeof dwSchema>> | null = null;

const DEFAULT_DW_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/datawarehouse")
  : "postgresql://localhost:5432/datawarehouse";

export function getWarehouseDb() {
  if (!_dwDb) {
    const url = process.env.DATABASE_URL_DW || DEFAULT_DW_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[DataWarehouse] Connecting to:", masked);
      _dwDb = drizzle(url, { schema: dwSchema });
      console.log("[DataWarehouse] Drizzle instance created");
    } catch (error) {
      console.error("[DataWarehouse] Connection failed:", error);
      _dwDb = null;
    }
  }
  return _dwDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetWarehouseDb() {
  _dwDb = null;
}
