/**
 * Tool Call Traces — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #626. Sister of #622 (runtime-runs retention
 * cron) and #612 (workspace-observability retention cron) on the
 * `ags_tool_call_traces` table. Wires #625's `pruneOldToolCallTraces`
 * to a boot-time cron.
 *
 * Defaults:
 *  - Cron: `"0 5 * * *"` — daily at 05:00 UTC. Offset 1h from the
 *    runtime-runs sweep (#622 at 04:00) and 2h from the workspace-
 *    observability sweep (#612 at 03:00). Spreading the three daily
 *    sweeps across distinct minutes avoids a single-minute write
 *    spike on the ASDB.
 *  - Retention: 30 days
 *  - dispatchResults filter: `["ok"]` only (the
 *    `pruneOldToolCallTraces` default — preserves error + blocked
 *    rows for forensic value)
 *
 * Env overrides:
 *  - `AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED=1` — opt out
 *  - `AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR` — cron expression
 *  - `AGS_TOOL_CALL_TRACES_RETENTION_DAYS` — retention window
 *
 * Status semantics + module shape mirror runtime-runs-retention-cron.ts
 * (#622). See `project_phase_22_cron_mini_arc.md` for the established
 * `*-cron.ts` pattern.
 */

import { matchesCron } from "./scheduler.js";
import {
  pruneOldToolCallTraces,
  type PruneOldToolCallTracesInput,
  type PruneOldToolCallTracesResult,
} from "./tool-call-traces-retention.js";

export const DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR = "0 5 * * *";
export const DEFAULT_TOOL_CALL_TRACES_RETENTION_DAYS = 30;

const TICK_INTERVAL_MS = 60_000;

export interface TickToolCallTracesRetentionCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly retentionDays?: number;
  readonly sweepInput?: Omit<PruneOldToolCallTracesInput, "olderThan">;
  readonly runSweep?: (
    input: PruneOldToolCallTracesInput,
  ) => Promise<PruneOldToolCallTracesResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickToolCallTracesRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: PruneOldToolCallTracesResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: PruneOldToolCallTracesResult | null;
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
  const env = process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveRetentionDays(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_TOOL_CALL_TRACES_RETENTION_DAYS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TOOL_CALL_TRACES_RETENTION_DAYS;
}

export async function tickToolCallTracesRetentionCron(
  options: TickToolCallTracesRetentionCronOptions = {},
): Promise<TickToolCallTracesRetentionCronResult> {
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
  const sweepInput: PruneOldToolCallTracesInput = {
    olderThan,
    ...(options.sweepInput ?? {}),
  };

  const sweep =
    options.runSweep ?? ((input) => pruneOldToolCallTraces(input));
  try {
    const result = await sweep(sweepInput);
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-tool-call-traces-retention-cron] swept — deleted=${result.deletedCount} retentionDays=${retentionDays}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-tool-call-traces-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

export interface ToolCallTracesRetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: PruneOldToolCallTracesResult | null;
  readonly lastError: string | null;
}

export function getToolCallTracesRetentionCronStatus(
  state: EnsureState = moduleState,
): ToolCallTracesRetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function ensureToolCallTracesRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-tool-call-traces-retention-cron] disabled via AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickToolCallTracesRetentionCron().catch((err) => {
      console.error(
        "[ags-tool-call-traces-retention-cron] tick crashed:",
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
    `[ags-tool-call-traces-retention-cron] started — 60s tick, cron='${cron}' (UTC), retentionDays=${days}`,
  );
}

export function _resetToolCallTracesRetentionCronForTests(): void {
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
