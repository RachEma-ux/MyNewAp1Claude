/**
 * Catalog Sync Log — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #634. Sister of #630 / #626 / #622 on the
 * `ags_catalog_sync_log` table. Wires #633's `pruneOldCatalogSyncLog`
 * to a boot-time cron.
 *
 * Defaults:
 *  - Cron: `"0 7 * * *"` — daily at 07:00 UTC. 5th slot in the
 *    daily-sweep ladder (03/04/05/06/07 spread).
 *  - Retention: 30 days
 *
 * Env: `AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 */

import { matchesCron } from "./scheduler.js";
import {
  pruneOldCatalogSyncLog,
  type PruneOldCatalogSyncLogInput,
  type PruneOldCatalogSyncLogResult,
} from "./catalog-sync-log-retention.js";

export const DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR = "0 7 * * *";
export const DEFAULT_CATALOG_SYNC_LOG_RETENTION_DAYS = 30;

const TICK_INTERVAL_MS = 60_000;

export interface TickCatalogSyncLogRetentionCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly retentionDays?: number;
  readonly sweepInput?: Omit<PruneOldCatalogSyncLogInput, "olderThan">;
  readonly runSweep?: (
    input: PruneOldCatalogSyncLogInput,
  ) => Promise<PruneOldCatalogSyncLogResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickCatalogSyncLogRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: PruneOldCatalogSyncLogResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: PruneOldCatalogSyncLogResult | null;
  lastError: string | null;
}

const moduleState: EnsureState = {
  lastRunMinuteKey: null,
  lastRunAt: null,
  lastResult: null,
  lastError: null,
};

function minuteKey(d: Date): string {
  return d.toISOString().slice(0, 16);
}

function resolveCronExpr(override?: string): string {
  if (typeof override === "string" && override.length > 0) return override;
  const env = process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveRetentionDays(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_CATALOG_SYNC_LOG_RETENTION_DAYS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CATALOG_SYNC_LOG_RETENTION_DAYS;
}

export async function tickCatalogSyncLogRetentionCron(
  options: TickCatalogSyncLogRetentionCronOptions = {},
): Promise<TickCatalogSyncLogRetentionCronResult> {
  const now = options.now ?? new Date();
  const warn = options.warn ?? console.warn;
  const log = options.log ?? console.log;
  const state = options.state ?? moduleState;

  if (resolveDisabled(options.disabled)) {
    return { fired: false, skippedReason: "disabled" };
  }

  const cronExpr = resolveCronExpr(options.cronExpr);
  if (!matchesCron(cronExpr, now)) {
    return { fired: false, skippedReason: "no_match" };
  }

  const key = minuteKey(now);
  if (state.lastRunMinuteKey === key) {
    return { fired: false, skippedReason: "deduped" };
  }
  state.lastRunMinuteKey = key;

  const retentionDays = resolveRetentionDays(options.retentionDays);
  const olderThan = new Date(now.getTime() - retentionDays * 86_400_000);
  const sweepInput: PruneOldCatalogSyncLogInput = {
    olderThan,
    ...(options.sweepInput ?? {}),
  };

  const sweep =
    options.runSweep ?? ((input) => pruneOldCatalogSyncLog(input));
  try {
    const result = await sweep(sweepInput);
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-catalog-sync-log-retention-cron] swept — deleted=${result.deletedCount} retentionDays=${retentionDays}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-catalog-sync-log-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

export interface CatalogSyncLogRetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: PruneOldCatalogSyncLogResult | null;
  readonly lastError: string | null;
}

export function getCatalogSyncLogRetentionCronStatus(
  state: EnsureState = moduleState,
): CatalogSyncLogRetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function ensureCatalogSyncLogRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-catalog-sync-log-retention-cron] disabled via AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickCatalogSyncLogRetentionCron().catch((err) => {
      console.error(
        "[ags-catalog-sync-log-retention-cron] tick crashed:",
        err,
      );
    });
  }, TICK_INTERVAL_MS);
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
  process.on("exit", () => {
    if (timer) clearInterval(timer);
  });
  const cron = resolveCronExpr();
  const days = resolveRetentionDays();
  console.log(
    `[ags-catalog-sync-log-retention-cron] started — 60s tick, cron='${cron}' (UTC), retentionDays=${days}`,
  );
}

export function _resetCatalogSyncLogRetentionCronForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
  moduleState.lastRunMinuteKey = null;
  moduleState.lastRunAt = null;
  moduleState.lastResult = null;
  moduleState.lastError = null;
}
