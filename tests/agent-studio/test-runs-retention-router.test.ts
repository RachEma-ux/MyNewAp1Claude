/**
 * Phase 22 follow-up #655 — test-runs retention router smoke test.
 * Lives on `agentStudio.testing` sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/test-runs-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldTestRuns: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/test-runs-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getTestRunsRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({ deletedRunsCount: 0, deletedResultsCount: 0 });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("testing.pruneRetention", () => {
  it("is mounted on the testing sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["testing.pruneRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedRunsCount: 7,
      deletedResultsCount: 23,
    });
    const result = await caller.testing.pruneRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedRunsCount).toBe(7);
    expect(result.deletedResultsCount).toBe(23);
  });

  it("forwards statuses + agentId + suiteId filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.testing.pruneRetention({
      retentionDays: 14,
      statuses: ["passed"],
      agentId: [11],
      suiteId: 99,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["passed"]);
    expect(arg.agentId).toEqual([11]);
    expect(arg.suiteId).toBe(99);
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.testing.pruneRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.testing.pruneRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("testing.getRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["testing.getRetentionCronStatus"]).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T11:00:00Z"),
      lastResult: { deletedRunsCount: 13, deletedResultsCount: 41 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.testing.getRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T11:00:00.000Z");
    expect(result.lastResult?.deletedRunsCount).toBe(13);
    expect(result.lastResult?.deletedResultsCount).toBe(41);
  });

  it("surfaces lastError", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: null,
      lastResult: null,
      lastError: "ASDB unreachable",
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.testing.getRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
