/**
 * Phase 22 — workspaceObservability.dismissNotifications router
 * smoke test (PR #544). User-initiated bulk delete from inbox.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dismissMock } = vi.hoisted(() => ({ dismissMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, dismissNotifications: dismissMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  dismissMock.mockReset();
  dismissMock.mockResolvedValue({ deletedCount: 0 });
});

describe("workspaceObservabilityRouter.dismissNotifications", () => {
  it("is mounted as a procedure", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.dismissNotifications).toBeDefined();
  });

  it("delegates with the caller's userId and the supplied ids", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    dismissMock.mockResolvedValueOnce({ deletedCount: 3 });

    const result = await caller.dismissNotifications({
      notificationIds: [101, 102, 103],
    });

    expect(dismissMock).toHaveBeenCalledWith({
      userId: 42,
      notificationIds: [101, 102, 103],
    });
    expect(result.deletedCount).toBe(3);
  });

  it("accepts an empty notificationIds array (no-op)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const result = await caller.dismissNotifications({ notificationIds: [] });
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(result.deletedCount).toBe(0);
  });

  it("rejects unauthenticated callers (protectedProcedure gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.dismissNotifications({ notificationIds: [1, 2] }),
    ).rejects.toThrow();
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive ids at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await expect(
      caller.dismissNotifications({ notificationIds: [0, -1] }),
    ).rejects.toThrow();
    expect(dismissMock).not.toHaveBeenCalled();
  });
});
