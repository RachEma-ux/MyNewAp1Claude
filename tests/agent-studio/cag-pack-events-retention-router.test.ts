/**
 * Phase 22 follow-up #647 — cag-pack-events retention router
 * procedures smoke test. Lives on `agentStudio.cag` sub-router.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/cag-pack-events-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldCagPackEvents: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/cag-pack-events-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getCagPackEventsRetentionCronStatus: statusMock };
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

describe("cag.pruneEventsRetention", () => {
  it("is mounted on the cag sub-router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["cag.pruneEventsRetention"]).toBeDefined();
  });

  it("delegates with computed cutoff (default 30 days)", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedCount: 88 });

    const result = await caller.cag.pruneEventsRetention();

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
    expect(result.deletedCount).toBe(88);
  });

  it("forwards all filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.cag.pruneEventsRetention({
      retentionDays: 14,
      eventTypes: ["pack_used"],
      eventSeverities: ["info"],
      workspaceId: [11, 22],
      agentDraftId: 42,
      packId: 9,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.eventTypes).toEqual(["pack_used"]);
    expect(arg.eventSeverities).toEqual(["info"]);
    expect(arg.workspaceId).toEqual([11, 22]);
    expect(arg.agentDraftId).toBe(42);
    expect(arg.packId).toBe(9);
  });

  it("rejects retentionDays out of range", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await expect(
      caller.cag.pruneEventsRetention({ retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.cag.pruneEventsRetention({ retentionDays: 3651 }),
    ).rejects.toThrow();
  });
});

describe("cag.getEventsRetentionCronStatus", () => {
  it("is mounted", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["cag.getEventsRetentionCronStatus"]).toBeDefined();
  });

  it("returns cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T09:00:00Z"),
      lastResult: { deletedCount: 137 },
      lastError: null,
    });
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.cag.getEventsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T09:00:00.000Z");
    expect(result.lastResult?.deletedCount).toBe(137);
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
    const result = await caller.cag.getEventsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
