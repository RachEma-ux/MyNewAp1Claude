/**
 * Phase 22 ↔ Phase 23 — operator dashboard composite query.
 *
 * Verifies the fan-out composition shape — three underlying queries
 * called in parallel, payload bundles all three keys, unauthenticated
 * caller gets the zero-state unread block instead of an error.
 */

import { describe, it, expect, vi } from "vitest";
import { getOperatorDashboard } from "../../server/agent-studio/services/graph-quality/operator-dashboard";
import type { GraphQualityStats } from "../../server/agent-studio/services/graph-quality/stats";
import type { WorkspaceObservabilityStats } from "../../server/agent-studio/services/workspace-observability/stats";
import type { UnreadNotificationCount } from "../../server/agent-studio/services/workspace-observability/user-notifications";

function makeGqStats(): GraphQualityStats {
  return {
    findingsByStatus: { open: 3 },
    findingsBySeverity: { medium: 3 },
    findingsByClass: { orphan_node: 3 },
    scansByStatus: { completed: 5 },
    agentRunsByStatus: { completed: 2 },
    findingsCreatedByDay: [{ date: "2026-05-11", count: 3 }],
    totals: { findings: 3, scans: 5, agentRuns: 2 },
  };
}

function makeObsStats(): WorkspaceObservabilityStats {
  return {
    errorEventsBySourceKind: { "graphQuality.router": 1 },
    errorEventsByErrorClass: { TRPCError: 1 },
    jobsByStatus: { completed: 4 },
    jobsByKind: { ingestion: 4 },
    notificationsByKind: { graph_quality_run_completed: 7 },
    notificationsByReadState: { unread: 2, read: 5 },
    totals: { errorEvents: 1, jobs: 4, notifications: 7 },
  };
}

function makeUnread(): UnreadNotificationCount {
  return {
    total: 2,
    byKind: { graph_quality_run_completed: 2 },
  };
}

describe("getOperatorDashboard", () => {
  it("bundles graphQuality + observability + unread when userId is set", async () => {
    const gqsMock = vi.fn(async () => makeGqStats());
    const obsMock = vi.fn(async () => makeObsStats());
    const unreadMock = vi.fn(async () => makeUnread());

    const result = await getOperatorDashboard(7, {
      getGraphQualityStats: gqsMock,
      getWorkspaceObservabilityStats: obsMock,
      countUnreadNotifications: unreadMock,
    });

    expect(gqsMock).toHaveBeenCalledTimes(1);
    expect(obsMock).toHaveBeenCalledTimes(1);
    expect(unreadMock).toHaveBeenCalledTimes(1);
    expect(unreadMock).toHaveBeenCalledWith(7);
    expect(result.graphQuality.totals.findings).toBe(3);
    expect(result.observability.totals.jobs).toBe(4);
    expect(result.unread.total).toBe(2);
  });

  it("returns zero-state unread when userId is null", async () => {
    const unreadMock = vi.fn(async () => makeUnread());
    const result = await getOperatorDashboard(null, {
      getGraphQualityStats: async () => makeGqStats(),
      getWorkspaceObservabilityStats: async () => makeObsStats(),
      countUnreadNotifications: unreadMock,
    });
    expect(unreadMock).not.toHaveBeenCalled();
    expect(result.unread).toEqual({ total: 0, byKind: {} });
  });

  it("returns zero-state unread when userId is undefined", async () => {
    const result = await getOperatorDashboard(undefined, {
      getGraphQualityStats: async () => makeGqStats(),
      getWorkspaceObservabilityStats: async () => makeObsStats(),
      countUnreadNotifications: async () => makeUnread(),
    });
    expect(result.unread).toEqual({ total: 0, byKind: {} });
  });

  it("propagates underlying query errors instead of swallowing", async () => {
    await expect(
      getOperatorDashboard(7, {
        getGraphQualityStats: async () => {
          throw new Error("stats blew up");
        },
        getWorkspaceObservabilityStats: async () => makeObsStats(),
        countUnreadNotifications: async () => makeUnread(),
      }),
    ).rejects.toThrow(/stats blew up/);
  });

  it("runs the three queries in parallel (not serially)", async () => {
    const callOrder: string[] = [];
    const slow =
      <T>(name: string, value: T, delayMs: number) =>
      async () => {
        callOrder.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, delayMs));
        callOrder.push(`${name}:end`);
        return value;
      };

    await getOperatorDashboard(7, {
      getGraphQualityStats: slow("gqs", makeGqStats(), 30),
      getWorkspaceObservabilityStats: slow("obs", makeObsStats(), 30),
      countUnreadNotifications: slow("unread", makeUnread(), 30),
    });

    // All three :start markers must appear before any :end marker, which
    // is only possible if they ran concurrently (Promise.all fan-out).
    const startIdx = ["gqs:start", "obs:start", "unread:start"].map((m) =>
      callOrder.indexOf(m),
    );
    const endIdx = ["gqs:end", "obs:end", "unread:end"].map((m) =>
      callOrder.indexOf(m),
    );
    const maxStart = Math.max(...startIdx);
    const minEnd = Math.min(...endIdx);
    expect(maxStart).toBeLessThan(minEnd);
  });
});
