/**
 * Phase 22 — workspaceObservability.failStaleRunningBackgroundJobs
 * router smoke test (PR #546).
 *
 * Verifies the admin-only auto-failer is mounted, validates input
 * shape, and delegates to failStaleRunningJobs.
 *
 * Service-layer behaviour (mark-failed bridging into error_events,
 * status re-check) is covered by the background-jobs service test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { failStaleMock } = vi.hoisted(() => ({ failStaleMock: vi.fn() }));

vi.mock(
  "../../server/agent-studio/services/workspace-observability/background-jobs.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, failStaleRunningJobs: failStaleMock };
  },
);

import { workspaceObservabilityRouter } from "../../server/agent-studio/services/workspace-observability/router";

const RESULT_FIXTURE = { failed: [], scanned: 0 };

beforeEach(() => {
  failStaleMock.mockReset();
  failStaleMock.mockResolvedValue(RESULT_FIXTURE);
});

describe("workspaceObservabilityRouter.failStaleRunningBackgroundJobs", () => {
  it("is mounted as a procedure on the router", () => {
    const procedures = workspaceObservabilityRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures.failStaleRunningBackgroundJobs).toBeDefined();
  });

  it("requires admin role (rejects non-admin caller)", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "user" },
    } as never);
    await expect(
      caller.failStaleRunningBackgroundJobs({
        olderThan: new Date("2026-05-12T00:00:00Z"),
      }),
    ).rejects.toThrow();
    expect(failStaleMock).not.toHaveBeenCalled();
  });

  it("delegates to failStaleRunningJobs for admin caller", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const cutoff = new Date("2026-05-12T00:00:00Z");
    const result = await caller.failStaleRunningBackgroundJobs({
      olderThan: cutoff,
    });
    expect(failStaleMock).toHaveBeenCalledWith({ olderThan: cutoff });
    expect(result).toBe(RESULT_FIXTURE);
  });

  it("forwards optional limit + errorMessage when supplied", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const cutoff = new Date("2026-05-12T00:00:00Z");
    await caller.failStaleRunningBackgroundJobs({
      olderThan: cutoff,
      limit: 50,
      errorMessage: "stuck after 30m",
    });
    expect(failStaleMock).toHaveBeenCalledWith({
      olderThan: cutoff,
      limit: 50,
      errorMessage: "stuck after 30m",
    });
  });

  it("rejects out-of-range limit at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const cutoff = new Date("2026-05-12T00:00:00Z");
    await expect(
      caller.failStaleRunningBackgroundJobs({
        olderThan: cutoff,
        limit: 0,
      }),
    ).rejects.toThrow();
    await expect(
      caller.failStaleRunningBackgroundJobs({
        olderThan: cutoff,
        limit: 5000,
      }),
    ).rejects.toThrow();
    expect(failStaleMock).not.toHaveBeenCalled();
  });

  it("rejects empty errorMessage at the input layer", async () => {
    const caller = workspaceObservabilityRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const cutoff = new Date("2026-05-12T00:00:00Z");
    await expect(
      caller.failStaleRunningBackgroundJobs({
        olderThan: cutoff,
        errorMessage: "",
      }),
    ).rejects.toThrow();
    expect(failStaleMock).not.toHaveBeenCalled();
  });
});
