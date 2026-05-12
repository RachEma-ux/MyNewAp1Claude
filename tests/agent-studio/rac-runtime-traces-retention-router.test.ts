/**
 * Phase 22 follow-up #640 — rac-runtime-traces retention router
 * procedures smoke test. Lives on `agentStudio.racTrace` sub-router
 * (alongside the existing getTrace / submitFeedback procedures).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/rac-runtime-traces-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldRacRuntimeTraces: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/rac-runtime-traces-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getRacRuntimeTracesRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({
    deletedTracesCount: 0,
    deletedContextBlocksCount: 0,
  });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("racTrace.pruneRetention", () => {
  it("is mounted on the racTrace sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["racTrace.pruneRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedTracesCount: 5,
      deletedContextBlocksCount: 47,
    });

    const result = await caller.racTrace.pruneRetention();

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedTracesCount).toBe(5);
    expect(result.deletedContextBlocksCount).toBe(47);
  });

  it("honors custom retentionDays", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.racTrace.pruneRetention({ retentionDays: 7 });
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(6.9);
    expect(ageDays).toBeLessThan(7.1);
  });

  it("forwards workspaceId (array) + agentId (single)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.racTrace.pruneRetention({
      workspaceId: [11, 22],
      agentId: 42,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.workspaceId).toEqual([11, 22]);
    expect(arg.agentId).toBe(42);
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.racTrace.pruneRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.racTrace.pruneRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("racTrace.getRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["racTrace.getRetentionCronStatus"]).toBeDefined();
  });

  it("returns the cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T08:00:00Z"),
      lastResult: { deletedTracesCount: 12, deletedContextBlocksCount: 88 },
      lastError: null,
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.racTrace.getRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T08:00:00.000Z");
    expect(result.lastResult?.deletedTracesCount).toBe(12);
    expect(result.lastResult?.deletedContextBlocksCount).toBe(88);
  });

  it("surfaces lastError when cron is failing", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: null,
      lastResult: null,
      lastError: "ASDB unreachable",
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.racTrace.getRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
