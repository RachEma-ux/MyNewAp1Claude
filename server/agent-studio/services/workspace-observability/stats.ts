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

export interface ErrorEventsTrendBucket {
  /** Day boundary as YYYY-MM-DD (UTC). */
  readonly date: string;
  readonly count: number;
}

/**
 * Generic day-bucket trend shape — same {date, count} contract as
 * `ErrorEventsTrendBucket`, kept under a generic alias so multiple
 * trend series (jobs, notifications, etc.) can declare their type
 * without each pretending to be an "error events" bucket.
 */
export type DayTrendBucket = ErrorEventsTrendBucket;

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
  /**
   * Per-day count of error events recorded in the last 14 days (UTC),
   * oldest-first. Days with zero events are zero-filled so the dashboard
   * sparkline renders continuously without client-side date arithmetic.
   * Mirrors the shape of `findingsCreatedByDay` in graph-quality stats
   * (PR #503) — the same UI sparkline component renders both.
   */
  readonly errorEventsByDay: readonly ErrorEventsTrendBucket[];
  /**
   * Per-day count of background jobs created in the last 14 days
   * (UTC), oldest-first, zero-filled. Sister of `errorEventsByDay` —
   * the dashboard renders both with the same sparkline component so
   * operators can spot throughput dips alongside error spikes.
   */
  readonly jobsCreatedByDay: readonly DayTrendBucket[];
  readonly jobsByStatus: Record<string, number>;
  readonly jobsByKind: Record<string, number>;
  /**
   * Lane rollup of `jobsByKind` by the first dot-separated segment,
   * mirroring `errorEventsByLane`. Lets the dashboard render a
   * high-level summary card without listing every per-action jobKind.
   * Examples:
   *   projection.rebuild + projection.sync → "projection" + 2
   *   retention.sweep → "retention" + 1
   *   importScan → "importScan" + 1 (no dot → key is itself)
   */
  readonly jobsByLane: Record<string, number>;
  /**
   * Failed-only subset of `jobsByKind`: counts only rows where
   * `status='failed'`, bucketed by jobKind. Lets the dashboard answer
   * "which kinds of jobs are breaking right now" without the operator
   * having to mentally subtract completed-of-kind from total-of-kind.
   * Empty `{}` when no failed jobs are recorded.
   */
  readonly failedJobsByKind: Record<string, number>;
  readonly notificationsByKind: Record<string, number>;
  /**
   * Lane rollup of `notificationsByKind` by the first dot-separated
   * segment, completing the lane-rollup symmetry across all three
   * Phase 22 tables (errorEventsByLane / jobsByLane).
   * Examples:
   *   promotion.approved + promotion.rejected → "promotion" + 2
   *   maintenance.window → "maintenance" + 1
   *   broadcast → "broadcast" + 1 (no dot → key is itself)
   */
  readonly notificationsByLane: Record<string, number>;
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

const TREND_DAYS = 14;

const EMPTY_STATS: WorkspaceObservabilityStats = {
  errorEventsBySourceKind: {},
  errorEventsByLane: {},
  errorEventsByErrorClass: {},
  errorEventsByDay: [],
  jobsCreatedByDay: [],
  jobsByStatus: {},
  jobsByKind: {},
  jobsByLane: {},
  failedJobsByKind: {},
  notificationsByKind: {},
  notificationsByLane: {},
  notificationsByReadState: { read: 0, unread: 0 },
  totals: { errorEvents: 0, jobs: 0, notifications: 0 },
};

/**
 * Zero-fill a day-bucket sparse map into an ordered `[{date, count}]`
 * array covering the last `windowDays` days (oldest-first, UTC). Same
 * shape as graph-quality's `zeroFillTrend` (PR #503) — kept in this
 * module for boundary clarity (workspace-observability shouldn't
 * import from graph-quality).
 *
 * Generic over which series — used for both error events and jobs.
 * The original `zeroFillErrorEventsTrend` name is kept as an alias
 * so existing imports/exports stay stable.
 */
