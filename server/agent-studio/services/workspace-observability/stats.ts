/**
 * Workspace Observability — dashboard stats aggregators.
 *
 * Phase 22. Bundles per-table GROUP BY counts for the operator
 * dashboard (background jobs, user notifications, error events).
 * Pure SQL, no app-side fanout. Mirrors the shape of
 * `services/graph-quality/stats.ts` (PR #488) so the operator UI
 * can reuse the same render component for both surfaces.
 *
 * ASDB-null returns the all-zero shape instead of throwing — the
 * dashboard renders "0 events" instead of an error banner.
 */

import { sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsWorkspaceErrorEvents,
  agsWorkspaceBackgroundJobs,
  agsWorkspaceUserNotifications,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export interface WorkspaceObservabilityStats {
  readonly errorEventsBySourceKind: Record<string, number>;
  /**
   * Lane rollup of errorEventsBySourceKind: groups by the first
   * dot-separated segment so the dashboard can render a high-level
   * summary card without listing every per-procedure sourceKind.
   * Examples (post #513 auto-capture):
   *   trpc.chat.send + trpc.chat.list + trpc.chat.retry → "trpc" + 3
   *   vault.router → "vault" + 1
   *   graphQuality.scanOrchestrator → "graphQuality" + 1
   * Sourcekinds with no dot use themselves as the lane key.
   */
  readonly errorEventsByLane: Record<string, number>;
  readonly errorEventsByErrorClass: Record<string, number>;
  readonly jobsByStatus: Record<string, number>;
  readonly jobsByKind: Record<string, number>;
  readonly notificationsByKind: Record<string, number>;
  readonly notificationsByReadState: { read: number; unread: number };
  readonly totals: {
    readonly errorEvents: number;
    readonly jobs: number;
    readonly notifications: number;
  };
}

export interface WorkspaceObservabilityStatsOptions {
  readonly getDb?: typeof getAsDb;
}

const EMPTY_STATS: WorkspaceObservabilityStats = {
  errorEventsBySourceKind: {},
  errorEventsByLane: {},
  errorEventsByErrorClass: {},
  jobsByStatus: {},
  jobsByKind: {},
  notificationsByKind: {},
  notificationsByReadState: { read: 0, unread: 0 },
  totals: { errorEvents: 0, jobs: 0, notifications: 0 },
};

/**
 * Roll up a per-sourceKind bucket map into a per-lane map by the first
 * dot-separated segment. Exported for direct unit-testing — the SQL
 * GROUP BY happens upstream; this is pure post-processing.
 */
export function rollupSourceKindsByLane(
  bySourceKind: Record<string, number>,
): Record<string, number> {
  const byLane: Record<string, number> = {};
  for (const [kind, count] of Object.entries(bySourceKind)) {
    const dot = kind.indexOf(".");
    const lane = dot === -1 ? kind : kind.slice(0, dot);
    byLane[lane] = (byLane[lane] ?? 0) + count;
  }
  return byLane;
}

function bucketize<T extends { count: unknown }>(
  rows: readonly T[],
  key: keyof T,
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const k = r[key];
    if (k == null) continue;
    buckets[String(k)] = Number(r.count) || 0;
  }
  return buckets;
}

function sumBuckets(buckets: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(buckets)) total += v;
  return total;
}

export async function getWorkspaceObservabilityStats(
  options: WorkspaceObservabilityStatsOptions = {},
): Promise<WorkspaceObservabilityStats> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return EMPTY_STATS;

  const [
    errorEventsBySourceKindRows,
    errorEventsByErrorClassRows,
    jobsByStatusRows,
    jobsByKindRows,
    notificationsByKindRows,
    notificationsByReadStateRows,
  ] = await Promise.all([
    db
      .select({
        sourceKind: agsWorkspaceErrorEvents.sourceKind,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceErrorEvents)
      .groupBy(agsWorkspaceErrorEvents.sourceKind),
    db
      .select({
        errorClass: agsWorkspaceErrorEvents.errorClass,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceErrorEvents)
      .groupBy(agsWorkspaceErrorEvents.errorClass),
    db
      .select({
        status: agsWorkspaceBackgroundJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceBackgroundJobs)
      .groupBy(agsWorkspaceBackgroundJobs.status),
    db
      .select({
        jobKind: agsWorkspaceBackgroundJobs.jobKind,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceBackgroundJobs)
      .groupBy(agsWorkspaceBackgroundJobs.jobKind),
    db
      .select({
        notificationKind: agsWorkspaceUserNotifications.notificationKind,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceUserNotifications)
      .groupBy(agsWorkspaceUserNotifications.notificationKind),
    db
      .select({
        read: agsWorkspaceUserNotifications.read,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceUserNotifications)
      .groupBy(agsWorkspaceUserNotifications.read),
  ]);

  const errorEventsBySourceKind = bucketize(
    errorEventsBySourceKindRows,
    "sourceKind",
  );
  const errorEventsByErrorClass = bucketize(
    errorEventsByErrorClassRows,
    "errorClass",
  );
  const jobsByStatus = bucketize(jobsByStatusRows, "status");
  const jobsByKind = bucketize(jobsByKindRows, "jobKind");
  const notificationsByKind = bucketize(notificationsByKindRows, "notificationKind");

  let readCount = 0;
  let unreadCount = 0;
  for (const r of notificationsByReadStateRows as readonly {
    read: boolean | null;
    count: unknown;
  }[]) {
    const c = Number(r.count) || 0;
    if (r.read === true) readCount += c;
    else if (r.read === false) unreadCount += c;
  }

  return {
    errorEventsBySourceKind,
    errorEventsByLane: rollupSourceKindsByLane(errorEventsBySourceKind),
    errorEventsByErrorClass,
    jobsByStatus,
    jobsByKind,
    notificationsByKind,
    notificationsByReadState: { read: readCount, unread: unreadCount },
    totals: {
      errorEvents: sumBuckets(errorEventsBySourceKind),
      jobs: sumBuckets(jobsByStatus),
      notifications: readCount + unreadCount,
    },
  };
}
