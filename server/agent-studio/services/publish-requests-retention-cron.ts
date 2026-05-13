/**
 * agsPublishRequests — scheduled retention sweep cron.
 *
 * First of three approval-lifecycle daily-sweep crons. Wraps
 * prunePublishRequestsRetention with the standard `makeRetentionCron`
 * factory contract.
 *
 * Defaults:
 *   - Cron: `"0 18 * * *"` — daily 18:00 UTC. 16th slot in the
 *     daily-sweep ladder (extends the prior 03-17 UTC sequence).
 *   - Retention window: **90 days**. Approval-lifecycle records carry
 *     compliance significance; longer default than the 30-day window
 *     of operational tables (cag-pack-events, etc.).
 *
 * Env vars: `AGS_PUBLISH_REQUESTS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 *
 * Built on the shared `makeRetentionCron({...})` factory.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  prunePublishRequestsRetention,
  type PrunePublishRequestsRetentionInput,
  type PrunePublishRequestsRetentionResult,
} from "./publish-requests-retention.js";

const cron = makeRetentionCron<
  PrunePublishRequestsRetentionInput,
  PrunePublishRequestsRetentionResult
>({
  logPrefix: "ags-publish-requests-retention-cron",
  envPrefix: "AGS_PUBLISH_REQUESTS_RETENTION",
  defaultCronExpr: "0 18 * * *",
  defaultRetentionDays: 90,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PrunePublishRequestsRetentionInput,
  runSweep: (input) => prunePublishRequestsRetention(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} preserved=${r.preservedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) => `retentionDays=${retentionDays}`,
});

export const DEFAULT_PUBLISH_REQUESTS_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;
export const DEFAULT_PUBLISH_REQUESTS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickPublishRequestsRetentionCronOptions = TickRetentionCronOptions<
  PrunePublishRequestsRetentionInput,
  PrunePublishRequestsRetentionResult
>;
export type TickPublishRequestsRetentionCronResult =
  TickRetentionCronResult<PrunePublishRequestsRetentionResult>;
export type EnsureState = RetentionCronEnsureState<PrunePublishRequestsRetentionResult>;
export type PublishRequestsRetentionCronStatus =
  RetentionCronStatus<PrunePublishRequestsRetentionResult>;

export const tickPublishRequestsRetentionCron = cron.tick;
export const getPublishRequestsRetentionCronStatus = cron.getStatus;
export const ensurePublishRequestsRetentionCronStarted = cron.ensureStarted;
export const _resetPublishRequestsRetentionCronForTests = cron.resetForTests;
