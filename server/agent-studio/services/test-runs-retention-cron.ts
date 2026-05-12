/**
 * Test Runs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #654. Sister of #650 on the `ags_test_runs` +
 * `ags_test_run_results` surface.
 *
 * Defaults:
 *  - Cron: `"0 11 * * *"` — daily 11:00 UTC. 9th slot in the
 *    daily-sweep ladder (03/04/05/06/07/08/09/10/11 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_TEST_RUNS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 *
 * Built on the shared `makeRetentionCron({...})` factory (#642).
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneOldTestRuns,
  type PruneOldTestRunsInput,
  type PruneOldTestRunsResult,
} from "./test-runs-retention.js";

const cron = makeRetentionCron<
  PruneOldTestRunsInput,
  PruneOldTestRunsResult
>({
  logPrefix: "ags-test-runs-retention-cron",
  envPrefix: "AGS_TEST_RUNS_RETENTION",
  defaultCronExpr: "0 11 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldTestRunsInput,
  runSweep: (input) => pruneOldTestRuns(input),
  formatSweepLogTail: (r, days) =>
    `runs=${r.deletedRunsCount} results=${r.deletedResultsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_TEST_RUNS_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;
export const DEFAULT_TEST_RUNS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickTestRunsRetentionCronOptions = TickRetentionCronOptions<
  PruneOldTestRunsInput,
  PruneOldTestRunsResult
>;
export type TickTestRunsRetentionCronResult =
  TickRetentionCronResult<PruneOldTestRunsResult>;
export type EnsureState = RetentionCronEnsureState<PruneOldTestRunsResult>;
export type TestRunsRetentionCronStatus =
  RetentionCronStatus<PruneOldTestRunsResult>;

export const tickTestRunsRetentionCron = cron.tick;
export const getTestRunsRetentionCronStatus = cron.getStatus;
export const ensureTestRunsRetentionCronStarted = cron.ensureStarted;
export const _resetTestRunsRetentionCronForTests = cron.resetForTests;
