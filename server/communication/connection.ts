/**
 * CommunicationDB — Dedicated DB Connection
 *
 * Connects to the `communicationdb` database, separate from the main
 * app DB. Uses DATABASE_URL_COMMUNICATIONDB env var, falls back to
 * replacing DB name in DATABASE_URL with /communicationdb.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as communicationSchema from "../../drizzle/tables/communicationdb";

let _communicationDb: ReturnType<
  typeof drizzle<typeof communicationSchema>
> | null = null;

const DEFAULT_COMMUNICATION_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/communicationdb")
  : "postgresql://localhost:5432/communicationdb";

export function getCommunicationDb() {
  if (!_communicationDb) {
    const url =
      process.env.DATABASE_URL_COMMUNICATIONDB || DEFAULT_COMMUNICATION_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[CommunicationDB] Connecting to:", masked);
      _communicationDb = drizzle(url, { schema: communicationSchema });
      console.log("[CommunicationDB] Drizzle instance created");
    } catch (error) {
      console.error("[CommunicationDB] Connection failed:", error);
      _communicationDb = null;
    }
  }
  return _communicationDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetCommunicationDb() {
  _communicationDb = null;
}
