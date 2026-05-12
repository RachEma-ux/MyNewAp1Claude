/**
 * Phase 22 follow-up #627 — tool-call-traces retention router
 * procedures smoke test. Sister of #623 (runtime-runs retention
 * router test).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { pruneMock, statusMock } = vi.hoisted(() => ({
  pruneMock: vi.fn(),
  statusMock: vi.fn(),
}));

vi.mock(
  "../../server/agent-studio/services/tool-call-traces-retention.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, pruneOldToolCallTraces: pruneMock };
  },
);
vi.mock(
  "../../server/agent-studio/services/tool-call-traces-retention-cron.js",
  async (orig) => {
    const real = (await orig()) as Record<string, unknown>;
    return { ...real, getToolCallTracesRetentionCronStatus: statusMock };
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

describe("runs.pruneToolCallTracesRetention", () => {
  it("is mounted as a procedure on the runs router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(procedures["runs.pruneToolCallTracesRetention"]).toBeDefined();
  });

  it("delegates to pruneOldToolCallTraces with computed cutoff", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    pruneMock.mockResolvedValueOnce({ deletedCount: 137 });

    const result = await caller.runs.pruneToolCallTracesRetention({
      retentionDays: 14,
    });

    expect(pruneMock).toHaveBeenCalledTimes(1);
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(13.9);
    expect(ageDays).toBeLessThan(14.1);
    expect(result.deletedCount).toBe(137);
  });

  it("defaults retentionDays to 30 when input omitted", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.runs.pruneToolCallTracesRetention();
    const arg = pruneMock.mock.calls[0][0];
    const ageDays = (Date.now() - arg.olderThan.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29.9);
    expect(ageDays).toBeLessThan(30.1);
  });

  it("forwards dispatchResults + workspaceId + agentId filters", async () => {
    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    await caller.runs.pruneToolCallTracesRetention({
      dispatchResults: ["ok", "error"],
      workspaceId: [11, 22],
      agentId: 42,
    });
    const arg = pruneMock.mock.calls[0][0];
    expect(arg.dispatchResults).toEqual(["ok", "error"]);
    expect(arg.workspaceId).toEqual([11, 22]);
    expect(arg.agentId).toBe(42);
  });
});

describe("runs.getToolCallTracesRetentionCronStatus", () => {
  it("is mounted as a procedure on the runs router", () => {
    const procedures = agentStudioRouter._def.procedures as Record<
      string,
      unknown
    >;
    expect(
      procedures["runs.getToolCallTracesRetentionCronStatus"],
    ).toBeDefined();
  });

  it("returns the cron status snapshot from the service getter", async () => {
    const lastRunAt = new Date("2026-05-12T05:00:00Z");
    statusMock.mockReturnValueOnce({
      lastRunAt,
      lastResult: { deletedCount: 999 },
      lastError: null,
    });

    const caller = agentStudioRouter.createCaller({
      user: { id: 1, role: "admin" },
    } as never);
    const result = await caller.runs.getToolCallTracesRetentionCronStatus();

    expect(result.lastRunAt?.toISOString()).toBe("2026-05-12T05:00:00.000Z");
    expect(result.lastResult?.deletedCount).toBe(999);
    expect(result.lastError).toBeNull();
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
    const result = await caller.runs.getToolCallTracesRetentionCronStatus();

    expect(result.lastError).toBe("ASDB unreachable");
  });
});
