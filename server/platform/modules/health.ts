/**
 * Module health utilities.
 *
 * Provides a default DB-ping health probe for owned-DB modules.
 */

import type { ModuleHealthReport } from "./types";

export async function dbPingHealth(
  label: string,
  connect: () => unknown | Promise<unknown>,
): Promise<ModuleHealthReport> {
  try {
    const db: any = await connect();
    if (!db) {
      return {
        state: "degraded",
        message: `${label}: connector returned null`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (typeof db.execute === "function") {
      // Drizzle adapter — execute SELECT 1 via tagged template.
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1 AS ok`);
      return { state: "ok", checkedAt: new Date().toISOString(), message: `${label}: connected` };
    }
    return { state: "ok", checkedAt: new Date().toISOString(), message: `${label}: present` };
  } catch (err) {
    return {
      state: "failed",
      message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export function okHealth(message?: string): ModuleHealthReport {
  return { state: "ok", checkedAt: new Date().toISOString(), message };
}

export function disabledHealth(reason: string): ModuleHealthReport {
  return { state: "disabled", checkedAt: new Date().toISOString(), message: reason };
}
