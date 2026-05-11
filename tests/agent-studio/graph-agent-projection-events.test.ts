/**
 * Phase 14 §6/§7 infrastructure — trace projection-intent service tests.
 *
 * Pure unit coverage of `projection-events.ts`. Drizzle is faked via an
 * active-row side-channel: insert returns a row with auto-id, list +
 * mark operations route by table identity. No DB required.
 */

import { describe, it, expect, vi } from "vitest";
import {
  recordTraceProjectionIntent,
  listPendingProjectionEvents,
  markEventApplied,
  markEventFailed,
  AsdbUnavailableError,
  ProjectionEventNotFoundError,
} from "../../server/agent-studio/services/graph-agent/projection-events";

interface FakeRow {
  id: number;
  eventKind: string;
  runtimeRunId: number;
  graphAgentRunId: number | null;
  payload: Record<string, unknown>;
  applied: boolean;
  neo4jRefs: Record<string, unknown> | null;
  appliedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

interface FakeState {
  rows: FakeRow[];
  nextId: number;
  /** When set, the next .where() filters by this id. */
  pendingWhereId: number | null;
  /** When set, the next select filters to applied=false. */
  pendingWhereApplied: boolean | null;
  pendingWhereKind: string | null;
}

function makeFakeDb() {
  const state: FakeState = {
    rows: [],
    nextId: 1,
    pendingWhereId: null,
    pendingWhereApplied: null,
    pendingWhereKind: null,
  };

  const db = {
    insert: vi.fn(() => ({
      values: (vals: Partial<FakeRow>) => ({
        returning: async () => {
          const row: FakeRow = {
            id: state.nextId++,
            eventKind: String(vals.eventKind),
            runtimeRunId: Number(vals.runtimeRunId),
            graphAgentRunId: vals.graphAgentRunId ?? null,
            payload: vals.payload ?? {},
            applied: vals.applied ?? false,
            neo4jRefs: null,
            appliedAt: null,
            lastError: null,
            createdAt: new Date(2026, 0, 1 + state.rows.length),
          };
          state.rows.push(row);
          return [row];
        },
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: (_w: unknown) => ({
          orderBy: () => ({
            limit: async (n: number) => {
              const rows = state.rows.filter((r) => {
                if (state.pendingWhereApplied !== null && r.applied !== state.pendingWhereApplied) {
                  return false;
                }
                if (state.pendingWhereKind !== null && r.eventKind !== state.pendingWhereKind) {
                  return false;
                }
                return true;
              });
              state.pendingWhereApplied = null;
              state.pendingWhereKind = null;
              return rows.slice(0, n);
            },
          }),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (patch: Partial<FakeRow>) => ({
        where: (_w: unknown) => ({
          returning: async () => {
            const id = state.pendingWhereId;
            state.pendingWhereId = null;
            const idx = state.rows.findIndex((r) => r.id === id);
            if (idx < 0) return [];
            state.rows[idx] = { ...state.rows[idx], ...patch };
            return [state.rows[idx]];
          },
        }),
      }),
    })),
  };

  return { db, state };
}

describe("projection-events — Phase 14 §6/§7", () => {
  describe("AsdbUnavailableError", () => {
    it("throws when ASDB is unavailable on recordTraceProjectionIntent", async () => {
      await expect(
        recordTraceProjectionIntent(
          {
            eventKind: "runtime_trace",
            runtimeRunId: 1,
            payload: { foo: "bar" },
          },
          { getDb: () => null as never },
        ),
      ).rejects.toBeInstanceOf(AsdbUnavailableError);
    });

    it("throws when ASDB is unavailable on listPendingProjectionEvents", async () => {
      await expect(
        listPendingProjectionEvents({}, { getDb: () => null as never }),
      ).rejects.toBeInstanceOf(AsdbUnavailableError);
    });

    it("throws when ASDB is unavailable on markEventApplied", async () => {
      await expect(
        markEventApplied(1, null, { getDb: () => null as never }),
      ).rejects.toBeInstanceOf(AsdbUnavailableError);
    });

    it("throws when ASDB is unavailable on markEventFailed", async () => {
      await expect(
        markEventFailed(1, "boom", { getDb: () => null as never }),
      ).rejects.toBeInstanceOf(AsdbUnavailableError);
    });
  });

  describe("recordTraceProjectionIntent", () => {
    it("inserts a row with applied=false and returns the assigned id", async () => {
      const { db, state } = makeFakeDb();
      const event = await recordTraceProjectionIntent(
        {
          eventKind: "runtime_trace",
          runtimeRunId: 42,
          payload: { nodes: [], edges: [] },
        },
        { getDb: () => db as never },
      );
      expect(event.id).toBeGreaterThan(0);
      expect(event.eventKind).toBe("runtime_trace");
      expect(event.runtimeRunId).toBe(42);
      expect(event.applied).toBe(false);
      expect(event.graphAgentRunId).toBeNull();
      expect(state.rows).toHaveLength(1);
    });

    it("passes graphAgentRunId through when supplied", async () => {
      const { db } = makeFakeDb();
      const event = await recordTraceProjectionIntent(
        {
          eventKind: "decision_trace",
          runtimeRunId: 7,
          graphAgentRunId: 99,
          payload: {},
        },
        { getDb: () => db as never },
      );
      expect(event.graphAgentRunId).toBe(99);
      expect(event.eventKind).toBe("decision_trace");
    });
  });

  describe("listPendingProjectionEvents", () => {
    it("returns only applied=false rows", async () => {
      const { db, state } = makeFakeDb();
      await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 1, payload: {} },
        { getDb: () => db as never },
      );
      await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 2, payload: {} },
        { getDb: () => db as never },
      );
      state.rows[0].applied = true;

      state.pendingWhereApplied = false;
      const pending = await listPendingProjectionEvents(
        {},
        { getDb: () => db as never },
      );
      expect(pending).toHaveLength(1);
      expect(pending[0].runtimeRunId).toBe(2);
    });

    it("filters by eventKind when supplied", async () => {
      const { db, state } = makeFakeDb();
      await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 1, payload: {} },
        { getDb: () => db as never },
      );
      await recordTraceProjectionIntent(
        { eventKind: "decision_trace", runtimeRunId: 2, payload: {} },
        { getDb: () => db as never },
      );

      state.pendingWhereApplied = false;
      state.pendingWhereKind = "decision_trace";
      const pending = await listPendingProjectionEvents(
        { eventKind: "decision_trace" },
        { getDb: () => db as never },
      );
      expect(pending).toHaveLength(1);
      expect(pending[0].eventKind).toBe("decision_trace");
    });

    it("honors the limit parameter", async () => {
      const { db, state } = makeFakeDb();
      for (let i = 0; i < 5; i++) {
        await recordTraceProjectionIntent(
          { eventKind: "runtime_trace", runtimeRunId: i, payload: {} },
          { getDb: () => db as never },
        );
      }
      state.pendingWhereApplied = false;
      const pending = await listPendingProjectionEvents(
        { limit: 3 },
        { getDb: () => db as never },
      );
      expect(pending).toHaveLength(3);
    });
  });

