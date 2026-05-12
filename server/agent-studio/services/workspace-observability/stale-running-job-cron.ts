/**
 * Workspace Observability — scheduled stale-running-jobs sweep cron.
 *
 * Phase 22 follow-up #613. The Phase 22 follow-up arc shipped
 * `failStaleRunningJobs()` (sweeps jobs stuck in `status='running'`
 * with no heartbeat/transition within a staleness window, auto-fails
 * them, bridges error_events) but had no scheduled caller —
 * operators had to fire it manually via the adminProcedure. This
 * module wires the boot-time cron tick so the sweep runs every 10
 * minutes (default), unsticking phantom in-flight rows so the worker
 * queue isn't starved.
 *
 * Design mirrors `retention-cron.ts` (#612) — same module shape, same
 * env-flag conventions, same test seam pattern. The two sweep crons
 * coexist as siblings under `services/workspace-observability/` and
 * are wired into `boot.ts` back-to-back.
 *
 * Defaults:
 *  - Cron: `"* /10 * * * *"` (every 10 minutes — runs often enough
 *    that operators don't see week-long phantom-running rows but not
 *    so often that the dashboard's recent-failed slice is dominated
 *    by sweep-induced failures)
 *  - Staleness threshold: 30 minutes (jobs that have been `running`
 *    with no `updatedAt` bump for 30 min are auto-failed)
 *  - Limit per sweep: 100 (matches `failStaleRunningJobs` default)
 *
 * Env overrides:
 *  - `AGS_STALE_RUNNING_CRON_DISABLED=1` — opt out entirely
 *  - `AGS_STALE_RUNNING_CRON_EXPR` — cron expression override
 *  - `AGS_STALE_RUNNING_THRESHOLD_MS` — staleness window in ms
 *  - `AGS_STALE_RUNNING_LIMIT` — max rows per sweep
 *
 * In-process dedup via `lastRunMinuteKey` — same trade-off as
 * retention-cron: a process restart during the target minute will
 * re-fire the sweep, but the sweep is idempotent (rows already
 * flipped to `failed` are excluded by the `status='running'` filter).
 *
 * Failure handling: a sweep that throws is logged via `warn` and
 * recorded as `skippedReason='swept_error'`. The dedup key is still
 * stamped so a tight re-tick within the minute doesn't retry-storm.
 */

import { matchesCron } from "../scheduler.js";
import {
  failStaleRunningJobs,
  type FailStaleRunningJobsInput,
  type FailStaleRunningJobsResult,
} from "./background-jobs.js";

/** Default cron: every 10 minutes. */
export const DEFAULT_STALE_RUNNING_CRON_EXPR = "*/10 * * * *";
/** Default staleness window: 30 minutes. */
export const DEFAULT_STALE_RUNNING_THRESHOLD_MS = 30 * 60_000;
/** Default rows per sweep — matches failStaleRunningJobs default. */
export const DEFAULT_STALE_RUNNING_LIMIT = 100;

const TICK_INTERVAL_MS = 60_000;

export interface TickStaleRunningCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly thresholdMs?: number;
  readonly limit?: number;
  /** Override the sweep function (test seam). */
  readonly runSweep?: (
    input: FailStaleRunningJobsInput,
  ) => Promise<FailStaleRunningJobsResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickStaleRunningCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: FailStaleRunningJobsResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
}

const moduleState: EnsureState = { lastRunMinuteKey: null };

function minuteKey(d: Date): string {
  return d.toISOString().slice(0, 16);
}

function resolveCronExpr(override?: string): string {
  if (typeof override === "string" && override.length > 0) return override;
  const env = process.env.AGS_STALE_RUNNING_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_STALE_RUNNING_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_STALE_RUNNING_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveThresholdMs(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_STALE_RUNNING_THRESHOLD_MS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_STALE_RUNNING_THRESHOLD_MS;
}

function resolveLimit(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_STALE_RUNNING_LIMIT;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_STALE_RUNNING_LIMIT;
}

/**
 * Single tick. Evaluates the cron against `now`, computes
 * `olderThan = now - thresholdMs`, and fires the sweep on match
 * (modulo dedup).
 */
export async function tickStaleRunningCron(
  options: TickStaleRunningCronOptions = {},
): Promise<TickStaleRunningCronResult> {
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

  const thresholdMs = resolveThresholdMs(options.thresholdMs);
  const limit = resolveLimit(options.limit);
  const olderThan = new Date(now.getTime() - thresholdMs);

  const sweep =
    options.runSweep ?? ((input) => failStaleRunningJobs(input));
  try {
    const result = await sweep({ olderThan, limit });
    log(
      `[ags-stale-running-cron] swept — scanned=${result.scanned} ` +
        `failed=${result.failed.length} thresholdMs=${thresholdMs}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`[ags-stale-running-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Idempotent boot helper. Honors `AGS_STALE_RUNNING_CRON_DISABLED=1`
 * to opt out entirely (no timer registered).
 */
export function ensureStaleRunningCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-stale-running-cron] disabled via AGS_STALE_RUNNING_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickStaleRunningCron().catch((err) => {
      console.error("[ags-stale-running-cron] tick crashed:", err);
    });
  }, TICK_INTERVAL_MS);
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
  process.on("exit", () => {
    if (timer) clearInterval(timer);
  });
  const cron = resolveCronExpr();
  const thresholdMs = resolveThresholdMs();
  console.log(
    `[ags-stale-running-cron] started — 60s tick, cron='${cron}' (UTC), thresholdMs=${thresholdMs}`,
  );
}

/** Test-only reset. */
export function _resetStaleRunningCronForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
  moduleState.lastRunMinuteKey = null;
}
