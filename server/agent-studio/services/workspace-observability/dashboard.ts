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
  type BackgroundJobRow,
} from "./background-jobs.js";
import {
  listErrorEvents,
  type ErrorEventRow,
} from "./error-events.js";

export interface ObservabilityDashboardPayload {
  readonly stats: WorkspaceObservabilityStats;
  readonly recentFailedJobs: readonly BackgroundJobRow[];
  readonly recentErrorEvents: readonly ErrorEventRow[];
  readonly staleRunningJobs: readonly BackgroundJobRow[];
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
}

export interface ObservabilityDashboardOptions {
  readonly getDb?: WorkspaceObservabilityStatsOptions["getDb"];
}

const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_STALE_LIMIT = 10;

export async function getObservabilityDashboard(
  input: ObservabilityDashboardInput = {},
  options: ObservabilityDashboardOptions = {},
): Promise<ObservabilityDashboardPayload> {
  const recentLimit = input.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const staleLimit = input.staleLimit ?? DEFAULT_STALE_LIMIT;

  const [stats, recentFailedJobs, recentErrorEvents, staleRunningJobs] =
    await Promise.all([
      getWorkspaceObservabilityStats({ getDb: options.getDb }),
      listJobs(
        { status: "failed", limit: recentLimit },
        { getDb: options.getDb },
      ),
      listErrorEvents({ limit: recentLimit }, { getDb: options.getDb }),
      listStaleRunningJobs(staleLimit, { getDb: options.getDb }),
    ]);

  return { stats, recentFailedJobs, recentErrorEvents, staleRunningJobs };
}
