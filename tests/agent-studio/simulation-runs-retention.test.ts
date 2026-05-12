/**
 * Phase 22 follow-up #649 — pruneOldSimulationRuns service primitive.
 * Mirrors pruneOldRuntimeRuns (#621) shape on a smaller 2-table
 * cascade (runs + steps only).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldSimulationRuns } from "../../server/agent-studio/services/simulation-runs-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /** Per-delete results in order: 0=steps, 1=runs. */
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

const ZERO_RESULT = { deletedRunsCount: 0, deletedStepsCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldSimulationRuns — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldSimulationRuns({ olderThan: new Date() });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldSimulationRuns — empty-array short-circuits", () => {
  it("empty agentId array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldSimulationRuns({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty scenarioId array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldSimulationRuns({
      olderThan: new Date(),
      scenarioId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldSimulationRuns({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldSimulationRuns — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldSimulationRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes steps + runs", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }], // steps (3)
      [{ id: 10 }, { id: 11 }], // runs (2)
    ];
    const result = await pruneOldSimulationRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
    expect(result.deletedStepsCount).toBe(3);
  });

  it("returns 0 for steps when matched runs had no steps", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [{ id: 9 }]];
    const result = await pruneOldSimulationRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
    expect(result.deletedStepsCount).toBe(0);
  });

  it("accepts a single agentId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [{ id: 5 }]];
    const result = await pruneOldSimulationRuns(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts agentId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldSimulationRuns(
      { olderThan: new Date(), agentId: [42, 43] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });

  it("accepts scenarioId (single + array)", async () => {
    const s1 = fresh();
    s1.selectResult = [{ id: 7 }];
    s1.deleteResults = [[], [{ id: 7 }]];
    const r1 = await pruneOldSimulationRuns(
      { olderThan: new Date(), scenarioId: 99 },
      { getDb: () => makeFakeDb(s1) as any },
    );
    expect(r1.deletedRunsCount).toBe(1);

    const s2 = fresh();
    s2.selectResult = [{ id: 7 }, { id: 8 }];
    s2.deleteResults = [[], [{ id: 7 }, { id: 8 }]];
    const r2 = await pruneOldSimulationRuns(
      { olderThan: new Date(), scenarioId: [99, 100] },
      { getDb: () => makeFakeDb(s2) as any },
    );
    expect(r2.deletedRunsCount).toBe(2);
  });
});

describe("pruneOldSimulationRuns — composability", () => {
  it("composes agentId + scenarioId + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [{ id: 1 }]];
    const result = await pruneOldSimulationRuns(
      {
        olderThan: new Date(),
        agentId: [11],
        scenarioId: [99],
        statuses: ["passed"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });
});
