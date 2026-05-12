/**
 * Phase 22 — workspaceObservability.getDashboard router smoke test
 * (PR #534).
 *
 * Verifies the composite dashboard surface is mounted, accepts the
 * documented input shape, and delegates to getObservabilityDashboard.
 *
 * Service-layer fan-out is covered by
 * workspace-observability-dashboard.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dashboardMock } = vi.hoisted(() => ({ dashboardMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/dashboard.js",
  () => ({ getObservabilityDashboard: dashboardMock }),
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

const PAYLOAD_FIXTURE = {
  stats: { totals: { errorEvents: 0, jobs: 0, notifications: 0 } },
  recentFailedJobs: [],
  recentCompletedJobs: [],
  recentErrorEvents: [],
  staleRunningJobs: [],
  oldestPendingJobs: [],
};

beforeEach(() => {
  dashboardMock.mockReset();
  dashboardMock.mockResolvedValue(PAYLOAD_FIXTURE);
});

describe("workspaceObservabilityRouter.getDashboard", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getDashboard).toBeDefined();
  });

  it("delegates to getObservabilityDashboard with no input", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getDashboard(undefined);
    expect(dashboardMock).toHaveBeenCalledWith({});
    expect(result).toBe(PAYLOAD_FIXTURE);
  });

  it("forwards recentLimit when supplied", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ recentLimit: 50 });
    expect(dashboardMock).toHaveBeenCalledWith({ recentLimit: 50 });
  });

  it("forwards staleLimit when supplied", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ staleLimit: 5 });
    expect(dashboardMock).toHaveBeenCalledWith({ staleLimit: 5 });
  });

  it("rejects out-of-range recentLimit at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getDashboard({ recentLimit: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.getDashboard({ recentLimit: 999 }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range staleLimit at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getDashboard({ staleLimit: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.getDashboard({ staleLimit: 500 }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("forwards staleJobKind when supplied (#556)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ staleJobKind: "projection.rebuild" });
    expect(dashboardMock).toHaveBeenCalledWith({
      staleJobKind: "projection.rebuild",
    });
  });

  it("forwards array-form staleJobKind (#556)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({
      staleJobKind: ["projection.rebuild", "import.scan"],
    });
    expect(dashboardMock).toHaveBeenCalledWith({
      staleJobKind: ["projection.rebuild", "import.scan"],
    });
  });

  it("rejects oversized staleJobKind array (#556)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const oversized = Array.from({ length: 21 }, (_, i) => `k${i}`);
    await expect(
      caller.getDashboard({ staleJobKind: oversized }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("forwards pendingLimit when supplied (#569)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ pendingLimit: 5 });
    expect(dashboardMock).toHaveBeenCalledWith({ pendingLimit: 5 });
  });

  it("forwards pendingJobKind when supplied (#569)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ pendingJobKind: "projection.rebuild" });
    expect(dashboardMock).toHaveBeenCalledWith({
      pendingJobKind: "projection.rebuild",
    });
  });

  it("rejects out-of-range pendingLimit at the input layer (#569)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getDashboard({ pendingLimit: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.getDashboard({ pendingLimit: 500 }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("forwards errorClass when supplied (#584)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ errorClass: "BackgroundJobFailed" });
    expect(dashboardMock).toHaveBeenCalledWith({
      errorClass: "BackgroundJobFailed",
    });
  });

  it("forwards array-form sourceKind when supplied (#584)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({
      sourceKind: ["trpc.chat.send", "trpc.chat.list"],
    });
    expect(dashboardMock).toHaveBeenCalledWith({
      sourceKind: ["trpc.chat.send", "trpc.chat.list"],
    });
  });

  it("rejects oversized errorClass array (#584)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const oversized = Array.from({ length: 21 }, (_, i) => `c${i}`);
    await expect(
      caller.getDashboard({ errorClass: oversized }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("forwards errorMessageLike when supplied (#586)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ errorMessageLike: "%timeout%" });
    expect(dashboardMock).toHaveBeenCalledWith({
      errorMessageLike: "%timeout%",
    });
  });

  it("rejects empty errorMessageLike at the input layer (#586)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getDashboard({ errorMessageLike: "" }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });

  it("forwards recentErrorEventsUserIdIsNull=true (#595)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ recentErrorEventsUserIdIsNull: true });
    expect(dashboardMock).toHaveBeenCalledWith({
      recentErrorEventsUserIdIsNull: true,
    });
  });

  it("forwards recentErrorEventsUserIdIsNull=false (#595)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await caller.getDashboard({ recentErrorEventsUserIdIsNull: false });
    expect(dashboardMock).toHaveBeenCalledWith({
      recentErrorEventsUserIdIsNull: false,
    });
  });

  it("rejects non-boolean recentErrorEventsUserIdIsNull at the input layer (#595)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getDashboard({
        recentErrorEventsUserIdIsNull: "true" as never,
      }),
    ).rejects.toThrow();
    expect(dashboardMock).not.toHaveBeenCalled();
  });
});
