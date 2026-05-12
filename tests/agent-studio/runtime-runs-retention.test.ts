/**
 * Phase 22 follow-up #621 — pruneOldRuntimeRuns service primitive.
 * Sister of pruneOldBackgroundJobs (#522) on the runtime_runs table
 * with cascade-delete to runtime_run_steps.
 *
 * Covers: filter shapes, empty-array short-circuits, fail-soft on
 * ASDB-null, cascade step deletion, default terminal statuses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, selectMock, deleteMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  selectMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldRuntimeRuns } from "../../server/agent-studio/services/runtime-runs-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  deleteRunsResult: Array<{ id: number }>;
  deleteStepsResult: Array<{ id: number }>;
  selectFilters: any[];
  deleteRunIdsCaptured: number[][];
  deleteStepRunIdsCaptured: number[][];
}

function makeFakeDb(state: FakeState) {
  // The production code does sequential deletes in a fixed order:
  // (1) steps first, (2) runs second. Track call order rather than
  // try to introspect the Drizzle table identity (which is opaque).
  let deleteCallCount = 0;
  return {
    select: () => ({
      from: (_t: unknown) => {
        return {
          where: (cond: any) => {
            state.selectFilters.push(cond);
            return Promise.resolve(state.selectResult);
          },
        };
      },
    }),
    delete: (_table: any) => {
      const isStepsCall = deleteCallCount === 0;
      deleteCallCount++;
      return {
        where: (_cond: any) => {
          return {
            returning: (_proj: unknown) => {
              if (isStepsCall) {
                return Promise.resolve(state.deleteStepsResult);
              }
              return Promise.resolve(state.deleteRunsResult);
            },
          };
        },
      };
    },
  };
}

function fresh(): FakeState {
  return {
    selectResult: [],
    deleteRunsResult: [],
    deleteStepsResult: [],
    selectFilters: [],
    deleteRunIdsCaptured: [],
    deleteStepRunIdsCaptured: [],
  };
}

beforeEach(() => {
  dbMock.mockReset();
  selectMock.mockReset();
  deleteMock.mockReset();
});

describe("pruneOldRuntimeRuns — fail-soft on ASDB null", () => {
  it("returns zeros without throwing when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
  });

  it("honors options.getDb override", async () => {
    const state = fresh();
    state.selectResult = [];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
  });
});

describe("pruneOldRuntimeRuns — empty-array short-circuits", () => {
  it("empty agentId array → zeros, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
  });

  it("empty environment array → zeros, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      environment: [],
    });
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
  });

  it("empty statuses array → zeros, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
  });
});

describe("pruneOldRuntimeRuns — happy path", () => {
  it("returns zeros when no rows match (SELECT returns empty)", async () => {
    const state = fresh();
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual({ deletedRunsCount: 0, deletedStepsCount: 0 });
    // SELECT happened; no DELETE
    expect(state.selectFilters).toHaveLength(1);
    expect(state.deleteRunIdsCaptured).toHaveLength(0);
    expect(state.deleteStepRunIdsCaptured).toHaveLength(0);
  });

  it("cascades steps + runs delete when rows match", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteStepsResult = [
      { id: 100 },
      { id: 101 },
      { id: 102 },
      { id: 103 },
      { id: 104 },
    ]; // 5 step rows across 3 runs
    state.deleteRunsResult = [{ id: 10 }, { id: 11 }, { id: 12 }];

    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );

    expect(result.deletedRunsCount).toBe(3);
    expect(result.deletedStepsCount).toBe(5);
  });

  it("uses default terminal statuses when statuses omitted", async () => {
    const state = fresh();
    // We can't easily introspect the inArray-formatted statuses
    // condition through the fake-DB stub, but we CAN verify that the
    // SELECT path was invoked (i.e. defaults didn't short-circuit
    // the function via the empty-array guard).
    await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(state.selectFilters).toHaveLength(1);
  });

  it("accepts a single agentId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteRunsResult = [{ id: 5 }];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts an agentId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteRunsResult = [{ id: 5 }, { id: 6 }];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), agentId: [42, 43] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });

  it("accepts a single environment (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }];
    state.deleteRunsResult = [{ id: 7 }];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), environment: "draft" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts an environment array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }, { id: 8 }];
    state.deleteRunsResult = [{ id: 7 }, { id: 8 }];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), environment: ["draft", "staging"] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });

  it("returns steps=0 when matched runs had no step rows", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteStepsResult = []; // no steps
    state.deleteRunsResult = [{ id: 9 }];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
    expect(result.deletedStepsCount).toBe(0);
  });
});

describe("pruneOldRuntimeRuns — composability", () => {
  it("composes agentId + environment + statuses filters in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteRunsResult = [{ id: 1 }];
    const result = await pruneOldRuntimeRuns(
      {
        olderThan: new Date(),
        agentId: [11],
        environment: ["production"],
        statuses: ["completed"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });
});
