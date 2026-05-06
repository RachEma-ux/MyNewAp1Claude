/**
 * Local pgvector ingestion adapter — placeholder (Phase 3).
 *
 * D-RET-4 ships pgvector as a **conditional** ASDB-resident backend:
 * the migration to add `CREATE EXTENSION IF NOT EXISTS vector` and
 * `ags_rac_chunks (… embedding vector(1536))` lands only when an
 * AS-managed source type proves insufficient on Qdrant. None of the
 * P2 source types require a chunk table yet — `cag_pack`, `memory`,
 * `workspace_context`, `tool_result_context`, `manual_context` are
 * in-process; `document_collection` reuses Qdrant; `graph_index` is
 * gap-shaped (see `graphrag-adapter.ts`).
 *
 * This file ships the adapter contract so source registrations of
 * `source_type="vector_index"` resolve to a concrete adapter rather
 * than a missing-binding error. Until the pgvector migration lands,
 * every method returns an `unavailable` shape carrying the structured
 * `pgvector_not_initialized` reason. The executor (P4) treats this
 * the same as any other `source_unavailable` warning.
 *
 * Activation steps when the conditional fires:
 *   1. Ship a follow-up migration (`drizzle/00NN_pgvector_extension.sql`)
 *      with `CREATE EXTENSION` + `ags_rac_chunks` table.
 *   2. Replace this file's `search` body with a real query against
 *      `ags_rac_chunks` using the per-source embedding ref + cosine
 *      operator. Use `withEmbeddingCredential` to embed the query.
 *   3. The `RacIngestionAdapter` contract does NOT change — callers
 *      stay stable.
 */

import type {
  RacIngestionAdapter,
  RacIndexValidationResult,
  RacIngestionPreview,
  RacRetrievalHealth,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "./types";

const PGVECTOR_NOT_INITIALIZED_REASON =
  "pgvector_not_initialized — D-RET-4 conditional has not fired (no ags_rac_chunks migration yet). The adapter contract is in place; flip the body when AS-managed source types need a vector backend beyond Qdrant.";

export const localPgvectorAdapter: RacIngestionAdapter = {
  async search(input: RacRetrievalRequest): Promise<RacRetrievalResult> {
    const start = Date.now();
    return {
      chunks: [],
      latencyMs: Date.now() - start,
      warnings: [
        `source_unavailable: source=${input.sourceId} type=vector_index — ${PGVECTOR_NOT_INITIALIZED_REASON}`,
      ],
    };
  },

  async health(): Promise<RacRetrievalHealth> {
    return {
      status: "unavailable",
      reason: PGVECTOR_NOT_INITIALIZED_REASON,
    };
  },

  async validateIndex(input: {
    workspaceId: number;
    sourceId: number;
  }): Promise<RacIndexValidationResult> {
    return {
      ok: false,
      reason: "pgvector_not_initialized",
      details: {
        workspaceId: input.workspaceId,
        sourceId: input.sourceId,
      },
    };
  },

  async preview(): Promise<RacIngestionPreview> {
    return {
      sampleChunks: [],
      warnings: [PGVECTOR_NOT_INITIALIZED_REASON],
    };
  },
};
