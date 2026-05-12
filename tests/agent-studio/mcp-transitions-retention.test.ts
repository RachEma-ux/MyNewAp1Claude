/**
 * Phase 22 follow-up #629 — pruneOldMcpTransitions service primitive.
 * Mirrors pruneOldToolCallTraces (#625) shape on the simpler
 * `ags_mcp_transitions` table (no statuses; just ts + serverId).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: vi.fn() }));

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: dbMock,
}));

import { pruneOldMcpTransitions } from "../../server/agent-studio/services/mcp-transitions-retention";

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

describe("pruneOldMcpTransitions — fail-soft on ASDB null", () => {
  it("returns zero without throwing when getAsDb returns null", async () => {
    dbMock.mockReturnValue(null);
    const result = await pruneOldMcpTransitions({
      olderThan: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldMcpTransitions — empty-array short-circuit", () => {
  it("empty serverId array → zero, no DB call", async () => {
    dbMock.mockImplementation(() => {
      throw new Error("DB should not be probed");
    });
    const result = await pruneOldMcpTransitions({
      olderThan: new Date(),
      serverId: [],
    });
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("pruneOldMcpTransitions — happy path", () => {
  it("returns deletedCount from DELETE returning() length", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const result = await pruneOldMcpTransitions(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(4);
  });

  it("accepts a single serverId (eq form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    const result = await pruneOldMcpTransitions(
      { olderThan: new Date(), serverId: 42 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("accepts a serverId array (inArray form)", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }, { id: 2 }];
    const result = await pruneOldMcpTransitions(
      { olderThan: new Date(), serverId: [42, 43] },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(2);
  });

  it("returns 0 when no rows match (empty result)", async () => {
    const state = fresh();
    state.deleteResult = [];
    const result = await pruneOldMcpTransitions(
      { olderThan: new Date() },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(result.deletedCount).toBe(0);
  });

  it("issues exactly one DELETE call per invocation", async () => {
    const state = fresh();
    state.deleteResult = [{ id: 1 }];
    await pruneOldMcpTransitions(
      { olderThan: new Date(), serverId: 7 },
      { getDb: () => makeFakeDb(state) as any },
    );
    expect(state.deleteCondCaptured).toHaveLength(1);
  });
});
