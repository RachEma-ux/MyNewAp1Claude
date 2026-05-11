/**
 * Phase 15 §1 + §2 — Vault templates service tests.
 *
 * Covers `createTemplate`, `listTemplates`, `getTemplateById`, and
 * `renderTemplate` from `services/vault/templates.ts`. Uses the
 * same active-key fake-DB pattern as the Graph Skill pack-mutations
 * tests (§12.5 §10).
 *
 * Variable-substitution tests don't need a DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  renderTemplate,
  AsdbUnavailableError,
} from "../../server/agent-studio/services/vault/templates";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeRow {
  id: number;
  vaultId: number | null;
  templateKey: string;
  name: string;
  contentMd: string;
  frontmatterDefaults: Record<string, unknown> | null;
  createdAt: Date;
}

interface FakeState {
  rows: FakeRow[];
  selectQueue: Array<"existingByKey" | "byId" | "list">;
  active: {
    vaultId?: number | null;
    templateKey?: string;
    templateId?: number;
  };
  nextId: number;
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
}

function makeFakeDb(initial?: Partial<FakeState>) {
  const state: FakeState = {
    rows: initial?.rows ?? [],
    selectQueue: [],
    active: {},
    nextId: initial?.nextId ?? 1000,
    inserts: [],
  };

  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        const op = state.selectQueue.shift();
        if (op === "list") {
          const vid = state.active.vaultId;
          if (vid === null || vid === undefined) {
            return Promise.resolve(
              state.rows.filter((r) => r.vaultId === null),
            ) as never;
          }
          return Promise.resolve(
            state.rows.filter(
              (r) => r.vaultId === vid || r.vaultId === null,
            ),
          ) as never;
        }
        return Promise.resolve([]) as never;
      },
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "existingByKey") {
          const key = state.active.templateKey;
          const vid = state.active.vaultId ?? null;
          const found = state.rows.find(
            (r) => r.templateKey === key && r.vaultId === vid,
          );
          return found ? [found] : [];
        }
        if (op === "byId") {
          const id = state.active.templateId;
          const found = state.rows.find((r) => r.id === id);
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
      values: (vals: Record<string, unknown>) => {
        state.inserts.push({ table: name, values: vals });
        return {
          returning: async () => {
            const id = state.nextId++;
            const row: FakeRow = {
              id,
              vaultId: vals.vaultId == null ? null : Number(vals.vaultId),
              templateKey: String(vals.templateKey),
              name: String(vals.name),
              contentMd: String(vals.contentMd),
              frontmatterDefaults:
                (vals.frontmatterDefaults as Record<string, unknown> | null) ??
                null,
              createdAt: new Date(),
            };
            state.rows.push(row);
            return [row];
          },
        };
      },
    };
  });

  const db = { select, insert } as unknown;
  return { db, state };
}

describe("renderTemplate — Phase 15 §2", () => {
  it("substitutes {{var}} placeholders from variables map", () => {
    const result = renderTemplate({
      contentMd: "Hello {{name}}, today is {{date}}.",
      variables: { name: "alice", date: "2026-05-11" },
    });
    expect(result.contentMd).toBe("Hello alice, today is 2026-05-11.");
  });

  it("passes through unknown placeholders verbatim", () => {
    const result = renderTemplate({
      contentMd: "Hello {{name}}, today is {{missing}}.",
      variables: { name: "alice" },
    });
    expect(result.contentMd).toBe("Hello alice, today is {{missing}}.");
  });

  it("tolerates whitespace inside the placeholder", () => {
    const result = renderTemplate({
      contentMd: "Hello {{ name }}.",
      variables: { name: "alice" },
    });
    expect(result.contentMd).toBe("Hello alice.");
  });

  it("does not substitute {{...}} blocks that don't match an identifier", () => {
    const result = renderTemplate({
      contentMd: "{{ }} {{1bad}} {{ok-no}}",
      variables: { ok: "x" },
    });
    // None match the [A-Za-z_][A-Za-z0-9_]* pattern, so the whole
    // string passes through verbatim.
    expect(result.contentMd).toBe("{{ }} {{1bad}} {{ok-no}}");
  });

  it("coerces non-string variable values to strings", () => {
    const result = renderTemplate({
      contentMd: "{{count}} items, ready={{ready}}",
      variables: { count: 42, ready: true },
    });
    expect(result.contentMd).toBe("42 items, ready=true");
  });

  it("treats null/undefined variable values as 'not supplied' (passthrough)", () => {
    const result = renderTemplate({
      contentMd: "{{a}} / {{b}}",
      variables: { a: null, b: undefined },
    });
    expect(result.contentMd).toBe("{{a}} / {{b}}");
  });

  it("merges frontmatter defaults with overrides (override wins)", () => {
    const result = renderTemplate({
      contentMd: "x",
      frontmatterDefaults: { kind: "note", tag: "default" },
      frontmatterOverrides: { tag: "override", extra: "yes" },
    });
    expect(result.frontmatter).toEqual({
      kind: "note",
      tag: "override",
      extra: "yes",
    });
  });

  it("returns empty frontmatter when neither defaults nor overrides supplied", () => {
    const result = renderTemplate({ contentMd: "x" });
    expect(result.frontmatter).toEqual({});
  });
});

describe("createTemplate — Phase 15 §1", () => {
  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      createTemplate(
        { templateKey: "k", name: "n", contentMd: "c" },
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a new global template row when no existing row matches", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingByKey");
    state.active.templateKey = "investigation_v1";
    state.active.vaultId = null;
    const result = await createTemplate(
      {
        templateKey: "investigation_v1",
        name: "Investigation",
        contentMd: "# {{title}}",
        frontmatterDefaults: { kind: "investigation" },
      },
      { getDb: () => db as never },
    );
    expect(result.created).toBe(true);
    expect(result.templateKey).toBe("investigation_v1");
    expect(result.vaultId).toBeNull();
    expect(state.rows.length).toBe(1);
    expect(state.rows[0].frontmatterDefaults).toEqual({
      kind: "investigation",
    });
  });

  it("returns the existing row (created=false) on duplicate key", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: null,
          templateKey: "k",
          name: "name",
          contentMd: "c",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("existingByKey");
    state.active.templateKey = "k";
    state.active.vaultId = null;

    const result = await createTemplate(
      { templateKey: "k", name: "name", contentMd: "c" },
      { getDb: () => db as never },
    );
    expect(result.created).toBe(false);
    expect(result.id).toBe(7);
    // No new row inserted.
    expect(state.rows.length).toBe(1);
  });

  it("scopes vault-specific templates separately from global", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: null,
          templateKey: "k",
          name: "global",
          contentMd: "g",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("existingByKey");
    state.active.templateKey = "k";
    state.active.vaultId = 42;

    const result = await createTemplate(
      { templateKey: "k", name: "vault-scoped", contentMd: "v", vaultId: 42 },
      { getDb: () => db as never },
    );
    // Active vault is 42; fake's existing search returns no row for
    // (k, vaultId=42), so a new row is inserted.
    expect(result.created).toBe(true);
    expect(result.vaultId).toBe(42);
    expect(state.rows.length).toBe(2);
  });
});

describe("listTemplates — Phase 15 §1", () => {
  it("returns [] on ASDB-unavailable", async () => {
    const result = await listTemplates(
      { vaultId: 1 },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("returns global + vault-scoped templates, deduping per templateKey with vault-scoped winning", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          vaultId: null,
          templateKey: "shared",
          name: "Shared (Global)",
          contentMd: "g",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          vaultId: 42,
          templateKey: "shared",
          name: "Shared (Vault Override)",
          contentMd: "v",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
        {
          id: 3,
          vaultId: null,
          templateKey: "global_only",
          name: "Global Only",
          contentMd: "x",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = 42;

    const result = await listTemplates(
      { vaultId: 42 },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(2);
    const sharedEntry = result.find((r) => r.templateKey === "shared");
    expect(sharedEntry?.scope).toBe("vault");
    expect(sharedEntry?.name).toBe("Shared (Vault Override)");
    const globalOnly = result.find((r) => r.templateKey === "global_only");
    expect(globalOnly?.scope).toBe("global");
  });

  it("returns only global templates when vaultId is omitted", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 1,
          vaultId: null,
          templateKey: "global",
          name: "G",
          contentMd: "x",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          vaultId: 42,
          templateKey: "vault_only",
          name: "V",
          contentMd: "y",
          frontmatterDefaults: null,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = null;
    const result = await listTemplates({}, { getDb: () => db as never });
    expect(result.length).toBe(1);
    expect(result[0].templateKey).toBe("global");
  });
});

describe("getTemplateById — Phase 15 §1", () => {
  it("returns null on ASDB-unavailable", async () => {
    const result = await getTemplateById(7, { getDb: () => null as never });
    expect(result).toBeNull();
  });

  it("returns the row when found", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: null,
          templateKey: "k",
          name: "n",
          contentMd: "c",
          frontmatterDefaults: { tag: "ok" },
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.templateId = 7;
    const result = await getTemplateById(7, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
    expect(result!.frontmatterDefaults).toEqual({ tag: "ok" });
  });

  it("returns null when no row matches the id", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.templateId = 999;
    const result = await getTemplateById(999, { getDb: () => db as never });
    expect(result).toBeNull();
  });
});
