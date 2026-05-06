# Agent Studio pgvector Future Migration — ADR

**Owner:** Agent Studio module + Platform infrastructure
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted as forward-looking; **not** an MVP requirement
**Authority:** Documents the conditions under which the platform would migrate vector storage into Postgres via pgvector, and what the swap surface looks like. Does NOT authorize the migration.

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
- Adding a `vector(N)` column to any retrofit-scope table now.

This ADR is forward-looking. The retrofit (Phases 0–14) does NOT touch vector storage. When/if the triggers in §3 fire, a separate planning + execution arc lands the migration.

---

## 7. Acceptance

- [x] Current state documented (no pgvector in use).
- [x] Trigger conditions enumerated.
- [x] Swap surface described.
- [x] Migration plan with back-out documented.
- [x] Explicitly NOT authorized for the retrofit scope.
- [ ] Re-evaluate when any §3 trigger fires.
