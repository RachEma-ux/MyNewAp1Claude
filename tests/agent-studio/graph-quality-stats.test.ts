/**
 * Phase 23 §1 — graph-quality dashboard stats aggregator.
 */

import { describe, it, expect, vi } from "vitest";
import { getGraphQualityStats } from "../../server/agent-studio/services/graph-quality/stats";

interface SeededBuckets {
  findingsByStatus?: { status: string; count: number }[];
  findingsBySeverity?: { severity: string; count: number }[];
  findingsByClass?: { findingClass: string; count: number }[];
  scansByStatus?: { status: string; count: number }[];
  agentRunsByStatus?: { status: string; count: number }[];
}

function makeFakeDb(seeded: SeededBuckets = {}) {
  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  let nextSelectKind: "status" | "severity" | "class" | null = null;

  const select = vi.fn((shape: Record<string, unknown>) => {
    // Identify which aggregation is being requested by the shape.
    if ("severity" in shape) nextSelectKind = "severity";
    else if ("findingClass" in shape) nextSelectKind = "class";
    else nextSelectKind = "status";

    return {
      from: (t: unknown) => {
        const tname = tableName(t);
        return {
          groupBy: async (_g: unknown) => {
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
            }
            if (tname === "ags_graph_quality_scans") {
              return seeded.scansByStatus ?? [];
            }
            if (tname === "ags_graph_quality_agent_runs") {
              return seeded.agentRunsByStatus ?? [];
            }
            return [];
          },
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
