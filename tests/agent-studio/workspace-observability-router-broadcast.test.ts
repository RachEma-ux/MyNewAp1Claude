/**
 * Phase 22 — workspaceObservability.broadcastNotification router
 * smoke test (PR #528).
 *
 * Verifies the admin-only operator-broadcast surface is mounted,
 * accepts the documented input shape, and delegates to the
 * `pushNotificationToUsers` service helper.
 *
 * Service-layer behavior (empty-array no-op, duplicate preservation,
 * fail-soft) is covered by
 * workspace-observability-notifications-errors.test.ts (#527).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { broadcastMock } = vi.hoisted(() => ({
  broadcastMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pushNotificationToUsers: broadcastMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  broadcastMock.mockReset();
  broadcastMock.mockResolvedValue({ insertedCount: 0, notifications: [] });
});

describe("workspaceObservabilityRouter.broadcastNotification", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.broadcastNotification).toBeDefined();
  });

  it("delegates to pushNotificationToUsers with the supplied input shape", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    broadcastMock.mockResolvedValueOnce({
      insertedCount: 3,
      notifications: [],
    });

    const result = await caller.broadcastNotification({
      userIds: [11, 22, 33],
      notificationKind: "maintenance_window",
      payload: { startsAt: "18:00Z" },
    });

    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(broadcastMock.mock.calls[0][0]).toEqual({
      userIds: [11, 22, 33],
      notificationKind: "maintenance_window",
      payload: { startsAt: "18:00Z" },
    });
    expect(result.insertedCount).toBe(3);
  });

  it("accepts an empty userIds array (no-op pass-through)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.broadcastNotification({
      userIds: [],
      notificationKind: "x",
    });
    expect(broadcastMock).toHaveBeenCalledTimes(1);
    expect(result.insertedCount).toBe(0);
  });

  it("normalizes missing payload to null at the service boundary", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.broadcastNotification({
      userIds: [1],
      notificationKind: "x",
    });
    expect(broadcastMock.mock.calls[0][0].payload).toBeNull();
  });

  it("rejects non-admin callers (admin gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 2, role: "user" },
    } as never);
    await expect(
      caller.broadcastNotification({
        userIds: [1, 2],
        notificationKind: "x",
      }),
    ).rejects.toThrow();
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive userIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.broadcastNotification({
        userIds: [0, -1],
        notificationKind: "x",
      }),
    ).rejects.toThrow();
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it("rejects an empty notificationKind at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.broadcastNotification({
        userIds: [1],
        notificationKind: "",
      }),
    ).rejects.toThrow();
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
