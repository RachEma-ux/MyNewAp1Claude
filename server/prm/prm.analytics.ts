/**
 * PRM Analytics — KPI calculations, dashboard queries
 */

import { sql } from "drizzle-orm";
import { getPrmDb } from "./connection";
import * as schema from "../../drizzle/tables/prmdb";

export async function getDashboardKPIs() {
  const db = getPrmDb();
  if (!db) return null;

  try {
    const [caseStats] = await db
      .select({
        totalCases: sql<number>`count(*)::int`,
        openCases: sql<number>`count(*) filter (where status not in ('verified_closed', 'cancelled'))::int`,
        criticalOpen: sql<number>`count(*) filter (where severity = 'critical' and status not in ('verified_closed', 'cancelled'))::int`,
        closedCases: sql<number>`count(*) filter (where status = 'verified_closed')::int`,
        cancelledCases: sql<number>`count(*) filter (where status = 'cancelled')::int`,
        reopenedCases: sql<number>`count(*) filter (where status = 'reopened')::int`,
      })
      .from(schema.prmCases);

    const [actionStats] = await db
      .select({
        totalActions: sql<number>`count(*)::int`,
        overdueActions: sql<number>`count(*) filter (where status in ('pending', 'in_progress') and due_date < now())::int`,
        pendingActions: sql<number>`count(*) filter (where status = 'pending')::int`,
        completedActions: sql<number>`count(*) filter (where status = 'completed')::int`,
      })
      .from(schema.prmActions);

    const [methodStats] = await db
      .select({
        totalRuns: sql<number>`count(*)::int`,
        completedRuns: sql<number>`count(*) filter (where status = 'completed')::int`,
      })
      .from(schema.prmMethodRuns);

    const severityBreakdown = await db
      .select({
        severity: schema.prmCases.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.prmCases)
      .where(sql`status not in ('verified_closed', 'cancelled')`)
      .groupBy(schema.prmCases.severity);

    const statusBreakdown = await db
      .select({
        status: schema.prmCases.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.prmCases)
      .groupBy(schema.prmCases.status);

    return {
      cases: caseStats,
      actions: actionStats,
      methods: methodStats,
      severityBreakdown,
      statusBreakdown,
    };
  } catch {
    return null;
  }
}

export async function getQueueSummary() {
  const db = getPrmDb();
  if (!db) return [];

  try {
    return db
      .select({
        status: schema.prmCases.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.prmCases)
      .where(sql`status not in ('verified_closed', 'cancelled')`)
      .groupBy(schema.prmCases.status)
      .orderBy(sql`count(*) desc`);
  } catch {
    return [];
  }
}
