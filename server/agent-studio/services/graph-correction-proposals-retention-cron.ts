/**
 * Graph Correction Proposals — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #662. Sister of #658 (graph-quality-scans) on
 * the `ags_graph_correction_proposals` surface.
 *
 * Defaults:
 *  - Cron: `"0 13 * * *"` — daily 13:00 UTC. 11th slot in the
 *    daily-sweep ladder (03-13 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_DISABLED` /
 * `_CRON_EXPR` / `_DAYS`.
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
  pruneOldGraphCorrectionProposals,
  type PruneOldGraphCorrectionProposalsInput,
  type PruneOldGraphCorrectionProposalsResult,
} from "./graph-correction-proposals-retention.js";

const cron = makeRetentionCron<
  PruneOldGraphCorrectionProposalsInput,
  PruneOldGraphCorrectionProposalsResult
>({
  logPrefix: "ags-graph-correction-proposals-retention-cron",
  envPrefix: "AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION",
  defaultCronExpr: "0 13 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldGraphCorrectionProposalsInput,
  runSweep: (input) => pruneOldGraphCorrectionProposals(input),
  formatSweepLogTail: (r, days) =>
    `proposals=${r.deletedProposalsCount} decisions=${r.deletedDecisionsCount} auditEvents=${r.deletedAuditEventsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickGraphCorrectionProposalsRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldGraphCorrectionProposalsInput,
    PruneOldGraphCorrectionProposalsResult
  >;
export type TickGraphCorrectionProposalsRetentionCronResult =
  TickRetentionCronResult<PruneOldGraphCorrectionProposalsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldGraphCorrectionProposalsResult>;
export type GraphCorrectionProposalsRetentionCronStatus =
  RetentionCronStatus<PruneOldGraphCorrectionProposalsResult>;

export const tickGraphCorrectionProposalsRetentionCron = cron.tick;
export const getGraphCorrectionProposalsRetentionCronStatus = cron.getStatus;
export const ensureGraphCorrectionProposalsRetentionCronStarted =
  cron.ensureStarted;
export const _resetGraphCorrectionProposalsRetentionCronForTests =
  cron.resetForTests;
