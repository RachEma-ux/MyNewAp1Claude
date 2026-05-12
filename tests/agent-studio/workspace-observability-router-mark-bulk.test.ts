/**
 * Phase 22 — workspaceObservability.markNotificationsRead router
 * smoke test (PR #530).
 *
 * Verifies the bulk mark-read surface is mounted, scopes to the
 * authenticated user, and delegates to the markNotificationsRead
 * service helper.
 *
 * Service-layer behavior (empty no-op, userId scoping in the WHERE
 * clause, returning count) is covered by
 * workspace-observability-notifications-errors.test.ts (#530).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { markBulkMock } = vi.hoisted(() => ({
  markBulkMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/user-notifications.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, markNotificationsRead: markBulkMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  markBulkMock.mockReset();
  markBulkMock.mockResolvedValue({ markedCount: 0 });
});

describe("workspaceObservabilityRouter.markNotificationsRead", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.markNotificationsRead).toBeDefined();
  });

  it("delegates with the caller's userId and the supplied ids", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    markBulkMock.mockResolvedValueOnce({ markedCount: 3 });

    const result = await caller.markNotificationsRead({
      notificationIds: [101, 102, 103],
    });

    expect(markBulkMock).toHaveBeenCalledTimes(1);
    expect(markBulkMock.mock.calls[0][0]).toEqual({
      userId: 42,
      notificationIds: [101, 102, 103],
    });
    expect(result.markedCount).toBe(3);
  });

  it("accepts an empty notificationIds array (no-op pass-through)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    const result = await caller.markNotificationsRead({
      notificationIds: [],
    });
    expect(markBulkMock).toHaveBeenCalledTimes(1);
    expect(result.markedCount).toBe(0);
  });

  it("rejects calls without an authenticated user (UNAUTHORIZED)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.markNotificationsRead({ notificationIds: [1, 2] }),
    ).rejects.toThrow();
    expect(markBulkMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive notificationIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 42, role: "user" },
    } as never);
    await expect(
      caller.markNotificationsRead({ notificationIds: [0, -5] }),
    ).rejects.toThrow();
    expect(markBulkMock).not.toHaveBeenCalled();
  });
});
