/**
 * Phase 22 — workspaceObservability.retryBackgroundJobs router smoke
 * test (PR #542). Bulk operator retry surface.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { retryJobsMock } = vi.hoisted(() => ({ retryJobsMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, retryJobs: retryJobsMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

beforeEach(() => {
  retryJobsMock.mockReset();
  retryJobsMock.mockResolvedValue({ retried: [], skipped: [] });
});

describe("workspaceObservabilityRouter.retryBackgroundJobs", () => {
  it("is mounted as a procedure", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.retryBackgroundJobs).toBeDefined();
  });

  it("delegates to retryJobs and returns the partition payload", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    retryJobsMock.mockResolvedValueOnce({
      retried: [{ id: 1, jobKind: "x", status: "pending" }],
      skipped: [{ jobId: 2, reason: "not_retryable", currentStatus: "completed" }],
    });

    const result = await caller.retryBackgroundJobs({ jobIds: [1, 2] });

    expect(retryJobsMock).toHaveBeenCalledWith([1, 2]);
    expect(result.retried).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it("accepts an empty jobIds array (no-op)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const result = await caller.retryBackgroundJobs({ jobIds: [] });
    expect(retryJobsMock).toHaveBeenCalledWith([]);
    expect(result).toEqual({ retried: [], skipped: [] });
  });

  it("rejects more than 200 jobIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(
      caller.retryBackgroundJobs({ jobIds: tooMany }),
    ).rejects.toThrow();
    expect(retryJobsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive jobIds at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.retryBackgroundJobs({ jobIds: [0] }),
    ).rejects.toThrow();
    expect(retryJobsMock).not.toHaveBeenCalled();
  });
});
