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
  recentErrorEvents: [],
  staleRunningJobs: [],
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
});
