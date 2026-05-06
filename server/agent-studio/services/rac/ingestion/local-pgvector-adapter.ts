/**
 * Local pgvector ingestion adapter — D-PARSE-PGVECTOR-1..4 (see
 * `docs/architecture/agent-studio-pgvector-future-migration.md` §11).
 *
 * Optional engine activation pattern, mirrors D-PARSE-OCR-3 /
 * -AUDIO-3 / -VIDEO-3. The adapter is always registered for
 * deterministic boot but probes the pgvector extension on every
 * `search()` call (cached 5 min). When the extension is absent the
 * adapter returns `health: unavailable` + a `source_unavailable`
 * warning; when the extension is present and the source's embedding
 * dim matches the column dim (1536), it runs a cosine-similarity
 * query against `ags_knowledge_chunks.embedding`.
 *
 * Activation: operators run
 * `scripts/migrations/manual/pgvector-optional-engine.sql` to install
 * the extension + add the column + create the HNSW index. The Drizzle
 * schema declares the column as a custom type so the rest of the
 * codebase compiles; the column physically exists only after the
 * manual migration runs.
 *
 * Test strategy: `createPgvectorAdapter(deps)` factory accepts
 * injected `getDb` + `embedQuery` + `now` so tests can run with
 * deterministic fake data — no live pgvector required.
 */

