/**
 * Phase 22 — getObservabilityDashboard composite (PR #534).
 *
 * Verifies the single round-trip dashboard payload bundles stats +
 * recentFailedJobs + recentErrorEvents and fans them out in
 * parallel. Underlying queries are individually covered by their
 * own service tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  statsMock,
  listJobsMock,
  listErrorsMock,
  listStaleMock,
  listPendingMock,
} = vi.hoisted(() => ({
  statsMock: vi.fn(),
  listJobsMock: vi.fn(),
  listErrorsMock: vi.fn(),
  listStaleMock: vi.fn(),
  listPendingMock: vi.fn(),
}));

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
      listOldestPendingJobs: listPendingMock,
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
  errorEventsByUserPresence: { system: 0, user: 0 },
  errorEventsByDay: [],
  jobsCreatedByDay: [],
  failedJobsByDay: [],
  completedJobsByDay: [],
  jobsByStatus: {},
  jobsByKind: {},
  jobsByLane: {},
  failedJobsByKind: {},
  pendingJobsByKind: {},
  pendingJobsByLane: {},
  runningJobsByKind: {},
  runningJobsByLane: {},
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
  listPendingMock.mockReset();
  statsMock.mockResolvedValue(STATS_FIXTURE);
  listJobsMock.mockResolvedValue([]);
  listErrorsMock.mockResolvedValue([]);
  listStaleMock.mockResolvedValue([]);
  listPendingMock.mockResolvedValue([]);
});

describe("getObservabilityDashboard", () => {
  it("returns the bundled payload from all six underlying calls", async () => {
    statsMock.mockResolvedValueOnce(STATS_FIXTURE);
    // listJobsMock queues two calls in order: status=failed, then status=completed.
    listJobsMock
      .mockResolvedValueOnce([
        { id: 1, jobKind: "k", status: "failed" } as never,
        { id: 2, jobKind: "k", status: "failed" } as never,
      ])
      .mockResolvedValueOnce([
        { id: 50, jobKind: "k", status: "completed" } as never,
        { id: 51, jobKind: "k", status: "completed" } as never,
        { id: 52, jobKind: "k", status: "completed" } as never,
      ]);
    listErrorsMock.mockResolvedValueOnce([
      { id: 10, sourceKind: "x.y" } as never,
    ]);
    listStaleMock.mockResolvedValueOnce([
      { id: 99, jobKind: "k", status: "running" } as never,
    ]);
    listPendingMock.mockResolvedValueOnce([
      { id: 200, jobKind: "k", status: "pending" } as never,
      { id: 201, jobKind: "k", status: "pending" } as never,
    ]);

    const payload = await getObservabilityDashboard();

    expect(payload.stats).toBe(STATS_FIXTURE);
    expect(payload.recentFailedJobs).toHaveLength(2);
    expect(payload.recentCompletedJobs).toHaveLength(3);
    expect(payload.recentErrorEvents).toHaveLength(1);
    expect(payload.staleRunningJobs).toHaveLength(1);
    expect(payload.oldestPendingJobs).toHaveLength(2);
  });

  it("defaults the recent slices to limit=20 and queries both 'failed' AND 'completed', stale to 10, pending to 10", async () => {
    await getObservabilityDashboard();
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "failed", limit: 20 },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "completed", limit: 20 },
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
    expect(listPendingMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("recentLimit applies to BOTH failed AND completed slices (#577)", async () => {
    await getObservabilityDashboard({ recentLimit: 7 });
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "failed", limit: 7 },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "completed", limit: 7 },
      expect.any(Object),
    );
  });

  it("forwards errorClass to listErrorEvents (#584)", async () => {
    await getObservabilityDashboard({ errorClass: "BackgroundJobFailed" });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: undefined,
      },
      expect.any(Object),
    );
  });

  it("forwards array-form errorClass to listErrorEvents (#584)", async () => {
    await getObservabilityDashboard({
      errorClass: ["BackgroundJobFailed", "ValidationError"],
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: ["BackgroundJobFailed", "ValidationError"],
        sourceKind: undefined,
      },
      expect.any(Object),
    );
  });

  it("forwards sourceKind to listErrorEvents (#584)", async () => {
    await getObservabilityDashboard({ sourceKind: "trpc.chat.send" });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: undefined,
        sourceKind: "trpc.chat.send",
      },
      expect.any(Object),
    );
  });

  it("ANDs errorClass + sourceKind when both are set (#584)", async () => {
    await getObservabilityDashboard({
      errorClass: "BackgroundJobFailed",
      sourceKind: ["backgroundJob.projection.rebuild"],
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: ["backgroundJob.projection.rebuild"],
      },
      expect.any(Object),
    );
  });

  it("recentJobKind forwards to BOTH listJobs calls (#585)", async () => {
    await getObservabilityDashboard({ recentJobKind: "projection.rebuild" });
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "failed", limit: 20, jobKind: "projection.rebuild" },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "completed", limit: 20, jobKind: "projection.rebuild" },
      expect.any(Object),
    );
  });

  it("array-form recentJobKind forwards to both recent slices (#585)", async () => {
    await getObservabilityDashboard({
      recentJobKind: ["projection.rebuild", "projection.repair"],
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "failed",
        limit: 20,
        jobKind: ["projection.rebuild", "projection.repair"],
      },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "completed",
        limit: 20,
        jobKind: ["projection.rebuild", "projection.repair"],
      },
      expect.any(Object),
    );
  });

  it("recentJobKind is undefined by default (does not narrow listJobs) (#585)", async () => {
    await getObservabilityDashboard();
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "failed", limit: 20, jobKind: undefined },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "completed", limit: 20, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("recentJobKindLike forwards to BOTH listJobs calls (#600)", async () => {
    await getObservabilityDashboard({ recentJobKindLike: "projection.%" });
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        jobKindLike: "projection.%",
      }),
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        jobKindLike: "projection.%",
      }),
      expect.any(Object),
    );
  });

  it("recentJobKindLike composes with recentJobsUpdatedSince on both slices (#600)", async () => {
    const since = new Date("2026-05-12T12:00:00Z");
    await getObservabilityDashboard({
      recentJobKindLike: "projection.%",
      recentJobsUpdatedSince: since,
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        jobKindLike: "projection.%",
        updatedSince: since,
      }),
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        jobKindLike: "projection.%",
        updatedSince: since,
      }),
      expect.any(Object),
    );
  });

  it("recentJobKindLike is undefined by default (#600)", async () => {
    await getObservabilityDashboard();
    const failedArgs = listJobsMock.mock.calls[0]?.[0] as { jobKindLike?: string };
    const completedArgs = listJobsMock.mock.calls[1]?.[0] as { jobKindLike?: string };
    expect(failedArgs.jobKindLike).toBeUndefined();
    expect(completedArgs.jobKindLike).toBeUndefined();
  });

  it("forwards errorMessageLike to listErrorEvents (#586)", async () => {
    await getObservabilityDashboard({
      errorMessageLike: "%connection refused%",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: undefined,
        sourceKind: undefined,
        errorMessageLike: "%connection refused%",
      },
      expect.any(Object),
    );
  });

  it("errorMessageLike composes with errorClass + sourceKind (#586)", async () => {
    await getObservabilityDashboard({
      errorClass: "BackgroundJobFailed",
      sourceKind: "backgroundJob.projection.rebuild",
      errorMessageLike: "%OOM%",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: "backgroundJob.projection.rebuild",
        errorMessageLike: "%OOM%",
      },
      expect.any(Object),
    );
  });

  it("recentJobsUpdatedSince forwards to BOTH failed AND completed listJobs (#591)", async () => {
    const since = new Date("2026-05-12T12:00:00Z");
    await getObservabilityDashboard({ recentJobsUpdatedSince: since });
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "failed",
        limit: 20,
        jobKind: undefined,
        lastErrorLike: undefined,
        updatedSince: since,
      },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "completed",
        limit: 20,
        jobKind: undefined,
        updatedSince: since,
      },
      expect.any(Object),
    );
  });

  it("recentJobsUpdatedSince composes with recentJobKind on both slices (#591)", async () => {
    const since = new Date("2026-05-12T12:00:00Z");
    await getObservabilityDashboard({
      recentJobKind: "projection.rebuild",
      recentJobsUpdatedSince: since,
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "failed",
        limit: 20,
        jobKind: "projection.rebuild",
        lastErrorLike: undefined,
        updatedSince: since,
      },
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "completed",
        limit: 20,
        jobKind: "projection.rebuild",
        updatedSince: since,
      },
      expect.any(Object),
    );
  });

  it("recentAttemptsGte forwards to BOTH listJobs calls (#609)", async () => {
    await getObservabilityDashboard({ recentAttemptsGte: 5 });
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", attemptsGte: 5 }),
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", attemptsGte: 5 }),
      expect.any(Object),
    );
  });

  it("recentAttemptsGte composes with recentJobKind on both slices (#609)", async () => {
    await getObservabilityDashboard({
      recentAttemptsGte: 3,
      recentJobKind: "projection.rebuild",
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        jobKind: "projection.rebuild",
        attemptsGte: 3,
      }),
      expect.any(Object),
    );
    expect(listJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        jobKind: "projection.rebuild",
        attemptsGte: 3,
      }),
      expect.any(Object),
    );
  });

  it("recentAttemptsGte undefined → no attemptsGte filter (#609)", async () => {
    await getObservabilityDashboard({});
    const failedArgs = listJobsMock.mock.calls[0]?.[0] as { attemptsGte?: number };
    const completedArgs = listJobsMock.mock.calls[1]?.[0] as { attemptsGte?: number };
    expect(failedArgs.attemptsGte).toBeUndefined();
    expect(completedArgs.attemptsGte).toBeUndefined();
  });

  it("forwards errorEventsCreatedSince to listErrorEvents (#590)", async () => {
    const since = new Date("2026-05-12T12:00:00Z");
    await getObservabilityDashboard({ errorEventsCreatedSince: since });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: undefined,
        sourceKind: undefined,
        errorMessageLike: undefined,
        createdSince: since,
      },
      expect.any(Object),
    );
  });

  it("errorEventsCreatedSince composes with errorClass + errorMessageLike (#590)", async () => {
    const since = new Date("2026-05-12T12:00:00Z");
    await getObservabilityDashboard({
      errorClass: "BackgroundJobFailed",
      errorMessageLike: "%OOM%",
      errorEventsCreatedSince: since,
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: undefined,
        errorMessageLike: "%OOM%",
        createdSince: since,
      },
      expect.any(Object),
    );
  });

  it("forwards recentErrorEventsUserIdIsNull=true to listErrorEvents (#595)", async () => {
    await getObservabilityDashboard({ recentErrorEventsUserIdIsNull: true });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: undefined,
        sourceKind: undefined,
        errorMessageLike: undefined,
        createdSince: undefined,
        userIdIsNull: true,
      },
      expect.any(Object),
    );
  });

  it("forwards recentErrorEventsUserIdIsNull=false to listErrorEvents (#595)", async () => {
    await getObservabilityDashboard({ recentErrorEventsUserIdIsNull: false });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userIdIsNull: false }),
      expect.any(Object),
    );
  });

  it("recentErrorEventsUserIdIsNull composes with errorClass + errorMessageLike (#595)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsUserIdIsNull: true,
      errorClass: "BackgroundJobFailed",
      errorMessageLike: "%OOM%",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: undefined,
        errorMessageLike: "%OOM%",
        createdSince: undefined,
        userIdIsNull: true,
      },
      expect.any(Object),
    );
  });

  it("undefined recentErrorEventsUserIdIsNull means both system+user errors are returned (#595)", async () => {
    await getObservabilityDashboard({});
    const args = listErrorsMock.mock.calls[0]?.[0] as { userIdIsNull?: boolean };
    expect(args.userIdIsNull).toBeUndefined();
  });

  it("forwards recentErrorEventsSourceId (single string) to listErrorEvents (#597)", async () => {
    await getObservabilityDashboard({ recentErrorEventsSourceId: "trace-A" });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "trace-A" }),
      expect.any(Object),
    );
  });

  it("forwards recentErrorEventsSourceId (array form) to listErrorEvents (#597)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsSourceId: ["trace-A", "trace-B"],
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: ["trace-A", "trace-B"] }),
      expect.any(Object),
    );
  });

  it("recentErrorEventsSourceId composes with errorClass + recentErrorEventsUserIdIsNull (#597)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsSourceId: "trace-A",
      errorClass: "BackgroundJobFailed",
      recentErrorEventsUserIdIsNull: true,
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: undefined,
        errorMessageLike: undefined,
        createdSince: undefined,
        userIdIsNull: true,
        sourceId: "trace-A",
      },
      expect.any(Object),
    );
  });

  it("undefined recentErrorEventsSourceId means no sourceId filter is applied (#597)", async () => {
    await getObservabilityDashboard({});
    const args = listErrorsMock.mock.calls[0]?.[0] as { sourceId?: unknown };
    expect(args.sourceId).toBeUndefined();
  });

  it("forwards recentErrorEventsUserId to listErrorEvents (#606)", async () => {
    await getObservabilityDashboard({ recentErrorEventsUserId: 42 });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42 }),
      expect.any(Object),
    );
  });

  it("recentErrorEventsUserId composes with errorClass (#606)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsUserId: 7,
      errorClass: "ValidationError",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        errorClass: "ValidationError",
      }),
      expect.any(Object),
    );
  });

  it("undefined recentErrorEventsUserId means no userId filter (#606)", async () => {
    await getObservabilityDashboard({});
    const args = listErrorsMock.mock.calls[0]?.[0] as { userId?: unknown };
    expect(args.userId).toBeUndefined();
  });

  it("forwards array-form recentErrorEventsUserId to listErrorEvents (#608)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsUserId: [7, 9, 11],
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: [7, 9, 11] }),
      expect.any(Object),
    );
  });

  it("recentErrorEventsUserId array composes with errorClass + sourceKind (#608)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsUserId: [42, 43],
      errorClass: "BackgroundJobFailed",
      sourceKind: "trpc.chat.send",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: [42, 43],
        errorClass: "BackgroundJobFailed",
        sourceKind: "trpc.chat.send",
      }),
      expect.any(Object),
    );
  });

  it("forwards recentErrorEventsSourceKindLike to listErrorEvents (#601)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsSourceKindLike: "trpc.chat.%",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKindLike: "trpc.chat.%" }),
      expect.any(Object),
    );
  });

  it("recentErrorEventsSourceKindLike composes with errorClass + errorMessageLike (#601)", async () => {
    await getObservabilityDashboard({
      recentErrorEventsSourceKindLike: "trpc.%",
      errorClass: "BackgroundJobFailed",
      errorMessageLike: "%timeout%",
    });
    expect(listErrorsMock).toHaveBeenCalledWith(
      {
        limit: 20,
        errorClass: "BackgroundJobFailed",
        sourceKind: undefined,
        sourceKindLike: "trpc.%",
        errorMessageLike: "%timeout%",
        createdSince: undefined,
        userIdIsNull: undefined,
        sourceId: undefined,
      },
      expect.any(Object),
    );
  });

  it("undefined recentErrorEventsSourceKindLike means no sourceKindLike filter (#601)", async () => {
    await getObservabilityDashboard({});
    const args = listErrorsMock.mock.calls[0]?.[0] as { sourceKindLike?: string };
    expect(args.sourceKindLike).toBeUndefined();
  });

  it("recentFailedLastErrorLike scopes ONLY the failed slice, not completed (#587)", async () => {
    await getObservabilityDashboard({
      recentFailedLastErrorLike: "%OOM%",
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "failed",
        limit: 20,
        jobKind: undefined,
        lastErrorLike: "%OOM%",
      },
      expect.any(Object),
    );
    // The completed call MUST NOT include lastErrorLike — completed
    // rows have NULL lastError and operators want the unfiltered
    // completion side as a healthy-baseline comparison.
    expect(listJobsMock).toHaveBeenCalledWith(
      { status: "completed", limit: 20, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("recentFailedLastErrorLike composes with recentJobKind on failed slice (#587)", async () => {
    await getObservabilityDashboard({
      recentJobKind: "projection.rebuild",
      recentFailedLastErrorLike: "%OOM%",
    });
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "failed",
        limit: 20,
        jobKind: "projection.rebuild",
        lastErrorLike: "%OOM%",
      },
      expect.any(Object),
    );
    // Completed side still scoped by jobKind only.
    expect(listJobsMock).toHaveBeenCalledWith(
      {
        status: "completed",
        limit: 20,
        jobKind: "projection.rebuild",
      },
      expect.any(Object),
    );
  });

  it("respects a custom pendingLimit on the pending-backlog slice (#569)", async () => {
    await getObservabilityDashboard({ pendingLimit: 3 });
    expect(listPendingMock).toHaveBeenCalledWith(
      { limit: 3, jobKind: undefined },
      expect.any(Object),
    );
  });

  it("forwards pendingJobKind to listOldestPendingJobs (#569)", async () => {
    await getObservabilityDashboard({
      pendingJobKind: "projection.rebuild",
    });
    expect(listPendingMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: "projection.rebuild" },
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

  it("forwards staleOlderThan SLA cutoff to listStaleRunningJobs (#588)", async () => {
    const cutoff = new Date("2026-05-12T11:30:00Z");
    await getObservabilityDashboard({ staleOlderThan: cutoff });
    expect(listStaleMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: undefined, olderThan: cutoff },
      expect.any(Object),
    );
  });

  it("staleOlderThan composes with staleJobKind (#588)", async () => {
    const cutoff = new Date("2026-05-12T11:30:00Z");
    await getObservabilityDashboard({
      staleJobKind: "projection.rebuild",
      staleOlderThan: cutoff,
    });
    expect(listStaleMock).toHaveBeenCalledWith(
      {
        limit: 10,
        jobKind: "projection.rebuild",
        olderThan: cutoff,
      },
      expect.any(Object),
    );
  });

  it("forwards pendingOlderThan SLA cutoff to listOldestPendingJobs (#589)", async () => {
    const cutoff = new Date("2026-05-12T06:00:00Z");
    await getObservabilityDashboard({ pendingOlderThan: cutoff });
    expect(listPendingMock).toHaveBeenCalledWith(
      { limit: 10, jobKind: undefined, olderThan: cutoff },
      expect.any(Object),
    );
  });

  it("pendingOlderThan composes with pendingJobKind (#589)", async () => {
    const cutoff = new Date("2026-05-12T06:00:00Z");
    await getObservabilityDashboard({
      pendingJobKind: "import.scan",
      pendingOlderThan: cutoff,
    });
    expect(listPendingMock).toHaveBeenCalledWith(
      {
        limit: 10,
        jobKind: "import.scan",
        olderThan: cutoff,
      },
      expect.any(Object),
    );
  });

  it("fans all six underlying calls out in parallel (Promise.all)", async () => {
    const order: string[] = [];
    statsMock.mockImplementationOnce(async () => {
      order.push("stats:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("stats:end");
      return STATS_FIXTURE;
    });
    // Two listJobs calls in Promise.all (failed + completed).
    listJobsMock
      .mockImplementationOnce(async () => {
        order.push("jobs-failed:start");
        await new Promise((r) => setTimeout(r, 25));
        order.push("jobs-failed:end");
        return [];
      })
      .mockImplementationOnce(async () => {
        order.push("jobs-completed:start");
        await new Promise((r) => setTimeout(r, 25));
        order.push("jobs-completed:end");
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
    listPendingMock.mockImplementationOnce(async () => {
      order.push("pending:start");
      await new Promise((r) => setTimeout(r, 25));
      order.push("pending:end");
      return [];
    });

    await getObservabilityDashboard();

    const starts = [
      order.indexOf("stats:start"),
      order.indexOf("jobs-failed:start"),
      order.indexOf("jobs-completed:start"),
      order.indexOf("errors:start"),
      order.indexOf("stale:start"),
      order.indexOf("pending:start"),
    ];
    const ends = [
      order.indexOf("stats:end"),
      order.indexOf("jobs-failed:end"),
      order.indexOf("jobs-completed:end"),
      order.indexOf("errors:end"),
      order.indexOf("stale:end"),
      order.indexOf("pending:end"),
    ];
    expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  });
});
