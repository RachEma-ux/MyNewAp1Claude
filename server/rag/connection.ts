/**
 * RagDB — Dedicated DB Connection
 *
 * Connects to the `ragdb` database, separate from the main app DB.
 * Uses DATABASE_URL_RAGDB env var, falls back to replacing DB name in DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import * as ragSchema from "../../drizzle/tables/ragdb";

let _ragDb: ReturnType<typeof drizzle<typeof ragSchema>> | null = null;

const DEFAULT_RAG_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/ragdb")
  : "postgresql://localhost:5432/ragdb";

export function getRagDb() {
  if (!_ragDb) {
    const url = process.env.DATABASE_URL_RAGDB || DEFAULT_RAG_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[RAGDB] Connecting to:", masked);
      _ragDb = drizzle(url, { schema: ragSchema });
      console.log("[RAGDB] Drizzle instance created");
    } catch (error) {
      console.error("[RAGDB] Connection failed:", error);
      _ragDb = null;
    }
  }
  return _ragDb;
}

/** Reset the cached connection (useful after seed/migration) */
export function resetRagDb() {
  _ragDb = null;
}
