/**
 * Phase 22 — workspaceObservability.getBackgroundJobsByIds router
 * smoke test (PR #559). Bulk reader sibling of getBackgroundJob.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdsMock } = vi.hoisted(() => ({ getByIdsMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getJobsByIds: getByIdsMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  getByIdsMock.mockReset();
  getByIdsMock.mockResolvedValue([]);
});

describe("workspaceObservabilityRouter.getBackgroundJobsByIds", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.getBackgroundJobsByIds).toBeDefined();
  });

  it("delegates to getJobsByIds and forwards the id array", async () => {
    getByIdsMock.mockResolvedValueOnce([
      { id: 7, jobKind: "x", status: "failed" } as never,
      { id: 9, jobKind: "y", status: "failed" } as never,
    ]);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getBackgroundJobsByIds({ jobIds: [7, 9, 99] });
    expect(getByIdsMock).toHaveBeenCalledWith([7, 9, 99]);
    expect(result).toHaveLength(2);
  });

  it("accepts an empty jobIds array (returns [])", async () => {
    getByIdsMock.mockResolvedValueOnce([]);
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.getBackgroundJobsByIds({ jobIds: [] });
    expect(result).toEqual([]);
    expect(getByIdsMock).toHaveBeenCalledWith([]);
  });

  it("rejects unauthenticated callers (protectedProcedure gate)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({} as never);
    await expect(
      caller.getBackgroundJobsByIds({ jobIds: [1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("rejects oversized jobIds array at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const oversized = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(
      caller.getBackgroundJobsByIds({ jobIds: oversized }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive jobIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.getBackgroundJobsByIds({ jobIds: [0, 1, 2] }),
    ).rejects.toThrow();
    await expect(
      caller.getBackgroundJobsByIds({ jobIds: [-1] }),
    ).rejects.toThrow();
    expect(getByIdsMock).not.toHaveBeenCalled();
  });
});
