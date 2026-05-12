/**
 * Phase 22 — workspaceObservability.getMyNotificationsByIds router
 * smoke test (PR #560). Bulk reader sibling for the notifications
 * surface, scoped to ctx.user.id.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdsMock } = vi.hoisted(() => ({ getByIdsMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getNotificationsByIds: getByIdsMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  getByIdsMock.mockReset();
  getByIdsMock.mockResolvedValue([]);
});

describe("workspaceObservabilityRouter.getMyNotificationsByIds", () => {
  it("is mounted as a procedure", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getMyNotificationsByIds).toBeDefined();
  });

  it("scopes the bulk read to ctx.user.id (peer rows excluded)", async () => {
    getByIdsMock.mockResolvedValueOnce([
      { id: 7, userId: 42, notificationKind: "x" } as never,
    ]);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const result = await caller.getMyNotificationsByIds({
      notificationIds: [7, 99],
    });
    expect(getByIdsMock).toHaveBeenCalledWith([7, 99], { userId: 42 });
    expect(result).toHaveLength(1);
  });

  it("returns [] for unauthenticated callers without calling service", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.getMyNotificationsByIds({ notificationIds: [1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("accepts an empty notificationIds array", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const result = await caller.getMyNotificationsByIds({
      notificationIds: [],
    });
    expect(result).toEqual([]);
    expect(getByIdsMock).toHaveBeenCalledWith([], { userId: 42 });
  });

  it("rejects oversized notificationIds array (>200) at input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const oversized = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(
      caller.getMyNotificationsByIds({ notificationIds: oversized }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive notificationIds at input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await expect(
      caller.getMyNotificationsByIds({ notificationIds: [0] }),
    ).rejects.toThrow();
    await expect(
      caller.getMyNotificationsByIds({ notificationIds: [-1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });
});
