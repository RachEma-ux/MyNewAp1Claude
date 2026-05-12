/**
 * RAC Runtime Traces — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #639. Sister of #622/#626/#630/#634 on the
 * `ags_rac_runtime_traces` + `ags_rac_context_blocks` surface.
 *
 * Defaults:
 *  - Cron: `"0 8 * * *"` — daily 08:00 UTC. 6th slot in the
 *    daily-sweep ladder (03/04/05/06/07/08).
 *  - Retention: 30 days
 *
 * Env: `AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 */

import { matchesCron } from "./scheduler.js";
import {
  pruneOldRacRuntimeTraces,
  type PruneOldRacRuntimeTracesInput,
  type PruneOldRacRuntimeTracesResult,
} from "./rac-runtime-traces-retention.js";

export const DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR = "0 8 * * *";
export const DEFAULT_RAC_RUNTIME_TRACES_RETENTION_DAYS = 30;

const TICK_INTERVAL_MS = 60_000;

export interface TickRacRuntimeTracesRetentionCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly retentionDays?: number;
  readonly sweepInput?: Omit<PruneOldRacRuntimeTracesInput, "olderThan">;
  readonly runSweep?: (
    input: PruneOldRacRuntimeTracesInput,
  ) => Promise<PruneOldRacRuntimeTracesResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickRacRuntimeTracesRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: PruneOldRacRuntimeTracesResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: PruneOldRacRuntimeTracesResult | null;
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
  const env = process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveRetentionDays(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_RAC_RUNTIME_TRACES_RETENTION_DAYS;
}

export async function tickRacRuntimeTracesRetentionCron(
  options: TickRacRuntimeTracesRetentionCronOptions = {},
): Promise<TickRacRuntimeTracesRetentionCronResult> {
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
  const sweepInput: PruneOldRacRuntimeTracesInput = {
    olderThan,
    ...(options.sweepInput ?? {}),
  };

  const sweep =
    options.runSweep ?? ((input) => pruneOldRacRuntimeTraces(input));
  try {
    const result = await sweep(sweepInput);
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-rac-runtime-traces-retention-cron] swept — traces=${result.deletedTracesCount} blocks=${result.deletedContextBlocksCount} retentionDays=${retentionDays}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-rac-runtime-traces-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

export interface RacRuntimeTracesRetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: PruneOldRacRuntimeTracesResult | null;
  readonly lastError: string | null;
}

export function getRacRuntimeTracesRetentionCronStatus(
  state: EnsureState = moduleState,
): RacRuntimeTracesRetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function ensureRacRuntimeTracesRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-rac-runtime-traces-retention-cron] disabled via AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickRacRuntimeTracesRetentionCron().catch((err) => {
      console.error(
        "[ags-rac-runtime-traces-retention-cron] tick crashed:",
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
    `[ags-rac-runtime-traces-retention-cron] started — 60s tick, cron='${cron}' (UTC), retentionDays=${days}`,
  );
}

export function _resetRacRuntimeTracesRetentionCronForTests(): void {
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
