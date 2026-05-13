/**
 * agsNotePromotions — scheduled retention sweep cron.
 *
 * Third of three approval-lifecycle daily-sweep crons. Wraps
 * pruneNotePromotionsRetention with the standard `makeRetentionCron`
 * factory contract.
 *
 * Defaults:
 *   - Cron: `"0 20 * * *"` — daily 20:00 UTC. 18th slot in the
 *     daily-sweep ladder.
 *   - Retention window: 90 days. Matches the other two approval-
 *     lifecycle crons.
 *
 * Env vars: `AGS_NOTE_PROMOTIONS_RETENTION_CRON_DISABLED` / `_CRON_EXPR`
 * / `_DAYS`.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "./retention/make-retention-cron.js";
import {
  pruneNotePromotionsRetention,
  type PruneNotePromotionsRetentionInput,
  type PruneNotePromotionsRetentionResult,
} from "./note-promotions-retention.js";

const cron = makeRetentionCron<
  PruneNotePromotionsRetentionInput,
  PruneNotePromotionsRetentionResult
>({
  logPrefix: "ags-note-promotions-retention-cron",
  envPrefix: "AGS_NOTE_PROMOTIONS_RETENTION",
  defaultCronExpr: "0 20 * * *",
  defaultRetentionDays: 90,
  buildSweepInput: ({ olderThan, sweepInput }) =>
    ({
      ...(sweepInput ?? {}),
      olderThan: olderThan as Date,
    }) as PruneNotePromotionsRetentionInput,
  runSweep: (input) => pruneNotePromotionsRetention(input),
  formatSweepLogTail: (r, days) =>
    `deleted=${r.deletedCount} preserved=${r.preservedCount} ` +
    `cascadeVersions=${r.cascadeDeletedCounts.versions} ` +
    `cascadeDecisions=${r.cascadeDeletedCounts.decisions} ` +
    `cascadeAuditEvents=${r.cascadeDeletedCounts.auditEvents} ` +
    `retentionDays=${days}`,
  formatStartupLogTail: ({ retentionDays }) => `retentionDays=${retentionDays}`,
});

export const DEFAULT_NOTE_PROMOTIONS_RETENTION_CRON_EXPR = cron.DEFAULT_CRON_EXPR;
export const DEFAULT_NOTE_PROMOTIONS_RETENTION_DAYS =
  cron.DEFAULT_RETENTION_DAYS as number;

export type TickNotePromotionsRetentionCronOptions = TickRetentionCronOptions<
  PruneNotePromotionsRetentionInput,
  PruneNotePromotionsRetentionResult
>;
export type TickNotePromotionsRetentionCronResult =
  TickRetentionCronResult<PruneNotePromotionsRetentionResult>;
export type EnsureState = RetentionCronEnsureState<PruneNotePromotionsRetentionResult>;
export type NotePromotionsRetentionCronStatus =
  RetentionCronStatus<PruneNotePromotionsRetentionResult>;

export const tickNotePromotionsRetentionCron = cron.tick;
export const getNotePromotionsRetentionCronStatus = cron.getStatus;
export const ensureNotePromotionsRetentionCronStarted = cron.ensureStarted;
export const _resetNotePromotionsRetentionCronForTests = cron.resetForTests;
