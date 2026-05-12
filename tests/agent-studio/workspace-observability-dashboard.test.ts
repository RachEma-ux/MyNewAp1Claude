/**
 * Phase 22 — getObservabilityDashboard composite (PR #534).
 *
 * Verifies the single round-trip dashboard payload bundles stats +
 * recentFailedJobs + recentErrorEvents and fans them out in
 * parallel. Underlying queries are individually covered by their
 * own service tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { statsMock, listJobsMock, listErrorsMock, listStaleMock } = vi.hoisted(
  () => ({
    statsMock: vi.fn(),
    listJobsMock: vi.fn(),
    listErrorsMock: vi.fn(),
    listStaleMock: vi.fn(),
  }),
);

vi.mock(
  "../../server/agent-studio/services/workspace-observability/stats.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getWorkspaceObservabilityStats: statsMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      listJobs: listJobsMock,
      listStaleRunningJobs: listStaleMock,
    };
  },
);
vi.mock(
  "../../server/agent-studio/services/workspace-observability/error-events.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, listErrorEvents: listErrorsMock };
  },
);

import { getObservabilityDashboard } from "../../server/agent-studio/services/workspace-observability/dashboard";

const STATS_FIXTURE = {
  errorEventsBySourceKind: { "x.y": 1 },
  errorEventsByLane: { x: 1 },
  errorEventsByErrorClass: {},
  errorEventsByDay: [],
  jobsCreatedByDay: [],
  failedJobsByDay: [],
  jobsByStatus: {},
  jobsByKind: {},
  jobsByLane: {},
  failedJobsByKind: {},
  notificationsByKind: {},
  notificationsByLane: {},
  notificationsByReadState: { read: 0, unread: 0 },
  totals: { errorEvents: 1, jobs: 0, notifications: 0 },
};

beforeEach(() => {
  statsMock.mockReset();
  listJobsMock.mockReset();
  listErrorsMock.mockReset();
  listStaleMock.mockReset();
  statsMock.mockResolvedValue(STATS_FIXTURE);
  listJobsMock.mockResolvedValue([]);
  listErrorsMock.mockResolvedValue([]);
  listStaleMock.mockResolvedValue([]);
});

describe("getObservabilityDashboard", () => {
  it("returns the bundled payload from all four underlying calls", async () => {
    statsMock.mockResolvedValueOnce(STATS_FIXTURE);
    listJobsMock.mockResolvedValueOnce([
      { id: 1, jobKind: "k", status: "failed" } as never,
      { id: 2, jobKind: "k", status: "failed" } as never,
    ]);
    listErrorsMock.mockResolvedValueOnce([
      { id: 10, sourceKind: "x.y" } as never,
    ]);
    listStaleMock.mockResolvedValueOnce([
      { id: 99, jobKind: "k", status: "running" } as never,
    ]);

    const payload = await getObservabilityDashboard();

    expect(payload.stats).toBe(STATS_FIXTURE);
    expect(payload.recentFailedJobs).toHaveLength(2);
    expect(payload.recentErrorEvents).toHaveLength(1);
    expect(payload.staleRunningJobs).toHaveLength(1);
  });

  it("defaults the recent slices to limit=20 and status='failed', stale to 10", async () => {
    await getObservabilityDashboard();
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "failed", limit: 20 },
      expect.any(Object),
    );
    expect(listErrorsMock).toHaveBeenCalledWith(
      { limit: 20 },
      expect.any(Object),
    );
    expect(listStaleMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("respects a custom recentLimit on both recent slices", async () => {
    await getObservabilityDashboard({ recentLimit: 5 });
    expect(listJobsMock.mock.calls[0][0].limit).toBe(5);
    expect(listErrorsMock.mock.calls[0][0].limit).toBe(5);
  });

  it("respects a custom staleLimit on the stale-running slice", async () => {
    await getObservabilityDashboard({ staleLimit: 3 });
    expect(listStaleMock).toHaveBeenCalledWith(
      { limit: 3, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("forwards staleJobKind to listStaleRunningJobs (#556)", async () => {
    await getObservabilityDashboard({ staleJobKind: "projection.rebuild" });
    expect(listStaleMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: "projection.rebuild" },
      expect.any(Object),
    );
  });

  it("forwards array-form staleJobKind (#556)", async () => {
    await getObservabilityDashboard({
      staleJobKind: ["projection.rebuild", "import.scan"],
    });
    expect(listStaleMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: ["projection.rebuild", "import.scan"] },
      expect.any(Object),
    );
  });

  it("fans all four underlying calls out in parallel (Promise.all)", async () => {
    const order: string[] = [];
    statsMock.mockImplementationOnce(async () => {
      order.push("stats:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("stats:end");
      return STATS_FIXTURE;
    });
    listJobsMock.mockImplementationOnce(async () => {
      order.push("jobs:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("jobs:end");
      return [];
    });
    listErrorsMock.mockImplementationOnce(async () => {
      order.push("errors:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("errors:end");
      return [];
    });
    listStaleMock.mockImplementationOnce(async () => {
      order.push("stale:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("stale:end");
      return [];
    });

    await getObservabilityDashboard();

    const starts = [
      order.indexOf("stats:start"),
      order.indexOf("jobs:start"),
      order.indexOf("errors:start"),
      order.indexOf("stale:start"),
    ];
    const ends = [
      order.indexOf("stats:end"),
      order.indexOf("jobs:end"),
      order.indexOf("errors:end"),
      order.indexOf("stale:end"),
    ];
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });
});
