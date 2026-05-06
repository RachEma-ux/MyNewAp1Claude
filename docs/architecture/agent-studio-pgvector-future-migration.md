# Agent Studio pgvector — ADR

**Owner:** Agent Studio module + Platform infrastructure
**Phase:** 1 (Retrofit ADRs) + Follow-up D1 amendment (2026-05-06)
**Status:** Adopted as **optional engine** for the retrofit. Activation per `D-PARSE-PGVECTOR-1..4`.
**Authority:** Picks the engine binding + opt-in activation pattern + graceful-degradation contract. Locks the optional-engine path; does NOT mandate that any deployment install pgvector.

---

## 1. Why this document exists

The retrofit prompt explicitly says:

> Use existing embedding storage for MVP.
> Do not force pgvector migration in MVP.
> pgvector may be documented as a future migration.

This ADR satisfies the third clause. It locks the position that pgvector is **deferred**, not blocked, and records:

1. The current state (no `vector(N)` columns anywhere).
2. The trigger conditions that would justify a migration.
3. The swap surface (which files / tables / DRs would change).
4. The migration plan (steps, ordering, back-out).

Future engineers reading this should see "we considered it, we didn't do it, here's when it'd be worth revisiting" — not "we forgot about it".

---

## 2. Current state (2026-05-06)

### 2.1 No pgvector in use

Verified via repo audit:

- No `pgvector` extension declared in any Postgres bootstrap or migration.
- No `vector(N)` column type anywhere in `drizzle/tables/` (39 table files audited).
- `documents.documentChunks.vectorId` is a `text` cross-reference field, not an in-row vector.
- `ags_rac_sources.embedding_provider_connection_id / embedding_model_ref / embedding_model_dim` are configuration fields per-source (D-EMB-1); the **actual vectors live wherever the configured provider's adapter stores them**.

### 2.2 Embedding storage today

Two paths:

- **Qdrant** — `server/vectordb/` integrates Qdrant via its HTTP API. Used by some pipelines. Not currently wired to RAC sources.
- **Per-source adapter** — `services/rac/ingestion/local-pgvector-adapter.ts` and `graphrag-adapter.ts` are stubs. Real ingestion adapters (e.g., a future Qdrant adapter, or a hosted Pinecone adapter, or an OpenAI vector store adapter) bind via the `embedding_provider_connection_id` per-source field.

The system is designed to be vector-store-agnostic at the source-row level (D-EMB-1). pgvector is one possible backend; nothing in the upper layers depends on which one is chosen.

---

## 3. Trigger conditions

A migration to pgvector becomes worth doing when ANY of these is true:

### 3.1 External-store cost crosses a threshold

If hosted vector storage (Qdrant Cloud, Pinecone, etc.) costs more per month than the engineering cost of a one-time migration, pgvector saves money. Threshold heuristic:

- Hosted store >$300/month sustained.
- AND >50% of vectors are RAC-source-bound (i.e., the savings flow to the retrofit, not unrelated systems).

### 3.2 Cross-row joins between vectors and metadata become hot

Today, retrieval queries the vector store, then enriches results with metadata from Postgres in a second round-trip. If retrieval latency p95 is dominated by the round-trip (>30% of the budget), an in-database vector index that can JOIN against `agsKnowledgeUnits` directly removes a network hop.

Measure via the Phase 10 runtime trace: `retrieval_latency_ms` minus the adapter's reported per-call time. If the difference is consistently >100ms, this trigger fires.

### 3.3 Operational complexity of a separate store outweighs the benefit

Separate stores have their own backup, scaling, security, IAM, and on-call surface. If on-call burden specifically attributable to the vector store exceeds the burden of running pgvector inside Postgres, consolidating is a net win.

### 3.4 A specific feature requires SQL-level vector ops

A future feature that needs `WHERE` with an embedding similarity threshold inside a complex JOIN — pgvector's `<->` operator becomes the simplest expression. External stores can be made to do this, but the SQL fluency is lost.

NONE of these triggers is true today.

---

## 4. Swap surface

When the migration becomes worth doing, here is the surface that changes:

### 4.1 Schema

Add the `pgvector` extension on the target database (most likely ASDB):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Add a `vector(N)` column to `agsKnowledgeChunks` (Phase 2 sibling table to `agsKnowledgeUnits`). N depends on the embedding provider:

- 1536 for OpenAI `text-embedding-3-small`
- 3072 for OpenAI `text-embedding-3-large`
- 1024 for Cohere `embed-multilingual-v3`
- 384 / 768 for sentence-transformers

