/**
 * Workspace Observability — retention sweep.
 *
 * Phase 22 follow-up. Bundles `pruneOldErrorEvents` (#519),
 * `pruneOldNotifications` (#520), and `pruneOldBackgroundJobs` (#522)
 * into one operator/cron call so the caller doesn't have to remember
 * to prune all three tables independently (and doesn't need to
 * compute cutoff dates separately).
 *
 * Defaults to 30-day retention for all three tables. Caller can
 * override any window independently — useful for noisy environments
 * (shorter window for error_events) or operators who want to
 * preserve unread notifications / failed jobs longer.
 *
 * Returns per-table deletion counts so cron jobs can emit metrics.
 */

import { pruneOldErrorEvents } from "./error-events.js";
import { pruneOldNotifications } from "./user-notifications.js";
import {
  pruneOldBackgroundJobs,
  type JobStatus,
} from "./background-jobs.js";
import { getAsDb } from "../../db/connection.js";

export interface RunRetentionSweepInput {
  /**
   * Days to retain in `ags_workspace_error_events`. Default 30.
   * Set to 0 to delete everything.
   */
  readonly errorEventsRetentionDays?: number;
  /**
   * Restrict error-event deletion to events of this errorClass (string)
   * or classes (array). Mirrors the errorClass filter on
   * pruneOldErrorEvents (#550) — lets cron callers shed noisy classes
   * aggressively while preserving rare ones.
   */
  readonly errorEventsErrorClass?: string | readonly string[];
  /**
   * Optional SQL LIKE-style filter on errorMessage (caller supplies
   * wildcards). Mirrors `pruneOldErrorEvents.errorMessageLike`
   * (#581) — lets a cron policy shed noisy transient errors by
   * substring while preserving rare classes. Composes with
   * `errorEventsErrorClass` (ANDed).
   */
  readonly errorEventsErrorMessageLike?: string;
  /**
   * Optional SQL LIKE-style prefix filter on sourceKind for the
   * error-events sweep. Mirrors `pruneOldErrorEvents.sourceKindLike`
   * (#604) — cron callers can prune by source-family prefix
   * (`trpc.chat.%`, `vault.%`) without enumerating each procedure.
   * Composes with the other error-events sweep filters (ANDed).
   */
  readonly errorEventsSourceKindLike?: string;
  /**
   * Days to retain in `ags_workspace_user_notifications`. Default 30.
   */
  readonly notificationsRetentionDays?: number;
  /**
   * If true, only prune READ notifications — preserves unread rows
   * regardless of age. Default false.
   */
  readonly notificationsReadOnly?: boolean;
  /**
   * Restrict notification deletion to this kind (string) or kinds
   * (array). Mirrors the filter on pruneOldNotifications (#551) —
   * lets cron callers shed noisy kinds aggressively while preserving
   * rare ones.
   */
  readonly notificationsNotificationKind?: string | readonly string[];
  /**
   * Optional SQL LIKE-style prefix filter on notificationKind for
   * the notifications sweep. Mirrors
   * `pruneOldNotifications.notificationKindLike` (#603) and
   * `backgroundJobsJobKindLike` (#602) — cron callers can prune by
   * kind prefix (`promotion.%`, `import.%`) without enumerating each
   * sub-kind. Mutually exclusive with `notificationsNotificationKind`
   * (exact wins).
   */
  readonly notificationsNotificationKindLike?: string;
  /**
   * Days to retain in `ags_workspace_background_jobs`. Default 30.
   */
  readonly backgroundJobsRetentionDays?: number;
  /**
   * Restrict background-job deletion to these terminal statuses.
   * Default ["completed", "cancelled"] (preserves `failed`). Pass
   * ["completed", "failed", "cancelled"] for aggressive cleanup.
   */
  readonly backgroundJobsStatuses?: readonly JobStatus[];
  /**
   * Restrict background-job deletion to jobs of this kind (string)
   * or kinds (array). Mirrors the jobKind filter on
   * pruneOldBackgroundJobs (#549) — lets cron callers run
   * per-worker retention policies without firing N sweeps.
   */
  readonly backgroundJobsJobKind?: string | readonly string[];
  /**
   * Optional SQL LIKE filter on `lastError` for the background-jobs
   * sweep. Mirrors `pruneOldBackgroundJobs.lastErrorLike` (#582) —
   * cron callers can prune already-triaged transient failures by
   * substring (e.g. `"%OOMKilled%"`) without forcing them through
   * the singular prune call.
   */
  readonly backgroundJobsLastErrorLike?: string;
  /**
   * Optional SQL LIKE-style prefix filter on `jobKind` for the
   * background-jobs sweep. Mirrors `pruneOldBackgroundJobs.jobKindLike`
   * (#602) — cron callers can prune by worker-family prefix (e.g.
   * `"projection.%"`) without enumerating each sub-kind. Mutually
   * exclusive with `backgroundJobsJobKind` (exact wins — same
   * precedence convention as the listJobs/pruneOldBackgroundJobs
   * surface).
   */
  readonly backgroundJobsJobKindLike?: string;
}

export interface RunRetentionSweepResult {
  readonly errorEventsDeleted: number;
  readonly notificationsDeleted: number;
  readonly backgroundJobsDeleted: number;
  readonly errorEventsCutoff: Date;
  readonly notificationsCutoff: Date;
  readonly backgroundJobsCutoff: Date;
}

export interface RunRetentionSweepOptions {
  readonly getDb?: typeof getAsDb;
  /** Override `now` for deterministic testing. */
  readonly now?: Date;
}

const DEFAULT_RETENTION_DAYS = 30;

export async function runRetentionSweep(
  input: RunRetentionSweepInput = {},
  options: RunRetentionSweepOptions = {},
): Promise<RunRetentionSweepResult> {
  const now = options.now ?? new Date();
  const errorDays = input.errorEventsRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const notifDays = input.notificationsRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const jobsDays =
    input.backgroundJobsRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const errorEventsCutoff = new Date(now.getTime() - errorDays * 86_400_000);
  const notificationsCutoff = new Date(
    now.getTime() - notifDays * 86_400_000,
  );
  const backgroundJobsCutoff = new Date(
    now.getTime() - jobsDays * 86_400_000,
  );

  const [errorRes, notifRes, jobsRes] = await Promise.all([
    pruneOldErrorEvents(
      {
        olderThan: errorEventsCutoff,
        errorClass: input.errorEventsErrorClass,
        errorMessageLike: input.errorEventsErrorMessageLike,
        sourceKindLike: input.errorEventsSourceKindLike,
      },
      { getDb: options.getDb },
    ),
    pruneOldNotifications(
      {
        olderThan: notificationsCutoff,
        readOnly: input.notificationsReadOnly,
        notificationKind: input.notificationsNotificationKind,
        notificationKindLike: input.notificationsNotificationKindLike,
      },
      { getDb: options.getDb },
    ),
    pruneOldBackgroundJobs(
      {
        olderThan: backgroundJobsCutoff,
        statuses: input.backgroundJobsStatuses,
        jobKind: input.backgroundJobsJobKind,
        jobKindLike: input.backgroundJobsJobKindLike,
        lastErrorLike: input.backgroundJobsLastErrorLike,
      },
      { getDb: options.getDb },
    ),
  ]);

  return {
    errorEventsDeleted: errorRes.deletedCount,
    notificationsDeleted: notifRes.deletedCount,
    backgroundJobsDeleted: jobsRes.deletedCount,
    errorEventsCutoff,
    notificationsCutoff,
    backgroundJobsCutoff,
  };
}
