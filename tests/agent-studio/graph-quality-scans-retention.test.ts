/**
 * Phase 22 follow-up #657 — pruneOldGraphQualityScans service.
 * Mirrors pruneOldTestRuns (#653) on `ags_graph_quality_scans` +
 * `ags_graph_quality_findings` (FK is declared with NO ACTION, so
 * cascade is application-level child-first).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldGraphQualityScans } from "../../server/agent-studio/services/graph-quality-scans-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /** Per-delete results in order: 0=findings, 1=scans. */
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

const ZERO_RESULT = { deletedScansCount: 0, deletedFindingsCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldGraphQualityScans — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldGraphQualityScans({ olderThan: new Date() });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphQualityScans — empty-array short-circuits", () => {
  it("empty scanKind array → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphQualityScans({
      olderThan: new Date(),
      scanKind: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty scope array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphQualityScans({
      olderThan: new Date(),
      scope: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphQualityScans({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphQualityScans — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldGraphQualityScans(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes findings (children-first) + scans (parent)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }], // findings (5)
      [{ id: 10 }, { id: 11 }, { id: 12 }], // scans (3)
    ];
    const result = await pruneOldGraphQualityScans(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedScansCount).toBe(3);
    expect(result.deletedFindingsCount).toBe(5);
  });

  it("returns 0 findings when matched scans had no findings", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [{ id: 9 }]];
    const result = await pruneOldGraphQualityScans(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedScansCount).toBe(1);
    expect(result.deletedFindingsCount).toBe(0);
  });

  it("accepts a single scanKind (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [{ id: 5 }]];
    const result = await pruneOldGraphQualityScans(
      { olderThan: new Date(), scanKind: "orphan-detector" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedScansCount).toBe(1);
  });

  it("accepts scanKind array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldGraphQualityScans(
      {
        olderThan: new Date(),
        scanKind: ["orphan-detector", "broken-citation-detector"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedScansCount).toBe(2);
  });

  it("accepts scope (single + array)", async () => {
    const s1 = fresh();
    s1.selectResult = [{ id: 7 }];
    s1.deleteResults = [[], [{ id: 7 }]];
    const r1 = await pruneOldGraphQualityScans(
      { olderThan: new Date(), scope: "workspace:11" },
      { getDb: () => makeFakeDb(s1) as any },
    );
    expect(r1.deletedScansCount).toBe(1);

    const s2 = fresh();
    s2.selectResult = [{ id: 7 }, { id: 8 }];
    s2.deleteResults = [[], [{ id: 7 }, { id: 8 }]];
    const r2 = await pruneOldGraphQualityScans(
      { olderThan: new Date(), scope: ["workspace:11", "workspace:22"] },
      { getDb: () => makeFakeDb(s2) as any },
    );
    expect(r2.deletedScansCount).toBe(2);
  });
});

describe("pruneOldGraphQualityScans — composability", () => {
  it("composes scanKind + scope + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [{ id: 1 }]];
    const result = await pruneOldGraphQualityScans(
      {
        olderThan: new Date(),
        scanKind: ["orphan-detector"],
        scope: ["workspace:11"],
        statuses: ["completed"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedScansCount).toBe(1);
  });
});
