/**
 * Workspace Observability — operator dashboard composite.
 *
 * Single round-trip payload for the workspace-observability operator
 * page. Bundles:
 *   - `stats`: getWorkspaceObservabilityStats() — the full per-table
 *     aggregates (sourceKind/lane/day, jobsByStatus/Kind/Lane,
 *     failedJobsBy{Kind,Day}, notificationsByKind/Lane/Read).
 *   - `recentFailedJobs`: listJobs({status:"failed", limit}) — the
 *     drilldown list operators click into when a failure spike
 *     appears on the trend.
 *   - `recentErrorEvents`: listErrorEvents({limit}) — the latest
 *     captured errors across all routers.
 *   - `staleRunningJobs`: listStaleRunningJobs(staleLimit) — the
 *     longest-running rows currently in `status='running'`, surfaced
 *     so operators can spot stuck workers without sorting the failed
 *     list.
 *
 * Composition is parallel via Promise.all. Sister of
 * `services/graph-quality/operator-dashboard.ts` but scoped to the
 * workspace-observability surface — the cross-domain composite is
 * the graph-quality one, which calls into observability stats but
 * doesn't surface the recent slices.
 *
 * ASDB-null: each underlying query is fail-soft, so the composite
 * inherits that — `stats` returns the all-zero shape, the recent
 * lists return [].
 */

import {
  getWorkspaceObservabilityStats,
  type WorkspaceObservabilityStats,
  type WorkspaceObservabilityStatsOptions,
} from "./stats.js";
import {
  listJobs,
  listStaleRunningJobs,
  listOldestPendingJobs,
  type BackgroundJobRow,
} from "./background-jobs.js";
import {
  listErrorEvents,
  type ErrorEventRow,
} from "./error-events.js";

export interface ObservabilityDashboardPayload {
  readonly stats: WorkspaceObservabilityStats;
  readonly recentFailedJobs: readonly BackgroundJobRow[];
  /**
   * Most-recently-completed jobs, drilldown counterpart to the
   * `completedJobsByDay` (#570) trend. Operators triaging a
   * failed-job spike compare the recent slices in parallel:
   * "is anything completing successfully right now?" answers
   * cascade-incident vs single-worker-regression. Ordered by
   * `updatedAt` DESC (most-recent flip first) since that's when
   * the row reached terminal status.
   */
  readonly recentCompletedJobs: readonly BackgroundJobRow[];
  readonly recentErrorEvents: readonly ErrorEventRow[];
  readonly staleRunningJobs: readonly BackgroundJobRow[];
  /**
   * Pending-queue backlog: oldest `status='pending'` rows by
   * `createdAt` ASC. Sister of `staleRunningJobs` — that surfaces
   * workers that *started but never finished*; this surfaces
   * workers that *never started at all* (queue starvation). A
   * jobKind concentration here is the operator's signal that a
   * worker subsystem isn't pulling its queue.
   */
  readonly oldestPendingJobs: readonly BackgroundJobRow[];
}

export interface ObservabilityDashboardInput {
  /**
   * Cap on `recentFailedJobs` and `recentErrorEvents` returned to the
   * dashboard. Default 20 — enough to populate a drilldown card
   * without inflating payload for the initial render.
   */
  readonly recentLimit?: number;
  /**
   * Cap on `staleRunningJobs`. Default 10 — operators want a short
   * "what's stuck" list, not a full running-job dump.
   */
  readonly staleLimit?: number;
  /**
   * Optional jobKind filter forwarded to listStaleRunningJobs (#556).
   * Lets the dashboard scope the stale-running list to a specific
   * worker subsystem when triaging.
   */
  readonly staleJobKind?: string | readonly string[];
  /**
   * Cap on `oldestPendingJobs`. Default 10 — operators want a short
   * "what's waiting" list, not a full pending-queue dump.
   */
  readonly pendingLimit?: number;
  /**
   * Optional jobKind filter forwarded to listOldestPendingJobs
   * (#569). Same scoping use as `staleJobKind` but for the pending
   * backlog.
   */
  readonly pendingJobKind?: string | readonly string[];
  /**
   * Optional jobKind filter forwarded to BOTH the
   * `recentFailedJobs` and `recentCompletedJobs` slices. Lets the
   * operator triage by worker subsystem — see failures and
   * completions for the same jobKind in parallel on the same
   * screen. Shared across both slices because the common case is
   * incident-scoped comparison; a single value covers both sides
   * of the failed/completed pair (matches `recentLimit`'s shared
   * shape).
   */
  readonly recentJobKind?: string | readonly string[];
  /**
   * Optional errorClass filter forwarded to listErrorEvents — lets
   * the dashboard scope the recent-error-events drilldown to a
   * specific class when triaging a known incident. Mirrors the
   * existing list-side filter shape (single string `eq` or array
   * `IN`). Does not affect the stats slice (which always shows
   * the full breakdown).
   */
  readonly errorClass?: string | readonly string[];
  /**
   * Optional sourceKind filter forwarded to listErrorEvents — same
   * scoping use as `errorClass`, but anchors on the source (e.g.
   * `trpc.chat.send`) rather than the exception class. Mutually
   * compatible — both are ANDed at the listing layer.
   */
  readonly sourceKind?: string | readonly string[];
  /**
   * Optional SQL LIKE-style filter on errorMessage forwarded to
   * listErrorEvents (#579). Lets the dashboard scope the
   * recent-errors drilldown to a substring — "show me recent
   * events whose message mentions 'connection refused'" without
   * the operator running a separate listErrorEvents call.
   * Composes with errorClass + sourceKind (ANDed in the WHERE).
   */
  readonly errorMessageLike?: string;
}

export interface ObservabilityDashboardOptions {
  readonly getDb?: WorkspaceObservabilityStatsOptions["getDb"];
}

const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_STALE_LIMIT = 10;
const DEFAULT_PENDING_LIMIT = 10;

export async function getObservabilityDashboard(
  input: ObservabilityDashboardInput = {},
  options: ObservabilityDashboardOptions = {},
): Promise<ObservabilityDashboardPayload> {
  const recentLimit = input.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const staleLimit = input.staleLimit ?? DEFAULT_STALE_LIMIT;
  const pendingLimit = input.pendingLimit ?? DEFAULT_PENDING_LIMIT;

  const [
    stats,
    recentFailedJobs,
    recentCompletedJobs,
    recentErrorEvents,
    staleRunningJobs,
    oldestPendingJobs,
  ] = await Promise.all([
    getWorkspaceObservabilityStats({ getDb: options.getDb }),
    listJobs(
      { status: "failed", limit: recentLimit, jobKind: input.recentJobKind },
      { getDb: options.getDb },
    ),
    listJobs(
      {
        status: "completed",
        limit: recentLimit,
        jobKind: input.recentJobKind,
      },
      { getDb: options.getDb },
    ),
    listErrorEvents(
      {
        limit: recentLimit,
        errorClass: input.errorClass,
        sourceKind: input.sourceKind,
        errorMessageLike: input.errorMessageLike,
      },
      { getDb: options.getDb },
    ),
    listStaleRunningJobs(
      { limit: staleLimit, jobKind: input.staleJobKind },
      { getDb: options.getDb },
    ),
    listOldestPendingJobs(
      { limit: pendingLimit, jobKind: input.pendingJobKind },
      { getDb: options.getDb },
    ),
  ]);

  return {
    stats,
    recentFailedJobs,
    recentCompletedJobs,
    recentErrorEvents,
    staleRunningJobs,
    oldestPendingJobs,
  };
}
