/**
 * Phase 22 — workspaceObservability.retryBackgroundJob router smoke
 * test (PR #532).
 *
 * Verifies the operator-retry surface is mounted, delegates to the
 * retryJob service helper, and surfaces JobNotRetryableError as
 * PRECONDITION_FAILED so the UI can render a clean message.
 *
 * Service-layer rules (failed-only invariant, attempts preserved,
 * lastError cleared) are covered by
 * workspace-observability-background-jobs.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { retryMock } = vi.hoisted(() => ({ retryMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, retryJob: retryMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";
import {
  JobNotFoundError,
  JobNotRetryableError,
} from "../../server/agent-studio/services/workspace-observability/background-jobs";

beforeEach(() => {
  retryMock.mockReset();
});

describe("workspaceObservabilityRouter.retryBackgroundJob", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.retryBackgroundJob).toBeDefined();
  });

  it("delegates to retryJob and returns the updated row", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    const updated = {
      id: 7,
      jobKind: "x",
      payload: null,
      status: "pending",
      attempts: 3,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    retryMock.mockResolvedValueOnce(updated);

    const result = await caller.retryBackgroundJob({ jobId: 7 });

    expect(retryMock).toHaveBeenCalledWith(7);
    expect(result).toEqual(updated);
  });

  it("surfaces JobNotFoundError as NOT_FOUND", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    retryMock.mockRejectedValueOnce(new JobNotFoundError(404));
    await expect(
      caller.retryBackgroundJob({ jobId: 404 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("surfaces JobNotRetryableError as PRECONDITION_FAILED", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    retryMock.mockRejectedValueOnce(new JobNotRetryableError(7, "completed"));
    await expect(
      caller.retryBackgroundJob({ jobId: 7 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects non-positive jobId at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.retryBackgroundJob({ jobId: 0 }),
    ).rejects.toThrow();
    expect(retryMock).not.toHaveBeenCalled();
  });
});
