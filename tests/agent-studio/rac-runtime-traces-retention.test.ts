/**
 * Phase 22 follow-up #638 — pruneOldRacRuntimeTraces service primitive.
 * Mirrors pruneOldRuntimeRuns (#621) shape on the RAC traces table
 * with cascade to agsRacContextBlocks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldRacRuntimeTraces } from "../../server/agent-studio/services/rac-runtime-traces-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /** Per-delete results in order: 0=blocks (children), 1=traces (parent). */
  deleteResults: Array<Array<{ id: number }>>;
  selectFilters: any[];
}

function makeFakeDb(state: FakeState) {
  let deleteCallCount = 0;
  return {
    select: () => ({
      from: (_t: unknown) => ({
        where: (cond: any) => {
          state.selectFilters.push(cond);
          return Promise.resolve(state.selectResult);
        },
      }),
    }),
    delete: (_t: any) => {
      const callIdx = deleteCallCount++;
      return {
        where: (_cond: any) => ({
          returning: (_proj: unknown) =>
            Promise.resolve(state.deleteResults[callIdx] ?? []),
        }),
      };
    },
  };
}

function fresh(): FakeState {
  return { selectResult: [], deleteResults: [], selectFilters: [] };
}

const ZERO = { deletedTracesCount: 0, deletedContextBlocksCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldRacRuntimeTraces — fail-soft", () => {
  it("returns ZERO when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldRacRuntimeTraces({
      olderThan: new Date(),
    });
    expect(result).toEqual(ZERO);
  });
});

describe("pruneOldRacRuntimeTraces — empty-array short-circuits", () => {
  it("empty workspaceId array → ZERO, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRacRuntimeTraces({
      olderThan: new Date(),
      workspaceId: [],
    });
    expect(result).toEqual(ZERO);
  });
  it("empty agentId array → ZERO, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRacRuntimeTraces({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual(ZERO);
  });
});

describe("pruneOldRacRuntimeTraces — happy path", () => {
  it("returns ZERO when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascades blocks + traces delete when rows match", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }], // blocks (children, 3 rows across 2 traces)
      [{ id: 10 }, { id: 11 }], // traces (parent, 2 rows)
    ];
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedTracesCount).toBe(2);
    expect(result.deletedContextBlocksCount).toBe(3);
  });

  it("returns blocks=0 when matched traces had no context blocks", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [{ id: 9 }]];
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedTracesCount).toBe(1);
    expect(result.deletedContextBlocksCount).toBe(0);
  });

  it("accepts a single workspaceId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [{ id: 5 }]];
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date(), workspaceId: 11 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedTracesCount).toBe(1);
  });

  it("accepts a workspaceId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date(), workspaceId: [11, 22] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedTracesCount).toBe(2);
  });

  it("accepts agentId (single + array)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }];
    state.deleteResults = [[], [{ id: 7 }]];
    const r1 = await pruneOldRacRuntimeTraces(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(r1.deletedTracesCount).toBe(1);

    const state2 = fresh();
    state2.selectResult = [{ id: 7 }, { id: 8 }];
    state2.deleteResults = [[], [{ id: 7 }, { id: 8 }]];
    const r2 = await pruneOldRacRuntimeTraces(
      { olderThan: new Date(), agentId: [42, 43] },
      { getDb: () => makeFakeDb(state2) as any },
    );
    expect(r2.deletedTracesCount).toBe(2);
  });
});

describe("pruneOldRacRuntimeTraces — composability", () => {
  it("composes workspaceId + agentId in one DELETE pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [{ id: 1 }]];
    const result = await pruneOldRacRuntimeTraces(
      { olderThan: new Date(), workspaceId: [11], agentId: [42] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedTracesCount).toBe(1);
  });
});
