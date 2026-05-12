/**
 * Phase 22 follow-up #631 — mcp-transitions retention router
 * procedures smoke test. Mirrors #623 / #627.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/mcp-transitions-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldMcpTransitions: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/mcp-transitions-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getMcpTransitionsRetentionCronStatus: statusMock };
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

describe("mcp.pruneTransitionsRetention", () => {
  it("is mounted on the mcp router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["mcp.pruneTransitionsRetention"]).toBeDefined();
  });

  it("delegates to pruneOldMcpTransitions with computed cutoff", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedCount: 21 });

    const result = await caller.mcp.pruneTransitionsRetention({
      retentionDays: 14,
    });

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(13.9);
    expect(ageDays).toBeLessThan(14.1);
    expect(result.deletedCount).toBe(21);
  });

  it("defaults retentionDays to 30 when input omitted", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.mcp.pruneTransitionsRetention();
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
  });

  it("forwards serverId filter", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.mcp.pruneTransitionsRetention({ serverId: [11, 22] });
    expect(pruneMock.mock.calls[0][0].serverId).toEqual([11, 22]);
  });
});

describe("mcp.getTransitionsRetentionCronStatus", () => {
  it("is mounted on the mcp router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["mcp.getTransitionsRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns the cron status snapshot", async () => {
    statusMock.mockReturnValueOnce({
      lastRunAt: new Date("2026-05-12T06:00:00Z"),
      lastResult: { deletedCount: 123 },
      lastError: null,
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.mcp.getTransitionsRetentionCronStatus();
    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T06:00:00.000Z");
    expect(result.lastResult?.deletedCount).toBe(123);
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
    const result = await caller.mcp.getTransitionsRetentionCronStatus();
    expect(result.lastError).toBe("ASDB unreachable");
  });
});
