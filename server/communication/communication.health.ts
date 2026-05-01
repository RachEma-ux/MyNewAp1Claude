/**
 * Communication — Health check
 *
 * Returns ok/degraded/failed based on CommunicationDB reachability
 * and whether the canonical tables exist.
 */

import { sql } from "drizzle-orm";
import type { ModuleHealthReport } from "../platform/modules/types";
import { getCommunicationDb } from "./connection";

const EXPECTED_TABLES = [
  "communication_conversations",
  "communication_messages",
  "communication_meetings",
  "communication_participants",
  "communication_notifications",
];

export async function communicationHealth(): Promise<ModuleHealthReport> {
  const checkedAt = new Date().toISOString();
  const db = getCommunicationDb();
  if (!db) {
    return {
      state: "degraded",
      message: "CommunicationDB connection unavailable",
      checkedAt,
    };
  }
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'communication_%'`,
    );
    const rows = (result as any).rows ?? result;
    const first = Array.isArray(rows) ? rows[0] : rows;
    const count = Number(first?.cnt ?? 0);
    if (count >= EXPECTED_TABLES.length) {
      return {
        state: "ok",
        message: `CommunicationDB reachable (${count} tables)`,
        details: { tableCount: count },
        checkedAt,
      };
    }
    return {
      state: "degraded",
      message: `Only ${count}/${EXPECTED_TABLES.length} communication_* tables present`,
      details: { tableCount: count, expected: EXPECTED_TABLES },
      checkedAt,
    };
  } catch (err) {
    return {
      state: "failed",
      message: `CommunicationDB ping failed: ${(err as Error).message}`,
      checkedAt,
    };
  }
}
