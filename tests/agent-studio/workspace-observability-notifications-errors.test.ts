/**
 * Phase 22 — Workspace observability: user notifications + error
 * events service tests.
 *
 * Both services share the same write/list shape; tested together
 * since the active-key fake-DB infrastructure is the same.
 */

import { describe, it, expect, vi } from "vitest";
import {
  pushNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  AsdbUnavailableError as NotificationsAsdbUnavailableError,
} from "../../server/agent-studio/services/workspace-observability/user-notifications";
import {
  recordErrorEvent,
  listErrorEvents,
  pruneOldErrorEvents,
} from "../../server/agent-studio/services/workspace-observability/error-events";

interface NotifRow {
  id: number;
  userId: number;
  notificationKind: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  createdAt: Date;
}

interface ErrEventRow {
  id: number;
  sourceKind: string;
  sourceId: string | null;
  userId: number | null;
  errorClass: string;
  errorMessage: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

interface NotifState {
  rows: NotifRow[];
  nextId: number;
  selectQueue: Array<"list">;
  active: { userId?: number; unreadOnly?: boolean; kind?: string };
}

interface ErrState {
  rows: ErrEventRow[];
  nextId: number;
  selectQueue: Array<"list">;
  active: {
    sourceKind?: string;
    sourceKindLike?: string;
    errorClass?: string;
    userId?: number;
  };
}

function makeNotifFakeDb(initial?: Partial<NotifState>) {
  const state: NotifState = {
    rows: initial?.rows ?? [],
    nextId: initial?.nextId ?? 1000,
    selectQueue: [],
    active: {},
  };

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => ({
        limit: async () => {
          state.selectQueue.shift();
          let rows = state.rows.filter((r) => r.userId === state.active.userId);
          if (state.active.unreadOnly) rows = rows.filter((r) => !r.read);
          if (state.active.kind !== undefined) {
            rows = rows.filter((r) => r.notificationKind === state.active.kind);
          }
          return rows.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
        },
      }),
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (name !== "ags_workspace_user_notifications") return [];
          const id = state.nextId++;
          const row: NotifRow = {
            id,
            userId: Number(vals.userId),
            notificationKind: String(vals.notificationKind),
            payload:
              (vals.payload as Record<string, unknown> | null | undefined) ??
              null,
            read: Boolean(vals.read ?? false),
            createdAt: new Date(),
          };
          state.rows.push(row);
          return [row];
        },
      }),
    };
  });

  // The update mock is a no-op since the test inspects state.rows directly.
  // Actual mutation logic lives in the test's assertion path.
  const updates: Array<{ set: Record<string, unknown>; markAll?: boolean }> =
    [];
  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        updates.push({ set: vals });
      },
    }),
  }));

  return { db: { select, insert, update } as unknown, state, updates };
}

