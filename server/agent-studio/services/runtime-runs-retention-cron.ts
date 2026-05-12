/**
 * Runtime Runs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #622. Sister of `services/workspace-observability/
 * retention-cron.ts` (#612) on the runtime-runs surface. Wires
 * `pruneOldRuntimeRuns` (#621) to a boot-time cron so the
 * `ags_runtime_runs` + `ags_runtime_run_steps` tables don't grow
 * unbounded.
 *
 * Defaults:
 *  - Cron: `"0 4 * * *"` — daily at 04:00 UTC, offset 1h from the
 *    workspace-observability retention sweep (#612 fires at 03:00).
 *    Spreading the two daily sweeps avoids a single-minute write
 *    spike on the ASDB.
 *  - Retention: 30 days, terminal statuses only (the
 *    `pruneOldRuntimeRuns` default — `["completed", "failed",
 *    "cancelled"]`)
 *
 * Env overrides:
 *  - `AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED=1` — opt out
 *  - `AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR` — cron expression
 *  - `AGS_RUNTIME_RUNS_RETENTION_DAYS` — retention window override
 *
 * Status semantics mirror the workspace-observability cron crons:
 *  - `lastRunMinuteKey` advances on every attempt (dedup-only)
 *  - `lastRunAt` / `lastResult` advance ONLY on successful fires
 *  - `lastError` is set on failure and cleared on next success
 *
 * Module-state + getter pattern carries forward from
 * `retention-cron.ts` / `stale-running-job-cron.ts` — see
 * `project_phase_22_cron_mini_arc.md` for the established
 * `*-cron.ts` shape.
 */

import { matchesCron } from "./scheduler.js";
import {
  pruneOldRuntimeRuns,
  type PruneOldRuntimeRunsInput,
  type PruneOldRuntimeRunsResult,
} from "./runtime-runs-retention.js";

export const DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR = "0 4 * * *";
export const DEFAULT_RUNTIME_RUNS_RETENTION_DAYS = 30;

const TICK_INTERVAL_MS = 60_000;

export interface TickRuntimeRunsRetentionCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly retentionDays?: number;
  /**
   * Override the agentId / environment filters. Default omits both
   * (sweep everything matching the window). Cron callers can pass
   * an array to scope a single tick — e.g. only sweep draft.
   */
  readonly sweepInput?: Omit<PruneOldRuntimeRunsInput, "olderThan">;
  /** Test seam for the prune function. */
  readonly runSweep?: (
    input: PruneOldRuntimeRunsInput,
  ) => Promise<PruneOldRuntimeRunsResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickRuntimeRunsRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: PruneOldRuntimeRunsResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: PruneOldRuntimeRunsResult | null;
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
  const env = process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveRetentionDays(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_RUNTIME_RUNS_RETENTION_DAYS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_RUNTIME_RUNS_RETENTION_DAYS;
}

export async function tickRuntimeRunsRetentionCron(
  options: TickRuntimeRunsRetentionCronOptions = {},
): Promise<TickRuntimeRunsRetentionCronResult> {
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
  const sweepInput: PruneOldRuntimeRunsInput = {
    olderThan,
    ...(options.sweepInput ?? {}),
  };

  const sweep =
    options.runSweep ?? ((input) => pruneOldRuntimeRuns(input));
  try {
    const result = await sweep(sweepInput);
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-runtime-runs-retention-cron] swept — runs=${result.deletedRunsCount} ` +
        `steps=${result.deletedStepsCount} retentionDays=${retentionDays}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-runtime-runs-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

export interface RuntimeRunsRetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: PruneOldRuntimeRunsResult | null;
  readonly lastError: string | null;
}

export function getRuntimeRunsRetentionCronStatus(
  state: EnsureState = moduleState,
): RuntimeRunsRetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function ensureRuntimeRunsRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-runtime-runs-retention-cron] disabled via AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickRuntimeRunsRetentionCron().catch((err) => {
      console.error(
        "[ags-runtime-runs-retention-cron] tick crashed:",
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
    `[ags-runtime-runs-retention-cron] started — 60s tick, cron='${cron}' (UTC), retentionDays=${days}`,
  );
}

export function _resetRuntimeRunsRetentionCronForTests(): void {
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