The column dim MUST match the source row's `embedding_model_dim`. Cross-source mixed dims are NOT supported by a single index; pgvector requires per-dim indexes.

### 4.2 Adapter

`services/rac/ingestion/local-pgvector-adapter.ts` (currently a stub) becomes the real adapter. It implements the `RacIngestionAdapter` interface unchanged; only the body is rewritten:

- `ingestUnit(unit)` → embed the chunk content via `withEmbeddingCredential`, write the vector to the new column.
- `retrieve(query, limit)` → `SELECT ... ORDER BY chunk.vector <=> $1 LIMIT $2` (cosine distance).

### 4.3 No upper-layer changes

The retrieval planner, executor, filter, assembler, and runtime trace consume `RacRetrievalChunk` — which is store-agnostic. None of them changes.

### 4.4 D-EMB-1 is preserved

The per-source binding stays. pgvector becomes one of several possible backends; sources that bind to it use this adapter, sources that bind to Qdrant use the Qdrant adapter. There is no "the platform uses pgvector now" flag day. The migration is per-source.

---

## 5. Migration plan (when triggered)

### 5.1 Pre-flight

- Confirm pgvector extension is available on the target Postgres (Termux dev: package availability check; cloud: extension allow-list).
- Confirm at least one source's `embedding_model_dim` is fixed and known.
- Confirm the chosen source's vector volume fits inside the planned index parameters (pgvector's `ivfflat` index has known scaling limits; HNSW handles more but costs more memory).

### 5.2 Migration steps

1. **Add the extension.** `CREATE EXTENSION IF NOT EXISTS vector;` on ASDB.
2. **Add the column.** Drizzle migration adds `vector(N)` to `agsKnowledgeChunks`, nullable.
3. **Backfill.** A one-shot script reads existing chunks for the migrating source from the external store, writes them to the new column. Throttled per Postgres write budget.
4. **Build the index.** `CREATE INDEX agsKnowledgeChunks_vector_idx ON ags_knowledge_chunks USING hnsw (vector vector_cosine_ops);` (or `ivfflat`).
5. **Flip the source's adapter.** `services/rac/ingestion/dispatcher.ts` already routes by `sourceType + ownerModule`; flip the source row to point at the pgvector adapter.
6. **Validate.** Phase 4's retrieval test runs against the migrated source; results match the pre-migration adapter within tolerance (~98% rank correlation on a fixed query set).
7. **Decommission the external store** — only after a soak window of at least 7 days with green traces.

### 5.3 Back-out

If validation fails, the back-out is simple: flip the source's adapter back. The new `vector(N)` column is left in place (nullable, idle). The external store is still authoritative until the migration succeeds.

The migration is non-destructive to the external store until step 7 (decommission) — that's the point of doing it per-source.

---

## 6. What this ADR does NOT authorize

- A platform-wide flag day.
- Forcing all sources to migrate at once.
- Adding pgvector as a Phase 4 prerequisite.
- Auto-installing the pgvector extension in any deployment.

**Amended 2026-05-06 (follow-up D1):** the original wording forbade "adding a `vector(N)` column to any retrofit-scope table now." That clause is rescinded. Trigger §3.4 fired — the retrofit shipped with NO working vector retrieval (`local-pgvector-adapter.ts`, `graphrag-adapter.ts` were stubs; `knowledge-unit-adapter.ts` does jaccard token scoring, not embedding similarity). Adding the optional `vector(1536)` column to `agsKnowledgeChunks` is now authorized under the optional-engine pattern documented in §11.

The amendment does NOT authorize:
- Installing the pgvector extension in any environment automatically.
- Backfilling existing embeddings without operator action.
- Forcing any source to bind to the pgvector adapter.

The column is **nullable**; deployments without the extension installed are unaffected. The adapter probes for the extension at runtime and refuses gracefully when absent (mirrors D-PARSE-OCR-3 / -AUDIO-3 / -VIDEO-3).

---

## 7. Acceptance

- [x] Current state documented (no pgvector in use).
- [x] Trigger conditions enumerated.
- [x] Swap surface described.
- [x] Migration plan with back-out documented.
- [x] §3.4 trigger fired (no working vector retrieval shipped with the retrofit).
- [x] Amended 2026-05-06 to authorize the optional-engine path (see §11).

---

## 11. Optional-engine activation (D-PARSE-PGVECTOR-1..4)

