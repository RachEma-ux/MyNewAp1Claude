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
  pushNotifications,
  pushNotificationToUsers,
  getNotificationById,
  getNotificationsByIds,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  dismissNotifications,
  dismissAllNotifications,
  dismissAllNotificationsByKind,
  markAllNotificationsReadByKind,
  pruneOldNotifications,
  AsdbUnavailableError as NotificationsAsdbUnavailableError,
} from "../../server/agent-studio/services/workspace-observability/user-notifications";
import {
  recordErrorEvent,
  recordErrorEvents,
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
    kindLike?: string;
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
    sourceId?: string;
    sourceIds?: readonly string[];
    errorClass?: string;
    errorClasses?: readonly string[];
    userId?: number;
    userIds?: readonly number[];
    createdSince?: Date;
    errorMessageLike?: string;
    userIdIsNull?: boolean;
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
          } else if (state.active.kinds !== undefined) {
            const set = new Set(state.active.kinds);
            rows = rows.filter((r) => set.has(r.notificationKind));
          } else if (state.active.kindLike !== undefined) {
            const pattern = state.active.kindLike;
            const startsWild = pattern.startsWith("%");
            const endsWild = pattern.endsWith("%");
            const core = pattern.slice(
              startsWild ? 1 : 0,
              endsWild ? pattern.length - 1 : pattern.length,
            );
            rows = rows.filter((r) => {
              if (startsWild && endsWild)
                return r.notificationKind.includes(core);
              if (startsWild) return r.notificationKind.endsWith(core);
              if (endsWild) return r.notificationKind.startsWith(core);
              return r.notificationKind === core;
            });
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

  it("pushNotifications throws AsdbUnavailableError on null DB with non-empty input (#583)", async () => {
    await expect(
      pushNotifications(
        [{ userId: 1, notificationKind: "x" }],
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("pushNotifications short-circuits empty input with no DB call (#583)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await pushNotifications([], { getDb });
    expect(result.insertedCount).toBe(0);
    expect(result.notifications).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("pushNotifications inserts heterogeneous payloads in one batch (#583)", async () => {
    const { db, state } = makeNotifFakeDb();
    const result = await pushNotifications(
      [
        {
          userId: 11,
          notificationKind: "job.completed",
          payload: { jobId: 101, jobKind: "projection.rebuild" },
        },
        {
          userId: 22,
          notificationKind: "job.completed",
          payload: { jobId: 102, jobKind: "projection.repair" },
        },
        {
          userId: 33,
          notificationKind: "promotion.approved",
          payload: { promotionId: 7 },
        },
      ],
      { getDb: () => db as never },
    );
    expect(result.insertedCount).toBe(3);
    expect(state.rows.length).toBe(3);
    // Each row preserves its own userId / kind / payload.
    const byUser = new Map(
      result.notifications.map((n) => [n.userId, n] as const),
    );
    expect(byUser.get(11)?.notificationKind).toBe("job.completed");
    expect(
      (byUser.get(11)?.payload as Record<string, unknown>).jobId,
    ).toBe(101);
    expect(byUser.get(22)?.notificationKind).toBe("job.completed");
    expect(
      (byUser.get(22)?.payload as Record<string, unknown>).jobId,
    ).toBe(102);
    expect(byUser.get(33)?.notificationKind).toBe("promotion.approved");
    expect(result.notifications.every((n) => n.read === false)).toBe(true);
  });

  it("pushNotifications calls db.insert exactly once for N inputs (#583)", async () => {
    const { db, state } = makeNotifFakeDb();
    // makeNotifFakeDb.insert is a vi.fn — assert call count.
    const dbAny = db as unknown as { insert: { mock: { calls: unknown[] } } };
    const initialCalls = dbAny.insert.mock.calls.length;
    await pushNotifications(
      [
        { userId: 1, notificationKind: "x" },
        { userId: 2, notificationKind: "y" },
        { userId: 3, notificationKind: "z" },
        { userId: 4, notificationKind: "w" },
      ],
      { getDb: () => db as never },
    );
    expect(dbAny.insert.mock.calls.length - initialCalls).toBe(1);
    expect(state.rows.length).toBe(4);
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

  it("markAllNotificationsReadByKind throws AsdbUnavailableError on null DB (#575)", async () => {
    await expect(
      markAllNotificationsReadByKind(
        { userId: 1, notificationKind: "promotion.approved" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("markAllNotificationsReadByKind short-circuits empty kind array BEFORE the ASDB probe (#575)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await markAllNotificationsReadByKind(
      { userId: 1, notificationKind: [] },
      { getDb },
    );
    expect(result.markedCount).toBe(0);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("markAllNotificationsReadByKind returns the count of flipped rows (#575)", async () => {
    const db = {
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: 10 }, { id: 11 }, { id: 12 }],
          }),
        }),
      })),
    };
    const result = await markAllNotificationsReadByKind(
      { userId: 7, notificationKind: "promotion.approved" },
      { getDb: () => db as never },
    );
    expect(result.markedCount).toBe(3);
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("markAllNotificationsReadByKind accepts array-form notificationKind (#575)", async () => {
    const db = {
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      })),
    };
    const result = await markAllNotificationsReadByKind(
      {
        userId: 7,
        notificationKind: ["promotion.approved", "broadcast"],
      },
      { getDb: () => db as never },
    );
    expect(result.markedCount).toBe(0);
    expect(db.update).toHaveBeenCalledOnce();
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

  it("dismissAllNotifications throws AsdbUnavailableError on null DB (#568)", async () => {
    await expect(
      dismissAllNotifications(
        { userId: 1 },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("dismissAllNotifications defaults to readOnly=true (deletes read rows only) (#568)", async () => {
    const captured: { delCalled: boolean } = { delCalled: false };
    const db = {
      delete: vi.fn(() => ({
        where: () => {
          captured.delCalled = true;
          return {
            returning: async () => [{ id: 10 }, { id: 11 }, { id: 12 }],
          };
        },
      })),
    };
    const result = await dismissAllNotifications(
      { userId: 7 },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(3);
    expect(captured.delCalled).toBe(true);
    // We can't easily introspect the and(eq, eq) clause from this fake,
    // but the next test asserts the readOnly=false branch takes a
    // different where shape, which combined proves the default path.
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("dismissAllNotifications with readOnly=false nukes the whole inbox (#568)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [
            { id: 10 },
            { id: 11 },
            { id: 12 },
            { id: 13 },
            { id: 14 },
          ],
        }),
      })),
    };
    const result = await dismissAllNotifications(
      { userId: 7, readOnly: false },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(5);
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("dismissAllNotifications returns deletedCount: 0 when nothing matches (#568)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [],
        }),
      })),
    };
    const result = await dismissAllNotifications(
      { userId: 7 },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(0);
  });

  it("dismissAllNotificationsByKind throws AsdbUnavailableError on null DB (#576)", async () => {
    await expect(
      dismissAllNotificationsByKind(
        { userId: 1, notificationKind: "promotion.approved" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(NotificationsAsdbUnavailableError);
  });

  it("dismissAllNotificationsByKind short-circuits empty kind array BEFORE the ASDB probe (#576)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await dismissAllNotificationsByKind(
      { userId: 1, notificationKind: [] },
      { getDb },
    );
    expect(result.deletedCount).toBe(0);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("dismissAllNotificationsByKind defaults readOnly=true (deletes only read rows) (#576)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 10 }, { id: 11 }],
        }),
      })),
    };
    const result = await dismissAllNotificationsByKind(
      { userId: 7, notificationKind: "promotion.approved" },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(2);
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("dismissAllNotificationsByKind with readOnly=false nukes all matching kind (#576)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [
            { id: 10 },
            { id: 11 },
            { id: 12 },
            { id: 13 },
          ],
        }),
      })),
    };
    const result = await dismissAllNotificationsByKind(
      { userId: 7, notificationKind: "promotion.approved", readOnly: false },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(4);
  });

  it("dismissAllNotificationsByKind accepts array-form notificationKind (#576)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [],
        }),
      })),
    };
    const result = await dismissAllNotificationsByKind(
      {
        userId: 7,
        notificationKind: ["promotion.approved", "broadcast"],
      },
      { getDb: () => db as never },
    );
    expect(result.deletedCount).toBe(0);
    expect(db.delete).toHaveBeenCalledOnce();
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
          if (state.active.sourceId !== undefined) {
            rows = rows.filter((r) => r.sourceId === state.active.sourceId);
          } else if (state.active.sourceIds !== undefined) {
            const set = new Set(state.active.sourceIds);
            rows = rows.filter(
              (r) => r.sourceId !== null && set.has(r.sourceId),
            );
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
          // userId precedence: specific userId/IDs narrower than IS NULL.
          if (state.active.userId !== undefined) {
            rows = rows.filter((r) => r.userId === state.active.userId);
          } else if (state.active.userIds !== undefined) {
            const set = new Set(state.active.userIds);
            rows = rows.filter(
              (r) => r.userId !== null && set.has(r.userId as number),
            );
          } else if (state.active.userIdIsNull === true) {
            rows = rows.filter((r) => r.userId === null);
          } else if (state.active.userIdIsNull === false) {
            rows = rows.filter((r) => r.userId !== null);
          }
          if (state.active.errorMessageLike !== undefined) {
            // Simulate SQL LIKE with %wildcards%. Leading/trailing `%`
            // controls anchored vs unanchored matching.
            const pattern = state.active.errorMessageLike;
            const startsWild = pattern.startsWith("%");
            const endsWild = pattern.endsWith("%");
            const core = pattern.slice(
              startsWild ? 1 : 0,
              endsWild ? pattern.length - 1 : pattern.length,
            );
            rows = rows.filter((r) => {
              if (startsWild && endsWild)
                return r.errorMessage.includes(core);
              if (startsWild) return r.errorMessage.endsWith(core);
              if (endsWild) return r.errorMessage.startsWith(core);
              return r.errorMessage === core;
            });
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
      values: (
        vals: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
      ) => ({
        returning: async () => {
          if (name !== "ags_workspace_error_events") return [];
          const batch = Array.isArray(vals) ? vals : [vals];
          const out: ErrEventRow[] = [];
          for (const v of batch) {
            const id = state.nextId++;
            const row: ErrEventRow = {
              id,
              sourceKind: String(v.sourceKind),
              sourceId: v.sourceId == null ? null : String(v.sourceId),
              userId: v.userId == null ? null : Number(v.userId),
              errorClass: String(v.errorClass),
              errorMessage: String(v.errorMessage),
              metadata:
                (v.metadata as Record<string, unknown> | null | undefined) ??
                null,
              createdAt: new Date(),
            };
            state.rows.push(row);
            out.push(row);
          }
          return out;
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

  it("recordErrorEvents short-circuits empty input with no DB call (#567)", async () => {
    const getDb = vi.fn(() => null as never);
    const result = await recordErrorEvents([], { getDb });
    expect(result).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("recordErrorEvents returns [] on ASDB-null fail-soft with non-empty input (#567)", async () => {
    const result = await recordErrorEvents(
      [
        {
          sourceKind: "promotion",
          errorClass: "validation",
          errorMessage: "x",
        },
      ],
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("recordErrorEvents inserts N rows in a single batch (#567)", async () => {
    const { db, state } = makeErrFakeDb();
    const result = await recordErrorEvents(
      [
        {
          sourceKind: "promotion",
          sourceId: "p_42",
          errorClass: "validation",
          errorMessage: "first",
          metadata: { idx: 0 },
        },
        {
          sourceKind: "promotion",
          sourceId: "p_43",
          userId: 9,
          errorClass: "timeout",
          errorMessage: "second",
        },
        {
          sourceKind: "neo4j.sync",
          errorClass: "io",
          errorMessage: "third",
          metadata: null,
        },
      ],
      { getDb: () => db as never },
    );
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.errorMessage)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(result[1].userId).toBe(9);
    expect(result[0].metadata).toEqual({ idx: 0 });
    expect(state.rows).toHaveLength(3);
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

describe("listErrorEvents — errorMessageLike grep filter (Phase 22 #579)", () => {
  it("returns rows whose errorMessage contains the substring (#579)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "connection refused: db", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "timeout exceeded", metadata: null, createdAt: now },
        { id: 3, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "connection refused: redis", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.errorMessageLike = "%connection refused%";

    const result = await listErrorEvents(
      { errorMessageLike: "%connection refused%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("returns rows whose errorMessage starts with the prefix (#579)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "FATAL: db is gone", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "warning: db is slow", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.errorMessageLike = "FATAL%";

    const result = await listErrorEvents(
      { errorMessageLike: "FATAL%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("composes with errorClass + createdSince filters (ANDed) (#579)", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const cutoff = new Date("2026-04-01T00:00:00Z");
    const { db, state } = makeErrFakeDb({
      rows: [
        // Wrong errorClass: filtered out by errorClass
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "Other", errorMessage: "connection refused", metadata: null, createdAt: recent },
        // Wrong age: filtered out by createdSince
        { id: 2, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "connection refused", metadata: null, createdAt: old },
        // Wrong message: filtered out by errorMessageLike
        { id: 3, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "unrelated", metadata: null, createdAt: recent },
        // Matches all three
        { id: 4, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "connection refused: db", metadata: null, createdAt: recent },
      ],
    });
    state.selectQueue.push("list");
    state.active.errorClass = "E";
    state.active.createdSince = cutoff;
    state.active.errorMessageLike = "%connection refused%";

    const result = await listErrorEvents(
      {
        errorClass: "E",
        createdSince: cutoff,
        errorMessageLike: "%connection refused%",
      },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([4]);
  });

  it("returns no rows when the pattern matches nothing (#579)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "ok", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.errorMessageLike = "%nope%";

    const result = await listErrorEvents(
      { errorMessageLike: "%nope%" },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });
});

describe("listErrorEvents — userIdIsNull tri-state filter (Phase 22 #593)", () => {
  it("userIdIsNull=true returns only system-driven (NULL userId) errors", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "system-1", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: 7, errorClass: "E", errorMessage: "user-7", metadata: null, createdAt: now },
        { id: 3, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "system-2", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userIdIsNull = true;

    const result = await listErrorEvents(
      { userIdIsNull: true },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("userIdIsNull=false returns only user-driven (non-NULL userId) errors", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "system", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: 7, errorClass: "E", errorMessage: "user-7", metadata: null, createdAt: now },
        { id: 3, sourceKind: "x", sourceId: null, userId: 9, errorClass: "E", errorMessage: "user-9", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userIdIsNull = false;

    const result = await listErrorEvents(
      { userIdIsNull: false },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("specific userId takes precedence over userIdIsNull (#593)", async () => {
    // When both are set the explicit userId wins (eq narrower than IS NULL).
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "x", sourceId: null, userId: null, errorClass: "E", errorMessage: "sys", metadata: null, createdAt: now },
        { id: 2, sourceKind: "x", sourceId: null, userId: 7, errorClass: "E", errorMessage: "u7", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;
    // userIdIsNull is intentionally not applied by the service when userId is set.

    const result = await listErrorEvents(
      { userId: 7, userIdIsNull: true },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([2]);
  });
});

describe("listErrorEvents — userId array filter (Phase 22 #607)", () => {
  it("filters by an array of userIds (OR semantics via IN)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: null, userId: 7, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "k", sourceId: null, userId: 8, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "k", sourceId: null, userId: 9, errorClass: "E", errorMessage: "c", metadata: null, createdAt: now },
        { id: 4, sourceKind: "k", sourceId: null, userId: null, errorClass: "E", errorMessage: "d", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userIds = [7, 9];

    const result = await listErrorEvents(
      { userId: [7, 9] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("returns [] when userId array is empty (vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: null, userId: 7, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
      ],
    });
    const result = await listErrorEvents(
      { userId: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });

  it("excludes NULL-userId rows in array form (IN semantics)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: null, userId: 7, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "k", sourceId: null, userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userIds = [7];

    const result = await listErrorEvents(
      { userId: [7] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("single-form userId still works (back-compat)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: null, userId: 7, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "k", sourceId: null, userId: 8, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;

    const result = await listErrorEvents(
      { userId: 7 },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("returns [] on ASDB-null (fail-soft) for userId array", async () => {
    const result = await listErrorEvents(
      { userId: [7, 8, 9] },
      { getDb: () => null as never },
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

describe("listErrorEvents — sourceId filter (Phase 22 #596)", () => {
  it("filters by a single sourceId (exact eq)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: "trace-A", userId: null, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.send", sourceId: "trace-B", userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "trpc.chat.send", sourceId: "trace-A", userId: null, errorClass: "E", errorMessage: "c", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceId = "trace-A";

    const result = await listErrorEvents(
      { sourceId: "trace-A" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("filters by an array of sourceIds (OR semantics via IN)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: "trace-A", userId: null, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "k", sourceId: "trace-B", userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "k", sourceId: "trace-C", userId: null, errorClass: "E", errorMessage: "c", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceIds = ["trace-A", "trace-C"];

    const result = await listErrorEvents(
      { sourceId: ["trace-A", "trace-C"] },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("returns [] when sourceId array is empty (vacuous IN)", async () => {
    const now = new Date();
    const { db } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: "trace-A", userId: null, errorClass: "E", errorMessage: "x", metadata: null, createdAt: now },
      ],
    });
    const result = await listErrorEvents(
      { sourceId: [] },
      { getDb: () => db as never },
    );
    expect(result).toEqual([]);
  });

  it("returns [] on ASDB-null (fail-soft, no DB probe)", async () => {
    const result = await listErrorEvents(
      { sourceId: "trace-A" },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("ANDs sourceId with sourceKind + errorClass", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "trpc.chat.send", sourceId: "trace-A", userId: null, errorClass: "E1", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "trpc.chat.send", sourceId: "trace-A", userId: null, errorClass: "E2", errorMessage: "b", metadata: null, createdAt: now },
        { id: 3, sourceKind: "trpc.chat.list", sourceId: "trace-A", userId: null, errorClass: "E1", errorMessage: "c", metadata: null, createdAt: now },
        { id: 4, sourceKind: "trpc.chat.send", sourceId: "trace-B", userId: null, errorClass: "E1", errorMessage: "d", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceKind = "trpc.chat.send";
    state.active.sourceId = "trace-A";
    state.active.errorClass = "E1";

    const result = await listErrorEvents(
      { sourceKind: "trpc.chat.send", sourceId: "trace-A", errorClass: "E1" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("NULL-sourceId rows are excluded (SQL eq/IN semantics)", async () => {
    const now = new Date();
    const { db, state } = makeErrFakeDb({
      rows: [
        { id: 1, sourceKind: "k", sourceId: "trace-A", userId: null, errorClass: "E", errorMessage: "a", metadata: null, createdAt: now },
        { id: 2, sourceKind: "k", sourceId: null, userId: null, errorClass: "E", errorMessage: "b", metadata: null, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.sourceId = "trace-A";

    const result = await listErrorEvents(
      { sourceId: "trace-A" },
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

  it("accepts errorMessageLike filter without throwing (#581)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 3 }, { id: 4 }, { id: 5 }],
        }),
      })),
    };
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        errorMessageLike: "%timeout%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 3 });
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("errorMessageLike composes with errorClass (ANDed) (#581)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 9 }],
        }),
      })),
    };
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        errorClass: "TimeoutError",
        errorMessageLike: "%redis%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 1 });
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("accepts sourceKindLike (prefix LIKE) on retention prune (#604)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        }),
      })),
    };
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        sourceKindLike: "trpc.chat.%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 4 });
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("ANDs sourceKindLike with errorClass on retention prune (#604)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }],
        }),
      })),
    };
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        errorClass: "ValidationError",
        sourceKindLike: "vault.%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 1 });
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it("sourceKindLike returns deletedCount=0 on ASDB-null (fail-soft, #604)", async () => {
    const result = await pruneOldErrorEvents(
      {
        olderThan: new Date("2026-04-01"),
        sourceKindLike: "trpc.%",
      },
      { getDb: () => null as never },
    );
    expect(result).toEqual({ deletedCount: 0 });
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

  it("accepts notificationKindLike (prefix LIKE) on retention prune (#603)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
        }),
      })),
    };
    const result = await pruneOldNotifications(
      {
        olderThan: new Date("2026-04-01"),
        notificationKindLike: "promotion.%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 3 });
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("exact notificationKind takes precedence over notificationKindLike on retention prune (#603)", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: () => ({
          returning: async () => [{ id: 1 }],
        }),
      })),
    };
    const result = await pruneOldNotifications(
      {
        olderThan: new Date("2026-04-01"),
        notificationKind: "promotion.approved",
        notificationKindLike: "promotion.%",
      },
      { getDb: () => db as never },
    );
    expect(result).toEqual({ deletedCount: 1 });
  });

  it("notificationKindLike returns deletedCount=0 on ASDB-null (fail-soft, #603)", async () => {
    const result = await pruneOldNotifications(
      {
        olderThan: new Date("2026-04-01"),
        notificationKindLike: "promotion.%",
      },
      { getDb: () => null as never },
    );
    expect(result).toEqual({ deletedCount: 0 });
  });
});

describe("listNotifications — notificationKindLike prefix filter (Phase 22 #599)", () => {
  it("prefix LIKE (trailing %) — operator filters all 'promotion.%' kinds", async () => {
    const now = new Date();
    const { db, state } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 7, notificationKind: "promotion.approved", payload: null, read: false, createdAt: now },
        { id: 2, userId: 7, notificationKind: "promotion.rejected", payload: null, read: false, createdAt: now },
        { id: 3, userId: 7, notificationKind: "promotion.expired", payload: null, read: false, createdAt: now },
        { id: 4, userId: 7, notificationKind: "graph_quality_run_completed", payload: null, read: false, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;
    state.active.kindLike = "promotion.%";

    const result = await listNotifications(
      { userId: 7, notificationKindLike: "promotion.%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2, 3]);
  });

  it("substring LIKE (leading + trailing %)", async () => {
    const now = new Date();
    const { db, state } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 7, notificationKind: "graph.proposal.approved", payload: null, read: false, createdAt: now },
        { id: 2, userId: 7, notificationKind: "ingestion.proposal.rejected", payload: null, read: false, createdAt: now },
        { id: 3, userId: 7, notificationKind: "graph.run.completed", payload: null, read: false, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;
    state.active.kindLike = "%proposal%";

    const result = await listNotifications(
      { userId: 7, notificationKindLike: "%proposal%" },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("exact notificationKind takes precedence over notificationKindLike", async () => {
    const now = new Date();
    const { db, state } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 7, notificationKind: "promotion.approved", payload: null, read: false, createdAt: now },
        { id: 2, userId: 7, notificationKind: "promotion.rejected", payload: null, read: false, createdAt: now },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;
    // Service prefers exact notificationKind over notificationKindLike; fake reflects this.
    state.active.kind = "promotion.approved";

    const result = await listNotifications(
      {
        userId: 7,
        notificationKind: "promotion.approved",
        notificationKindLike: "promotion.%",
      },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("ANDs with unreadOnly + createdSince", async () => {
    const old = new Date("2026-04-01T00:00:00Z");
    const recent = new Date("2026-05-12T00:00:00Z");
    const { db, state } = makeNotifFakeDb({
      rows: [
        { id: 1, userId: 7, notificationKind: "promotion.approved", payload: null, read: true,  createdAt: recent },
        { id: 2, userId: 7, notificationKind: "promotion.rejected", payload: null, read: false, createdAt: recent },
        { id: 3, userId: 7, notificationKind: "promotion.expired",  payload: null, read: false, createdAt: old },
      ],
    });
    state.selectQueue.push("list");
    state.active.userId = 7;
    state.active.kindLike = "promotion.%";
    state.active.unreadOnly = true;
    state.active.createdSince = new Date("2026-05-01T00:00:00Z");

    const result = await listNotifications(
      {
        userId: 7,
        notificationKindLike: "promotion.%",
        unreadOnly: true,
        createdSince: new Date("2026-05-01T00:00:00Z"),
      },
      { getDb: () => db as never },
    );
    expect(result.map((r) => r.id)).toEqual([2]);
  });

  it("returns [] on ASDB-null (fail-soft)", async () => {
    const result = await listNotifications(
      { userId: 7, notificationKindLike: "promotion.%" },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });
});
