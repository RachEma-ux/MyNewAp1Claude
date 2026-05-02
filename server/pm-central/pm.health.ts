/**
 * PM Central — Health check
 *
 * Returns ok/degraded/failed based on PMDB reachability and whether
 * the canonical pm_* tables exist.
 */

import { sql } from "drizzle-orm";
import type { ModuleHealthReport } from "../platform/modules/types";
import { getPmDb } from "./connection";

const EXPECTED_TABLES = [
  "pm_projects",
  "pm_plans",
  "pm_milestones",
  "pm_tasks",
  "pm_risks",
  "pm_issues",
  "pm_decisions",
  "pm_handoffs",
  "pm_activity_log",
];

export async function pmHealth(): Promise<ModuleHealthReport> {
  const checkedAt = new Date().toISOString();
  const db = getPmDb();
  if (!db) {
    return {
      state: "degraded",
      message: "PMDB connection unavailable",
      checkedAt,
    };
  }
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int AS cnt FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'pm\\_%' ESCAPE '\\'`,
    );
    const rows = (result as any).rows ?? result;
    const first = Array.isArray(rows) ? rows[0] : rows;
    const count = Number(first?.cnt ?? 0);
    if (count >= EXPECTED_TABLES.length) {
      return {
        state: "ok",
        message: `PMDB reachable (${count} pm_* tables)`,
        details: { tableCount: count },
        checkedAt,
      };
    }
    return {
      state: "degraded",
      message: `Only ${count}/${EXPECTED_TABLES.length} pm_* tables present`,
      details: { tableCount: count, expected: EXPECTED_TABLES },
      checkedAt,
    };
  } catch (err) {
    return {
      state: "failed",
      message: `PMDB ping failed: ${(err as Error).message}`,
      checkedAt,
    };
  }
}
