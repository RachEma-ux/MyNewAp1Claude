/**
 * PS Module — Monitoring / Metrics Aggregation
 *
 * Pure DB aggregation functions for the PS control panel.
 * No business logic — just counting and deriving metrics from existing tables.
 */

import { eq, and, count, sql, desc, gte } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psSystems,
  psWizardRuns,
  psResourceRequests,
  psResourceAssignments,
} from "../../drizzle/tables/ps";

// ── Types ────────────────────────────────────────────────────────────────

export interface SystemMetrics {
  total: number;
  active: number;
  draft: number;
  archived: number;
}

export interface WizardMetrics {
  total: number;
  last24h: number;
  last7d: number;
  averageConfidence: number | null;
  lastRunAt: string | null;
}

export interface DemandMetrics {
  total: number;
  draft: number;
  open: number;
  partiallyFilled: number;
  filled: number;
  closed: number;
}

export interface AssignmentMetrics {
  total: number;
  active: number;
  completed: number;
  rejected: number;
  cancelled: number;
}

export interface FulfillmentMetrics {
  totalRequests: number;
  filledPercent: number;
  partialPercent: number;
  unfilledPercent: number;
}

export interface ActivityEntry {
  type: string;
  label: string;
  timestamp: string | null;
}

export interface MonitoringSummary {
  systems: SystemMetrics;
  wizard: WizardMetrics;
  demand: DemandMetrics;
  assignments: AssignmentMetrics;
  fulfillment: FulfillmentMetrics;
  activity: ActivityEntry[];
}

// ── System Metrics ──────────────────────────────────────────────────────

export async function getSystemMetrics(workspaceId: number): Promise<SystemMetrics> {
  const db = getDb();
  if (!db) return { total: 0, active: 0, draft: 0, archived: 0 };

  const rows = await db
    .select({
      status: psSystems.status,
      cnt: count(),
    })
    .from(psSystems)
    .where(eq(psSystems.workspaceId, workspaceId))
    .groupBy(psSystems.status);

  const result: SystemMetrics = { total: 0, active: 0, draft: 0, archived: 0 };
  for (const r of rows) {
    const n = Number(r.cnt);
    result.total += n;
    if (r.status === "active") result.active = n;
    else if (r.status === "draft") result.draft = n;
    else if (r.status === "archived") result.archived = n;
  }
  return result;
}

// ── Wizard Metrics ──────────────────────────────────────────────────────

export async function getWizardMetrics(workspaceId: number): Promise<WizardMetrics> {
  const db = getDb();
  if (!db) return { total: 0, last24h: 0, last7d: 0, averageConfidence: null, lastRunAt: null };

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Single query: total, last24h, last7d, avgConfidence, lastRunAt
  const [row] = await db
    .select({
      total: count(),
      last24h: sql<number>`count(*) filter (where ${psWizardRuns.createdAt} >= ${oneDayAgo})`,
      last7d: sql<number>`count(*) filter (where ${psWizardRuns.createdAt} >= ${sevenDaysAgo})`,
      avgConfidence: sql<string | null>`avg(${psWizardRuns.confidence}::numeric)`,
      lastRunAt: sql<string | null>`max(${psWizardRuns.createdAt})`,
    })
    .from(psWizardRuns)
    .where(eq(psWizardRuns.workspaceId, workspaceId));

  return {
    total: Number(row?.total ?? 0),
    last24h: Number(row?.last24h ?? 0),
    last7d: Number(row?.last7d ?? 0),
    averageConfidence: row?.avgConfidence ? Math.round(Number(row.avgConfidence) * 100) / 100 : null,
    lastRunAt: row?.lastRunAt ? String(row.lastRunAt) : null,
  };
}

// ── Demand Metrics ──────────────────────────────────────────────────────

export async function getDemandMetrics(workspaceId: number): Promise<DemandMetrics> {
  const db = getDb();
  if (!db) return { total: 0, draft: 0, open: 0, partiallyFilled: 0, filled: 0, closed: 0 };

  const rows = await db
    .select({
      status: psResourceRequests.status,
      cnt: count(),
    })
    .from(psResourceRequests)
    .where(eq(psResourceRequests.workspaceId, workspaceId))
    .groupBy(psResourceRequests.status);

  const result: DemandMetrics = { total: 0, draft: 0, open: 0, partiallyFilled: 0, filled: 0, closed: 0 };
  for (const r of rows) {
    const n = Number(r.cnt);
    result.total += n;
    if (r.status === "draft") result.draft = n;
    else if (r.status === "open") result.open = n;
    else if (r.status === "partially_filled") result.partiallyFilled = n;
    else if (r.status === "filled") result.filled = n;
    else if (r.status === "closed") result.closed = n;
  }
  return result;
}

