/**
 * Phase 22 — workspace observability dashboard stats aggregator.
 */

import { describe, it, expect, vi } from "vitest";
import {
  getWorkspaceObservabilityStats,
  rollupSourceKindsByLane,
  rollupByLane,
  zeroFillErrorEventsTrend,
  zeroFillDayTrend,
} from "../../server/agent-studio/services/workspace-observability/stats";

interface SeededBuckets {
  errorEventsBySourceKind?: { sourceKind: string; count: number }[];
  errorEventsByErrorClass?: { errorClass: string; count: number }[];
  jobsByStatus?: { status: string; count: number }[];
  jobsByKind?: { jobKind: string; count: number }[];
  failedJobsByKind?: { jobKind: string; count: number }[];
  notificationsByKind?: { notificationKind: string; count: number }[];
  notificationsByReadState?: { read: boolean | null; count: number }[];
  errorEventsByDay?: { day: string; count: number }[];
  jobsByDay?: { day: string; count: number }[];
  failedJobsByDay?: { day: string; count: number }[];
  completedJobsByDay?: { day: string; count: number }[];
  notificationsByDay?: { day: string; count: number }[];
}

function makeFakeDb(seeded: SeededBuckets = {}) {
  const tableName = (t: unknown): string => {
    const sym = Object.getOwnPropertySymbols(t as object).find(
      (s) => s.description === "drizzle:Name",
    );
    return sym ? String((t as Record<symbol, unknown>)[sym]) : "?";
  };

  let nextSelectKind:
    | "errorSource"
    | "errorClass"
    | "jobStatus"
    | "jobKind"
    | "notifKind"
    | "notifRead"
    | "day"
    | null = null;
  let jobsDayCallCount = 0;

  const select = vi.fn((shape: Record<string, unknown>) => {
    if ("sourceKind" in shape) nextSelectKind = "errorSource";
    else if ("errorClass" in shape) nextSelectKind = "errorClass";
    else if ("status" in shape) nextSelectKind = "jobStatus";
    else if ("jobKind" in shape) nextSelectKind = "jobKind";
    else if ("notificationKind" in shape) nextSelectKind = "notifKind";
    else if ("read" in shape) nextSelectKind = "notifRead";
    else if ("day" in shape) nextSelectKind = "day";

    return {
      from: (t: unknown) => {
        const tn = tableName(t);
        const make = (whereCalled: boolean) => async () => {
          switch (nextSelectKind) {
            case "errorSource":
              return seeded.errorEventsBySourceKind ?? [];
            case "errorClass":
              return seeded.errorEventsByErrorClass ?? [];
            case "jobStatus":
              return seeded.jobsByStatus ?? [];
            case "jobKind":
              // The failed-only jobsByKind query uses .where(); the
              // total-jobsByKind query doesn't. Use that to dispatch.
              if (whereCalled) return seeded.failedJobsByKind ?? [];
              return seeded.jobsByKind ?? [];
            case "notifKind":
              return seeded.notificationsByKind ?? [];
            case "notifRead":
              return seeded.notificationsByReadState ?? [];
            case "day":
              if (tn === "ags_workspace_background_jobs") {
                // Day-bucketed queries on the jobs table, in promise-order:
                //   1) jobsCreatedByDay   (status-agnostic)
                //   2) failedJobsByDay    (status='failed')
                //   3) completedJobsByDay (status='completed')
                // All use .where(); dispatch by call order.
                jobsDayCallCount += 1;
                if (jobsDayCallCount === 1) return seeded.jobsByDay ?? [];
                if (jobsDayCallCount === 2)
                  return seeded.failedJobsByDay ?? [];
                return seeded.completedJobsByDay ?? [];
              }
              if (tn === "ags_workspace_user_notifications") {
                return seeded.notificationsByDay ?? [];
              }
              return seeded.errorEventsByDay ?? [];
            default:
              return [];
          }
        };
        return {
          groupBy: make(false),
          where: () => ({ groupBy: make(true) }),
        };
      },
    };
  });

  return { db: { select } };
}

