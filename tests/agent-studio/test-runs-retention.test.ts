/**
 * Phase 22 follow-up #653 — pruneOldTestRuns service primitive.
 * Mirrors pruneOldSimulationRuns (#649) on `ags_test_runs` +
 * `ags_test_run_results`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldTestRuns } from "../../server/agent-studio/services/test-runs-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /** Per-delete results in order: 0=results, 1=runs. */
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

const ZERO_RESULT = { deletedRunsCount: 0, deletedResultsCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldTestRuns — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldTestRuns({ olderThan: new Date() });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldTestRuns — empty-array short-circuits", () => {
  it("empty agentId array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldTestRuns({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty suiteId array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldTestRuns({
      olderThan: new Date(),
      suiteId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldTestRuns({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldTestRuns — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldTestRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes results + runs", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }], // results (4)
      [{ id: 10 }, { id: 11 }], // runs (2)
    ];
    const result = await pruneOldTestRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
    expect(result.deletedResultsCount).toBe(4);
  });

  it("returns 0 for results when matched runs had no results", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [{ id: 9 }]];
    const result = await pruneOldTestRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
    expect(result.deletedResultsCount).toBe(0);
  });

  it("accepts a single agentId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [{ id: 5 }]];
    const result = await pruneOldTestRuns(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts agentId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldTestRuns(
      { olderThan: new Date(), agentId: [42, 43] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });

  it("accepts suiteId (single + array)", async () => {
    const s1 = fresh();
    s1.selectResult = [{ id: 7 }];
    s1.deleteResults = [[], [{ id: 7 }]];
    const r1 = await pruneOldTestRuns(
      { olderThan: new Date(), suiteId: 99 },
      { getDb: () => makeFakeDb(s1) as any },
    );
    expect(r1.deletedRunsCount).toBe(1);

    const s2 = fresh();
    s2.selectResult = [{ id: 7 }, { id: 8 }];
    s2.deleteResults = [[], [{ id: 7 }, { id: 8 }]];
    const r2 = await pruneOldTestRuns(
      { olderThan: new Date(), suiteId: [99, 100] },
      { getDb: () => makeFakeDb(s2) as any },
    );
    expect(r2.deletedRunsCount).toBe(2);
  });
});

describe("pruneOldTestRuns — composability", () => {
  it("composes agentId + suiteId + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [{ id: 1 }]];
    const result = await pruneOldTestRuns(
      {
        olderThan: new Date(),
        agentId: [11],
        suiteId: [99],
        statuses: ["passed"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });
});