// ── Assignment Metrics ──────────────────────────────────────────────────

export async function getAssignmentMetrics(workspaceId: number): Promise<AssignmentMetrics> {
  const db = getDb();
  if (!db) return { total: 0, active: 0, completed: 0, rejected: 0, cancelled: 0 };

  const rows = await db
    .select({
      status: psResourceAssignments.status,
      cnt: count(),
    })
    .from(psResourceAssignments)
    .where(eq(psResourceAssignments.workspaceId, workspaceId))
    .groupBy(psResourceAssignments.status);

  const result: AssignmentMetrics = { total: 0, active: 0, completed: 0, rejected: 0, cancelled: 0 };
  for (const r of rows) {
    const n = Number(r.cnt);
    result.total += n;
    if (r.status === "active" || r.status === "confirmed") result.active += n;
    else if (r.status === "completed") result.completed = n;
    else if (r.status === "rejected") result.rejected = n;
    else if (r.status === "cancelled") result.cancelled = n;
    // proposed, requested count toward total but not shown as separate categories
  }
  return result;
}

// ── Fulfillment Metrics ─────────────────────────────────────────────────

export async function getFulfillmentMetrics(workspaceId: number): Promise<FulfillmentMetrics> {
  const db = getDb();
  if (!db) return { totalRequests: 0, filledPercent: 0, partialPercent: 0, unfilledPercent: 0 };

  const rows = await db
    .select({
      status: psResourceRequests.status,
      cnt: count(),
    })
    .from(psResourceRequests)
    .where(eq(psResourceRequests.workspaceId, workspaceId))
    .groupBy(psResourceRequests.status);

  let total = 0;
  let filled = 0;
  let partial = 0;

  for (const r of rows) {
    const n = Number(r.cnt);
    total += n;
    if (r.status === "filled") filled = n;
    else if (r.status === "partially_filled") partial = n;
  }

  if (total === 0) {
    return { totalRequests: 0, filledPercent: 0, partialPercent: 0, unfilledPercent: 0 };
  }

  const unfilled = total - filled - partial;
  return {
    totalRequests: total,
    filledPercent: Math.round((filled / total) * 100),
    partialPercent: Math.round((partial / total) * 100),
    unfilledPercent: Math.round((unfilled / total) * 100),
  };
}

// ── Recent Activity ─────────────────────────────────────────────────────

export async function getRecentActivity(workspaceId: number): Promise<ActivityEntry[]> {
  const db = getDb();
  if (!db) return [];

  // Fetch most recent timestamps from each table in parallel
  const [latestSystem, latestWizard, latestDemand, latestAssignment] = await Promise.all([
    db
      .select({ ts: psSystems.createdAt, name: psSystems.name })
      .from(psSystems)
      .where(eq(psSystems.workspaceId, workspaceId))
      .orderBy(desc(psSystems.createdAt))
      .limit(1),
    db
      .select({ ts: psWizardRuns.createdAt })
      .from(psWizardRuns)
      .where(eq(psWizardRuns.workspaceId, workspaceId))
      .orderBy(desc(psWizardRuns.createdAt))
      .limit(1),
    db
      .select({ ts: psResourceRequests.createdAt, role: psResourceRequests.role })
      .from(psResourceRequests)
      .where(eq(psResourceRequests.workspaceId, workspaceId))
      .orderBy(desc(psResourceRequests.createdAt))
      .limit(1),
    db
      .select({ ts: psResourceAssignments.updatedAt, role: psResourceAssignments.assignmentRole })
      .from(psResourceAssignments)
      .where(eq(psResourceAssignments.workspaceId, workspaceId))
      .orderBy(desc(psResourceAssignments.updatedAt))
      .limit(1),
  ]);

  const entries: ActivityEntry[] = [];

  if (latestSystem[0]) {
    entries.push({
      type: "system_created",
      label: `System created: ${latestSystem[0].name}`,
      timestamp: latestSystem[0].ts?.toISOString() ?? null,
    });
  }

  if (latestWizard[0]) {
    entries.push({
      type: "wizard_run",
      label: "Wizard run completed",
      timestamp: latestWizard[0].ts?.toISOString() ?? null,
    });
  }

  if (latestDemand[0]) {
    entries.push({
      type: "demand_created",
      label: `Demand created: ${latestDemand[0].role}`,
      timestamp: latestDemand[0].ts?.toISOString() ?? null,
    });
  }

  if (latestAssignment[0]) {
    entries.push({
      type: "assignment_updated",
      label: `Assignment updated: ${latestAssignment[0].role}`,
      timestamp: latestAssignment[0].ts?.toISOString() ?? null,
    });
  }

  // Sort by most recent first
  entries.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return entries;
}
