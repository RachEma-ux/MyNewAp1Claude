/**
 * Graph-quality dashboard stats aggregator.
 *
 * Phase 23 §1. Single read that bundles "what does the operator dashboard
 * need to render summary cards" — counts of findings by status, by
 * severity, by findingClass, plus recent-scan counts and recent-agent-run
 * counts.
 *
 * Pure SQL aggregation. No JOIN-on-app-side fanout. The result shape
 * is keyed to render directly in the operator UI (bucket names → counts).
 *
 * ASDB-null returns the zero-stats shape (all-zeros) instead of
 * throwing — the dashboard renders "0 findings" instead of an error.
 */

import { sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityFindings,
  agsGraphQualityScans,
  agsGraphQualityAgentRuns,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";

export interface FindingsTrendBucket {
  /** Day boundary as YYYY-MM-DD (UTC). */
  readonly date: string;
  readonly count: number;
}

export interface GraphQualityStats {
  readonly findingsByStatus: Record<string, number>;
  readonly findingsBySeverity: Record<string, number>;
  readonly findingsByClass: Record<string, number>;
  readonly scansByStatus: Record<string, number>;
  readonly agentRunsByStatus: Record<string, number>;
  /**
   * Per-day count of findings created in the last 14 days (UTC),
   * oldest-first. Days with zero findings are included (zero-filled)
   * so the dashboard can render a continuous sparkline without
   * client-side date arithmetic.
   */
  readonly findingsCreatedByDay: readonly FindingsTrendBucket[];
  readonly totals: {
    readonly findings: number;
    readonly scans: number;
    readonly agentRuns: number;
  };
}

export interface GraphQualityStatsOptions {
  readonly getDb?: typeof getAsDb;
}

const TREND_DAYS = 14;

const EMPTY_STATS: GraphQualityStats = {
  findingsByStatus: {},
  findingsBySeverity: {},
  findingsByClass: {},
  scansByStatus: {},
  agentRunsByStatus: {},
  findingsCreatedByDay: [],
  totals: { findings: 0, scans: 0, agentRuns: 0 },
};

/**
 * Zero-fill a day-bucket sparse map into an ordered `[{date, count}]`
 * array covering the last `windowDays` days (oldest-first, UTC).
 *
 * Exported for direct unit-testing — the SQL path can vary between
 * sqlite/postgres test harnesses; the zero-fill logic is exercised
 * in isolation.
 */
export function zeroFillTrend(
  rawBuckets: Record<string, number>,
  windowDays: number,
  now: Date = new Date(),
): FindingsTrendBucket[] {
  const filled: FindingsTrendBucket[] = [];
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

export async function getGraphQualityStats(
  options: GraphQualityStatsOptions = {},
): Promise<GraphQualityStats> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return EMPTY_STATS;

  const [
    findingsByStatusRows,
    findingsBySeverityRows,
    findingsByClassRows,
    scansByStatusRows,
    agentRunsByStatusRows,
    findingsTrendRows,
  ] = await Promise.all([
    db
      .select({
        status: agsGraphQualityFindings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityFindings)
      .groupBy(agsGraphQualityFindings.status),
    db
      .select({
        severity: agsGraphQualityFindings.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityFindings)
      .groupBy(agsGraphQualityFindings.severity),
    db
      .select({
        findingClass: agsGraphQualityFindings.findingClass,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityFindings)
      .groupBy(agsGraphQualityFindings.findingClass),
    db
      .select({
        status: agsGraphQualityScans.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityScans)
      .groupBy(agsGraphQualityScans.status),
    db
      .select({
        status: agsGraphQualityAgentRuns.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityAgentRuns)
      .groupBy(agsGraphQualityAgentRuns.status),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${agsGraphQualityFindings.createdAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(agsGraphQualityFindings)
      .where(
        sql`${agsGraphQualityFindings.createdAt} > now() - interval '${sql.raw(String(TREND_DAYS))} days'`,
      )
      .groupBy(sql`date_trunc('day', ${agsGraphQualityFindings.createdAt}) AT TIME ZONE 'UTC'`),
  ]);

  const findingsByStatus = bucketize(findingsByStatusRows, "status");
  const findingsBySeverity = bucketize(findingsBySeverityRows, "severity");
  const findingsByClass = bucketize(findingsByClassRows, "findingClass");
  const scansByStatus = bucketize(scansByStatusRows, "status");
  const agentRunsByStatus = bucketize(agentRunsByStatusRows, "status");
  const findingsTrendMap = bucketize(findingsTrendRows, "day");
  const findingsCreatedByDay = zeroFillTrend(findingsTrendMap, TREND_DAYS);

  return {
    findingsByStatus,
    findingsBySeverity,
    findingsByClass,
    scansByStatus,
    agentRunsByStatus,
    findingsCreatedByDay,
    totals: {
      findings: sumBuckets(findingsByStatus),
      scans: sumBuckets(scansByStatus),
      agentRuns: sumBuckets(agentRunsByStatus),
    },
  };
}
