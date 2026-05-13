/**
 * Phase 22 follow-up #673 — pruneOldGraphChangeProposals service.
 *
 * 4-table cascade sibling of pruneOldGraphCorrectionProposals
 * (#661) — same shape, different domain (structural-change
 * proposals vs quality-correction proposals).
 *
 * Children: items + decisions + auditEvents (all NO ACTION FK).
 * Deletion order: parallel children-first via Promise.all, then
 * parent.
 *
 * Status vocabulary: pending|validating|in_review|approved|
 * rejected|withdrawn. Terminal defaults [approved, rejected,
 * withdrawn]; pending+validating+in_review never swept.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldGraphChangeProposals } from "../../server/agent-studio/services/graph-change-proposals-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /** Per-delete results — order: items, decisions, auditEvents, proposals. */
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

const ZERO_RESULT = {
  deletedProposalsCount: 0,
  deletedItemsCount: 0,
  deletedDecisionsCount: 0,
  deletedAuditEventsCount: 0,
};

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldGraphChangeProposals — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldGraphChangeProposals({
      olderThan: new Date(),
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphChangeProposals — empty-array short-circuits", () => {
  it("empty statuses → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphChangeProposals({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty proposalKind → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphChangeProposals({
      olderThan: new Date(),
      proposalKind: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphChangeProposals — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldGraphChangeProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes 3 child tables (parallel) + parent (last)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteResults = [
      [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }], // items (4)
      [{ id: 200 }, { id: 201 }], // decisions (2)
      [
        { id: 300 },
        { id: 301 },
        { id: 302 },
        { id: 303 },
        { id: 304 },
        { id: 305 },
      ], // auditEvents (6)
      [{ id: 10 }, { id: 11 }, { id: 12 }], // proposals (3)
    ];
    const result = await pruneOldGraphChangeProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(3);
    expect(result.deletedItemsCount).toBe(4);
    expect(result.deletedDecisionsCount).toBe(2);
    expect(result.deletedAuditEventsCount).toBe(6);
  });

  it("returns 0 children when matched proposals had none", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [], [], [{ id: 9 }]];
    const result = await pruneOldGraphChangeProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
    expect(result.deletedItemsCount).toBe(0);
    expect(result.deletedDecisionsCount).toBe(0);
    expect(result.deletedAuditEventsCount).toBe(0);
  });

  it("accepts a single proposalKind (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [], [], [{ id: 5 }]];
    const result = await pruneOldGraphChangeProposals(
      { olderThan: new Date(), proposalKind: "entity_merge" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
  });

  it("accepts proposalKind array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [], [], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldGraphChangeProposals(
      {
        olderThan: new Date(),
        proposalKind: ["entity_merge", "projection_correction"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(2);
  });

  it("accepts narrowed statuses (e.g. withdrawn-only)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 7 }];
    state.deleteResults = [[], [], [], [{ id: 7 }]];
    const result = await pruneOldGraphChangeProposals(
      { olderThan: new Date(), statuses: ["withdrawn"] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
  });
});

describe("pruneOldGraphChangeProposals — composability", () => {
  it("composes proposalKind + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [], [], [{ id: 1 }]];
    const result = await pruneOldGraphChangeProposals(
      {
        olderThan: new Date(),
        proposalKind: ["entity_merge"],
        statuses: ["approved"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
  });
});
