/**
 * Phase 22 — workspaceObservability.runRetentionSweep router smoke
 * test (PR #524).
 *
 * Verifies the admin-only operator-trigger surface for the three-table
 * retention sweep is mounted, accepts the documented input shape, and
 * delegates to the runRetentionSweep service helper.
 *
 * The service-layer fan-out + cutoff math is covered by
 * workspace-observability-retention-sweep.test.ts (#521 + #523).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sweepMock } = vi.hoisted(() => ({
  sweepMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/retention-sweep.js",
  () => ({ runRetentionSweep: sweepMock }),
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({
    errorEventsDeleted: 0,
    notificationsDeleted: 0,
    backgroundJobsDeleted: 0,
    errorEventsCutoff: new Date("2026-04-12T00:00:00Z"),
    notificationsCutoff: new Date("2026-04-12T00:00:00Z"),
    backgroundJobsCutoff: new Date("2026-04-12T00:00:00Z"),
  });
});

describe("workspaceObservabilityRouter.runRetentionSweep", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.runRetentionSweep).toBeDefined();
  });

  it("delegates to runRetentionSweep with the supplied input shape", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    sweepMock.mockResolvedValueOnce({
      errorEventsDeleted: 4,
      notificationsDeleted: 9,
      backgroundJobsDeleted: 11,
      errorEventsCutoff: new Date("2026-05-05T00:00:00Z"),
      notificationsCutoff: new Date("2026-03-13T00:00:00Z"),
      backgroundJobsCutoff: new Date("2026-04-28T00:00:00Z"),
    });

    const result = await caller.runRetentionSweep({
      errorEventsRetentionDays: 7,
      notificationsRetentionDays: 60,
      notificationsReadOnly: true,
      backgroundJobsRetentionDays: 14,
      backgroundJobsStatuses: ["completed", "failed", "cancelled"],
    });

    expect(sweepMock).toHaveBeenCalledTimes(1);
    expect(sweepMock.mock.calls[0][0]).toEqual({
      errorEventsRetentionDays: 7,
      notificationsRetentionDays: 60,
      notificationsReadOnly: true,
      backgroundJobsRetentionDays: 14,
      backgroundJobsStatuses: ["completed", "failed", "cancelled"],
    });
    expect(result).toMatchObject({
      errorEventsDeleted: 4,
      notificationsDeleted: 9,
      backgroundJobsDeleted: 11,
    });
  });

  it("accepts an empty input and forwards {} to the service", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.runRetentionSweep(undefined);
    expect(sweepMock).toHaveBeenCalledTimes(1);
    expect(sweepMock.mock.calls[0][0]).toEqual({});
  });

  it("rejects non-admin callers (admin gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 2, role: "user" },
    } as never);
    await expect(
      caller.runRetentionSweep({ errorEventsRetentionDays: 7 }),
    ).rejects.toThrow();
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("rejects negative retention days at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.runRetentionSweep({ errorEventsRetentionDays: -1 }),
    ).rejects.toThrow();
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("forwards single-string backgroundJobsJobKind (#549)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.runRetentionSweep({
      backgroundJobsJobKind: "projection.rebuild",
    });
    expect(sweepMock).toHaveBeenCalledWith({
      backgroundJobsJobKind: "projection.rebuild",
    });
  });

  it("forwards array-form backgroundJobsJobKind (#549)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.runRetentionSweep({
      backgroundJobsJobKind: ["projection.rebuild", "import.scan"],
    });
    expect(sweepMock).toHaveBeenCalledWith({
      backgroundJobsJobKind: ["projection.rebuild", "import.scan"],
    });
  });

  it("rejects oversized backgroundJobsJobKind array (#549)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const oversized = Array.from({ length: 21 }, (_, i) => `kind.${i}`);
    await expect(
      caller.runRetentionSweep({ backgroundJobsJobKind: oversized }),
    ).rejects.toThrow();
    expect(sweepMock).not.toHaveBeenCalled();
  });
});
