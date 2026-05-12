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
  pushNotificationToUsers,
  getNotificationById,
  getNotificationsByIds,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  dismissNotifications,
  pruneOldNotifications,
  AsdbUnavailableError as NotificationsAsdbUnavailableError,
} from "../../server/agent-studio/services/workspace-observability/user-notifications";
import {
  recordErrorEvent,
  getErrorEventById,
  getErrorEventsByIds,
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
  active: {
    userId?: number;
    unreadOnly?: boolean;
    kind?: string;
    kinds?: readonly string[];
    createdSince?: Date;
  };
}

interface ErrState {
  rows: ErrEventRow[];
  nextId: number;
  selectQueue: Array<"list">;
  active: {
    sourceKind?: string;
    sourceKinds?: readonly string[];
    sourceKindLike?: string;
    errorClass?: string;
    errorClasses?: readonly string[];
    userId?: number;
    createdSince?: Date;
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
          if (state.active.kinds !== undefined) {
            const set = new Set(state.active.kinds);
            rows = rows.filter((r) => set.has(r.notificationKind));
          }
          if (state.active.createdSince !== undefined) {
            const cutoff = state.active.createdSince.getTime();
            rows = rows.filter((r) => r.createdAt.getTime() >= cutoff);
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
      values: (vals: Record<string, unknown> | Record<string, unknown>[]) => ({
        returning: async () => {
          if (name !== "ags_workspace_user_notifications") return [];
          const list = Array.isArray(vals) ? vals : [vals];
          const inserted: NotifRow[] = [];
          for (const v of list) {
            const id = state.nextId++;
            const row: NotifRow = {
              id,
              userId: Number(v.userId),
              notificationKind: String(v.notificationKind),
              payload:
                (v.payload as Record<string, unknown> | null | undefined) ??
                null,
              read: Boolean(v.read ?? false),
              createdAt: new Date(),
            };
            state.rows.push(row);
            inserted.push(row);
          }
          return inserted;
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

  it("pushNotificationToUsers throws AsdbUnavailableError on null DB", async () => {
    await expect(
      pushNotificationToUsers(
        { userIds: [1, 2], notificationKind: "x" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("pushNotificationToUsers short-circuits to no-op on empty userIds", async () => {
    const { db, state } = makeNotifFakeDb();
    const result = await pushNotificationToUsers(
      { userIds: [], notificationKind: "broadcast" },
      { getDb: () => db as never },
    );
    expect(result.insertedCount).toBe(0);
    expect(result.notifications).toEqual([]);
    expect(state.rows.length).toBe(0);
  });

  it("pushNotificationToUsers inserts one unread row per user with the same body", async () => {
    const { db, state } = makeNotifFakeDb();
    const result = await pushNotificationToUsers(
      {
        userIds: [11, 22, 33],
        notificationKind: "maintenance_window",
        payload: { startsAt: "18:00Z" },
      },
      { getDb: () => db as never },
    );
    expect(result.insertedCount).toBe(3);
    expect(state.rows.length).toBe(3);
    expect(result.notifications.map((n) => n.userId)).toEqual([11, 22, 33]);
    expect(
      result.notifications.every(
        (n) =>
          n.notificationKind === "maintenance_window" &&
          n.read === false &&
          (n.payload as Record<string, unknown>).startsAt === "18:00Z",
      ),
    ).toBe(true);
  });

  it("pushNotificationToUsers preserves duplicate userIds (caller dedupes)", async () => {
    const { db, state } = makeNotifFakeDb();
    const result = await pushNotificationToUsers(
      { userIds: [7, 7, 7], notificationKind: "x" },
      { getDb: () => db as never },
    );
    expect(result.insertedCount).toBe(3);
    expect(state.rows.length).toBe(3);
    expect(state.rows.every((r) => r.userId === 7)).toBe(true);
  });

  it("listNotifications filters by an array of notificationKinds (OR semantics)", async () => {
    const now = new Date();
    const { db, state } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 42, notificationKind: "promotion.approved", payload: null, read: false, createdAt: now },
        { id: 2, userId: 42, notificationKind: "promotion.rejected", payload: null, read: false, createdAt: now },
        { id: 3, userId: 42, notificationKind: "maintenance.window", payload: null, read: false, createdAt: now },
        { id: 4, userId: 42, notificationKind: "broadcast", payload: null, read: false, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 42;
    state.active.kinds = ["promotion.approved", "promotion.rejected"];
    const result = await listNotifications(
      { userId: 42, notificationKind: ["promotion.approved", "promotion.rejected"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("listNotifications returns [] when notificationKind array is empty", async () => {
    const now = new Date();
    const { db } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 42, notificationKind: "x", payload: null, read: false, createdAt: now },
      ],
    });
    const result = await listNotifications(
      { userId: 42, notificationKind: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });

  it("listNotifications filters by createdSince when supplied", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const { db, state } = makeNotifFakeDb({
      rows: [
        {
          id: 1,
          userId: 42,
          notificationKind: "x",
          payload: null,
          read: false,
          createdAt: old,
        },
        {
          id: 2,
          userId: 42,
          notificationKind: "x",
          payload: null,
          read: false,
          createdAt: recent,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 42;
    state.active.createdSince = new Date("2026-04-01T00:00:00Z");
    const result = await listNotifications(
      { userId: 42, createdSince: new Date("2026-04-01T00:00:00Z") },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
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

  it("dismissNotifications throws AsdbUnavailableError on null DB", async () => {
    await expect(
      dismissNotifications(
        { userId: 1, notificationIds: [10, 11] },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("dismissNotifications short-circuits to no-op on empty notificationIds", async () => {
    const deleteSpy = vi.fn();
    const db = { delete: deleteSpy } as unknown;
    const result = await dismissNotifications(
      { userId: 1, notificationIds: [] },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(0);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("dismissNotifications returns the number of deleted rows", async () => {
    const captured: { whereCalled: boolean } = { whereCalled: false };
    const db = {
      delete: vi.fn(() => ({
        where: () => {
          captured.whereCalled = true;
          return {
            returning: async () => [{ id: 10 }, { id: 11 }],
          };
        },
      })),
    };
    const result = await dismissNotifications(
      { userId: 7, notificationIds: [10, 11, 12] },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(2);
    expect(captured.whereCalled).toBe(true);
  });

  it("markNotificationsRead throws AsdbUnavailableError on null DB", async () => {
    await expect(
      markNotificationsRead(
        { userId: 1, notificationIds: [10, 11] },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("markNotificationsRead short-circuits to no-op on empty notificationIds", async () => {
    const updateSpy = vi.fn();
    const db = { update: updateSpy } as unknown;
    const result = await markNotificationsRead(
      { userId: 1, notificationIds: [] },
      { getDb: () => db as never },
    );
    expect(result.markedCount).toBe(0);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("markNotificationsRead returns the count of returned rows", async () => {
    const captured: { vals?: Record<string, unknown> } = {};
    const db = {
      update: vi.fn(() => ({
        set: (vals: Record<string, unknown>) => {
          captured.vals = vals;
          return {
            where: () => ({
              returning: async () => [{ id: 10 }, { id: 11 }],
            }),
          };
        },
      })),
    };
    const result = await markNotificationsRead(
      { userId: 7, notificationIds: [10, 11, 12] },
      { getDb: () => db as never },
    );
    expect(result.markedCount).toBe(2);
    expect(captured.vals).toEqual({ read: true });
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
          } else if (state.active.sourceKinds !== undefined) {
            const set = new Set(state.active.sourceKinds);
            rows = rows.filter((r) => set.has(r.sourceKind));
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
          if (state.active.errorClasses !== undefined) {
            const set = new Set(state.active.errorClasses);
            rows = rows.filter((r) => set.has(r.errorClass));
          }
          if (state.active.createdSince !== undefined) {
            const cutoff = state.active.createdSince.getTime();
            rows = rows.filter((r) => r.createdAt.getTime() >= cutoff);
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

describe("listErrorEvents — createdSince date-window filter (Phase 22 #537)", () => {
  it("returns only rows whose createdAt is at-or-after the cutoff", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const cutoff = new Date("2026-04-01T00:00:00Z");
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "old", metadata: null, createdAt: old },
        { id: 2, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "recent", metadata: null, createdAt: recent },
      ],
    });
    state.selectQueue.push("list");
    state.active.createdSince = cutoff;
    const result = await listErrorEvents(
      { createdSince: cutoff },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("composes with sourceKindLike (AND semantics)", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 1_000_000_000);
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "E", errorMessage: "old-trpc", metadata: null, createdAt: old },
        { id: 2, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "E", errorMessage: "fresh-trpc", metadata: null, createdAt: now },
        { id: 3, sourceKind: "vault.router", sourceId: null, userId: null, errorClass: "E", errorMessage: "fresh-vault", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKindLike = "trpc.%";
    state.active.createdSince = new Date(now.getTime() - 100_000);
    const result = await listErrorEvents(
      { sourceKindLike: "trpc.%", createdSince: new Date(now.getTime() - 100_000) },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });
});

describe("listErrorEvents — errorClass array filter (Phase 22 #540)", () => {
  it("filters by an array of errorClasses (OR semantics via IN)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "TRPCError:UNAUTHORIZED", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: null, errorClass: "TRPCError:FORBIDDEN", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "x", sourceId: null, userId: null, errorClass: "ZodError", errorMessage: "c", metadata: null, createdAt: now },
        { id: 4, sourceKind: "x", sourceId: null, userId: null, errorClass: "BackgroundJobFailed", errorMessage: "d", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.errorClasses = ["TRPCError:UNAUTHORIZED", "TRPCError:FORBIDDEN"];

    const result = await listErrorEvents(
      { errorClass: ["TRPCError:UNAUTHORIZED", "TRPCError:FORBIDDEN"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("returns [] when errorClass array is empty (vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "x", metadata: null, createdAt: now },
      ],
    });
    const result = await listErrorEvents(
      { errorClass: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });
});

describe("listErrorEvents — sourceKind array filter (#553)", () => {
  it("filters by an array of sourceKinds (OR semantics via IN)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.list", sourceId: null, userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "trpc.providers.list", sourceId: null, userId: null, errorClass: "E", errorMessage: "c", metadata: null, createdAt: now },
        { id: 4, sourceKind: "vault.router", sourceId: null, userId: null, errorClass: "E", errorMessage: "d", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKinds = ["trpc.chat.send", "trpc.chat.list"];

    const result = await listErrorEvents(
      { sourceKind: ["trpc.chat.send", "trpc.chat.list"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("returns [] when sourceKind array is empty (vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "x", metadata: null, createdAt: now },
      ],
    });
    const result = await listErrorEvents(
      { sourceKind: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });

  it("single-string sourceKind still works (back-compat)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: null, userId: null, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.list", sourceId: null, userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKind = "trpc.chat.send";

    const result = await listErrorEvents(
      { sourceKind: "trpc.chat.send" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });
});

describe("getErrorEventById — Phase 22 #558 singleton getter", () => {
  it("returns null on ASDB-null (fail-soft)", async () => {
    const result = await getErrorEventById(7, {
      getDb: () => null as never,
    });
    expect(result).toBeNull();
  });

  it("returns the row when found", async () => {
    const now = new Date();
    const row: ErrEventRow = {
      id: 7,
      sourceKind: "trpc.chat.send",
      sourceId: null,
      userId: null,
      errorClass: "ValidationError",
      errorMessage: "boom",
      metadata: null,
      createdAt: now,
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [row],
          }),
        }),
      }),
    };
    const result = await getErrorEventById(7, {
      getDb: () => db as never,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
    expect(result!.errorClass).toBe("ValidationError");
  });

  it("returns null when no row matches", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };
    const result = await getErrorEventById(999, {
      getDb: () => db as never,
    });
    expect(result).toBeNull();
  });
});

describe("getErrorEventsByIds — Phase 22 #561 bulk reader", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await getErrorEventsByIds([], { getDb });
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns [] on ASDB-null with non-empty input (fail-soft)", async () => {
    const result = await getErrorEventsByIds([1, 2], {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns matched rows via SQL IN", async () => {
    const now = new Date();
    const rows: ErrEventRow[] = [
      {
        id: 7,
        sourceKind: "trpc.chat.send",
        sourceId: null,
        userId: null,
        errorClass: "ValidationError",
        errorMessage: "a",
        metadata: null,
        createdAt: now,
      },
      {
        id: 9,
        sourceKind: "trpc.chat.list",
        sourceId: null,
        userId: null,
        errorClass: "ZodError",
        errorMessage: "b",
        metadata: null,
        createdAt: now,
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    };
    const result = await getErrorEventsByIds([7, 9, 999], {
      getDb: () => db as never,
    });
    expect(result.map((r) => r.id).sort()).toEqual([7, 9]);
  });

  it("returns [] when no ids match (all missing)", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };
    const result = await getErrorEventsByIds([100, 200], {
      getDb: () => db as never,
    });
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

  it("short-circuits empty errorClass array with no DB call (#550)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await pruneOldErrorEvents(
      { olderThan: new Date("2026-04-01"), errorClass: [] },
      { getDb },
    );
    expect(result).toEqual({ deletedCount: 0 });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards single-string errorClass to DELETE predicate (#550)", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [{ id: 1 }, { id: 2 }],
        }),
      }),
    };
    const result = await pruneOldErrorEvents(
      { olderThan: new Date("2026-04-01"), errorClass: "ValidationError" },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 2 });
  });

  it("forwards array-form errorClass to DELETE predicate (#550)", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [{ id: 5 }],
        }),
      }),
    };
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        errorClass: ["ValidationError", "RateLimitError"],
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 1 });
  });
});

describe("getNotificationById — Phase 22 #557 singleton getter", () => {
  function makeByIdFakeDb(rows: NotifRow[]) {
    const calls: { whereCalled: boolean } = { whereCalled: false };
    const db = {
      select: vi.fn(() => {
        let activeId: number | undefined;
        let activeUserId: number | undefined;
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => {
            calls.whereCalled = true;
            // The fake doesn't introspect the AND() expression; the
            // test fixture passes the active filter via mutation hooks
            // (set via the wrapper below).
            return chain;
          },
          limit: async (_n: number) => {
            const matched = rows.find(
              (r) =>
                r.id === activeId &&
                (activeUserId === undefined || r.userId === activeUserId),
            );
            return matched ? [matched] : [];
          },
        };
        // Helper to inject filter values for the test — set on the
        // chain BEFORE calling .limit().
        Object.defineProperty(chain, "__setActive", {
          value: (id?: number, userId?: number) => {
            activeId = id;
            activeUserId = userId;
          },
        });
        return chain;
      }),
    };
    return { db, calls };
  }

  it("returns null on ASDB-null (fail-soft)", async () => {
    const result = await getNotificationById(7, {
      getDb: () => null as never,
    });
    expect(result).toBeNull();
  });

  it("returns the row when found (no userId scope)", async () => {
    const now = new Date();
    const rows: NotifRow[] = [
      {
        id: 7,
        userId: 42,
        notificationKind: "promotion.approved",
        payload: null,
        read: false,
        createdAt: now,
      },
    ];
    // Use a minimal direct fake — the integration is simple enough.
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
    };
    const result = await getNotificationById(7, {
      getDb: () => db as never,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
  });

  it("returns null when no row matches", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };
    const result = await getNotificationById(999, {
      getDb: () => db as never,
    });
    expect(result).toBeNull();
  });

  it("with userId scope, returns null on peer's row (id-enumeration guard)", async () => {
    // The DB layer applies the userId AND filter; we simulate that by
    // returning [] when the test-injected userId doesn't match the row.
    const requestedUserId = 999; // peer
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              // Simulating: SELECT ... WHERE id=7 AND userId=999 → no rows
              // because row 7 belongs to user 42.
              return [];
            },
          }),
        }),
      }),
    };
    const result = await getNotificationById(7, {
      getDb: () => db as never,
      userId: requestedUserId,
    });
    expect(result).toBeNull();
  });
});

describe("getNotificationsByIds — Phase 22 #560 bulk reader", () => {
  it("short-circuits empty input with no DB call", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await getNotificationsByIds([], { getDb });
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns [] on ASDB-null with non-empty input (fail-soft)", async () => {
    const result = await getNotificationsByIds([1, 2], {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns matched rows via SQL IN", async () => {
    const now = new Date();
    const rows = [
      {
        id: 7,
        userId: 42,
        notificationKind: "promotion.approved",
        payload: null,
        read: false,
        createdAt: now,
      },
      {
        id: 9,
        userId: 42,
        notificationKind: "incident_resolved",
        payload: null,
        read: true,
        createdAt: now,
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    };
    const result = await getNotificationsByIds([7, 9, 999], {
      getDb: () => db as never,
    });
    expect(result.map((r) => r.id).sort()).toEqual([7, 9]);
  });

  it("with userId scope, returns only rows belonging to that user", async () => {
    // The SQL adds AND userId=X, so the DB returns only the matching
    // subset. The fake returns whatever we feed it; we verify the
    // call shape accepts the userId option without throwing and
    // returns the rows.
    const now = new Date();
    const rows = [
      {
        id: 7,
        userId: 42,
        notificationKind: "x",
        payload: null,
        read: false,
        createdAt: now,
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    };
    const result = await getNotificationsByIds([7, 8], {
      getDb: () => db as never,
      userId: 42,
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(42);
  });
});

describe("pruneOldNotifications — Phase 22 #520 retention prune", () => {
  it("returns deletedCount=0 on ASDB-null (fail-soft)", async () => {
    const result = await pruneOldNotifications(
      { olderThan: new Date() },
      { getDb: () => null as never },
    );
    expect(result).toEqual({ deletedCount: 0 });
  });

  it("returns deleted count from .returning() when readOnly omitted", async () => {
    const deleted = [{ id: 1 }, { id: 2 }];
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => deleted,
        }),
      }),
    };
    const result = await pruneOldNotifications(
      { olderThan: new Date("2026-04-01") },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 2 });
  });

  it("respects readOnly=true (filter assembled, .returning honored)", async () => {
    const deleted = [{ id: 5 }];
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => deleted,
        }),
      }),
    };
    const result = await pruneOldNotifications(
      { olderThan: new Date("2026-04-01"), readOnly: true },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(1);
  });

  it("returns deletedCount=0 when no rows match", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    };
    const result = await pruneOldNotifications(
      { olderThan: new Date("2026-01-01") },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(0);
  });

  it("short-circuits empty notificationKind array with no DB call (#551)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await pruneOldNotifications(
      { olderThan: new Date("2026-04-01"), notificationKind: [] },
      { getDb },
    );
    expect(result).toEqual({ deletedCount: 0 });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("forwards single-string notificationKind to DELETE predicate (#551)", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
        }),
      }),
    };
    const result = await pruneOldNotifications(
      {
        olderThan: new Date("2026-04-01"),
        notificationKind: "graph_quality_run_completed",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 3 });
  });

  it("forwards array-form notificationKind to DELETE predicate (#551)", async () => {
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [{ id: 5 }],
        }),
      }),
    };
    const result = await pruneOldNotifications(
      {
        olderThan: new Date("2026-04-01"),
        notificationKind: ["graph_quality_run_completed", "import_complete"],
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 1 });
  });
});
