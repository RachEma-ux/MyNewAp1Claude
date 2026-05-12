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
}

export interface ObservabilityDashboardInput {
  /**
   * Cap on `recentFailedJobs` and `recentErrorEvents` returned to the
   * dashboard. Default 20 — enough to populate a drilldown card
   * without inflating payload for the initial render.
   */
  readonly recentLimit?: number;
}

export interface ObservabilityDashboardOptions {
  readonly getDb?: WorkspaceObservabilityStatsOptions["getDb"];
}

const DEFAULT_RECENT_LIMIT = 20;

export async function getObservabilityDashboard(
  input: ObservabilityDashboardInput = {},
  options: ObservabilityDashboardOptions = {},
): Promise<ObservabilityDashboardPayload> {
  const recentLimit = input.recentLimit ?? DEFAULT_RECENT_LIMIT;

  const [stats, recentFailedJobs, recentErrorEvents] = await Promise.all([
    getWorkspaceObservabilityStats({ getDb: options.getDb }),
    listJobs(
      { status: "failed", limit: recentLimit },
      { getDb: options.getDb },
    ),
    listErrorEvents({ limit: recentLimit }, { getDb: options.getDb }),
  ]);

  return { stats, recentFailedJobs, recentErrorEvents };
}
