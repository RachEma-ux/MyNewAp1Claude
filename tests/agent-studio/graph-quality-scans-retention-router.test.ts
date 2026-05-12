/**
 * Phase 22 follow-up #659 — graph-quality-scans retention router
 * smoke test. Lives on `agentStudio.graphQuality` sub-router.
 *
 * Procedure names use `ScansRetention` (not just `Retention`) to
 * disambiguate from existing scan-CRUD procedures on the
 * graphQuality sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/graph-quality-scans-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldGraphQualityScans: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/graph-quality-scans-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getGraphQualityScansRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({
    deletedScansCount: 0,
    deletedFindingsCount: 0,
  });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("graphQuality.pruneScansRetention", () => {
  it("is mounted on the graphQuality sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["graphQuality.pruneScansRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({
      deletedScansCount: 3,
      deletedFindingsCount: 41,
    });
    const result = await caller.graphQuality.pruneScansRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedScansCount).toBe(3);
    expect(result.deletedFindingsCount).toBe(41);
  });

  it("forwards statuses + scanKind + scope filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.graphQuality.pruneScansRetention({
      retentionDays: 14,
      statuses: ["completed"],
      scanKind: ["orphan-detector"],
      scope: "workspace:11",
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["completed"]);
    expect(arg.scanKind).toEqual(["orphan-detector"]);
    expect(arg.scope).toBe("workspace:11");
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.graphQuality.pruneScansRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.graphQuality.pruneScansRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("graphQuality.getScansRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["graphQuality.getScansRetentionCronStatus"]).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T12:00:00Z"),
      lastResult: { deletedScansCount: 7, deletedFindingsCount: 88 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.graphQuality.getScansRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T12:00:00.000Z");
    expect(result.lastResult?.deletedScansCount).toBe(7);
    expect(result.lastResult?.deletedFindingsCount).toBe(88);
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
    const result = await caller.graphQuality.getScansRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
