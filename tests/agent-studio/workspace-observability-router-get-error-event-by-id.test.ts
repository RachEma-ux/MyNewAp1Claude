/**
 * Phase 22 — workspaceObservability.getErrorEventById router smoke
 * test (PR #558).
 *
 * Sister of the getMyNotificationById smoke (#557), but for the
 * error_events surface. Error events aren't user-scoped, so this is
 * a straight protectedProcedure lookup with NOT_FOUND on miss.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdMock } = vi.hoisted(() => ({ getByIdMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/error-events.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getErrorEventById: getByIdMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

const ROW_FIXTURE = {
  id: 7,
  sourceKind: "trpc.chat.send",
  sourceId: null,
  userId: null,
  errorClass: "ValidationError",
  errorMessage: "boom",
  metadata: null,
  createdAt: new Date("2026-05-12T00:00:00Z"),
};

beforeEach(() => {
  getByIdMock.mockReset();
});

describe("workspaceObservabilityRouter.getErrorEventById", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getErrorEventById).toBeDefined();
  });

  it("delegates to the service and returns the row on hit", async () => {
    getByIdMock.mockResolvedValueOnce(ROW_FIXTURE);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getErrorEventById({ errorEventId: 7 });
    expect(getByIdMock).toHaveBeenCalledWith(7);
    expect(result).toEqual(ROW_FIXTURE);
  });

  it("throws NOT_FOUND when the service returns null", async () => {
    getByIdMock.mockResolvedValueOnce(null);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getErrorEventById({ errorEventId: 999 }),
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers (protectedProcedure gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.getErrorEventById({ errorEventId: 7 }),
    ).rejects.toThrow();
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive errorEventId at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getErrorEventById({ errorEventId: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.getErrorEventById({ errorEventId: -5 }),
    ).rejects.toThrow();
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
