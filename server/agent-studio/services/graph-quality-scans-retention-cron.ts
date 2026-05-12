/**
 * Graph Quality Scans — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #658. Sister of #654 on the
 * `ags_graph_quality_scans` + `ags_graph_quality_findings` surface.
 *
 * Defaults:
 *  - Cron: `"0 12 * * *"` — daily 12:00 UTC. 10th slot in the
 *    daily-sweep ladder (03-12 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
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
  pruneOldGraphQualityScans,
  type PruneOldGraphQualityScansInput,
  type PruneOldGraphQualityScansResult,
} from "./graph-quality-scans-retention.js";

const cron = makeRetentionCron<
  PruneOldGraphQualityScansInput,
  PruneOldGraphQualityScansResult
>({
  logPrefix: "ags-graph-quality-scans-retention-cron",
  envPrefix: "AGS_GRAPH_QUALITY_SCANS_RETENTION",
  defaultCronExpr: "0 12 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldGraphQualityScansInput,
  runSweep: (input) => pruneOldGraphQualityScans(input),
  formatSweepLogTail: (r, days) =>
    `scans=${r.deletedScansCount} findings=${r.deletedFindingsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_GRAPH_QUALITY_SCANS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickGraphQualityScansRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldGraphQualityScansInput,
    PruneOldGraphQualityScansResult
  >;
export type TickGraphQualityScansRetentionCronResult =
  TickRetentionCronResult<PruneOldGraphQualityScansResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldGraphQualityScansResult>;
export type GraphQualityScansRetentionCronStatus =
  RetentionCronStatus<PruneOldGraphQualityScansResult>;

export const tickGraphQualityScansRetentionCron = cron.tick;
export const getGraphQualityScansRetentionCronStatus = cron.getStatus;
export const ensureGraphQualityScansRetentionCronStarted = cron.ensureStarted;
export const _resetGraphQualityScansRetentionCronForTests = cron.resetForTests;
