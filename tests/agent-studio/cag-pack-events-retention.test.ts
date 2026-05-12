/**
 * Phase 22 follow-up #645 — pruneOldCagPackEvents service primitive.
 * Mirrors pruneOldCatalogSyncLog (#633) shape on `ags_cag_pack_events`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldCagPackEvents } from "../../server/agent-studio/services/cag-pack-events-retention";

interface FakeState {
  deleteResult: Array<{ id: number }>;
  deleteCondCaptured: any[];
}

function makeFakeDb(state: FakeState) {
  return {
    delete: (_table: unknown) => ({
      where: (cond: any) => {
        state.deleteCondCaptured.push(cond);
        return {
          returning: (_proj: unknown) => Promise.resolve(state.deleteResult),
        };
      },
    }),
  };
}

function fresh(): FakeState {
  return { deleteResult: [], deleteCondCaptured: [] };
}

beforeEach(() => {
  dbMock.mockReset();
});

describe("pruneOldCagPackEvents — fail-soft on ASDB null", () => {
  it("returns zero when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldCagPackEvents({ olderThan: new Date() });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldCagPackEvents — empty-array short-circuits", () => {
  it("empty eventTypes array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldCagPackEvents({
      olderThan: new Date(),
      eventTypes: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("empty eventSeverities array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldCagPackEvents({
      olderThan: new Date(),
      eventSeverities: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("empty workspaceId array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldCagPackEvents({
      olderThan: new Date(),
      workspaceId: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldCagPackEvents — happy path", () => {
  it("returns deletedCount from DELETE returning() length", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const result = await pruneOldCagPackEvents(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(4);
  });

  it("accepts eventTypes filter (preserve pack_validation_failed)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldCagPackEvents(
      {
        olderThan: new Date(),
        eventTypes: ["pack_used", "pack_created"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts eventSeverities filter (preserve warn + error)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 2 }, { id: 3 }];
    const result = await pruneOldCagPackEvents(
      {
        olderThan: new Date(),
        eventSeverities: ["info"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("accepts a single workspaceId (eq form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldCagPackEvents(
      { olderThan: new Date(), workspaceId: 11 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts a workspaceId array (inArray form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }];
    const result = await pruneOldCagPackEvents(
      { olderThan: new Date(), workspaceId: [11, 22] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("accepts agentDraftId filter for targeted cleanup", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldCagPackEvents(
      { olderThan: new Date(), agentDraftId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts packId filter for single-pack cleanup", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 7 }];
    const result = await pruneOldCagPackEvents(
      { olderThan: new Date(), packId: 9 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("composes all filters in one DELETE", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldCagPackEvents(
      {
        olderThan: new Date(),
        eventTypes: ["pack_used"],
        eventSeverities: ["info"],
        workspaceId: [11],
        agentDraftId: 42,
        packId: 9,
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
    expect(state.deleteCondCaptured).toHaveLength(1);
  });
});