export function zeroFillDayTrend(
  rawBuckets: Record<string, number>,
  windowDays: number,
  now: Date = new Date(),
): DayTrendBucket[] {
  const filled: DayTrendBucket[] = [];
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(utcMidnight - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    filled.push({ date, count: rawBuckets[date] ?? 0 });
  }
  return filled;
}

/** @deprecated Use {@link zeroFillDayTrend}. Kept for back-compat. */
export const zeroFillErrorEventsTrend = zeroFillDayTrend;

/**
 * Roll up a per-key bucket map into a per-lane map by the first
 * dot-separated segment. Exported for direct unit-testing — the SQL
 * GROUP BY happens upstream; this is pure post-processing.
 *
 * Generic across keyspaces: errorEvents.sourceKind, backgroundJobs.jobKind,
 * etc. — anywhere the keys follow a `module.action` taxonomy.
 */
export function rollupByLane(
  byKey: Record<string, number>,
): Record<string, number> {
  const byLane: Record<string, number> = {};
  for (const [kind, count] of Object.entries(byKey)) {
    const dot = kind.indexOf(".");
    const lane = dot === -1 ? kind : kind.slice(0, dot);
    byLane[lane] = (byLane[lane] ?? 0) + count;
  }
  return byLane;
}

/** @deprecated Use {@link rollupByLane}. Kept for back-compat. */
export const rollupSourceKindsByLane = rollupByLane;

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
    errorEventsTrendRows,
    jobsTrendRows,
    failedJobsByKindRows,
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
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${agsWorkspaceErrorEvents.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceErrorEvents)
      .where(
        sql`${agsWorkspaceErrorEvents.createdAt} > now() - interval '${sql.raw(String(TREND_DAYS))} days'`,
      )
      .groupBy(sql`date_trunc('day', ${agsWorkspaceErrorEvents.createdAt}) AT TIME ZONE 'UTC'`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${agsWorkspaceBackgroundJobs.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceBackgroundJobs)
      .where(
        sql`${agsWorkspaceBackgroundJobs.createdAt} > now() - interval '${sql.raw(String(TREND_DAYS))} days'`,
      )
      .groupBy(sql`date_trunc('day', ${agsWorkspaceBackgroundJobs.createdAt}) AT TIME ZONE 'UTC'`),
    db
      .select({
        jobKind: agsWorkspaceBackgroundJobs.jobKind,
        count: sql<number>`count(*)::int`,
      })
      .from(agsWorkspaceBackgroundJobs)
      .where(sql`${agsWorkspaceBackgroundJobs.status} = 'failed'`)
      .groupBy(agsWorkspaceBackgroundJobs.jobKind),
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

  const errorEventsTrendMap = bucketize(errorEventsTrendRows, "day");
  const errorEventsByDay = zeroFillDayTrend(errorEventsTrendMap, TREND_DAYS);

  const jobsTrendMap = bucketize(jobsTrendRows, "day");
  const jobsCreatedByDay = zeroFillDayTrend(jobsTrendMap, TREND_DAYS);

  return {
    errorEventsBySourceKind,
    errorEventsByLane: rollupByLane(errorEventsBySourceKind),
    errorEventsByErrorClass,
    errorEventsByDay,
    jobsCreatedByDay,
    jobsByStatus,
    jobsByKind,
    jobsByLane: rollupByLane(jobsByKind),
    failedJobsByKind: bucketize(failedJobsByKindRows, "jobKind"),
    notificationsByKind,
    notificationsByLane: rollupByLane(notificationsByKind),
    notificationsByReadState: { read: readCount, unread: unreadCount },
    totals: {
      errorEvents: sumBuckets(errorEventsBySourceKind),
      jobs: sumBuckets(jobsByStatus),
      notifications: readCount + unreadCount,
    },
  };
}
