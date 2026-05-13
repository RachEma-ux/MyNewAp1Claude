/**
 * Graph Change Proposals — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #674. Sister of #662 (graph-correction-proposals)
 * for the Phase 11.5 structural-change subsystem.
 *
 * Defaults:
 *  - Cron: `"0 16 * * *"` — daily 16:00 UTC. 14th slot in the
 *    daily-sweep ladder (03-16 UTC).
 *  - Retention: 30 days
 *
 * Env: `AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_DISABLED` /
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
  pruneOldGraphChangeProposals,
  type PruneOldGraphChangeProposalsInput,
  type PruneOldGraphChangeProposalsResult,
} from "./graph-change-proposals-retention.js";

const cron = makeRetentionCron<
  PruneOldGraphChangeProposalsInput,
  PruneOldGraphChangeProposalsResult
>({
  logPrefix: "ags-graph-change-proposals-retention-cron",
  envPrefix: "AGS_GRAPH_CHANGE_PROPOSALS_RETENTION",
  defaultCronExpr: "0 16 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldGraphChangeProposalsInput,
  runSweep: (input) => pruneOldGraphChangeProposals(input),
  formatSweepLogTail: (r, days) =>
    `proposals=${r.deletedProposalsCount} items=${r.deletedItemsCount} decisions=${r.deletedDecisionsCount} auditEvents=${r.deletedAuditEventsCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickGraphChangeProposalsRetentionCronOptions =
  TickRetentionCronOptions<
    PruneOldGraphChangeProposalsInput,
    PruneOldGraphChangeProposalsResult
  >;
export type TickGraphChangeProposalsRetentionCronResult =
  TickRetentionCronResult<PruneOldGraphChangeProposalsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldGraphChangeProposalsResult>;
export type GraphChangeProposalsRetentionCronStatus =
  RetentionCronStatus<PruneOldGraphChangeProposalsResult>;

export const tickGraphChangeProposalsRetentionCron = cron.tick;
export const getGraphChangeProposalsRetentionCronStatus = cron.getStatus;
export const ensureGraphChangeProposalsRetentionCronStarted =
  cron.ensureStarted;
export const _resetGraphChangeProposalsRetentionCronForTests =
  cron.resetForTests;
