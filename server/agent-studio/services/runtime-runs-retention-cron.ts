/**
 * Runtime Runs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #622. Sister of `services/workspace-observability/
 * retention-cron.ts` (#612) on the runtime-runs surface. Wires
 * `pruneOldRuntimeRuns` (#621, cascade extended in #637) to a
 * boot-time cron so the `ags_runtime_runs` + 5 sibling tables don't
 * grow unbounded.
 *
 * Defaults:
 *  - Cron: `"0 4 * * *"` — daily 04:00 UTC (offset 1h from #612).
 *  - Retention: 30 days. Default terminal statuses
 *    `["completed", "failed", "cancelled"]` are applied by the prune
 *    service itself.
 *
 * Env: `AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
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
  pruneOldRuntimeRuns,
  type PruneOldRuntimeRunsInput,
  type PruneOldRuntimeRunsResult,
} from "./runtime-runs-retention.js";

const cron = makeRetentionCron<
  PruneOldRuntimeRunsInput,
  PruneOldRuntimeRunsResult
>({
  logPrefix: "ags-runtime-runs-retention-cron",
  envPrefix: "AGS_RUNTIME_RUNS_RETENTION",
  defaultCronExpr: "0 4 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldRuntimeRunsInput,
  runSweep: (input) => pruneOldRuntimeRuns(input),
  formatSweepLogTail: (r, days) =>
    `runs=${r.deletedRunsCount} steps=${r.deletedStepsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_RUNTIME_RUNS_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;
export const DEFAULT_RUNTIME_RUNS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickRuntimeRunsRetentionCronOptions = TickRetentionCronOptions<
  PruneOldRuntimeRunsInput,
  PruneOldRuntimeRunsResult
>;
export type TickRuntimeRunsRetentionCronResult =
  TickRetentionCronResult<PruneOldRuntimeRunsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldRuntimeRunsResult>;
export type RuntimeRunsRetentionCronStatus =
  RetentionCronStatus<PruneOldRuntimeRunsResult>;

export const tickRuntimeRunsRetentionCron = cron.tick;
export const getRuntimeRunsRetentionCronStatus = cron.getStatus;
export const ensureRuntimeRunsRetentionCronStarted = cron.ensureStarted;
export const _resetRuntimeRunsRetentionCronForTests = cron.resetForTests;
