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

export interface GraphQualityStats {
  readonly findingsByStatus: Record<string, number>;
  readonly findingsBySeverity: Record<string, number>;
  readonly findingsByClass: Record<string, number>;
  readonly scansByStatus: Record<string, number>;
  readonly agentRunsByStatus: Record<string, number>;
  readonly totals: {
    readonly findings: number;
    readonly scans: number;
    readonly agentRuns: number;
  };
}

export interface GraphQualityStatsOptions {
  readonly getDb?: typeof getAsDb;
}

const EMPTY_STATS: GraphQualityStats = {
  findingsByStatus: {},
  findingsBySeverity: {},
  findingsByClass: {},
  scansByStatus: {},
  agentRunsByStatus: {},
  totals: { findings: 0, scans: 0, agentRuns: 0 },
};

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
  ]);

  const findingsByStatus = bucketize(findingsByStatusRows, "status");
  const findingsBySeverity = bucketize(findingsBySeverityRows, "severity");
  const findingsByClass = bucketize(findingsByClassRows, "findingClass");
  const scansByStatus = bucketize(scansByStatusRows, "status");
  const agentRunsByStatus = bucketize(agentRunsByStatusRows, "status");

  return {
    findingsByStatus,
    findingsBySeverity,
    findingsByClass,
    scansByStatus,
    agentRunsByStatus,
    totals: {
      findings: sumBuckets(findingsByStatus),
      scans: sumBuckets(scansByStatus),
      agentRuns: sumBuckets(agentRunsByStatus),
    },
  };
}
