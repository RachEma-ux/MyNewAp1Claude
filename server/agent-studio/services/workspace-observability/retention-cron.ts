/**
 * Workspace Observability — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #612. The Phase 22 follow-up arc shipped
 * `runRetentionSweep()` (bundling pruneOldErrorEvents +
 * pruneOldNotifications + pruneOldBackgroundJobs into one call) but
 * had no scheduled caller — operators had to fire it manually via
 * `agentStudio.workspaceObservability.runRetentionSweep`. This module
 * wires the boot-time cron tick so a default 30-day retention sweep
 * runs daily at 03:00 UTC (off-peak) without operator action.
 *
 * Design notes:
 *  - Reuses `matchesCron` from `../scheduler` so we don't duplicate
 *    the cron evaluator. The scheduler's evaluator is the canonical
 *    Agent Studio cron implementation (Phase 10).
 *  - 60s tick — matches scheduler precedent, sufficient for
 *    minute-granularity cron expressions.
 *  - In-process dedup via `lastRunMinuteKey` — daily fires are
 *    infrequent enough that we don't need a DB row to dedupe.
 *    Trade-off: a process restart during the target minute will
 *    re-fire the sweep. Acceptable because retention sweeps are
 *    idempotent (deleting rows older than the cutoff a second time
 *    finds nothing to delete).
 *  - Env-flag-gated: `AGS_RETENTION_CRON_DISABLED=1` opts out
 *    entirely. `AGS_RETENTION_CRON_EXPR` overrides the default cron
 *    expression.
 *  - Failure swallowing: a sweep that throws is logged but does not
 *    crash the tick. The next tick will retry.
 *  - `timer.unref()` so the cron doesn't keep the process alive on
 *    `process.exit()` — same convention as scheduler.ts.
 *
 * Public API:
 *  - `tickRetentionCron(options?)` — single tick, exposed for tests
 *  - `ensureRetentionCronStarted(options?)` — idempotent boot helper
 */

import { matchesCron } from "../scheduler.js";
import {
  runRetentionSweep,
  type RunRetentionSweepInput,
  type RunRetentionSweepResult,
} from "./retention-sweep.js";

/** Default cron: daily at 03:00 UTC (off-peak). */
export const DEFAULT_RETENTION_CRON_EXPR = "0 3 * * *";

/** Tick frequency — matches scheduler.ts. */
const TICK_INTERVAL_MS = 60_000;

export interface TickRetentionCronOptions {
  /** Override `now` for deterministic testing. */
  readonly now?: Date;
  /** Cron expression. Defaults to env / DEFAULT_RETENTION_CRON_EXPR. */
  readonly cronExpr?: string;
  /** Override the disabled-flag for tests (defaults to env). */
  readonly disabled?: boolean;
  /** Override the sweep input (defaults to {}). */
  readonly sweepInput?: RunRetentionSweepInput;
  /** Override the sweep function (test seam). */
  readonly runSweep?: (
    input: RunRetentionSweepInput,
  ) => Promise<RunRetentionSweepResult>;
  /** Override the in-process dedup state (test seam — see EnsureState). */
  readonly state?: EnsureState;
  /** Override `console.warn` for tests. */
  readonly warn?: (message: string, ...args: unknown[]) => void;
  /** Override `console.log` for tests. */
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: RunRetentionSweepResult;
}

/**
 * Module-level state. Holds:
 *  - `lastRunMinuteKey` — minute-key of the most recent fire (or
 *    most recent attempt — set even when the sweep throws — so a
 *    tight re-tick within the same minute deduplicates and doesn't
 *    retry-storm).
 *  - `lastRunAt` — wall-clock timestamp of the most recent successful
 *    fire (only set on `fired=true`; sweep failures do NOT advance it,
 *    so operator monitors can detect "the cron is firing but always
 *    erroring" by seeing a stale `lastRunAt`).
 *  - `lastResult` — result of the most recent successful fire. Same
 *    advance semantics as `lastRunAt`.
 *  - `lastError` — error message from the most recent failed fire
 *    (cleared on the next successful fire so the indicator
 *    auto-resolves once the sweep recovers).
 *
 * Status-getter rationale: operators monitor the dashboard for "what
 * sweeps ran today?" — `lastRunAt` answers that without re-running
 * the sweep. The split between `lastRunAt`/`lastResult` (success only)
 * and `lastError` (failure only) lets a status panel render both
 * "last good sweep" and "is there a current outage?" independently.
 */
export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: RunRetentionSweepResult | null;
  lastError: string | null;
}

const moduleState: EnsureState = {
  lastRunMinuteKey: null,
  lastRunAt: null,
  lastResult: null,
  lastError: null,
};

function minuteKey(d: Date): string {
  // YYYY-MM-DDTHH:MM (UTC) — coarsest dedup that still allows
  // two consecutive minutes to fire independently.
  return d.toISOString().slice(0, 16);
}

function resolveCronExpr(override?: string): string {
  if (typeof override === "string" && override.length > 0) return override;
  const env = process.env.AGS_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

/**
 * Single tick. Evaluates the cron against `now`, fires the sweep on
 * match (modulo dedup), and returns the outcome.
 */
export async function tickRetentionCron(
  options: TickRetentionCronOptions = {},
): Promise<TickRetentionCronResult> {
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

  const sweep = options.runSweep ?? ((input) => runRetentionSweep(input));
  try {
    const result = await sweep(options.sweepInput ?? {});
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-retention-cron] swept — errors=${result.errorEventsDeleted} ` +
        `notifications=${result.notificationsDeleted} ` +
        `jobs=${result.backgroundJobsDeleted}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

/**
 * Operator-visible cron status. Returns `{ lastRunAt, lastResult,
 * lastError }` from module state — only the most recent successful
 * fire advances `lastRunAt` / `lastResult`; failures only set
 * `lastError`. Lets an admin panel render two independent signals:
 *  - "last successful sweep" → `lastRunAt` + `lastResult.*Deleted`
 *  - "current outage" → non-null `lastError`
 *
 * Returns a snapshot — not a live binding. Callers should re-invoke
 * for fresh data.
 */
export interface RetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: RunRetentionSweepResult | null;
  readonly lastError: string | null;
}

export function getRetentionCronStatus(
  state: EnsureState = moduleState,
): RetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Idempotent. Starts the 60s tick loop the first time it's called
 * and registers a `process.on('exit')` cleanup. Calling it again is
 * a no-op. Honors `AGS_RETENTION_CRON_DISABLED=1` to opt out
 * entirely (no timer registered).
 */
export function ensureRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log("[ags-retention-cron] disabled via AGS_RETENTION_CRON_DISABLED");
    started = true; // mark started so a later call is still a no-op
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickRetentionCron().catch((err) => {
      console.error("[ags-retention-cron] tick crashed:", err);
    });
  }, TICK_INTERVAL_MS);
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
  process.on("exit", () => {
    if (timer) clearInterval(timer);
  });
  const cron = resolveCronExpr();
  console.log(
    `[ags-retention-cron] started — 60s tick, cron='${cron}' (UTC)`,
  );
}

/**
 * Test-only reset. Clears the module-level dedup state and the
 * started flag so a subsequent `ensureRetentionCronStarted()` will
 * re-register. NOT exported via the public-api barrel.
 */
export function _resetRetentionCronForTests(): void {
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
