/**
 * Phase 22 follow-up #651 — simulation-runs retention router
 * procedures smoke test. Lives on `agentStudio.simulation` sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/simulation-runs-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldSimulationRuns: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/simulation-runs-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getSimulationRunsRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({ deletedRunsCount: 0, deletedStepsCount: 0 });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("simulation.pruneRetention", () => {
  it("is mounted on the simulation sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["simulation.pruneRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedRunsCount: 5,
      deletedStepsCount: 17,
    });

    const result = await caller.simulation.pruneRetention();

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedRunsCount).toBe(5);
    expect(result.deletedStepsCount).toBe(17);
  });

  it("forwards statuses + agentId + scenarioId filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.simulation.pruneRetention({
      retentionDays: 14,
      statuses: ["passed"],
      agentId: [11],
      scenarioId: 99,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["passed"]);
    expect(arg.agentId).toEqual([11]);
    expect(arg.scenarioId).toBe(99);
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.simulation.pruneRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.simulation.pruneRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("simulation.getRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["simulation.getRetentionCronStatus"]).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T10:00:00Z"),
      lastResult: { deletedRunsCount: 42, deletedStepsCount: 137 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.simulation.getRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T10:00:00.000Z");
    expect(result.lastResult?.deletedRunsCount).toBe(42);
    expect(result.lastResult?.deletedStepsCount).toBe(137);
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
    const result = await caller.simulation.getRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