Added 2026-05-06 as part of D1 closure. Mirrors the OCR/audio/video closure pattern.

### 11.1 Decisions

| ID | Decision | One-line rationale |
|---|---|---|
| **D-PARSE-PGVECTOR-1** | Engine binding: PostgreSQL pgvector extension on ASDB. Adapter implementation lives at `services/rac/ingestion/local-pgvector-adapter.ts` (was a stub; now real). | Existing per-source adapter slot; ASDB is the natural home since `agsKnowledgeChunks` already lives there. |
| **D-PARSE-PGVECTOR-2** | No per-workspace credential binding. The pgvector extension is ASDB-resident; the embedding provider that produces vectors is workspace-bound via D-EMB-1 (unchanged). | The "remote provider" criterion in the D4 deferral spec doesn't apply — pgvector is a local Postgres extension, not a credentialed cloud vendor. |
| **D-PARSE-PGVECTOR-3** | Adapter registers always (deterministic boot). At every `search()` call, probes `pg_extension` for the `vector` extension; refuses gracefully (`status: "unavailable"`, `source_unavailable` warning) when absent. 5-minute health-cache TTL — pgvector availability is much more stable than a remote worker's reachability. | Mirrors OCR/audio/video refusal-on-unhealthy. Operators see `unavailable` instead of an opaque crash; recovery is automatic when the extension installs and the cache flips. |
| **D-PARSE-PGVECTOR-4** | Wire contract: column is `embedding vector(1536)` on `agsKnowledgeChunks`, nullable. Sources whose embedding dim is not 1536 are refused at search-time with `embedding_dim_mismatch`. Insert/backfill is operator-driven via the manual ops migration in `scripts/migrations/manual/pgvector-optional-engine.sql`. | 1536 is the OpenAI `text-embedding-3-small` dim — the most common in deployments. Other dims need a separate column or a multi-dim side table; that's a future amendment. |

### 11.2 Activation steps (operator runbook)

1. **Confirm the extension is available** on the target ASDB:
   ```sql
   SELECT * FROM pg_available_extensions WHERE name = 'vector';
   ```
2. **Install the extension** (requires CREATE EXTENSION privilege):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. **Run the manual ops migration**: `psql -d asdb -f scripts/migrations/manual/pgvector-optional-engine.sql`. This adds the nullable `embedding vector(1536)` column to `ags_knowledge_chunks` and creates an HNSW index for cosine similarity.
4. **Verify**: `SELECT extname, extversion FROM pg_extension WHERE extname='vector';` returns a row.
5. **Wire a source**: insert an `ags_rac_sources` row with `source_type='vector_index'` and the workspace's 1536-dim embedding binding. The adapter takes over from there.
6. **Backfill (optional)**: a one-shot script reads existing chunks for that source from the prior store, embeds them, writes to the new column. Throttled per Postgres write budget.

The retrofit's automatic Drizzle migrations do NOT include any pgvector statements. Step 3 is operator-controlled.

### 11.3 Failure modes (D-PARSE-PGVECTOR-3)

| Failure | Adapter behavior | Operator surface |
|---|---|---|
| pgvector extension absent | `health()` returns `unavailable` with `pgvector_extension_not_installed`; `search()` returns empty chunks + `source_unavailable` warning | Trace dashboard shows the warning; operator runs the manual ops migration to install |
| Source dim ≠ 1536 | `health()` returns `degraded` with `embedding_dim_unsupported`; `search()` throws `EmbeddingDimMismatchError` | Trace shows the dim mismatch; operator either re-pins the source's embedding model to 1536 or waits for the multi-dim amendment |
| `embedding` column is NULL on all chunks | `search()` returns empty chunks (no rows match the cosine query); no warning | Backfill required (operator action) |
| Postgres connection unavailable | Same as the rest of ASDB-resident adapters: `asdb_unavailable` warning | Existing ASDB health surface |

### 11.4 Test strategy

Unit tests exercise the adapter via injected `getAsDb` + `withEmbeddingCredential` fakes — no live pgvector required. Tests use **deterministic fake data**:

- Fake AS-DB query returns pre-computed `(chunkId, content, score)` triples for the cosine query path.
- Fake `withEmbeddingCredential` returns a deterministic 1536-dim vector based on a hash of the query text.
- Fake `pg_extension` probe returns extension-present / extension-absent matrix.

The factory pattern (`createPgvectorAdapter(deps)`) follows D-PARSE-OCR-3's shape exactly.