  describe("markEventApplied", () => {
    it("flips applied=true and stamps neo4jRefs + appliedAt", async () => {
      const { db, state } = makeFakeDb();
      const created = await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 1, payload: {} },
        { getDb: () => db as never },
      );

      state.pendingWhereId = created.id;
      const updated = await markEventApplied(
        created.id,
        { neo4jNodeIds: ["n-1", "n-2"] },
        { getDb: () => db as never },
      );
      expect(updated.applied).toBe(true);
      expect(updated.neo4jRefs).toEqual({ neo4jNodeIds: ["n-1", "n-2"] });
      expect(updated.appliedAt).toBeInstanceOf(Date);
    });

    it("clears lastError when marking applied (recovery from previous failure)", async () => {
      const { db, state } = makeFakeDb();
      const created = await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 1, payload: {} },
        { getDb: () => db as never },
      );

      state.pendingWhereId = created.id;
      await markEventFailed(created.id, "transient cypher error", {
        getDb: () => db as never,
      });
      expect(state.rows[0].lastError).toBe("transient cypher error");

      state.pendingWhereId = created.id;
      const updated = await markEventApplied(created.id, null, {
        getDb: () => db as never,
      });
      expect(updated.lastError).toBeNull();
    });

    it("throws ProjectionEventNotFoundError for unknown id", async () => {
      const { db, state } = makeFakeDb();
      state.pendingWhereId = 99999;
      await expect(
        markEventApplied(99999, null, { getDb: () => db as never }),
      ).rejects.toBeInstanceOf(ProjectionEventNotFoundError);
    });
  });

  describe("markEventFailed", () => {
    it("records lastError without flipping applied", async () => {
      const { db, state } = makeFakeDb();
      const created = await recordTraceProjectionIntent(
        { eventKind: "runtime_trace", runtimeRunId: 1, payload: {} },
        { getDb: () => db as never },
      );

      state.pendingWhereId = created.id;
      const updated = await markEventFailed(created.id, "neo4j down", {
        getDb: () => db as never,
      });
      expect(updated.lastError).toBe("neo4j down");
      expect(updated.applied).toBe(false);
    });

    it("throws ProjectionEventNotFoundError for unknown id", async () => {
      const { db, state } = makeFakeDb();
      state.pendingWhereId = 99999;
      await expect(
        markEventFailed(99999, "boom", { getDb: () => db as never }),
      ).rejects.toBeInstanceOf(ProjectionEventNotFoundError);
    });
  });
});