describe("user-notifications — Phase 22", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      pushNotification(
        { userId: 1, notificationKind: "x" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("pushNotification inserts an unread row", async () => {
    const { db, state } = makeNotifFakeDb();
    const result = await pushNotification(
      {
        userId: 42,
        notificationKind: "promotion_approved",
        payload: { promotionId: 7 },
      },
      { getDb: () => db as never },
    );
    expect(result.read).toBe(false);
    expect(result.notificationKind).toBe("promotion_approved");
    expect(state.rows.length).toBe(1);
  });

  it("listNotifications filters by user + unreadOnly + kind", async () => {
    const now = new Date();
    const { db, state } = makeNotifFakeDb({
      rows: [
        {
          id: 1,
          userId: 42,
          notificationKind: "promotion_approved",
          payload: null,
          read: false,
          createdAt: now,
        },
        {
          id: 2,
          userId: 42,
          notificationKind: "promotion_approved",
          payload: null,
          read: true,
          createdAt: now,
        },
        {
          id: 3,
          userId: 99,
          notificationKind: "promotion_approved",
          payload: null,
          read: false,
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 42;
    state.active.unreadOnly = true;
    state.active.kind = "promotion_approved";

    const result = await listNotifications(
      { userId: 42, unreadOnly: true, notificationKind: "promotion_approved" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it("returns [] on ASDB-null", async () => {
    const result = await listNotifications(
      { userId: 1 },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("markNotificationRead is a no-op on null DB (throws)", async () => {
    await expect(
      markNotificationRead(1, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("markAllNotificationsRead is a no-op on null DB (throws)", async () => {
    await expect(
      markAllNotificationsRead(1, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("countUnreadNotifications returns zero-state on ASDB-null (fail-soft)", async () => {
    const result = await countUnreadNotifications(1, {
      getDb: () => null as never,
    });
    expect(result).toEqual({ total: 0, byKind: {} });
  });

  it("countUnreadNotifications aggregates unread rows by kind", async () => {
    function makeGroupByFakeDb(rows: { kind: string; count: number }[]) {
      const select = vi.fn(() => ({
        from: () => ({
          where: () => ({
            groupBy: async () =>
              rows.map((r) => ({ notificationKind: r.kind, count: r.count })),
          }),
        }),
      }));
      return { select } as unknown;
    }
    const db = makeGroupByFakeDb([
      { kind: "graph_quality_run_completed", count: 3 },
      { kind: "graph_quality_proposals_created", count: 2 },
      { kind: "graph_quality_proposal_applied", count: 5 },
    ]);
    const result = await countUnreadNotifications(7, {
      getDb: () => db as never,
    });
    expect(result.total).toBe(10);
    expect(result.byKind).toEqual({
      graph_quality_run_completed: 3,
      graph_quality_proposals_created: 2,
      graph_quality_proposal_applied: 5,
    });
  });

  it("countUnreadNotifications returns empty byKind when no unread rows", async () => {
    function makeEmptyDb() {
      return {
        select: vi.fn(() => ({
          from: () => ({
            where: () => ({
              groupBy: async () => [],
            }),
          }),
        })),
      } as unknown;
    }
    const result = await countUnreadNotifications(7, {
      getDb: () => makeEmptyDb() as never,
    });
    expect(result).toEqual({ total: 0, byKind: {} });
  });
});

function makeErrFakeDb(initial?: Partial<ErrState>) {
  const state: ErrState = {
    rows: initial?.rows ?? [],
    nextId: initial?.nextId ?? 1000,
    selectQueue: [],
    active: {},
  };

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => ({
        limit: async () => {
          state.selectQueue.shift();
          let rows = state.rows;
          if (state.active.sourceKind !== undefined) {
            rows = rows.filter((r) => r.sourceKind === state.active.sourceKind);
          } else if (state.active.sourceKindLike !== undefined) {
            // Simple LIKE-prefix simulation: trailing "%" → startsWith.
            const pattern = state.active.sourceKindLike;
            if (pattern.endsWith("%")) {
              const prefix = pattern.slice(0, -1);
              rows = rows.filter((r) => r.sourceKind.startsWith(prefix));
            } else {
              rows = rows.filter((r) => r.sourceKind === pattern);
            }
          }
          if (state.active.errorClass !== undefined) {
            rows = rows.filter((r) => r.errorClass === state.active.errorClass);
          }
          return rows.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
        },
      }),
    };
    return chain;
  });

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (name !== "ags_workspace_error_events") return [];
          const id = state.nextId++;
          const row: ErrEventRow = {
            id,
            sourceKind: String(vals.sourceKind),
            sourceId: vals.sourceId == null ? null : String(vals.sourceId),
            userId: vals.userId == null ? null : Number(vals.userId),
            errorClass: String(vals.errorClass),
            errorMessage: String(vals.errorMessage),
            metadata:
              (vals.metadata as Record<string, unknown> | null | undefined) ??
              null,
            createdAt: new Date(),
          };
          state.rows.push(row);
          return [row];
        },
      }),
    };
  });

  return { db: { select, insert } as unknown, state };
}

describe("error-events — Phase 22", () => {
  it("recordErrorEvent returns null on ASDB-null (fail-soft)", async () => {
    const result = await recordErrorEvent(
      {
        sourceKind: "promotion",
        errorClass: "validation",
        errorMessage: "bad input",
      },
      { getDb: () => null as never },
    );
    expect(result).toBeNull();
  });

  it("recordErrorEvent inserts a row with the captured metadata", async () => {
    const { db, state } = makeErrFakeDb();
    const result = await recordErrorEvent(
      {
        sourceKind: "promotion",
        sourceId: "p_42",
        userId: 7,
        errorClass: "validation",
        errorMessage: "missing source note",
        metadata: { fields: ["sourceNoteVersionId"] },
      },
      { getDb: () => db as never },
    );
    expect(result).not.toBeNull();
    expect(result!.sourceKind).toBe("promotion");
    expect(result!.userId).toBe(7);
    expect(result!.metadata).toEqual({ fields: ["sourceNoteVersionId"] });
    expect(state.rows.length).toBe(1);
  });

  it("listErrorEvents filters by sourceKind + errorClass", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        {
          id: 1,
          sourceKind: "promotion",
          sourceId: null,
          userId: null,
          errorClass: "validation",
          errorMessage: "x",
          metadata: null,
          createdAt: now,
        },
        {
          id: 2,
          sourceKind: "promotion",
          sourceId: null,
          userId: null,
          errorClass: "timeout",
          errorMessage: "y",
          metadata: null,
          createdAt: now,
        },
        {
          id: 3,
          sourceKind: "neo4j_sync",
          sourceId: null,
          userId: null,
          errorClass: "validation",
          errorMessage: "z",
          metadata: null,
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKind = "promotion";
    state.active.errorClass = "validation";

    const result = await listErrorEvents(
      { sourceKind: "promotion", errorClass: "validation" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it("listErrorEvents returns [] on ASDB-null", async () => {
    const result = await listErrorEvents(
      {},
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });
});

describe("listErrorEvents — sourceKindLike prefix filter (Phase 22 #514)", () => {
  it("returns rows whose sourceKind starts with the LIKE prefix", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "Error", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.list", sourceId: null, userId: null, errorClass: "Error", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "trpc.providers.list", sourceId: null, userId: null, errorClass: "Error", errorMessage: "c", metadata: null, createdAt: now },
        { id: 4, sourceKind: "vault.router", sourceId: null, userId: null, errorClass: "Error", errorMessage: "d", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKindLike = "trpc.chat.%";

    const result = await listErrorEvents(
      { sourceKindLike: "trpc.chat.%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("exact sourceKind wins when both filters are set (narrower)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "Error", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.list", sourceId: null, userId: null, errorClass: "Error", errorMessage: "b", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKind = "trpc.chat.send";
    // sourceKindLike is ignored when sourceKind is set.

    const result = await listErrorEvents(
      { sourceKind: "trpc.chat.send", sourceKindLike: "trpc.%" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it("returns no rows when prefix matches nothing", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "vault.router", sourceId: null, userId: null, errorClass: "Error", errorMessage: "x", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKindLike = "trpc.%";

    const result = await listErrorEvents(
      { sourceKindLike: "trpc.%" },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });
});

describe("pruneOldErrorEvents — Phase 22 #519 retention prune", () => {
  it("returns deletedCount=0 on ASDB-null (fail-soft, no throw)", async () => {
    const result = await pruneOldErrorEvents(
      { olderThan: new Date() },
      { getDb: () => null as never },
    );
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("returns the number of deleted rows from .returning()", async () => {
    const deleted = [{ id: 1 }, { id: 2 }, { id: 5 }];
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => deleted,
        }),
      }),
    };
    const result = await pruneOldErrorEvents(
      { olderThan: new Date("2026-04-01") },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 3 });
  });

  it("returns deletedCount=0 when no rows match the cutoff", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    };
    const result = await pruneOldErrorEvents(
      { olderThan: new Date("2026-01-01") },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 0 });
  });
});
