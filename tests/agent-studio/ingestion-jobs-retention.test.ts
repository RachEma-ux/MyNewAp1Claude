/**
 * Phase 22 follow-up #669 — pruneOldIngestionJobs service.
 *
 * Single-table prune for the Universal Ingestion (Phase 2-3)
 * lifecycle wrapper. Status vocabulary: pending/running/succeeded/
 * failed/unsupported_type; terminal defaults
 * ["succeeded","failed","unsupported_type"]. Cutoff: requestedAt
 * (always non-null).
 *
 * Note: agsIngestionArtifacts is a SIBLING table, NOT a child —
 * it has its own (workspaceId, contentHash) unique key and is
 * compliance-adjacent (out of scope for this prune).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldIngestionJobs } from "../../server/agent-studio/services/ingestion-jobs-retention";

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

const ZERO_RESULT = { deletedJobsCount: 0 };

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldIngestionJobs — fail-soft on ASDB null", () => {
  it("returns ZERO_RESULT when getAsDb null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldIngestionJobs({ olderThan: new Date() });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldIngestionJobs — empty-array short-circuits", () => {
  it("empty statuses → ZERO_RESULT, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldIngestionJobs({
      olderThan: new Date(),
      statuses: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty workspaceId → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldIngestionJobs({
      olderThan: new Date(),
      workspaceId: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });

  it("empty sourceConnectorKey → ZERO_RESULT", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldIngestionJobs({
      olderThan: new Date(),
      sourceConnectorKey: [],
    });
    expect(result).toEqual(ZERO_RESULT);
  });
});

describe("pruneOldIngestionJobs — happy path", () => {
  it("returns ZERO_RESULT when no rows match", async () => {
    const state = fresh();
    const result = await pruneOldIngestionJobs(
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
    const result = await pruneOldIngestionJobs(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedJobsCount).toBe(3);
  });

  it("accepts a single workspaceId (eq form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }];
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldIngestionJobs(
      { olderThan: new Date(), workspaceId: 11 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedJobsCount).toBe(1);
  });

  it("accepts workspaceId array (inArray form)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 5 }, { id: 6 }];
    state.deleteResult = [{ id: 5 }, { id: 6 }];
    const result = await pruneOldIngestionJobs(
      { olderThan: new Date(), workspaceId: [11, 22] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedJobsCount).toBe(2);
  });

  it("accepts sourceConnectorKey (single + array)", async () => {
    const s1 = fresh();
    s1.selectResult = [{ id: 7 }];
    s1.deleteResult = [{ id: 7 }];
    const r1 = await pruneOldIngestionJobs(
      { olderThan: new Date(), sourceConnectorKey: "s3" },
      { getDb: () => makeFakeDb(s1) as any },
    );
    expect(r1.deletedJobsCount).toBe(1);

    const s2 = fresh();
    s2.selectResult = [{ id: 7 }, { id: 8 }];
    s2.deleteResult = [{ id: 7 }, { id: 8 }];
    const r2 = await pruneOldIngestionJobs(
      { olderThan: new Date(), sourceConnectorKey: ["s3", "gdrive"] },
      { getDb: () => makeFakeDb(s2) as any },
    );
    expect(r2.deletedJobsCount).toBe(2);
  });

  it("accepts narrowed statuses (e.g. failed + unsupported_type only)", async () => {
    const state = fresh();
    state.selectResult = [{ id: 9 }];
    state.deleteResult = [{ id: 9 }];
    const result = await pruneOldIngestionJobs(
      {
        olderThan: new Date(),
        statuses: ["failed", "unsupported_type"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedJobsCount).toBe(1);
  });
});

describe("pruneOldIngestionJobs — composability", () => {
  it("composes workspaceId + sourceConnectorKey + statuses in one pass", async () => {
    const state = fresh();
    state.selectResult = [{ id: 1 }];
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldIngestionJobs(
      {
        olderThan: new Date(),
        workspaceId: [11],
        sourceConnectorKey: ["s3"],
        statuses: ["succeeded"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedJobsCount).toBe(1);
  });
});