import { sql } from "drizzle-orm";
import { getAsDb } from "../../../db/connection";
import { withEmbeddingCredential } from "../../../../provider-connections/internal/credential-resolver";
import { getSource as getSourceFromStore } from "../sources/store";
import type {
  RacIngestionAdapter,
  RacIndexValidationResult,
  RacIngestionPreview,
  RacRetrievalChunk,
  RacRetrievalHealth,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "./types";
import { EmbeddingDimMismatchError } from "./types";

/** Column dim locked by D-PARSE-PGVECTOR-4. Sources with other dims are refused. */
export const PGVECTOR_COLUMN_DIM = 1536;

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

const NOT_ACTIVATED_REASON =
  "pgvector_extension_not_installed — run `scripts/migrations/manual/pgvector-optional-engine.sql` " +
  "on ASDB to enable vector retrieval (D-PARSE-PGVECTOR-3).";

const DIM_UNSUPPORTED_REASON = (sourceId: number, dim: number) =>
  `embedding_dim_unsupported — source=${sourceId} dim=${dim} cannot use the pgvector adapter ` +
  `(column is vector(${PGVECTOR_COLUMN_DIM})). Re-pin the source's embedding to a 1536-dim model, ` +
  `or wait for the multi-dim amendment.`;

interface DbHealthRow extends Record<string, unknown> {
  extension_installed: boolean;
  column_present: boolean;
}

interface SearchRow extends Record<string, unknown> {
  id: number;
  unit_id: number;
  chunk_text: string;
  distance: number;
}

interface PgvectorDb {
  execute<T extends Record<string, unknown> = Record<string, unknown>>(
    query: ReturnType<typeof sql>,
  ): Promise<{ rows: T[] }>;
}

export interface PgvectorAdapterDeps {
  /** AS-DB accessor. Default reads `getAsDb()`; tests inject. */
  getDb?: () => PgvectorDb | null;
  /**
   * Embed the query into a 1536-dim vector. Default uses
   * `withEmbeddingCredential`; tests inject deterministic fakes.
   */
  embedQuery?: (
    input: {
      workspaceId: number;
      sourceId: number;
      query: string;
      providerConnectionId: number;
      modelRef: string;
      modelDim: number;
    },
  ) => Promise<number[]>;
  /** Time source for the health cache. Default `Date.now`. */
  now?: () => number;
  /** Cache TTL (ms). Default 5 min. Tests use 0 to force re-probe. */
  cacheTtlMs?: number;
  /** Source-row lookup. Default uses the registry store; tests inject. */
  getSource?: (sourceId: number) => Promise<RacSourceLike | null>;
}

interface RacSourceLike {
  id: number;
  workspaceId: number;
  embeddingProviderConnectionId: number | null;
  embeddingModelRef: string | null;
  embeddingModelDim: number | null;
}

export function createPgvectorAdapter(
  deps: PgvectorAdapterDeps = {},
): RacIngestionAdapter {
  const getDb = deps.getDb ?? (() => getAsDb() as unknown as PgvectorDb | null);
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? HEALTH_CACHE_TTL_MS;
  const getSource =
    deps.getSource ?? ((id) => getSourceFromStore(id) as Promise<RacSourceLike | null>);
  const embedQuery = deps.embedQuery ?? defaultEmbedQuery;

  let cachedHealth: { row: DbHealthRow; expiresAt: number } | null = null;

  async function probeHealth(): Promise<DbHealthRow | null> {
    const ts = now();
    if (cachedHealth && cachedHealth.expiresAt > ts) return cachedHealth.row;
    const db = getDb();
    if (!db) return null;
    try {
      const result = await db.execute<DbHealthRow>(sql`
        SELECT
          EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS extension_installed,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'ags_knowledge_chunks' AND column_name = 'embedding'
          ) AS column_present
      `);
      const row = result.rows[0] ?? { extension_installed: false, column_present: false };
      cachedHealth = { row, expiresAt: ts + cacheTtlMs };
      return row;
    } catch {
      const row: DbHealthRow = { extension_installed: false, column_present: false };
      cachedHealth = { row, expiresAt: ts + cacheTtlMs };
      return row;
    }
  }

  return {
    async search(input: RacRetrievalRequest): Promise<RacRetrievalResult> {
      const start = now();
      const db = getDb();
      if (!db) {
        return {
          chunks: [],
          latencyMs: now() - start,
          warnings: ["asdb_unavailable"],
        };
      }
      const health = await probeHealth();
      if (!health || !health.extension_installed || !health.column_present) {
        return {
          chunks: [],
          latencyMs: now() - start,
          warnings: [
            `source_unavailable: source=${input.sourceId} type=vector_index — ${NOT_ACTIVATED_REASON}`,
          ],
        };
      }

      const source = await getSource(input.sourceId);
      if (!source) {
        return {
          chunks: [],
          latencyMs: now() - start,
          warnings: [`source_missing: id=${input.sourceId}`],
        };
      }

      const dim =
        source.embeddingModelDim ?? input.workspaceEmbeddingDefault?.embeddingModelDim ?? null;
      if (dim !== PGVECTOR_COLUMN_DIM) {
        return {
          chunks: [],
          latencyMs: now() - start,
          warnings: [DIM_UNSUPPORTED_REASON(input.sourceId, dim ?? -1)],
        };
      }

      const providerConnectionId =
        source.embeddingProviderConnectionId ??
        input.workspaceEmbeddingDefault?.embeddingProviderConnectionId ??
        null;
      const modelRef =
        source.embeddingModelRef ??
        input.workspaceEmbeddingDefault?.embeddingModelRef ??
        null;
      if (providerConnectionId == null || modelRef == null) {
        return {
          chunks: [],
          latencyMs: now() - start,
          warnings: [`embedding_provider_unresolved: source=${input.sourceId}`],
        };
      }

      const queryVector = await embedQuery({
        workspaceId: source.workspaceId,
        sourceId: source.id,
        query: input.query,
        providerConnectionId,
        modelRef,
        modelDim: dim,
      });

      if (queryVector.length !== PGVECTOR_COLUMN_DIM) {
        throw new EmbeddingDimMismatchError(
          source.id,
          PGVECTOR_COLUMN_DIM,
          queryVector.length,
        );
      }

      const literal = `[${queryVector.join(",")}]`;
      const result = await db.execute<SearchRow>(sql`
        SELECT
          c.id,
          c.unit_id,
          c.chunk_text,
          c.embedding <=> ${literal}::vector AS distance
        FROM ags_knowledge_chunks c
        JOIN ags_knowledge_units u ON u.id = c.unit_id
        WHERE u.workspace_id = ${source.workspaceId}
          AND c.workspace_id = ${source.workspaceId}
          AND c.embedding IS NOT NULL
          AND u.archived_at IS NULL
        ORDER BY c.embedding <=> ${literal}::vector ASC
        LIMIT ${input.topK}
      `);

      const chunks: RacRetrievalChunk[] = result.rows.map((row) => ({
        content: row.chunk_text,
        // pgvector's `<=>` returns cosine distance in [0, 2].
        // Normalize to similarity in [0, 1]: score = 1 - distance / 2.
        score: Math.max(0, Math.min(1, 1 - row.distance / 2)),
        citation: `[unit:${row.unit_id} chunk:${row.id}]`,
        sourceChunkId: `pgvector-${row.id}`,
        metadata: {
          unitId: row.unit_id,
          chunkId: row.id,
          distance: row.distance,
        },
      }));

      return {
        chunks,
        latencyMs: now() - start,
        warnings: [],
      };
    },

    async health(): Promise<RacRetrievalHealth> {
      const row = await probeHealth();
      if (!row || !row.extension_installed || !row.column_present) {
        return { status: "unavailable", reason: NOT_ACTIVATED_REASON };
      }
      return {
        status: "ok",
        metrics: {
          extensionInstalled: "true",
          columnPresent: "true",
        },
      };
    },

    async validateIndex(input: {
      workspaceId: number;
      sourceId: number;
    }): Promise<RacIndexValidationResult> {
      const row = await probeHealth();
      if (!row || !row.extension_installed || !row.column_present) {
        return {
          ok: false,
          reason: "pgvector_not_initialized",
          details: { workspaceId: input.workspaceId, sourceId: input.sourceId },
        };
      }
      const source = await getSource(input.sourceId);
      if (!source) {
        return {
          ok: false,
          reason: "source_missing",
          details: { sourceId: input.sourceId },
        };
      }
      const dim = source.embeddingModelDim;
      if (dim != null && dim !== PGVECTOR_COLUMN_DIM) {
        return {
          ok: false,
          reason: "embedding_dim_unsupported",
          details: { sourceId: input.sourceId, dim, expected: PGVECTOR_COLUMN_DIM },
        };
      }
      return { ok: true };
    },

    async preview(): Promise<RacIngestionPreview> {
      const row = await probeHealth();
      if (!row || !row.extension_installed || !row.column_present) {
        return { sampleChunks: [], warnings: [NOT_ACTIVATED_REASON] };
      }
      // Preview content is sourced via the same SELECT shape as search;
      // operators viewing the preview see what the index actually holds.
      // Empty implementation in MVP — preview consumers are not in
      // critical path. Future amendment can add a non-vector-similarity
      // sample query.
      return { sampleChunks: [], warnings: [] };
    },
  };
}

async function defaultEmbedQuery(input: {
  workspaceId: number;
  sourceId: number;
  query: string;
  providerConnectionId: number;
  modelRef: string;
  modelDim: number;
}): Promise<number[]> {
  return withEmbeddingCredential(
    input.providerConnectionId,
    input.modelRef,
    async (cred) => {
      const response = await fetch(cred.embeddingEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...cred.authHeaders,
        },
        body: JSON.stringify({
          model: input.modelRef,
          input: input.query,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Embedding endpoint returned ${response.status} ${response.statusText}`,
        );
      }
      const body = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
      const vec = body.data?.[0]?.embedding;
      if (!Array.isArray(vec)) {
        throw new Error("Embedding response missing data[0].embedding array");
      }
      return vec;
    },
  );
}

/** Production singleton — wired with real ASDB + production credential helper. */
export const localPgvectorAdapter: RacIngestionAdapter = createPgvectorAdapter();
