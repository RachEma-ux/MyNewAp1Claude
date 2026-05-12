/**
 * Workspace Observability — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #612. Wires the bundled `runRetentionSweep()`
 * (errorEvents + notifications + backgroundJobs in one call) to a
 * boot-time cron so the workspace-observability tables don't grow
 * unbounded.
 *
 * Unlike the daily-sweep sister crons (#622/#626/#630/#634/#639) this
 * cron has no top-level retentionDays envelope — the bundled sweep
 * service applies per-table cutoffs (errorEventsRetentionDays,
 * notificationsRetentionDays, backgroundJobsRetentionDays) internally
 * via its own sweepInput shape.
 *
 * Defaults:
 *  - Cron: `"0 3 * * *"` — daily at 03:00 UTC (off-peak; 1st slot in
 *    the daily-sweep ladder).
 *
 * Env: `AGS_RETENTION_CRON_DISABLED` / `AGS_RETENTION_CRON_EXPR`.
 *
 * Phase 22 follow-up #642 — module body collapsed onto the shared
 * `makeRetentionCron({...})` factory (with `defaultRetentionDays:
 * null` to opt out of the olderThan envelope). Named exports
 * preserved.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus as _CronStatus,
  type TickRetentionCronOptions as _TickOptions,
  type TickRetentionCronResult as _TickResult,
} from "../retention/make-retention-cron.js";
import {
  runRetentionSweep,
  type RunRetentionSweepInput,
  type RunRetentionSweepResult,
} from "./retention-sweep.js";

const cron = makeRetentionCron<RunRetentionSweepInput, RunRetentionSweepResult>(
  {
    logPrefix: "ags-retention-cron",
    envPrefix: "AGS_RETENTION",
    defaultCronExpr: "0 3 * * *",
    defaultRetentionDays: null,
    buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
    runSweep: (input) => runRetentionSweep(input),
    formatSweepLogTail: (r) =>
      `errors=${r.errorEventsDeleted} notifications=${r.notificationsDeleted} jobs=${r.backgroundJobsDeleted}`,
  },
);

export const DEFAULT_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickRetentionCronOptions = _TickOptions<
  RunRetentionSweepInput,
  RunRetentionSweepResult
>;
export type TickRetentionCronResult = _TickResult<RunRetentionSweepResult>;
export type EnsureState = RetentionCronEnsureState<RunRetentionSweepResult>;
export type RetentionCronStatus = _CronStatus<RunRetentionSweepResult>;

export const tickRetentionCron = cron.tick;
export const getRetentionCronStatus = cron.getStatus;
export const ensureRetentionCronStarted = cron.ensureStarted;
export const _resetRetentionCronForTests = cron.resetForTests;
