/**
 * Phase 16 §1-§4 — Vault saved-views service tests.
 *
 * Covers `services/vault/saved-views.ts`: createSavedView,
 * getSavedViewById, listSavedViews, updateSavedView, deleteSavedView.
 * Uses an active-key fake-DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createSavedView,
  getSavedViewById,
  listSavedViews,
  updateSavedView,
  deleteSavedView,
  AsdbUnavailableError,
  SavedViewNotFoundError,
} from "../../server/agent-studio/services/vault/saved-views";

interface FakeRow {
  id: number;
  vaultId: number;
  ownerUserId: number | null;
  name: string;
  viewKind: string;
  filters: Record<string, unknown> | null;
  sort: Record<string, unknown> | null;
  columns: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeState {
  rows: FakeRow[];
  nextId: number;
  selectQueue: Array<"byId" | "list">;
  active: {
    viewId?: number;
    vaultId?: number;
    ownerUserId?: number | null;
    viewKind?: string;
  };
  updates: Array<{ id: number; set: Record<string, unknown> }>;
  deletes: Array<number>;
}

function makeFakeDb(initial?: Partial<FakeState>) {
  const state: FakeState = {
    rows: initial?.rows ?? [],
    nextId: initial?.nextId ?? 1000,
    selectQueue: [],
    active: {},
    updates: [],
    deletes: [],
  };

  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        const op = state.selectQueue.shift();
        if (op === "list") {
          let rows = state.rows.filter((r) => r.vaultId === state.active.vaultId);
          if (state.active.ownerUserId !== undefined) {
            rows = rows.filter((r) => r.ownerUserId === state.active.ownerUserId);
          }
          if (state.active.viewKind !== undefined) {
            rows = rows.filter((r) => r.viewKind === state.active.viewKind);
          }
          return {
            limit: async () =>
              rows.sort(
                (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
              ),
          };
        }
        return chain;
      },
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "byId") {
          const found = state.rows.find((r) => r.id === state.active.viewId);
          return found ? [found] : [];
        }
        return [];
      },
    };
    return chain;
  });

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (name !== "ags_vault_saved_views") return [];
          const now = new Date();
          const id = state.nextId++;
          const row: FakeRow = {
            id,
            vaultId: Number(vals.vaultId),
            ownerUserId: vals.ownerUserId == null ? null : Number(vals.ownerUserId),
            name: String(vals.name),
            viewKind: String(vals.viewKind),
            filters:
              (vals.filters as Record<string, unknown> | null | undefined) ??
              null,
            sort:
              (vals.sort as Record<string, unknown> | null | undefined) ??
              null,
            columns: (vals.columns as string[] | null | undefined) ?? null,
            createdAt: now,
            updatedAt: now,
          };
          state.rows.push(row);
          return [row];
        },
      }),
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        const id = state.active.viewId;
        if (id == null) return;
        const target = state.rows.find((r) => r.id === id);
        if (!target) return;
        if ("name" in vals) target.name = String(vals.name);
        if ("filters" in vals)
          target.filters = vals.filters as Record<string, unknown> | null;
        if ("sort" in vals) target.sort = vals.sort as Record<string, unknown> | null;
        if ("columns" in vals)
          target.columns = vals.columns as string[] | null;
        if ("updatedAt" in vals) target.updatedAt = vals.updatedAt as Date;
        state.updates.push({ id, set: vals });
      },
    }),
  }));

  const del = vi.fn((_table: unknown) => ({
    where: async () => {
      const id = state.active.viewId;
      if (id == null) return;
      state.rows = state.rows.filter((r) => r.id !== id);
      state.deletes.push(id);
    },
  }));

  const db = { select, insert, update, delete: del } as unknown;
  return { db, state };
}

describe("createSavedView — Phase 16 §1", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      createSavedView(
        { vaultId: 1, name: "x", viewKind: "note_list" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a saved view with filters + sort + columns", async () => {
    const { db, state } = makeFakeDb();
    const result = await createSavedView(
      {
        vaultId: 5,
        ownerUserId: 42,
        name: "My Notes",
        viewKind: "note_list",
        filters: { tag: "important" },
        sort: { field: "updatedAt", order: "desc" },
        columns: ["title", "tags", "updatedAt"],
      },
      { getDb: () => db as never },
    );
    expect(result.id).toBeGreaterThan(0);
    expect(result.name).toBe("My Notes");
    expect(result.filters).toEqual({ tag: "important" });
    expect(result.sort).toEqual({ field: "updatedAt", order: "desc" });
    expect(result.columns).toEqual(["title", "tags", "updatedAt"]);
    expect(state.rows.length).toBe(1);
  });

  it("treats null filters/sort/columns as the absence of constraint", async () => {
    const { db, state } = makeFakeDb();
    const result = await createSavedView(
      { vaultId: 5, name: "Empty", viewKind: "note_list" },
      { getDb: () => db as never },
    );
    expect(result.filters).toBeNull();
    expect(result.sort).toBeNull();
    expect(result.columns).toBeNull();
    expect(state.rows[0].ownerUserId).toBeNull();
  });
});

describe("getSavedViewById — Phase 16", () => {
  it("returns null when ASDB is unavailable", async () => {
    const result = await getSavedViewById(7, { getDb: () => null as never });
    expect(result).toBeNull();
  });

  it("returns null when row is missing", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.viewId = 999;
    const result = await getSavedViewById(999, { getDb: () => db as never });
    expect(result).toBeNull();
  });

  it("returns the row when found", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: 42,
          name: "x",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.viewId = 7;
    const result = await getSavedViewById(7, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
  });
});

describe("listSavedViews — Phase 16", () => {
  it("returns [] on ASDB-unavailable", async () => {
    const result = await listSavedViews(
      { vaultId: 1 },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("filters by vaultId", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: null,
          name: "a",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 8,
          vaultId: 2,
          ownerUserId: null,
          name: "b",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = 1;
    const result = await listSavedViews(
      { vaultId: 1 },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(7);
  });

  it("filters by ownerUserId when supplied", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: 42,
          name: "mine",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 8,
          vaultId: 1,
          ownerUserId: 99,
          name: "theirs",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = 1;
    state.active.ownerUserId = 42;
    const result = await listSavedViews(
      { vaultId: 1, ownerUserId: 42 },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("mine");
  });

  it("filters by viewKind when supplied", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: null,
          name: "notes",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 8,
          vaultId: 1,
          ownerUserId: null,
          name: "entities",
          viewKind: "entity_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = 1;
    state.active.viewKind = "entity_list";
    const result = await listSavedViews(
      { vaultId: 1, viewKind: "entity_list" },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("entities");
  });
});

describe("updateSavedView — Phase 16", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      updateSavedView(
        { id: 1, name: "x" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("patches name + filters + sort + columns", async () => {
    const now = new Date(0);
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: 42,
          name: "old",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    // V1+ Phase 16-γ: updateSavedView now calls getSavedViewById
    // TWICE — once to snapshot the prior row, once to return the
    // updated row. Both share the same `rows` fixture in our fake.
    state.selectQueue.push("byId");
    state.selectQueue.push("byId");
    state.active.viewId = 7;
    const result = await updateSavedView(
      {
        id: 7,
        name: "new",
        filters: { tag: "x" },
        sort: { field: "title" },
        columns: ["title"],
      },
      { getDb: () => db as never },
    );
    expect(result.name).toBe("new");
    expect(result.filters).toEqual({ tag: "x" });
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("throws SavedViewNotFoundError when row is missing (prior snapshot lookup fails first)", async () => {
    // V1+ Phase 16-γ moved the not-found check earlier: the prior
    // snapshot lookup runs BEFORE the update, so a missing row throws
    // at the snapshot read step (not at the post-update lookup).
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.viewId = 999;
    await expect(
      updateSavedView({ id: 999, name: "x" }, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(SavedViewNotFoundError);
  });
});

describe("deleteSavedView — Phase 16", () => {
  it("throws AsdbUnavailableError on null DB", async () => {
    await expect(
      deleteSavedView(7, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("removes the row", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          ownerUserId: null,
          name: "x",
          viewKind: "note_list",
          filters: null,
          sort: null,
          columns: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    state.active.viewId = 7;
    const result = await deleteSavedView(7, { getDb: () => db as never });
    expect(result.deleted).toBe(true);
    expect(state.rows.length).toBe(0);
  });
});
