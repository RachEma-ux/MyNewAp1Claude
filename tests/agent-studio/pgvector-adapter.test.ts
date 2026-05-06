/**
 * Follow-up D1 — pgvector adapter unit tests.
 *
 * Locks the adapter's contract per `D-PARSE-PGVECTOR-1..4`:
 *   - Engine-up + extension installed + column present + dim=1536:
 *     issues a cosine-similarity query, normalizes distance → score,
 *     emits one chunk per row.
 *   - Extension absent: `health: unavailable`, search returns
 *     `source_unavailable` warning, fetch never called.
 *   - Column absent (extension installed but operator hasn't run the
 *     manual migration): same as extension-absent.
 *   - Source missing: `source_missing` warning.
 *   - Dim mismatch (source bound to a non-1536 model): refused with
 *     `embedding_dim_unsupported` warning.
 *   - Embedding dim mismatch at query time (fake `embedQuery` returns
 *     a 768-dim vector): throws `EmbeddingDimMismatchError`.
 *   - DB unavailable: `asdb_unavailable` warning.
 *   - Health-cache TTL: probes once within window; recovery after
 *     extension-installed flip.
 *
 * All tests use **deterministic fake data** — no live pgvector or
 * ASDB required. The factory pattern accepts injected `getDb`,
 * `embedQuery`, `getSource`, and `now`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPgvectorAdapter,
  PGVECTOR_COLUMN_DIM,
} from "../../server/agent-studio/services/rac/ingestion/local-pgvector-adapter";
import { EmbeddingDimMismatchError } from "../../server/agent-studio/services/rac/ingestion/types";

// ── Fake data builders ──────────────────────────────────────────────

function fakeVector(seed: number, dim = PGVECTOR_COLUMN_DIM): number[] {
  // Deterministic: same seed → same vector. Normalised so any two
  // vectors with the same seed have cosine similarity = 1.
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.sin((i + 1) * (seed + 1));
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function fakeSource(overrides: Partial<{
  id: number;
  workspaceId: number;
  embeddingProviderConnectionId: number | null;
  embeddingModelRef: string | null;
  embeddingModelDim: number | null;
}> = {}) {
  return {
    id: 1001,
    workspaceId: 7,
    embeddingProviderConnectionId: 100,
    embeddingModelRef: "text-embedding-3-small",
    embeddingModelDim: PGVECTOR_COLUMN_DIM,
    ...overrides,
  };
}

interface CapturedQuery {
  queryString: string;
  params: unknown[];
}

function fakeDb(opts: {
  health?: { extension_installed: boolean; column_present: boolean };
  searchRows?: Array<{ id: number; unit_id: number; chunk_text: string; distance: number }>;
  capture?: CapturedQuery[];
  throwHealth?: boolean;
}) {
  const capture = opts.capture ?? [];
  return {
    async execute(query: { queryChunks: unknown[]; queryString?: string }) {
      // Drizzle's sql`` builder exposes `.queryChunks` — for tests we
      // capture the chunks array (mostly to confirm shape) and route
      // by detecting the `pg_extension` substring in the SQL fragments.
      const merged = serializeChunks(query.queryChunks);
      capture.push({ queryString: merged, params: [] });

      if (merged.includes("pg_extension")) {
        if (opts.throwHealth) throw new Error("simulated health probe failure");
        return {
          rows: [opts.health ?? { extension_installed: true, column_present: true }],
        };
      }
      // Search query.
      return { rows: opts.searchRows ?? [] };
    },
  };
}

function serializeChunks(chunks: unknown[]): string {
  return chunks
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object") {
        const obj = c as { value?: unknown; queryChunks?: unknown[] };
        if (Array.isArray(obj.queryChunks)) return serializeChunks(obj.queryChunks);
        if ("value" in obj) return String(obj.value);
      }
      return "";
    })
    .join("");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("pgvectorAdapter — engine-up happy path", () => {
  it("returns chunks ranked by score (1 - distance/2) when extension + column + dim all match", async () => {
    const captured: CapturedQuery[] = [];
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({
          health: { extension_installed: true, column_present: true },
          searchRows: [
            { id: 1, unit_id: 100, chunk_text: "alpha", distance: 0.0 },
            { id: 2, unit_id: 101, chunk_text: "beta", distance: 0.5 },
            { id: 3, unit_id: 102, chunk_text: "gamma", distance: 1.6 },
          ],
          capture: captured,
        }),
      embedQuery: async () => fakeVector(1),
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "find me alpha",
      topK: 5,
    });

    expect(result.warnings).toEqual([]);
    expect(result.chunks).toHaveLength(3);
    // distance 0.0 → score 1.0 (perfect match)
    expect(result.chunks[0].score).toBeCloseTo(1.0, 4);
    expect(result.chunks[0].content).toBe("alpha");
    // distance 0.5 → score 0.75
    expect(result.chunks[1].score).toBeCloseTo(0.75, 4);
    // distance 1.6 → score 0.2
    expect(result.chunks[2].score).toBeCloseTo(0.2, 4);
    // citation + sourceChunkId derived from row identifiers
    expect(result.chunks[0].citation).toBe("[unit:100 chunk:1]");
    expect(result.chunks[0].sourceChunkId).toBe("pgvector-1");
  });

  it("issues a SQL query that uses the `<=>` cosine operator and respects topK", async () => {
    const captured: CapturedQuery[] = [];
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({
          health: { extension_installed: true, column_present: true },
          searchRows: [],
          capture: captured,
        }),
      embedQuery: async () => fakeVector(2),
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });

    await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 4,
    });

    // First call: health probe; second call: search.
    expect(captured.length).toBeGreaterThanOrEqual(2);
    const searchSql = captured[captured.length - 1].queryString;
    expect(searchSql).toContain("<=>");
    expect(searchSql).toContain("ags_knowledge_chunks");
    expect(searchSql).toContain("ORDER BY");
    expect(searchSql).toMatch(/LIMIT/);
  });

  it("falls back to workspaceEmbeddingDefault when source row has no binding", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({
          health: { extension_installed: true, column_present: true },
          searchRows: [{ id: 1, unit_id: 1, chunk_text: "x", distance: 0.0 }],
        }),
      embedQuery: async () => fakeVector(3),
      getSource: async () =>
        fakeSource({
          embeddingProviderConnectionId: null,
          embeddingModelRef: null,
          embeddingModelDim: null,
        }),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
      workspaceEmbeddingDefault: {
        embeddingProviderConnectionId: 200,
        embeddingModelRef: "text-embedding-3-small",
        embeddingModelDim: PGVECTOR_COLUMN_DIM,
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.chunks).toHaveLength(1);
  });
});

describe("pgvectorAdapter — extension/column absent (D-PARSE-PGVECTOR-3)", () => {
  it("returns source_unavailable warning when pgvector extension is not installed", async () => {
    const embedQuery = vi.fn();
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({ health: { extension_installed: false, column_present: false } }),
      embedQuery: embedQuery as unknown as never,
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
    });

    expect(result.chunks).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("pgvector_extension_not_installed");
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it("returns source_unavailable when column is absent (operator hasn't run manual migration)", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({ health: { extension_installed: true, column_present: false } }),
      embedQuery: async () => fakeVector(0),
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
    });

    expect(result.warnings[0]).toContain("pgvector_extension_not_installed");
  });

  it("health() returns `unavailable` when extension absent", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () =>
        fakeDb({ health: { extension_installed: false, column_present: false } }),
      cacheTtlMs: 0,
    });

    const h = await adapter.health();
    expect(h.status).toBe("unavailable");
    expect(h.reason).toContain("pgvector_extension_not_installed");
  });

  it("health() returns `ok` when extension + column both present", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      cacheTtlMs: 0,
    });
    const h = await adapter.health();
    expect(h.status).toBe("ok");
    expect(h.metrics).toMatchObject({ extensionInstalled: "true", columnPresent: "true" });
  });
});

describe("pgvectorAdapter — dim mismatch (D-PARSE-PGVECTOR-4)", () => {
  it("refuses sources whose embedding dim ≠ 1536 with a clear warning", async () => {
    const embedQuery = vi.fn();
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      embedQuery: embedQuery as unknown as never,
      getSource: async () => fakeSource({ embeddingModelDim: 768 }),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
    });

    expect(result.chunks).toEqual([]);
    expect(result.warnings[0]).toContain("embedding_dim_unsupported");
    expect(result.warnings[0]).toContain("dim=768");
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it("throws EmbeddingDimMismatchError when source claims 1536 but embedQuery returns a different dim", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      embedQuery: async () => fakeVector(1, 768),
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });

    await expect(
      adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 }),
    ).rejects.toBeInstanceOf(EmbeddingDimMismatchError);
  });

  it("validateIndex returns `embedding_dim_unsupported` for non-1536 sources", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      getSource: async () => fakeSource({ embeddingModelDim: 384 }),
      cacheTtlMs: 0,
    });

    const r = await adapter.validateIndex!({ workspaceId: 7, sourceId: 1001 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("embedding_dim_unsupported");
    expect(r.details).toMatchObject({ dim: 384, expected: PGVECTOR_COLUMN_DIM });
  });
});

describe("pgvectorAdapter — source resolution edge cases", () => {
  it("warns `source_missing` when getSource returns null", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      getSource: async () => null,
      embedQuery: async () => fakeVector(0),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 9999,
      query: "x",
      topK: 5,
    });
    expect(result.warnings[0]).toContain("source_missing");
  });

  it("warns `embedding_provider_unresolved` when neither source nor workspace default has a binding", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => fakeDb({ health: { extension_installed: true, column_present: true } }),
      getSource: async () =>
        fakeSource({
          embeddingProviderConnectionId: null,
          embeddingModelRef: null,
          embeddingModelDim: PGVECTOR_COLUMN_DIM, // dim resolves but no provider
        }),
      embedQuery: async () => fakeVector(0),
      cacheTtlMs: 0,
    });

    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
    });
    expect(result.warnings[0]).toContain("embedding_provider_unresolved");
  });

  it("returns asdb_unavailable when getDb returns null", async () => {
    const adapter = createPgvectorAdapter({
      getDb: () => null,
      embedQuery: async () => fakeVector(0),
      getSource: async () => fakeSource(),
      cacheTtlMs: 0,
    });
    const result = await adapter.search({
      workspaceId: 7,
      sourceId: 1001,
      query: "x",
      topK: 5,
    });
    expect(result.warnings).toEqual(["asdb_unavailable"]);
  });
});

describe("pgvectorAdapter — health cache TTL (D-PARSE-PGVECTOR-3 §11.3)", () => {
  let probeCount = 0;
  let nowValue = 0;
  let healthState = { extension_installed: true, column_present: true };

  beforeEach(() => {
    probeCount = 0;
    nowValue = 0;
    healthState = { extension_installed: true, column_present: true };
  });

  function makeAdapter(cacheTtlMs: number) {
    return createPgvectorAdapter({
      getDb: () => ({
        async execute(query: { queryChunks: unknown[] }) {
          const merged = serializeChunks(query.queryChunks);
          if (merged.includes("pg_extension")) {
            probeCount += 1;
            return { rows: [healthState] };
          }
          return { rows: [] };
        },
      }),
      embedQuery: async () => fakeVector(0),
      getSource: async () => fakeSource(),
      now: () => nowValue,
      cacheTtlMs,
    });
  }

  it("probes once across multiple calls within the TTL window", async () => {
    const adapter = makeAdapter(60_000);
    nowValue = 0;
    await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    nowValue = 30_000;
    await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    nowValue = 59_000;
    await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    expect(probeCount).toBe(1);
  });

  it("re-probes after the TTL window expires", async () => {
    const adapter = makeAdapter(60_000);
    nowValue = 0;
    await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    nowValue = 60_001;
    await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    expect(probeCount).toBe(2);
  });

  it("recovery: after extension installs (cache flip), next call routes normally", async () => {
    const adapter = makeAdapter(0);
    healthState = { extension_installed: false, column_present: false };
    const r1 = await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    expect(r1.warnings[0]).toContain("pgvector_extension_not_installed");
    healthState = { extension_installed: true, column_present: true };
    const r2 = await adapter.search({ workspaceId: 7, sourceId: 1001, query: "x", topK: 5 });
    expect(r2.warnings).toEqual([]);
    expect(probeCount).toBe(2);
  });
});
