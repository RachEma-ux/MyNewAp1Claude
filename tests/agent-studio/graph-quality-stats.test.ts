/**
 * Phase 23 §1 — graph-quality dashboard stats aggregator.
 */

import { describe, it, expect, vi } from "vitest";
import {
  getGraphQualityStats,
  zeroFillTrend,
} from "../../server/agent-studio/services/graph-quality/stats";

interface SeededBuckets {
  findingsByStatus?: { status: string; count: number }[];
  findingsBySeverity?: { severity: string; count: number }[];
  findingsByClass?: { findingClass: string; count: number }[];
  scansByStatus?: { status: string; count: number }[];
  agentRunsByStatus?: { status: string; count: number }[];
  findingsByDay?: { day: string; count: number }[];
}

function makeFakeDb(seeded: SeededBuckets = {}) {
  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  let nextSelectKind:
    | "status"
    | "severity"
    | "class"
    | "day"
    | null = null;

  const select = vi.fn((shape: Record<string, unknown>) => {
    // Identify which aggregation is being requested by the shape.
    if ("severity" in shape) nextSelectKind = "severity";
    else if ("findingClass" in shape) nextSelectKind = "class";
    else if ("day" in shape) nextSelectKind = "day";
    else nextSelectKind = "status";

    return {
      from: (t: unknown) => {
        const tname = tableName(t);
        const resolver = async () => {
          if (tname === "ags_graph_quality_findings") {
            if (nextSelectKind === "status") {
              return seeded.findingsByStatus ?? [];
            }
            if (nextSelectKind === "severity") {
              return seeded.findingsBySeverity ?? [];
            }
            if (nextSelectKind === "class") {
              return seeded.findingsByClass ?? [];
            }
            if (nextSelectKind === "day") {
              return seeded.findingsByDay ?? [];
            }
          }
          if (tname === "ags_graph_quality_scans") {
            return seeded.scansByStatus ?? [];
          }
          if (tname === "ags_graph_quality_agent_runs") {
            return seeded.agentRunsByStatus ?? [];
          }
          return [];
        };
        return {
          // Status/severity/class/scans/agentRuns paths chain .groupBy directly.
          groupBy: resolver,
          // The trend path chains .where().groupBy().
          where: () => ({ groupBy: resolver }),
        };
      },
    };
  });

  return { db: { select } };
}

describe("getGraphQualityStats", () => {
  it("returns the all-zero shape when ASDB is unavailable", async () => {
    const stats = await getGraphQualityStats({ getDb: () => null as never });
    expect(stats).toEqual({
      findingsByStatus: {},
      findingsBySeverity: {},
      findingsByClass: {},
      scansByStatus: {},
      agentRunsByStatus: {},
      findingsCreatedByDay: [],
      totals: { findings: 0, scans: 0, agentRuns: 0 },
    });
  });

  it("returns the all-zero shape when every bucket query is empty", async () => {
    const { db } = makeFakeDb({});
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.totals).toEqual({ findings: 0, scans: 0, agentRuns: 0 });
    expect(stats.findingsByStatus).toEqual({});
  });

  it("bucketizes findings by status + computes the totals correctly", async () => {
    const { db } = makeFakeDb({
      findingsByStatus: [
        { status: "open", count: 3 },
        { status: "triaged", count: 5 },
        { status: "applied", count: 2 },
        { status: "dismissed", count: 1 },
      ],
    });
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.findingsByStatus).toEqual({
      open: 3,
      triaged: 5,
      applied: 2,
      dismissed: 1,
    });
    expect(stats.totals.findings).toBe(11);
  });

  it("bucketizes by severity + class independently", async () => {
    const { db } = makeFakeDb({
      findingsBySeverity: [
        { severity: "high", count: 2 },
        { severity: "medium", count: 4 },
      ],
      findingsByClass: [
        { findingClass: "orphan_node", count: 4 },
        { findingClass: "duplicate_entity", count: 2 },
      ],
    });
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.findingsBySeverity).toEqual({ high: 2, medium: 4 });
    expect(stats.findingsByClass).toEqual({
      orphan_node: 4,
      duplicate_entity: 2,
    });
  });

  it("rolls scans + agentRuns into totals separately from findings", async () => {
    const { db } = makeFakeDb({
      scansByStatus: [
        { status: "completed", count: 6 },
        { status: "failed", count: 1 },
      ],
      agentRunsByStatus: [
        { status: "completed", count: 3 },
      ],
    });
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.totals).toEqual({
      findings: 0,
      scans: 7,
      agentRuns: 3,
    });
    expect(stats.scansByStatus).toEqual({ completed: 6, failed: 1 });
    expect(stats.agentRunsByStatus).toEqual({ completed: 3 });
  });

  it("zero-fills the 14-day findings trend when DB returns no rows", async () => {
    const { db } = makeFakeDb({});
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.findingsCreatedByDay).toHaveLength(14);
    expect(stats.findingsCreatedByDay.every((b) => b.count === 0)).toBe(true);
    // oldest-first
    const dates = stats.findingsCreatedByDay.map((b) => b.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("merges DB day-bucket counts into the zero-filled window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      findingsByDay: [{ day: today, count: 7 }],
    });
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    const todayBucket = stats.findingsCreatedByDay.find(
      (b) => b.date === today,
    );
    expect(todayBucket?.count).toBe(7);
    // every other bucket stays at 0
    const otherBuckets = stats.findingsCreatedByDay.filter(
      (b) => b.date !== today,
    );
    expect(otherBuckets.every((b) => b.count === 0)).toBe(true);
  });

  it("ignores rows with null bucket keys (defensive)", async () => {
    const { db } = makeFakeDb({
      findingsByStatus: [
        { status: null as unknown as string, count: 99 },
        { status: "open", count: 4 },
      ],
    });
    const stats = await getGraphQualityStats({ getDb: () => db as never });
    expect(stats.findingsByStatus).toEqual({ open: 4 });
    expect(stats.totals.findings).toBe(4);
  });
});

describe("zeroFillTrend — pure helper", () => {
  const now = new Date("2026-05-11T12:34:56Z");

  it("returns N consecutive days, oldest-first, all zero when raw is empty", () => {
    const result = zeroFillTrend({}, 3, now);
    expect(result).toEqual([
      { date: "2026-05-09", count: 0 },
      { date: "2026-05-10", count: 0 },
      { date: "2026-05-11", count: 0 },
    ]);
  });

  it("merges raw counts onto the matching date keys", () => {
    const result = zeroFillTrend(
      { "2026-05-10": 5, "2026-05-11": 12 },
      3,
      now,
    );
    expect(result).toEqual([
      { date: "2026-05-09", count: 0 },
      { date: "2026-05-10", count: 5 },
      { date: "2026-05-11", count: 12 },
    ]);
  });

  it("drops raw entries that fall outside the window", () => {
    const result = zeroFillTrend(
      { "2026-04-01": 999, "2026-05-11": 4 },
      3,
      now,
    );
    const dates = result.map((b) => b.date);
    expect(dates).not.toContain("2026-04-01");
    expect(result.find((b) => b.date === "2026-05-11")?.count).toBe(4);
  });
});
