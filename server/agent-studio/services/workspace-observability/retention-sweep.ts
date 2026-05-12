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
   * Days to retain in `ags_workspace_user_notifications`. Default 30.
   */
  readonly notificationsRetentionDays?: number;
  /**
   * If true, only prune READ notifications — preserves unread rows
   * regardless of age. Default false.
   */
  readonly notificationsReadOnly?: boolean;
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
      { olderThan: errorEventsCutoff },
      { getDb: options.getDb },
    ),
    pruneOldNotifications(
      {
        olderThan: notificationsCutoff,
        readOnly: input.notificationsReadOnly,
      },
      { getDb: options.getDb },
    ),
    pruneOldBackgroundJobs(
      {
        olderThan: backgroundJobsCutoff,
        statuses: input.backgroundJobsStatuses,
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
