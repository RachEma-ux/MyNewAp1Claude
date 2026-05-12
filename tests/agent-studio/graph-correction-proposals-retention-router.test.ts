/**
 * Phase 22 follow-up #663 — graph-correction-proposals retention
 * router smoke test. Lives on `agentStudio.graphCorrection` sub-router.
 *
 * Procedure names use `ProposalsRetention` to disambiguate from
 * existing proposal-CRUD on the graphCorrection sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-correction-proposals-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldGraphCorrectionProposals: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/graph-correction-proposals-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      getGraphCorrectionProposalsRetentionCronStatus: statusMock,
    };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({
    deletedProposalsCount: 0,
    deletedDecisionsCount: 0,
    deletedAuditEventsCount: 0,
  });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("graphCorrection.pruneProposalsRetention", () => {
  it("is mounted on the graphCorrection sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["graphCorrection.pruneProposalsRetention"],
    ).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedProposalsCount: 3,
      deletedDecisionsCount: 5,
      deletedAuditEventsCount: 41,
    });
    const result = await caller.graphCorrection.pruneProposalsRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedProposalsCount).toBe(3);
    expect(result.deletedDecisionsCount).toBe(5);
    expect(result.deletedAuditEventsCount).toBe(41);
  });

  it("forwards statuses + proposalKind + targetTypeKey filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.graphCorrection.pruneProposalsRetention({
      retentionDays: 14,
      statuses: ["applied"],
      proposalKind: ["rename-entity"],
      targetTypeKey: "entity",
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["applied"]);
    expect(arg.proposalKind).toEqual(["rename-entity"]);
    expect(arg.targetTypeKey).toBe("entity");
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.graphCorrection.pruneProposalsRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.graphCorrection.pruneProposalsRetention({
        retentionDays: 3651,
      }),
    ).rejects.toThrow();
  });
});

describe("graphCorrection.getProposalsRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["graphCorrection.getProposalsRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T13:00:00Z"),
      lastResult: {
        deletedProposalsCount: 12,
        deletedDecisionsCount: 18,
        deletedAuditEventsCount: 137,
      },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result =
      await caller.graphCorrection.getProposalsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T13:00:00.000Z");
    expect(result.lastResult?.deletedProposalsCount).toBe(12);
    expect(result.lastResult?.deletedDecisionsCount).toBe(18);
    expect(result.lastResult?.deletedAuditEventsCount).toBe(137);
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
      await caller.graphCorrection.getProposalsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
