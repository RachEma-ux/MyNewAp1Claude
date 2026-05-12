/**
 * Phase 22 follow-up #621 + #637 + #643 — pruneOldRuntimeRuns service.
 *
 * #621 shipped the prune primitive with cascade-delete to
 * agsRuntimeRunSteps only.
 *
 * #637 extended cascade to 4 sibling tables (agsRuntimeToolCalls,
 * agsRuntimeMemoryEvents, agsRuntimePolicyEvents,
 * agsRuntimeHookExecutions) that key on runId.
 *
 * #643 extends cascade further to agsRuntimeGraphEvents (Phase 14
 * Native Graph Workspace; FK runtimeRunId). Tests cover the full
 * 7-table cascade (6 children + 1 parent).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldRuntimeRuns } from "../../server/agent-studio/services/runtime-runs-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /**
   * Per-delete-call results. The production code issues 7 deletes per
   * sweep in this order:
   *  0: steps       (parallel cascade)
   *  1: toolCalls   (parallel cascade)
   *  2: memoryEvts  (parallel cascade)
   *  3: policyEvts  (parallel cascade)
   *  4: hookExecs   (parallel cascade)
   *  5: graphEvts   (parallel cascade — #643)
   *  6: runs        (parent, sequentially after the children resolve)
   */
  deleteResults: Array<Array<{ id: number }>>;
  selectFilters: any[];
}

function makeFakeDb(state: FakeState) {
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
      const callIdx = deleteCallCount++;
      return {
        where: (_cond: any) => {
          return {
            returning: (_proj: unknown) => {
              return Promise.resolve(
                state.deleteResults[callIdx] ?? [],
              );
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
    deleteResults: [],
    selectFilters: [],
  };
}

beforeEach(() => {
  dbMock.mockReset();
});

const ZERO_RESULT = {
  deletedRunsCount: 0,
  deletedStepsCount: 0,
  deletedToolCallsCount: 0,
  deletedMemoryEventsCount: 0,
  deletedPolicyEventsCount: 0,
  deletedHookExecutionsCount: 0,
  deletedGraphEventsCount: 0,
};

describe("pruneOldRuntimeRuns — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldRuntimeRuns — empty-array short-circuits", () => {
  it("empty agentId array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      agentId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty environment array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      environment: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldRuntimeRuns({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldRuntimeRuns — happy path", () => {
  it("returns ZERO_RESULT when no rows match (SELECT empty)", async () => {
    const state = fresh();
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes all 6 sibling tables + runs (#637 + #643)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }], // steps (5)
      [{ id: 200 }, { id: 201 }], // toolCalls (2)
      [{ id: 300 }, { id: 301 }, { id: 302 }], // memoryEvents (3)
      [{ id: 400 }], // policyEvents (1)
      [{ id: 500 }, { id: 501 }, { id: 502 }, { id: 503 }], // hookExecutions (4)
      [{ id: 600 }, { id: 601 }, { id: 602 }, { id: 603 }, { id: 604 }, { id: 605 }], // graphEvents (6) — #643
      [{ id: 10 }, { id: 11 }, { id: 12 }], // runs (3)
    ];

    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );

    expect(result.deletedRunsCount).toBe(3);
    expect(result.deletedStepsCount).toBe(5);
    expect(result.deletedToolCallsCount).toBe(2);
    expect(result.deletedMemoryEventsCount).toBe(3);
    expect(result.deletedPolicyEventsCount).toBe(1);
    expect(result.deletedHookExecutionsCount).toBe(4);
    expect(result.deletedGraphEventsCount).toBe(6);
  });

  it("returns 0 for sibling tables that had no rows for the deleted runs", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [
      [], // steps
      [], // toolCalls
      [], // memoryEvents
      [], // policyEvents
      [], // hookExecutions
      [], // graphEvents — #643
      [{ id: 9 }], // runs
    ];

    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );

    expect(result.deletedRunsCount).toBe(1);
    expect(result.deletedStepsCount).toBe(0);
    expect(result.deletedToolCallsCount).toBe(0);
    expect(result.deletedMemoryEventsCount).toBe(0);
    expect(result.deletedPolicyEventsCount).toBe(0);
    expect(result.deletedHookExecutionsCount).toBe(0);
    expect(result.deletedGraphEventsCount).toBe(0);
  });

  it("accepts a single agentId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [], [], [], [], [], [{ id: 5 }]];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), agentId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts an agentId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [
      [],
      [],
      [],
      [],
      [],
      [],
      [{ id: 5 }, { id: 6 }],
    ];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), agentId: [42, 43] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });

  it("accepts a single environment (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }];
    state.deleteResults = [[], [], [], [], [], [], [{ id: 7 }]];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), environment: "draft" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(1);
  });

  it("accepts an environment array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }, { id: 8 }];
    state.deleteResults = [
      [],
      [],
      [],
      [],
      [],
      [],
      [{ id: 7 }, { id: 8 }],
    ];
    const result = await pruneOldRuntimeRuns(
      { olderThan: new Date(), environment: ["draft", "staging"] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedRunsCount).toBe(2);
  });
});

describe("pruneOldRuntimeRuns — composability", () => {
  it("composes agentId + environment + statuses filters in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [], [], [], [], [], [{ id: 1 }]];
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
