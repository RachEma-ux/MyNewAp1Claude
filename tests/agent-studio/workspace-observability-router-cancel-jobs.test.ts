/**
 * Phase 22 — workspaceObservability.cancelBackgroundJobs router
 * smoke test (PR #543). Bulk operator cancel surface.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { cancelJobsMock } = vi.hoisted(() => ({ cancelJobsMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, cancelJobs: cancelJobsMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  cancelJobsMock.mockReset();
  cancelJobsMock.mockResolvedValue({ cancelled: [], skipped: [] });
});

describe("workspaceObservabilityRouter.cancelBackgroundJobs", () => {
  it("is mounted as a procedure", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.cancelBackgroundJobs).toBeDefined();
  });

  it("delegates to cancelJobs and returns the partition payload", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    cancelJobsMock.mockResolvedValueOnce({
      cancelled: [{ id: 1, jobKind: "x", status: "cancelled" }],
      skipped: [
        { jobId: 2, reason: "not_cancellable", currentStatus: "completed" },
      ],
    });

    const result = await caller.cancelBackgroundJobs({ jobIds: [1, 2] });

    expect(cancelJobsMock).toHaveBeenCalledWith([1, 2]);
    expect(result.cancelled).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it("accepts an empty jobIds array (no-op)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.cancelBackgroundJobs({ jobIds: [] });
    expect(cancelJobsMock).toHaveBeenCalledWith([]);
    expect(result).toEqual({ cancelled: [], skipped: [] });
  });

  it("rejects more than 200 jobIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(
      caller.cancelBackgroundJobs({ jobIds: tooMany }),
    ).rejects.toThrow();
    expect(cancelJobsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive jobIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.cancelBackgroundJobs({ jobIds: [0] }),
    ).rejects.toThrow();
    expect(cancelJobsMock).not.toHaveBeenCalled();
  });
});
