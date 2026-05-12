/**
 * CAG Pack Events — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #646. Sister of #622/#626/#630/#634/#639 on the
 * `ags_cag_pack_events` table.
 *
 * Defaults:
 *  - Cron: `"0 9 * * *"` — daily 09:00 UTC. 7th slot in the
 *    daily-sweep ladder (03/04/05/06/07/08/09).
 *  - Retention: 30 days
 *
 * Env: `AGS_CAG_PACK_EVENTS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
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
  pruneOldCagPackEvents,
  type PruneOldCagPackEventsInput,
  type PruneOldCagPackEventsResult,
} from "./cag-pack-events-retention.js";

const cron = makeRetentionCron<
  PruneOldCagPackEventsInput,
  PruneOldCagPackEventsResult
>({
  logPrefix: "ags-cag-pack-events-retention-cron",
  envPrefix: "AGS_CAG_PACK_EVENTS_RETENTION",
  defaultCronExpr: "0 9 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldCagPackEventsInput,
  runSweep: (input) => pruneOldCagPackEvents(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_CAG_PACK_EVENTS_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_CAG_PACK_EVENTS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickCagPackEventsRetentionCronOptions = TickRetentionCronOptions<
  PruneOldCagPackEventsInput,
  PruneOldCagPackEventsResult
>;
export type TickCagPackEventsRetentionCronResult =
  TickRetentionCronResult<PruneOldCagPackEventsResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldCagPackEventsResult>;
export type CagPackEventsRetentionCronStatus =
  RetentionCronStatus<PruneOldCagPackEventsResult>;

export const tickCagPackEventsRetentionCron = cron.tick;
export const getCagPackEventsRetentionCronStatus = cron.getStatus;
export const ensureCagPackEventsRetentionCronStarted = cron.ensureStarted;
export const _resetCagPackEventsRetentionCronForTests = cron.resetForTests;
