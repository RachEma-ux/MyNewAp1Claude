/**
 * Phase 22 follow-up #623 — runtime-runs retention router procedures
 * smoke test. Verifies the two admin procedures on `runsRouter` are
 * mounted + delegate correctly.
 *
 * Service-layer behavior is covered by:
 *  - runtime-runs-retention.test.ts (#621) — prune semantics
 *  - runtime-runs-retention-cron.test.ts (#622) — cron tick semantics
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/runtime-runs-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldRuntimeRuns: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/runtime-runs-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getRuntimeRunsRetentionCronStatus: statusMock };
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

describe("runs.pruneRetention", () => {
  it("is mounted as a procedure on the runs router", () => {
    const procedures = (agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >);
    expect(procedures["runs.pruneRetention"]).toBeDefined();
  });

  it("delegates to pruneOldRuntimeRuns with computed cutoff", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);

    pruneMock.mockResolvedValueOnce({
      deletedRunsCount: 5,
      deletedStepsCount: 17,
    });

    const result = await caller.runs.pruneRetention({ retentionDays: 14 });

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.olderThan).toBeInstanceOf(Date);
    // Sanity: cutoff should be roughly 14 days before now.
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(13.9);
    expect(ageDays).toBeLessThan(14.1);
    expect(result.deletedRunsCount).toBe(5);
    expect(result.deletedStepsCount).toBe(17);
  });

  it("defaults retentionDays to 30 when input omitted", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);

    await caller.runs.pruneRetention();

    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
  });

  it("forwards agentId + environment + statuses filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);

    await caller.runs.pruneRetention({
      agentId: [11, 22],
      environment: "production",
      statuses: ["completed"],
    });

    const arg = pruneMock.mock.calls[0][0];
    expect(arg.agentId).toEqual([11, 22]);
    expect(arg.environment).toBe("production");
    expect(arg.statuses).toEqual(["completed"]);
  });
});

describe("runs.getRetentionCronStatus", () => {
  it("is mounted as a procedure on the runs router", () => {
    const procedures = (agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >);
    expect(procedures["runs.getRetentionCronStatus"]).toBeDefined();
  });

  it("returns the cron status snapshot from the service getter", async () => {
    const lastRunAt = new Date("2026-05-12T04:00:00Z");
    statusMock.mockReturnValueOnce({
      lastRunAt,
      lastResult: { deletedRunsCount: 42, deletedStepsCount: 137 },
      lastError: null,
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.runs.getRetentionCronStatus();

    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T04:00:00.000Z");
    expect(result.lastResult?.deletedRunsCount).toBe(42);
    expect(result.lastError).toBeNull();
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces lastError when the cron is failing", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: null,
      lastResult: null,
      lastError: "ASDB unreachable",
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.runs.getRetentionCronStatus();

    expect(result.lastError).toBe("ASDB unreachable");
    expect(result.lastRunAt).toBeNull();
  });
});
