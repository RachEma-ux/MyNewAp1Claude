/**
 * Phase 22 follow-up #665 — pruneOldGraphQualityAgentRuns service.
 *
 * Sibling of pruneOldGraphQualityScans (#657) at the agent-orchestration
 * layer. Single-table (no FK children), so simpler than the cascade
 * pruners. Status vocabulary: `running` / `completed` / `failed`;
 * terminal defaults `["completed", "failed"]`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldGraphQualityAgentRuns } from "../../server/agent-studio/services/graph-quality-agent-runs-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  deleteResult: Array<{ id: number }>;
  selectFilters: any[];
}

function makeFakeDb(state: FakeState) {
  return {
    select: () => ({
      from: (_t: unknown) => ({
        where: (cond: any) => {
          state.selectFilters.push(cond);
          return Promise.resolve(state.selectResult);
        },
      }),
    }),
    delete: (_t: any) => ({
      where: (_cond: any) => ({
        returning: (_proj: unknown) => Promise.resolve(state.deleteResult),
      }),
    }),
  };
}

function fresh(): FakeState {
  return { selectResult: [], deleteResult: [], selectFilters: [] };
}

const ZERO_RESULT = { deletedAgentRunsCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldGraphQualityAgentRuns — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldGraphQualityAgentRuns({
      olderThan: new Date(),
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphQualityAgentRuns — empty-array short-circuits", () => {
  it("empty agentKey array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphQualityAgentRuns({
      olderThan: new Date(),
      agentKey: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphQualityAgentRuns({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphQualityAgentRuns — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldGraphQualityAgentRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("deletes matched rows (single-table, no cascade)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    const result = await pruneOldGraphQualityAgentRuns(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedAgentRunsCount).toBe(3);
  });

  it("accepts a single agentKey (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldGraphQualityAgentRuns(
      { olderThan: new Date(), agentKey: "graph_quality_agent" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedAgentRunsCount).toBe(1);
  });

  it("accepts agentKey array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResult = [{ id: 5 }, { id: 6 }];
    const result = await pruneOldGraphQualityAgentRuns(
      {
        olderThan: new Date(),
        agentKey: ["graph_quality_agent", "future_secondary_agent"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedAgentRunsCount).toBe(2);
  });

  it("accepts narrowed statuses (e.g. failed-only)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }];
    state.deleteResult = [{ id: 7 }];
    const result = await pruneOldGraphQualityAgentRuns(
      { olderThan: new Date(), statuses: ["failed"] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedAgentRunsCount).toBe(1);
  });
});

describe("pruneOldGraphQualityAgentRuns — composability", () => {
  it("composes agentKey + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldGraphQualityAgentRuns(
      {
        olderThan: new Date(),
        agentKey: ["graph_quality_agent"],
        statuses: ["completed"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedAgentRunsCount).toBe(1);
  });
});
