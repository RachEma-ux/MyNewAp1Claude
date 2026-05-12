/**
 * Phase 22 follow-up #633 — pruneOldCatalogSyncLog service primitive.
 * Mirrors pruneOldMcpTransitions (#629) shape on the catalog sync
 * log table with extra eventType + sourceModule + catalogEntryId
 * filters.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldCatalogSyncLog } from "../../server/agent-studio/services/catalog-sync-log-retention";

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

describe("pruneOldCatalogSyncLog — fail-soft on ASDB null", () => {
  it("returns zero when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldCatalogSyncLog({
      olderThan: new Date(),
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldCatalogSyncLog — empty-array short-circuits", () => {
  it("empty eventTypes array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldCatalogSyncLog({
      olderThan: new Date(),
      eventTypes: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("empty sourceModule array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldCatalogSyncLog({
      olderThan: new Date(),
      sourceModule: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldCatalogSyncLog — happy path", () => {
  it("returns deletedCount from DELETE returning() length", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = await pruneOldCatalogSyncLog(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(3);
  });

  it("accepts a single sourceModule (eq form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldCatalogSyncLog(
      { olderThan: new Date(), sourceModule: "agentStudio" },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts sourceModule array (inArray form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }];
    const result = await pruneOldCatalogSyncLog(
      {
        olderThan: new Date(),
        sourceModule: ["agentStudio", "aiTypes"],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("accepts an eventTypes filter (preserve deprecated forever)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 7 }];
    const result = await pruneOldCatalogSyncLog(
      {
        olderThan: new Date(),
        eventTypes: [
          "aiTypes.catalog.registered",
          "aiTypes.catalog.published",
        ],
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts a catalogEntryId filter for targeted cleanup", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldCatalogSyncLog(
      { olderThan: new Date(), catalogEntryId: 99 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("composes all filters in one DELETE", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 5 }];
    const result = await pruneOldCatalogSyncLog(
      {
        olderThan: new Date(),
        eventTypes: ["aiTypes.catalog.registered"],
        sourceModule: "agentStudio",
        catalogEntryId: 42,
      },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
    expect(state.deleteCondCaptured).toHaveLength(1);
  });
});
