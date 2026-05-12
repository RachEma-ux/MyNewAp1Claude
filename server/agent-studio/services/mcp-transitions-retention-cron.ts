/**
 * MCP Transitions — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #630. Sister of #622 / #626 on the
 * `ags_mcp_transitions` table. Wires #629's `pruneOldMcpTransitions`
 * to a boot-time cron.
 *
 * Defaults:
 *  - Cron: `"0 6 * * *"` — daily at 06:00 UTC. 4th minute slot in
 *    the daily-sweep ladder (03:00 workspace-observability / 04:00
 *    runtime-runs / 05:00 tool-call-traces / 06:00 mcp-transitions).
 *  - Retention: 30 days
 *
 * Env overrides:
 *  - `AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED=1` — opt out
 *  - `AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR` — cron expression
 *  - `AGS_MCP_TRANSITIONS_RETENTION_DAYS` — retention window
 *
 * Module shape mirrors the 3 sister crons. See
 * `project_phase_22_cron_mini_arc.md` for the established pattern.
 */

import { matchesCron } from "./scheduler.js";
import {
  pruneOldMcpTransitions,
  type PruneOldMcpTransitionsInput,
  type PruneOldMcpTransitionsResult,
} from "./mcp-transitions-retention.js";

export const DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR = "0 6 * * *";
export const DEFAULT_MCP_TRANSITIONS_RETENTION_DAYS = 30;

const TICK_INTERVAL_MS = 60_000;

export interface TickMcpTransitionsRetentionCronOptions {
  readonly now?: Date;
  readonly cronExpr?: string;
  readonly disabled?: boolean;
  readonly retentionDays?: number;
  readonly sweepInput?: Omit<PruneOldMcpTransitionsInput, "olderThan">;
  readonly runSweep?: (
    input: PruneOldMcpTransitionsInput,
  ) => Promise<PruneOldMcpTransitionsResult>;
  readonly state?: EnsureState;
  readonly warn?: (message: string, ...args: unknown[]) => void;
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickMcpTransitionsRetentionCronResult {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: PruneOldMcpTransitionsResult;
}

export interface EnsureState {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: PruneOldMcpTransitionsResult | null;
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
  const env = process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR;
  if (typeof env === "string" && env.length > 0) return env;
  return DEFAULT_MCP_TRANSITIONS_RETENTION_CRON_EXPR;
}

function resolveDisabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const env = process.env.AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED;
  return env === "1" || env === "true";
}

function resolveRetentionDays(override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  const env = process.env.AGS_MCP_TRANSITIONS_RETENTION_DAYS;
  if (typeof env === "string") {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MCP_TRANSITIONS_RETENTION_DAYS;
}

export async function tickMcpTransitionsRetentionCron(
  options: TickMcpTransitionsRetentionCronOptions = {},
): Promise<TickMcpTransitionsRetentionCronResult> {
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
  const sweepInput: PruneOldMcpTransitionsInput = {
    olderThan,
    ...(options.sweepInput ?? {}),
  };

  const sweep =
    options.runSweep ?? ((input) => pruneOldMcpTransitions(input));
  try {
    const result = await sweep(sweepInput);
    state.lastRunAt = now;
    state.lastResult = result;
    state.lastError = null;
    log(
      `[ags-mcp-transitions-retention-cron] swept — deleted=${result.deletedCount} retentionDays=${retentionDays}`,
    );
    return { fired: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    warn(`[ags-mcp-transitions-retention-cron] sweep failed: ${msg}`);
    return { fired: false, skippedReason: "swept_error" };
  }
}

export interface McpTransitionsRetentionCronStatus {
  readonly lastRunAt: Date | null;
  readonly lastResult: PruneOldMcpTransitionsResult | null;
  readonly lastError: string | null;
}

export function getMcpTransitionsRetentionCronStatus(
  state: EnsureState = moduleState,
): McpTransitionsRetentionCronStatus {
  return {
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
  };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function ensureMcpTransitionsRetentionCronStarted(): void {
  if (started) return;
  if (resolveDisabled()) {
    console.log(
      "[ags-mcp-transitions-retention-cron] disabled via AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED",
    );
    started = true;
    return;
  }
  started = true;
  timer = setInterval(() => {
    tickMcpTransitionsRetentionCron().catch((err) => {
      console.error(
        "[ags-mcp-transitions-retention-cron] tick crashed:",
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
    `[ags-mcp-transitions-retention-cron] started — 60s tick, cron='${cron}' (UTC), retentionDays=${days}`,
  );
}

export function _resetMcpTransitionsRetentionCronForTests(): void {
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
