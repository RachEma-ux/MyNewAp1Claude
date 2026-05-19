/**
 * Vault search tsvector implementation — source-scan + behavioral test.
 *
 * Slice 27 of the no-deferral continuation catalogue (2026-05-19).
 * Closes `services/vault/router.ts:search` (returning `[]`) + the
 * `services/vault/search.ts` skeleton with a tsvector-backed
 * `AsdbVaultSearchService` that joins `ags_vault_members` for
 * permissions.
 *
 * Behavioral tests inject a fake `getAsDb` so we don't boot ASDB.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AsdbVaultSearchService } from "../../server/agent-studio/services/vault/search-asdb.js";

const REPO_ROOT = join(__dirname, "..", "..");
const SEARCH_ASDB_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/vault/search-asdb.ts",
);
const ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/vault/router.ts",
);
const SEARCH_CONTRACT_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/vault/search.ts",
);

describe("Vault search — slice 27 source-scan", () => {
  const asdbSource = readFileSync(SEARCH_ASDB_PATH, "utf8");
  const routerSource = readFileSync(ROUTER_PATH, "utf8");
  const searchSource = readFileSync(SEARCH_CONTRACT_PATH, "utf8");

  it("AsdbVaultSearchService uses tsvector + websearch_to_tsquery", () => {
    expect(asdbSource).toContain("websearch_to_tsquery");
    expect(asdbSource).toContain("to_tsvector('english', v.content_md)");
    expect(asdbSource).toContain("ts_headline");
    expect(asdbSource).toContain("ts_rank");
  });

  it("query is parameterized via drizzle sql template (no string concat)", () => {
    expect(asdbSource).toContain("${input.query}");
    expect(asdbSource).not.toMatch(/`.*\$\{input\.query\}.*`\s*\+/);
  });

  it("joins ags_vault_members for permission filter", () => {
    expect(asdbSource).toContain("JOIN ags_vault_members m");
    expect(asdbSource).toContain("m.user_id  = ${runtime.userId ?? -1}");
  });

  it("filters out deleted notes + non-active governance", () => {
    expect(asdbSource).toContain("n.governance_status = 'active'");
    expect(asdbSource).toContain("n.deleted_at IS NULL");
  });

  it("optional vaultId filter is parameterized via NULL coalesce", () => {
    expect(asdbSource).toContain(
      "${input.vaultId ?? null}::integer IS NULL OR n.vault_id =",
    );
  });

  it("router wires getSearchService into the search procedure", () => {
    expect(routerSource).toContain("getSearchService()");
    expect(routerSource).toContain("AsdbVaultSearchService");
    expect(routerSource).toContain("_setVaultSearchServiceForTests");
  });

  it("router no longer returns the empty-array stub", () => {
    expect(routerSource).not.toMatch(
      /return \[\] as Array<\{ noteId: number; title: string; snippet: string; score: number \}>/,
    );
  });

  it("search.ts no longer claims skeleton status", () => {
    expect(searchSource).not.toContain("search service skeleton");
    expect(searchSource).not.toContain("MVP skeleton uses VaultRepositoryStub");
  });
});

describe("AsdbVaultSearchService — behavioral", () => {
  // Lightweight fake of `getAsDb()` — only `execute` is exercised.
  let capturedSql: string | null = null;
  let capturedParams: unknown[] = [];
  let nextRows: Array<{
    note_id: number;
    vault_id: number;
    title: string;
    slug: string;
    snippet: string;
    score: number;
  }> = [];

  const fakeDb = {
    execute: async (q: {
      queryChunks?: unknown[];
      sql?: string;
      params?: unknown[];
    }) => {
      // Best-effort capture for assertion; the actual SQL is built by
      // drizzle's sql tag and won't be a plain string here.
      capturedSql = JSON.stringify(q);
      capturedParams = q.params ?? [];
      return nextRows;
    },
  };

  beforeEach(() => {
    capturedSql = null;
    capturedParams = [];
    nextRows = [];
  });

  it("returns mapped SearchHit[] for non-empty rows", async () => {
    nextRows = [
      {
        note_id: 1,
        vault_id: 10,
        title: "First",
        slug: "first",
        snippet: "<b>hello</b> world",
        score: 0.42,
      },
      {
        note_id: 2,
        vault_id: 10,
        title: "Second",
        slug: "second",
        snippet: "<b>world</b>",
        score: 0.31,
      },
    ];
    const svc = new AsdbVaultSearchService(() => fakeDb as never);
    const hits = await svc.search(
      { query: "hello", limit: 20 } as never,
      { userId: 7 },
    );
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      noteId: 1,
      vaultId: 10,
      title: "First",
      slug: "first",
      snippet: "<b>hello</b> world",
      score: 0.42,
    });
  });

  it("clamps limit into [1, 100]", async () => {
    const svc = new AsdbVaultSearchService(() => fakeDb as never);
    await svc.search({ query: "x", limit: 999 } as never, { userId: 1 });
    expect(capturedSql).toBeTruthy();
    // Limit parameter is part of the bound params; ensure no value
    // above 100 reached the query.
    const flat = JSON.stringify({ capturedSql, capturedParams });
    expect(flat).toContain("100");
    expect(flat).not.toContain('"999"');
  });

  it("falls back to userId=-1 when ctx has no user (defense in depth)", async () => {
    const svc = new AsdbVaultSearchService(() => fakeDb as never);
    await svc.search({ query: "x", limit: 20 } as never, {});
    const flat = JSON.stringify({ capturedSql, capturedParams });
    expect(flat).toContain("-1");
  });

  it("returns [] for empty rowset", async () => {
    const svc = new AsdbVaultSearchService(() => fakeDb as never);
    const hits = await svc.search(
      { query: "nope", limit: 20 } as never,
      { userId: 1 },
    );
    expect(hits).toEqual([]);
  });

  it("supports {rows} envelope (node-postgres shape)", async () => {
    const envelopedDb = {
      execute: async () => ({
        rows: [
          {
            note_id: 99,
            vault_id: 1,
            title: "Enveloped",
            slug: "enveloped",
            snippet: "hi",
            score: 0.5,
          },
        ],
      }),
    };
    const svc = new AsdbVaultSearchService(() => envelopedDb as never);
    const hits = await svc.search(
      { query: "x", limit: 20 } as never,
      { userId: 1 },
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.noteId).toBe(99);
  });
});
