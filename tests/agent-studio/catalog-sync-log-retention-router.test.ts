/**
 * Phase 22 follow-up #635 — catalog-sync-log retention router
 * procedures smoke test. Lives on `agentStudio.catalogSyncLog`
 * sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/catalog-sync-log-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldCatalogSyncLog: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/catalog-sync-log-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getCatalogSyncLogRetentionCronStatus: statusMock };
  },
);

import { agentStudioRouter } from "../../server/agent-studio/api/router";

beforeEach(() => {
  pruneMock.mockReset();
  statusMock.mockReset();
  pruneMock.mockResolvedValue({ deletedCount: 0 });
  statusMock.mockReturnValue({
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  });
});

describe("catalogSyncLog.pruneRetention", () => {
  it("is mounted on the catalogSyncLog sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["catalogSyncLog.pruneRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedCount: 7 });

    const result = await caller.catalogSyncLog.pruneRetention();

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedCount).toBe(7);
  });

  it("forwards eventTypes / sourceModule / catalogEntryId filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.catalogSyncLog.pruneRetention({
      retentionDays: 14,
      eventTypes: [
        "aiTypes.catalog.registered",
        "aiTypes.catalog.published",
      ],
      sourceModule: "agentStudio",
      catalogEntryId: 42,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.eventTypes).toEqual([
      "aiTypes.catalog.registered",
      "aiTypes.catalog.published",
    ]);
    expect(arg.sourceModule).toBe("agentStudio");
    expect(arg.catalogEntryId).toBe(42);
  });
});

describe("catalogSyncLog.getRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["catalogSyncLog.getRetentionCronStatus"]).toBeDefined();
  });

  it("returns the cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T07:00:00Z"),
      lastResult: { deletedCount: 99 },
      lastError: null,
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.catalogSyncLog.getRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T07:00:00.000Z");
    expect(result.lastResult?.deletedCount).toBe(99);
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
    const result = await caller.catalogSyncLog.getRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
