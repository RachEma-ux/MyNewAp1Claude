/**
 * Phase 22 follow-up #667 — graph-quality-agent-runs retention
 * router smoke test. Lives on `agentStudio.graphQuality` sub-router.
 *
 * Procedure names use `AgentRunsRetention` (not just `Retention`) to
 * disambiguate from existing `pruneScansRetention` (#659) on the
 * same sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-quality-agent-runs-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldGraphQualityAgentRuns: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/graph-quality-agent-runs-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      getGraphQualityAgentRunsRetentionCronStatus: statusMock,
    };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({ deletedAgentRunsCount: 0 });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("graphQuality.pruneAgentRunsRetention", () => {
  it("is mounted on the graphQuality sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["graphQuality.pruneAgentRunsRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedAgentRunsCount: 5 });
    const result = await caller.graphQuality.pruneAgentRunsRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedAgentRunsCount).toBe(5);
  });

  it("forwards statuses + agentKey filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.graphQuality.pruneAgentRunsRetention({
      retentionDays: 14,
      statuses: ["completed"],
      agentKey: "graph_quality_agent",
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["completed"]);
    expect(arg.agentKey).toBe("graph_quality_agent");
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.graphQuality.pruneAgentRunsRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.graphQuality.pruneAgentRunsRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("graphQuality.getAgentRunsRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["graphQuality.getAgentRunsRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T14:00:00Z"),
      lastResult: { deletedAgentRunsCount: 9 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result =
      await caller.graphQuality.getAgentRunsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T14:00:00.000Z");
    expect(result.lastResult?.deletedAgentRunsCount).toBe(9);
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
    const result =
      await caller.graphQuality.getAgentRunsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
