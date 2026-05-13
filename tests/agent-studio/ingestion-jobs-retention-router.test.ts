/**
 * Phase 22 follow-up #671 — ingestion-jobs retention router smoke
 * test. Lives on the NEW `agentStudio.ingestion` sub-router (first
 * procedures on that sub-router — created lean to host the
 * Universal Ingestion retention surface).
 *
 * Distinct from `agentStudio.racIngestion` (RAC Phase 3 adapter
 * contract surface).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/ingestion-jobs-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldIngestionJobs: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/ingestion-jobs-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getIngestionJobsRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({ deletedJobsCount: 0 });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("ingestion.pruneJobsRetention", () => {
  it("is mounted on the ingestion sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["ingestion.pruneJobsRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedJobsCount: 17 });
    const result = await caller.ingestion.pruneJobsRetention();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedJobsCount).toBe(17);
  });

  it("forwards statuses + workspaceId + sourceConnectorKey filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.ingestion.pruneJobsRetention({
      retentionDays: 14,
      statuses: ["failed", "unsupported_type"],
      workspaceId: [11, 22],
      sourceConnectorKey: "s3",
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.statuses).toEqual(["failed", "unsupported_type"]);
    expect(arg.workspaceId).toEqual([11, 22]);
    expect(arg.sourceConnectorKey).toBe("s3");
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.ingestion.pruneJobsRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.ingestion.pruneJobsRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("ingestion.getJobsRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["ingestion.getJobsRetentionCronStatus"]).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-13T15:00:00Z"),
      lastResult: { deletedJobsCount: 42 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.ingestion.getJobsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-13T15:00:00.000Z");
    expect(result.lastResult?.deletedJobsCount).toBe(42);
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
    const result = await caller.ingestion.getJobsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
