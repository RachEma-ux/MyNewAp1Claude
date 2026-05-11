/**
 * Phase 22 — workspace observability dashboard stats aggregator.
 */

import { describe, it, expect, vi } from "vitest";
import { getWorkspaceObservabilityStats } from "../../server/agent-studio/services/workspace-observability/stats";

interface SeededBuckets {
  errorEventsBySourceKind?: { sourceKind: string; count: number }[];
  errorEventsByErrorClass?: { errorClass: string; count: number }[];
  jobsByStatus?: { status: string; count: number }[];
  jobsByKind?: { jobKind: string; count: number }[];
  notificationsByKind?: { notificationKind: string; count: number }[];
  notificationsByReadState?: { read: boolean | null; count: number }[];
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
    | null = null;

  const select = vi.fn((shape: Record<string, unknown>) => {
    if ("sourceKind" in shape) nextSelectKind = "errorSource";
    else if ("errorClass" in shape) nextSelectKind = "errorClass";
    else if ("status" in shape) nextSelectKind = "jobStatus";
    else if ("jobKind" in shape) nextSelectKind = "jobKind";
    else if ("notificationKind" in shape) nextSelectKind = "notifKind";
    else if ("read" in shape) nextSelectKind = "notifRead";

    return {
      from: (_t: unknown) => ({
        groupBy: async (_g: unknown) => {
          switch (nextSelectKind) {
            case "errorSource":
              return seeded.errorEventsBySourceKind ?? [];
            case "errorClass":
              return seeded.errorEventsByErrorClass ?? [];
            case "jobStatus":
              return seeded.jobsByStatus ?? [];
            case "jobKind":
              return seeded.jobsByKind ?? [];
            case "notifKind":
              return seeded.notificationsByKind ?? [];
            case "notifRead":
              return seeded.notificationsByReadState ?? [];
            default:
              return [];
          }
        },
      }),
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
