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
  pruneOldRacRuntimeTraces,
  type PruneOldRacRuntimeTracesInput,
  type PruneOldRacRuntimeTracesResult,
} from "./rac-runtime-traces-retention.js";

const cron = makeRetentionCron<
  PruneOldRacRuntimeTracesInput,
  PruneOldRacRuntimeTracesResult
>({
  logPrefix: "ags-rac-runtime-traces-retention-cron",
  envPrefix: "AGS_RAC_RUNTIME_TRACES_RETENTION",
  defaultCronExpr: "0 8 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldRacRuntimeTracesInput,
  runSweep: (input) => pruneOldRacRuntimeTraces(input),
  formatSweepLogTail: (r, days) =>
    `traces=${r.deletedTracesCount} blocks=${r.deletedContextBlocksCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_RAC_RUNTIME_TRACES_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickRacRuntimeTracesRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldRacRuntimeTracesInput,
    PruneOldRacRuntimeTracesResult
  >;
export type TickRacRuntimeTracesRetentionCronResult =
  TickRetentionCronResult<PruneOldRacRuntimeTracesResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldRacRuntimeTracesResult>;
export type RacRuntimeTracesRetentionCronStatus =
  RetentionCronStatus<PruneOldRacRuntimeTracesResult>;

export const tickRacRuntimeTracesRetentionCron = cron.tick;
export const getRacRuntimeTracesRetentionCronStatus = cron.getStatus;
export const ensureRacRuntimeTracesRetentionCronStarted = cron.ensureStarted;
export const _resetRacRuntimeTracesRetentionCronForTests = cron.resetForTests;
