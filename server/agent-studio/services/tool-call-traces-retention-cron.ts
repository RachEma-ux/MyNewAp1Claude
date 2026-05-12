/**
 * Tool Call Traces — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #626. Sister of #622 (runtime-runs retention
 * cron) and #612 (workspace-observability retention cron) on the
 * `ags_tool_call_traces` table. Wires #625's `pruneOldToolCallTraces`
 * to a boot-time cron.
 *
 * Defaults:
 *  - Cron: `"0 5 * * *"` — daily at 05:00 UTC.
 *  - Retention: 30 days
 *  - dispatchResults filter: `["ok"]` only (the
 *    `pruneOldToolCallTraces` default — preserves error + blocked
 *    rows for forensic value)
 *
 * Env: `AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 *
 * Phase 22 follow-up #642 — module body collapsed onto the shared
 * `makeRetentionCron({...})` factory. Named exports preserved.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneOldToolCallTraces,
  type PruneOldToolCallTracesInput,
  type PruneOldToolCallTracesResult,
} from "./tool-call-traces-retention.js";

const cron = makeRetentionCron<
  PruneOldToolCallTracesInput,
  PruneOldToolCallTracesResult
>({
  logPrefix: "ags-tool-call-traces-retention-cron",
  envPrefix: "AGS_TOOL_CALL_TRACES_RETENTION",
  defaultCronExpr: "0 5 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldToolCallTracesInput,
  runSweep: (input) => pruneOldToolCallTraces(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_TOOL_CALL_TRACES_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_TOOL_CALL_TRACES_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickToolCallTracesRetentionCronOptions = TickRetentionCronOptions<
  PruneOldToolCallTracesInput,
  PruneOldToolCallTracesResult
>;
export type TickToolCallTracesRetentionCronResult =
  TickRetentionCronResult<PruneOldToolCallTracesResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldToolCallTracesResult>;
export type ToolCallTracesRetentionCronStatus =
  RetentionCronStatus<PruneOldToolCallTracesResult>;

export const tickToolCallTracesRetentionCron = cron.tick;
export const getToolCallTracesRetentionCronStatus = cron.getStatus;
export const ensureToolCallTracesRetentionCronStarted = cron.ensureStarted;
export const _resetToolCallTracesRetentionCronForTests = cron.resetForTests;
