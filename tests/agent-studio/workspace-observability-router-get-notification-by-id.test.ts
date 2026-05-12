/**
 * Phase 22 — workspaceObservability.getMyNotificationById router
 * smoke test (PR #557).
 *
 * Verifies the singleton notification getter is mounted, scoped to
 * ctx.user.id, and surfaces NOT_FOUND instead of leaking row contents
 * when the row belongs to a peer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdMock } = vi.hoisted(() => ({ getByIdMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getNotificationById: getByIdMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

const ROW_FIXTURE = {
  id: 7,
  userId: 42,
  notificationKind: "promotion.approved",
  payload: null,
  read: false,
  createdAt: new Date("2026-05-12T00:00:00Z"),
};

beforeEach(() => {
  getByIdMock.mockReset();
});

describe("workspaceObservabilityRouter.getMyNotificationById", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getMyNotificationById).toBeDefined();
  });

  it("scopes the lookup to ctx.user.id", async () => {
    getByIdMock.mockResolvedValueOnce(ROW_FIXTURE);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const result = await caller.getMyNotificationById({ notificationId: 7 });
    expect(getByIdMock).toHaveBeenCalledWith(7, { userId: 42 });
    expect(result).toEqual(ROW_FIXTURE);
  });

  it("throws NOT_FOUND when service returns null (peer's row or missing)", async () => {
    getByIdMock.mockResolvedValueOnce(null);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await expect(
      caller.getMyNotificationById({ notificationId: 99 }),
    ).rejects.toThrow();
    expect(getByIdMock).toHaveBeenCalledWith(99, { userId: 42 });
  });

  it("throws NOT_FOUND for unauthenticated callers (instead of leaking)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.getMyNotificationById({ notificationId: 7 }),
    ).rejects.toThrow();
    // Service must NOT be called for an unauthenticated caller.
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive notificationId at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await expect(
      caller.getMyNotificationById({ notificationId: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.getMyNotificationById({ notificationId: -5 }),
    ).rejects.toThrow();
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
