/**
 * Phase 22 follow-up #620 — workspaceObservability.getCronStatus
 * router smoke test. Verifies the admin-only cron-status surface
 * (#614) is mounted, exposed as a query, and returns both retention
 * + stale-running status snapshots.
 *
 * Service-layer behavior (lastRunAt/lastResult/lastError split,
 * status preservation across success+failure) is covered by
 * workspace-observability-cron-status.test.ts (#614).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { retentionMock, staleMock } = vi.hoisted(() => ({
  retentionMock: vi.fn(),
  staleMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getRetentionCronStatus: retentionMock };
  },
);

vi.mock(
  "../../server/agent-studio/services/workspace-observability/stale-running-job-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getStaleRunningCronStatus: staleMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  retentionMock.mockReset();
  staleMock.mockReset();
  retentionMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
  staleMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("workspaceObservabilityRouter.getCronStatus", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getCronStatus).toBeDefined();
  });

  it("returns both retention + staleRunning snapshots in the response", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);

    const result = await caller.getCronStatus();

    expect(result).toEqual({
      retention: { lastRunAt: null, lastResult: null, lastError: null },
      staleRunning: { lastRunAt: null, lastResult: null, lastError: null },
    });
    expect(retentionMock).toHaveBeenCalledTimes(1);
    expect(staleMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces lastRunAt + lastResult.errorEventsDeleted from the retention getter", async () => {
    const lastRunAt = new Date("2026-05-12T03:00:00Z");
    retentionMock.mockReturnValueOnce({
      lastRunAt,
      lastResult: {
        errorEventsDeleted: 7,
        notificationsDeleted: 11,
        backgroundJobsDeleted: 13,
        errorEventsCutoff: new Date(0),
        notificationsCutoff: new Date(0),
        backgroundJobsCutoff: new Date(0),
      },
      lastError: null,
    });

    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.getCronStatus();

    expect(result.retention.lastRunAt?.toISOString()).toBe(
      "2026-05-12T03:00:00.000Z",
    );
    expect(result.retention.lastResult?.errorEventsDeleted).toBe(7);
    expect(result.retention.lastResult?.notificationsDeleted).toBe(11);
    expect(result.retention.lastResult?.backgroundJobsDeleted).toBe(13);
    expect(result.retention.lastError).toBeNull();
  });

  it("surfaces lastError from the staleRunning getter (cron-failing state)", async () => {
    staleMock.mockReturnValueOnce({
      lastRunAt: null,
      lastResult: null,
      lastError: "ASDB unreachable",
    });

    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.getCronStatus();

    expect(result.staleRunning.lastError).toBe("ASDB unreachable");
    expect(result.staleRunning.lastRunAt).toBeNull();
    expect(result.staleRunning.lastResult).toBeNull();
  });

  it("forwards both getters independently per invocation (no shared call)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);

    await caller.getCronStatus();
    await caller.getCronStatus();

    expect(retentionMock).toHaveBeenCalledTimes(2);
    expect(staleMock).toHaveBeenCalledTimes(2);
  });
});
