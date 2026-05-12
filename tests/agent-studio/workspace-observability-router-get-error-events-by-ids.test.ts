/**
 * Phase 22 — workspaceObservability.getErrorEventsByIds router smoke
 * test (PR #561). Completes the bulk-getByIds router symmetry across
 * all three Phase 22 tables.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdsMock } = vi.hoisted(() => ({ getByIdsMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/error-events.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getErrorEventsByIds: getByIdsMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  getByIdsMock.mockReset();
  getByIdsMock.mockResolvedValue([]);
});

describe("workspaceObservabilityRouter.getErrorEventsByIds", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getErrorEventsByIds).toBeDefined();
  });

  it("delegates to the service and forwards the id array", async () => {
    getByIdsMock.mockResolvedValueOnce([
      { id: 7, sourceKind: "trpc.chat.send" } as never,
      { id: 9, sourceKind: "trpc.chat.list" } as never,
    ]);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getErrorEventsByIds({ errorEventIds: [7, 9] });
    expect(getByIdsMock).toHaveBeenCalledWith([7, 9]);
    expect(result).toHaveLength(2);
  });

  it("accepts an empty errorEventIds array", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getErrorEventsByIds({ errorEventIds: [] });
    expect(result).toEqual([]);
    expect(getByIdsMock).toHaveBeenCalledWith([]);
  });

  it("rejects unauthenticated callers (protectedProcedure gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.getErrorEventsByIds({ errorEventIds: [1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("rejects oversized errorEventIds (>200) at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const oversized = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(
      caller.getErrorEventsByIds({ errorEventIds: oversized }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive errorEventIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getErrorEventsByIds({ errorEventIds: [0] }),
    ).rejects.toThrow();
    await expect(
      caller.getErrorEventsByIds({ errorEventIds: [-1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });
});
