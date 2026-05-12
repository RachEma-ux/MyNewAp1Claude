/**
 * Phase 22 follow-up #625 — pruneOldToolCallTraces service primitive.
 * Sister of pruneOldBackgroundJobs (#522) + pruneOldRuntimeRuns
 * (#621) on the `ags_tool_call_traces` table.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldToolCallTraces } from "../../server/agent-studio/services/tool-call-traces-retention";

interface FakeState {
  deleteResult: Array<{ id: number }>;
  deleteCondCaptured: any[];
}

function makeFakeDb(state: FakeState) {
  return {
    delete: (_table: unknown) => ({
      where: (cond: any) => {
        state.deleteCondCaptured.push(cond);
        return {
          returning: (_proj: unknown) => Promise.resolve(state.deleteResult),
        };
      },
    }),
  };
}

function fresh(): FakeState {
  return { deleteResult: [], deleteCondCaptured: [] };
}

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldToolCallTraces — fail-soft on ASDB null", () => {
  it("returns zero without throwing when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldToolCallTraces({
      olderThan: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldToolCallTraces — empty-array short-circuits", () => {
  it("empty workspaceId array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldToolCallTraces({
      olderThan: new Date(),
      workspaceId: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("empty agentId array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldToolCallTraces({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("empty dispatchResults array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldToolCallTraces({
      olderThan: new Date(),
      dispatchResults: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldToolCallTraces — happy path", () => {
  it("returns deletedCount from the DELETE returning() length", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = await pruneOldToolCallTraces(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(3);
  });

  it("accepts a single workspaceId (eq form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldToolCallTraces(
      { olderThan: new Date(), workspaceId: 11 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts a workspaceId array (inArray form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }];
    const result = await pruneOldToolCallTraces(
      { olderThan: new Date(), workspaceId: [11, 22] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("accepts a single agentId (eq form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 99 }];
    const result = await pruneOldToolCallTraces(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts a dispatchResults override array (multi-value)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }];
    const result = await pruneOldToolCallTraces(
      {
        olderThan: new Date(),
        dispatchResults: ["ok", "error", "blocked"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("uses default dispatchResults=['ok'] when none specified", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 5 }];
    await pruneOldToolCallTraces(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    // The DELETE happened, meaning the function ran the default
    // dispatchResults filter through to the where clause.
    expect(state.deleteCondCaptured).toHaveLength(1);
  });

  it("composes workspaceId + agentId + dispatchResults filters", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 7 }];
    const result = await pruneOldToolCallTraces(
      {
        olderThan: new Date(),
        workspaceId: [11],
        agentId: [42],
        dispatchResults: ["ok"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });
});
