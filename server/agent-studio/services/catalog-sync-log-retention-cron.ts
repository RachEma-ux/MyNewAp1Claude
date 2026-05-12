/**
 * Catalog Sync Log — scheduled retention sweep cron.
 *
 * Phase 22 follow-up #634. Sister of #622/#626/#630 on the
 * `ags_catalog_sync_log` table.
 *
 * Defaults:
 *  - Cron: `"0 7 * * *"` — daily 07:00 UTC.
 *  - Retention: 30 days
 *
 * Env: `AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
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
  pruneOldCatalogSyncLog,
  type PruneOldCatalogSyncLogInput,
  type PruneOldCatalogSyncLogResult,
} from "./catalog-sync-log-retention.js";

const cron = makeRetentionCron<
  PruneOldCatalogSyncLogInput,
  PruneOldCatalogSyncLogResult
>({
  logPrefix: "ags-catalog-sync-log-retention-cron",
  envPrefix: "AGS_CATALOG_SYNC_LOG_RETENTION",
  defaultCronExpr: "0 7 * * *",
  defaultRetentionDays: 30,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneOldCatalogSyncLogInput,
  runSweep: (input) => pruneOldCatalogSyncLog(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) =>
    `retentionDays=${retentionDays}`,
});

export const DEFAULT_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR =
  cron.DEFAULT_CRON_EXPR;
export const DEFAULT_CATALOG_SYNC_LOG_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickCatalogSyncLogRetentionCronOptions = TickRetentionCronOptions<
  PruneOldCatalogSyncLogInput,
  PruneOldCatalogSyncLogResult
>;
export type TickCatalogSyncLogRetentionCronResult =
  TickRetentionCronResult<PruneOldCatalogSyncLogResult>;
export type EnsureState =
  RetentionCronEnsureState<PruneOldCatalogSyncLogResult>;
export type CatalogSyncLogRetentionCronStatus =
  RetentionCronStatus<PruneOldCatalogSyncLogResult>;

export const tickCatalogSyncLogRetentionCron = cron.tick;
export const getCatalogSyncLogRetentionCronStatus = cron.getStatus;
export const ensureCatalogSyncLogRetentionCronStarted = cron.ensureStarted;
export const _resetCatalogSyncLogRetentionCronForTests = cron.resetForTests;
