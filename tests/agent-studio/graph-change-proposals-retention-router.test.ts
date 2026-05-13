/**
 * Phase 22 follow-up #675 — graph-change-proposals retention router
 * smoke test. Lives on the NEW `agentStudio.graphChange` sub-router
 * (first procedures on that sub-router — created lean to host the
 * Phase 11.5 structural-change-proposal retention surface).
 *
 * Distinct from `agentStudio.graphCorrection` (Phase 14 quality-
 * remediation proposals, different domain).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-change-proposals-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldGraphChangeProposals: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/graph-change-proposals-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return {
      ...real,
      getGraphChangeProposalsRetentionCronStatus: statusMock,
    };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({
    deletedProposalsCount: 0,
    deletedItemsCount: 0,
    deletedDecisionsCount: 0,
    deletedAuditEventsCount: 0,
  });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("graphChange.pruneProposalsRetention", () => {
  it("is mounted on the graphChange sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["graphChange.pruneProposalsRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedProposalsCount: 3,
      deletedItemsCount: 7,
      deletedDecisionsCount: 2,
      deletedAuditEventsCount: 11,
    });
    const result = await caller.graphChange.pruneProposalsRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedProposalsCount).toBe(3);
    expect(result.deletedItemsCount).toBe(7);
    expect(result.deletedDecisionsCount).toBe(2);
    expect(result.deletedAuditEventsCount).toBe(11);
  });

  it("forwards statuses + proposalKind filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.graphChange.pruneProposalsRetention({
      retentionDays: 14,
      statuses: ["approved", "rejected"],
      proposalKind: ["entity_merge", "projection_correction"],
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["approved", "rejected"]);
    expect(arg.proposalKind).toEqual(["entity_merge", "projection_correction"]);
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.graphChange.pruneProposalsRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.graphChange.pruneProposalsRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("graphChange.getProposalsRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["graphChange.getProposalsRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-13T16:00:00Z"),
      lastResult: {
        deletedProposalsCount: 4,
        deletedItemsCount: 9,
        deletedDecisionsCount: 3,
        deletedAuditEventsCount: 22,
      },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result =
      await caller.graphChange.getProposalsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-13T16:00:00.000Z");
    expect(result.lastResult?.deletedProposalsCount).toBe(4);
    expect(result.lastResult?.deletedItemsCount).toBe(9);
    expect(result.lastResult?.deletedDecisionsCount).toBe(3);
    expect(result.lastResult?.deletedAuditEventsCount).toBe(22);
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
      await caller.graphChange.getProposalsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