describe("getWorkspaceObservabilityStats", () => {
  it("returns the all-zero shape when ASDB is unavailable", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.totals).toEqual({ errorEvents: 0, jobs: 0, notifications: 0 });
    expect(stats.notificationsByReadState).toEqual({ read: 0, unread: 0 });
  });

  it("bucketizes error events by sourceKind + computes the total", async () => {
    const { db } = makeFakeDb({
      errorEventsBySourceKind: [
        { sourceKind: "graphQuality.router", count: 5 },
        { sourceKind: "graphCorrection.router", count: 3 },
        { sourceKind: "workspaceObservability.router", count: 1 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsBySourceKind).toEqual({
      "graphQuality.router": 5,
      "graphCorrection.router": 3,
      "workspaceObservability.router": 1,
    });
    expect(stats.totals.errorEvents).toBe(9);
  });

  it("bucketizes error events by errorClass independently", async () => {
    const { db } = makeFakeDb({
      errorEventsByErrorClass: [
        { errorClass: "TRPCError:INTERNAL_SERVER_ERROR", count: 4 },
        { errorClass: "ZodError", count: 2 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsByErrorClass).toEqual({
      "TRPCError:INTERNAL_SERVER_ERROR": 4,
      ZodError: 2,
    });
  });

  it("bucketizes jobs by status + kind", async () => {
    const { db } = makeFakeDb({
      jobsByStatus: [
        { status: "completed", count: 12 },
        { status: "failed", count: 2 },
      ],
      jobsByKind: [
        { jobKind: "projection_sync", count: 10 },
        { jobKind: "scan", count: 4 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.jobsByStatus).toEqual({ completed: 12, failed: 2 });
    expect(stats.jobsByKind).toEqual({ projection_sync: 10, scan: 4 });
    expect(stats.totals.jobs).toBe(14);
  });

  it("splits notifications into read / unread + bucketizes by kind", async () => {
    const { db } = makeFakeDb({
      notificationsByKind: [
        { notificationKind: "promotion_complete", count: 3 },
      ],
      notificationsByReadState: [
        { read: true, count: 2 },
        { read: false, count: 1 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.notificationsByKind).toEqual({ promotion_complete: 3 });
    expect(stats.notificationsByReadState).toEqual({ read: 2, unread: 1 });
    expect(stats.totals.notifications).toBe(3);
  });

  it("rolls errorEventsBySourceKind up into errorEventsByLane", async () => {
    const { db } = makeFakeDb({
      errorEventsBySourceKind: [
        { sourceKind: "trpc.chat.send", count: 5 },
        { sourceKind: "trpc.chat.list", count: 3 },
        { sourceKind: "trpc.providers.list", count: 2 },
        { sourceKind: "vault.router", count: 1 },
        { sourceKind: "graphQuality.scanOrchestrator", count: 4 },
        { sourceKind: "graphQuality.mutationWorker", count: 1 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsByLane).toEqual({
      trpc: 10, // 5 + 3 + 2
      vault: 1,
      graphQuality: 5, // 4 + 1
    });
  });

  it("ignores null bucket keys (defensive)", async () => {
    const { db } = makeFakeDb({
      errorEventsBySourceKind: [
        { sourceKind: null as unknown as string, count: 99 },
        { sourceKind: "real.router", count: 4 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsBySourceKind).toEqual({ "real.router": 4 });
    expect(stats.totals.errorEvents).toBe(4);
  });
});

describe("rollupSourceKindsByLane — pure helper", () => {
  it("returns {} for an empty input map", () => {
    expect(rollupSourceKindsByLane({})).toEqual({});
  });

  it("uses the entire kind as the lane when there is no dot", () => {
    expect(rollupSourceKindsByLane({ standalone: 7 })).toEqual({ standalone: 7 });
  });

  it("uses the first segment up to the first dot as the lane", () => {
    expect(rollupSourceKindsByLane({ "trpc.chat.send": 5 })).toEqual({ trpc: 5 });
  });

  it("sums counts across kinds that share the same lane", () => {
    expect(
      rollupSourceKindsByLane({
        "trpc.chat.send": 5,
        "trpc.chat.list": 3,
        "trpc.providers.list": 2,
      }),
    ).toEqual({ trpc: 10 });
  });

  it("preserves multiple distinct lanes", () => {
    expect(
      rollupSourceKindsByLane({
        "trpc.chat.send": 5,
        "vault.router": 3,
        "graphQuality.scanOrchestrator": 2,
      }),
    ).toEqual({ trpc: 5, vault: 3, graphQuality: 2 });
  });

  it("rollupByLane is the canonical alias and yields the same output for jobKind keyspaces", () => {
    expect(
      rollupByLane({
        "projection.rebuild": 3,
        "projection.sync": 1,
        "retention.sweep": 2,
        importScan: 7,
      }),
    ).toEqual({ projection: 4, retention: 2, importScan: 7 });
  });
});

describe("getWorkspaceObservabilityStats — failedJobsByDay trend", () => {
  it("zero-fills the 14-day window when no failures are recorded", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.failedJobsByDay).toHaveLength(14);
    expect(stats.failedJobsByDay.every((b) => b.count === 0)).toBe(true);
  });

  it("merges DB day-bucket counts into the failed-jobs window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      failedJobsByDay: [{ day: today, count: 5 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const todayBucket = stats.failedJobsByDay.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(5);
    const others = stats.failedJobsByDay.filter((b) => b.date !== today);
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("jobs-created and jobs-failed trends are independent series", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      jobsByDay: [{ day: today, count: 50 }],
      failedJobsByDay: [{ day: today, count: 7 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.jobsCreatedByDay.find((b) => b.date === today)?.count).toBe(50);
    expect(stats.failedJobsByDay.find((b) => b.date === today)?.count).toBe(7);
  });

  it("returns an empty failedJobsByDay on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.failedJobsByDay).toEqual([]);
  });
});

describe("getWorkspaceObservabilityStats — completedJobsByDay trend (#570)", () => {
  it("zero-fills the 14-day window when no completions are recorded", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.completedJobsByDay).toHaveLength(14);
    expect(stats.completedJobsByDay.every((b) => b.count === 0)).toBe(true);
  });

  it("merges DB day-bucket counts into the completed-jobs window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      completedJobsByDay: [{ day: today, count: 42 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const todayBucket = stats.completedJobsByDay.find(
      (b) => b.date === today,
    );
    expect(todayBucket?.count).toBe(42);
    const others = stats.completedJobsByDay.filter((b) => b.date !== today);
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("failed and completed trends are independent series", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      failedJobsByDay: [{ day: today, count: 3 }],
      completedJobsByDay: [{ day: today, count: 97 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.failedJobsByDay.find((b) => b.date === today)?.count).toBe(3);
    expect(stats.completedJobsByDay.find((b) => b.date === today)?.count).toBe(
      97,
    );
  });

  it("returns an empty completedJobsByDay on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.completedJobsByDay).toEqual([]);
  });
});

describe("getWorkspaceObservabilityStats — failedJobsByLane rollup", () => {
  it("rolls failedJobsByKind up by first dot-segment", async () => {
    const { db } = makeFakeDb({
      failedJobsByKind: [
        { jobKind: "projection.rebuild", count: 3 },
        { jobKind: "projection.sync", count: 1 },
        { jobKind: "retention.sweep", count: 2 },
        { jobKind: "importScan", count: 5 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.failedJobsByLane).toEqual({
      projection: 4,
      retention: 2,
      importScan: 5,
    });
  });

  it("returns an empty failedJobsByLane when nothing is failed", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.failedJobsByLane).toEqual({});
  });

  it("returns an empty failedJobsByLane on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.failedJobsByLane).toEqual({});
  });
});

describe("getWorkspaceObservabilityStats — failedJobsByKind sub-stat", () => {
  it("buckets only the failed-status rows by jobKind", async () => {
    const { db } = makeFakeDb({
      jobsByKind: [
        { jobKind: "projection.rebuild", count: 12 },
        { jobKind: "projection.sync", count: 4 },
        { jobKind: "retention.sweep", count: 2 },
      ],
      failedJobsByKind: [
        { jobKind: "projection.rebuild", count: 3 },
        { jobKind: "retention.sweep", count: 1 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    // Total-of-kind unchanged
    expect(stats.jobsByKind).toEqual({
      "projection.rebuild": 12,
      "projection.sync": 4,
      "retention.sweep": 2,
    });
    // Failed-of-kind shows the breakage subset only
    expect(stats.failedJobsByKind).toEqual({
      "projection.rebuild": 3,
      "retention.sweep": 1,
    });
  });

  it("returns an empty failedJobsByKind when nothing is failed", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.failedJobsByKind).toEqual({});
  });

  it("returns an empty failedJobsByKind on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.failedJobsByKind).toEqual({});
  });
});

describe("getWorkspaceObservabilityStats — notificationsByLane rollup", () => {
  it("rolls notificationsByKind into lanes by first dot-segment", async () => {
    const { db } = makeFakeDb({
      notificationsByKind: [
        { notificationKind: "promotion.approved", count: 3 },
        { notificationKind: "promotion.rejected", count: 1 },
        { notificationKind: "maintenance.window", count: 2 },
        { notificationKind: "broadcast", count: 5 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.notificationsByLane).toEqual({
      promotion: 4,
      maintenance: 2,
      broadcast: 5,
    });
  });

  it("returns an empty notificationsByLane when no notifications are recorded", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.notificationsByLane).toEqual({});
  });

  it("returns an empty notificationsByLane on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.notificationsByLane).toEqual({});
  });
});

describe("getWorkspaceObservabilityStats — jobsByLane rollup", () => {
  it("rolls jobsByKind into lanes by first dot-segment", async () => {
    const { db } = makeFakeDb({
      jobsByKind: [
        { jobKind: "projection.rebuild", count: 3 },
        { jobKind: "projection.sync", count: 1 },
        { jobKind: "retention.sweep", count: 2 },
        { jobKind: "importScan", count: 7 },
      ],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.jobsByLane).toEqual({
      projection: 4,
      retention: 2,
      importScan: 7,
    });
  });

  it("returns an empty jobsByLane when no jobs are recorded", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.jobsByLane).toEqual({});
  });

  it("returns an empty jobsByLane on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.jobsByLane).toEqual({});
  });
});

describe("getWorkspaceObservabilityStats — errorEventsByDay trend", () => {
  it("zero-fills the 14-day window when DB returns no rows", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsByDay).toHaveLength(14);
    expect(stats.errorEventsByDay.every((b) => b.count === 0)).toBe(true);
    const dates = stats.errorEventsByDay.map((b) => b.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("merges DB day-bucket counts into the zero-filled window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      errorEventsByDay: [{ day: today, count: 4 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const todayBucket = stats.errorEventsByDay.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(4);
    const others = stats.errorEventsByDay.filter((b) => b.date !== today);
    expect(others.every((b) => b.count === 0)).toBe(true);
  });
});

describe("zeroFillErrorEventsTrend — pure helper", () => {
  const now = new Date("2026-05-12T08:00:00Z");

  it("returns N consecutive days oldest-first, all zero when raw is empty", () => {
    const result = zeroFillErrorEventsTrend({}, 3, now);
    expect(result).toEqual([
      { date: "2026-05-10", count: 0 },
      { date: "2026-05-11", count: 0 },
      { date: "2026-05-12", count: 0 },
    ]);
  });

  it("merges raw counts onto matching date keys + drops out-of-window entries", () => {
    const result = zeroFillErrorEventsTrend(
      { "2026-04-15": 999, "2026-05-11": 7, "2026-05-12": 3 },
      3,
      now,
    );
    expect(result).toEqual([
      { date: "2026-05-10", count: 0 },
      { date: "2026-05-11", count: 7 },
      { date: "2026-05-12", count: 3 },
    ]);
  });

  it("zeroFillDayTrend is the canonical alias and yields the same output", () => {
    const a = zeroFillErrorEventsTrend(
      { "2026-05-12": 9 },
      3,
      now,
    );
    const b = zeroFillDayTrend({ "2026-05-12": 9 }, 3, now);
    expect(a).toEqual(b);
  });
});

describe("getWorkspaceObservabilityStats — jobsCreatedByDay trend", () => {
  it("zero-fills the 14-day window when DB returns no rows", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.jobsCreatedByDay).toHaveLength(14);
    expect(stats.jobsCreatedByDay.every((b) => b.count === 0)).toBe(true);
    const dates = stats.jobsCreatedByDay.map((b) => b.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("merges DB day-bucket counts into the zero-filled jobs window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      jobsByDay: [{ day: today, count: 9 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const todayBucket = stats.jobsCreatedByDay.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(9);
    const others = stats.jobsCreatedByDay.filter((b) => b.date !== today);
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("error-events and jobs trends are independent (no cross-contamination)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      errorEventsByDay: [{ day: today, count: 4 }],
      jobsByDay: [{ day: today, count: 11 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const errToday = stats.errorEventsByDay.find((b) => b.date === today);
    const jobToday = stats.jobsCreatedByDay.find((b) => b.date === today);
    expect(errToday?.count).toBe(4);
    expect(jobToday?.count).toBe(11);
  });
});

describe("getWorkspaceObservabilityStats — notificationsByDay trend (#552)", () => {
  it("zero-fills the 14-day window when DB returns no rows", async () => {
    const { db } = makeFakeDb({});
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.notificationsByDay).toHaveLength(14);
    expect(stats.notificationsByDay.every((b) => b.count === 0)).toBe(true);
    const dates = stats.notificationsByDay.map((b) => b.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("merges DB day-bucket counts into the zero-filled window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      notificationsByDay: [{ day: today, count: 6 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    const todayBucket = stats.notificationsByDay.find((b) => b.date === today);
    expect(todayBucket?.count).toBe(6);
    const others = stats.notificationsByDay.filter((b) => b.date !== today);
    expect(others.every((b) => b.count === 0)).toBe(true);
  });

  it("notifications, error-events, and jobs trends are mutually independent", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = makeFakeDb({
      errorEventsByDay: [{ day: today, count: 2 }],
      jobsByDay: [{ day: today, count: 5 }],
      notificationsByDay: [{ day: today, count: 8 }],
    });
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => db as never,
    });
    expect(stats.errorEventsByDay.find((b) => b.date === today)?.count).toBe(2);
    expect(stats.jobsCreatedByDay.find((b) => b.date === today)?.count).toBe(5);
    expect(stats.notificationsByDay.find((b) => b.date === today)?.count).toBe(8);
  });

  it("returns the all-zero shape on ASDB-null", async () => {
    const stats = await getWorkspaceObservabilityStats({
      getDb: () => null as never,
    });
    expect(stats.notificationsByDay).toEqual([]);
  });
});
