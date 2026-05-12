/**
 * Phase 22 follow-up #661 — pruneOldGraphCorrectionProposals service.
 * 3-table cascade: proposals + decisions + audit_events. Both children
 * FK with NO ACTION → application-level child-first deletion mandatory.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldGraphCorrectionProposals } from "../../server/agent-studio/services/graph-correction-proposals-retention";

interface FakeState {
  selectResult: Array<{ id: number }>;
  /**
   * Per-delete results in order:
   *   0: decisions    (parallel cascade)
   *   1: audit_events (parallel cascade)
   *   2: proposals    (parent, sequential after children)
   */
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
  deletedDecisionsCount: 0,
  deletedAuditEventsCount: 0,
};

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldGraphCorrectionProposals — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldGraphCorrectionProposals({
      olderThan: new Date(),
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphCorrectionProposals — empty-array short-circuits", () => {
  it("empty proposalKind array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphCorrectionProposals({
      olderThan: new Date(),
      proposalKind: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty targetTypeKey array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphCorrectionProposals({
      olderThan: new Date(),
      targetTypeKey: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty statuses array → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldGraphCorrectionProposals({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldGraphCorrectionProposals — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result).toEqual(ZERO_RESULT);
    expect(state.selectFilters).toHaveLength(1);
  });

  it("cascade-deletes decisions + audit_events (children-first) + proposals (parent)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.deleteResults = [
      [{ id: 200 }, { id: 201 }], // decisions (2)
      [{ id: 300 }, { id: 301 }, { id: 302 }, { id: 303 }], // audit_events (4)
      [{ id: 10 }, { id: 11 }, { id: 12 }], // proposals (3)
    ];
    const result = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(3);
    expect(result.deletedDecisionsCount).toBe(2);
    expect(result.deletedAuditEventsCount).toBe(4);
  });

  it("returns 0 for children when matched proposals had no children", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResults = [[], [], [{ id: 9 }]];
    const result = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
    expect(result.deletedDecisionsCount).toBe(0);
    expect(result.deletedAuditEventsCount).toBe(0);
  });

  it("accepts a single proposalKind (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResults = [[], [], [{ id: 5 }]];
    const result = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date(), proposalKind: "rename-entity" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
  });

  it("accepts proposalKind array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResults = [[], [], [{ id: 5 }, { id: 6 }]];
    const result = await pruneOldGraphCorrectionProposals(
      {
        olderThan: new Date(),
        proposalKind: ["rename-entity", "merge-entities"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(2);
  });

  it("accepts targetTypeKey (single + array)", async () => {
    const s1 = fresh();
    s1.selectResult = [{ id: 7 }];
    s1.deleteResults = [[], [], [{ id: 7 }]];
    const r1 = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date(), targetTypeKey: "entity" },
      { getDb: () => makeFakeDb(s1) as any },
    );
    expect(r1.deletedProposalsCount).toBe(1);

    const s2 = fresh();
    s2.selectResult = [{ id: 7 }, { id: 8 }];
    s2.deleteResults = [[], [], [{ id: 7 }, { id: 8 }]];
    const r2 = await pruneOldGraphCorrectionProposals(
      { olderThan: new Date(), targetTypeKey: ["entity", "relationship"] },
      { getDb: () => makeFakeDb(s2) as any },
    );
    expect(r2.deletedProposalsCount).toBe(2);
  });
});

describe("pruneOldGraphCorrectionProposals — composability", () => {
  it("composes proposalKind + targetTypeKey + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResults = [[], [], [{ id: 1 }]];
    const result = await pruneOldGraphCorrectionProposals(
      {
        olderThan: new Date(),
        proposalKind: ["rename-entity"],
        targetTypeKey: ["entity"],
        statuses: ["applied"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedProposalsCount).toBe(1);
  });
});
