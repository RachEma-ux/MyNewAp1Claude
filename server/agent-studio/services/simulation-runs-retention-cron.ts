/**
 * Simulation Runs — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #650. Sister of #622/#626/#630/#634/#639/#646 on
 * the `ags_simulation_runs` + `ags_simulation_run_steps` surface.
 *
 * Defaults:
 *  - Cron: `"0 10 * * *"` — daily 10:00 UTC. 8th slot in the
 *    daily-sweep ladder (03/04/05/06/07/08/09/10 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_SIMULATION_RUNS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
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
  pruneOldSimulationRuns,
  type PruneOldSimulationRunsInput,
  type PruneOldSimulationRunsResult,
} from "./simulation-runs-retention.js";

const cron = makeRetentionCron<
  PruneOldSimulationRunsInput,
  PruneOldSimulationRunsResult
>({
  logPrefix: "ags-simulation-runs-retention-cron",
  envPrefix: "AGS_SIMULATION_RUNS_RETENTION",
  defaultCronExpr: "0 10 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldSimulationRunsInput,
  runSweep: (input) => pruneOldSimulationRuns(input),
  formatSweepLogTail: (r, days) =>
    `runs=${r.deletedRunsCount} steps=${r.deletedStepsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_SIMULATION_RUNS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_SIMULATION_RUNS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickSimulationRunsRetentionCronOptions = TickRetentionCronOptions<
  PruneOldSimulationRunsInput,
  PruneOldSimulationRunsResult
>;
export type TickSimulationRunsRetentionCronResult =
  TickRetentionCronResult<PruneOldSimulationRunsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldSimulationRunsResult>;
export type SimulationRunsRetentionCronStatus =
  RetentionCronStatus<PruneOldSimulationRunsResult>;

export const tickSimulationRunsRetentionCron = cron.tick;
export const getSimulationRunsRetentionCronStatus = cron.getStatus;
export const ensureSimulationRunsRetentionCronStarted = cron.ensureStarted;
export const _resetSimulationRunsRetentionCronForTests = cron.resetForTests;
