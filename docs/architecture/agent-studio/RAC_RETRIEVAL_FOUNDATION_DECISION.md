# RAC Retrieval Foundation Decision

**Owner:** Agent Studio module
**Phase:** P0.5
**Status:** Adopted (this PR)
**Authority:** RAC_EXECUTION_PLAN.md §0.5; cross-references D-EMB-1..5 in `RAC_EMBEDDING_BINDING_DECISION.md`; consumes audit findings from `docs/evidence/agent-studio-rac/RAC_REPO_REALITY_MAP.md` §F (GraphRAG gap) and §E (vector infra)

---

## 1. Problem statement

P3 (ingestion adapters) and P4 (retrieval pipeline) cannot start without locked answers to:

1. Source types — final enum
2. Chunking strategy — concrete numbers
3. Embedding policy — already locked by D-EMB; this DR cross-references
4. Vector / graph index decision — pick or defer with explicit adapter contract
5. Retrieval quality filtering — concrete defaults
6. Latency target — measurable SLO

This DR locks all six. After this lands, P3 implementation begins immediately.

---

## 2. Decisions (D-RET-1 … D-RET-6)

### D-RET-1 — Source types (final enum, no `unknown`)

The `source_type` column on `ags_rac_sources` (P2 schema) carries exactly one of:

| Value | Meaning | Owner module |
| --- | --- | --- |
| `cag_pack` | Capability pack as a synthesized source (D-PRM-2 §4) | `agentStudio` |
| `memory` | `ags_runtime_memory_events` packaged via memory adapter | `agentStudio` |
| `document_collection` | Documents in `documents`/`document_chunks` + Qdrant | `agentStudio` (consumer; data lives in main DB / Qdrant) |
| `vector_index` | A registered Qdrant collection or pgvector index, generic | `agentStudio` (or external) |
| `graph_index` | GraphRAG-owned graph index | `dataAnalysis` |
| `workspace_context` | Current workspace metadata (name, member roles, active models) | `agentStudio` |
| `project_context` | Active project (Project Manager module records) | `projectsSystem` |
| `tool_result_context` | Recent successful tool outputs from `ags_runtime_tool_calls` | `agentStudio` |
| `manual_context` | Free-text per-turn injection from the chat caller | `agentStudio` |
| `external_connector` | Future: arbitrary external HTTP retrieval adapter | `external` |

`unknown` is **rejected** — same default-deny posture as D-TOOL-1. New source types extend this enum via a future RAC PR; until then, `external_connector` is the catch-all and requires explicit adapter registration.

### D-RET-2 — Chunking strategy (defaults; per-source override permitted)

```
chunkSize:                          1000 tokens (target)
chunkSizeMin:                       400 tokens (don't emit chunks smaller unless forced by document boundary)
chunkSizeMax:                       1500 tokens (hard cap; overflow splits)
overlap:                            150 tokens (15%)
hierarchicalChunking:               false  (MVP — flat chunks; P11+ may add)
preserveDocumentBoundaries:         true   (don't merge across documents)
preserveSectionHeadings:            true   (chunk respects markdown H1/H2)
metadataFields:                     ["sourceId", "documentId", "documentTitle", "chunkIndex", "headingPath", "createdAt", "embeddingModelRef"]
citationFormat:                     "[doc:{documentTitle} §{headingPath}]"
```

Per-source override fields (on `ags_rac_sources` P2 schema): `chunk_size_override`, `chunk_overlap_override`. NULL means "use defaults above."

**Rationale:** 1000-token chunks are large enough to preserve context for groundedness checks but small enough that 8 chunks fit comfortably in the 1536-token retrieval-evidence budget (D-PRM-3). 15% overlap balances dedup-resistance against signal preservation.

### D-RET-3 — Embedding policy (cross-reference to D-EMB)

Locked elsewhere. This DR re-states: `(provider_connection_id, model_ref, dim)` triple lives on `ags_rac_sources`, with `ags_rac_workspace_embedding_default` providing a workspace fallback (D-EMB-4). No silent vendor fallback (D-EMB-5).

**Concrete defaults if a workspace has no default set:**

- Cloud workspace (any active `provider_connection` with embedding capability): block source registration with `embedding_default_required` until the workspace admin sets one.
- Local workspace (`provider_connections.kind="local"` with embedding endpoint): default to that connection, model_ref recorded at the source row.

### D-RET-4 — Vector / graph index decision (adapter-first; pgvector for AS-managed; GraphRAG via gap-shaped adapter)

**Locked choice:** **adapter-first contract with two concrete backends.**

| Source type | Backend (locked here) | Status |
| --- | --- | --- |
| `document_collection` | Existing Qdrant via `server/vectordb/qdrant-service.ts` | Wired today |
| `vector_index` (Agent-Studio-managed) | Pgvector in **ASDB** (new extension) | Lands in P3 if needed |
| `graph_index` | Adapter-only with `source_unavailable` warning until Data Analysis exposes a public contract | Per `GRAPHRAG_CONTRACT_GAP_REPORT.md` |
| `memory` / `workspace_context` / `project_context` / `manual_context` / `tool_result_context` | In-process adapters (no vector index needed; small-N retrieval) | New in P3 |
| `external_connector` | Adapter-only; concrete impl per registration | Future |

**Adapter contract (final, lifted from gap report and locked here):**

```ts
export interface RacIngestionAdapter {
  search(input: RacRetrievalRequest): Promise<RacRetrievalResult>;
  health(): Promise<RacRetrievalHealth>;
}

export interface RacRetrievalRequest {
  workspaceId: number;
  sourceId: number;
  query: string;
  topK: number;
  filters?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface RacRetrievalResult {
  chunks: Array<{
    content: string;
    score: number;
    citation: string;
    sourceChunkId: string;
    metadata?: Record<string, unknown>;
  }>;
  latencyMs: number;
  warnings: string[];
}
```

**Pgvector extension decision (conditional):** If P3 implementation finds the existing Qdrant integration insufficient for AS-managed source types (e.g. memory packaging, tool_result aggregation), P3 lands a Postgres `pgvector` extension on ASDB. Migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE ags_rac_chunks ADD COLUMN embedding vector(1536);
```

This is conditional — P3 reviews and decides. The default is "reuse Qdrant via the document_collection adapter."

### D-RET-5 — Quality filtering (defaults)

```
minScore:                  0.45
maxChunks:                 8
dedupeBy:                  "hash"     (SHA-256 of chunk content; first occurrence wins)
freshnessMaxAgeDays:       null       (no default expiry; per-source override available)
citationRequired:          true       (chunk without citation metadata is dropped)
sourcePermissionFilter:    "workspace_id_match"  (chunks not in current workspace are dropped)
piiPolicy:                 "warn"     (P8 evaluation flags but does not block; P10 readiness can promote to "block")
licensePolicy:             "warn"     (same)
```

**Per-profile override:** `ags_rac_policies` (P2 table) carries column overrides. NULL → fall back to these defaults.

### D-RET-6 — Latency target (measurable SLO)

```
p50 retrieval latency:     ≤ 500ms  (warm local/indexed sources)
p95 retrieval latency:     ≤ 2000ms (normal RAC query)
hard timeout:              3000ms   (configurable per profile; default 3s)
```

**Wired to P7 trace:** `ags_rac_runtime_traces.retrieval_latency_ms` is REQUIRED non-null on every chat row that touched RAC. Per-source breakdown via `ags_rac_context_blocks.source_latency_ms`.

**Measurement loop:**
- P4 retrieval executor records `Date.now()` at start/end per source.
- P7 trace persists raw values.
- P11 UI (RAC dashboard) computes p50/p95 over rolling windows.
- P12 ops doc records the runbook for SLO violations.

---

## 3. Cross-references

- **D-EMB-1..5** (`RAC_EMBEDDING_BINDING_DECISION.md`): embeddings bind to source row; `withEmbeddingCredential` resolver; workspace default + override; no silent fallback.
- **D-PRM-3** (`RAC_PROMPT_COMPOSITION.md`): retrieval-evidence section budget = 1536 tokens. D-RET-2's 1000-token chunks fit ~1 chunk per ~1500 tokens of evidence after rendering; `maxChunks=8` × ~150-token rendered overhead per citation falls below budget.
- **D-PRM-5**: retrieval-evidence excluded from prompt cache key. Latency-sensitive retrievals don't poison prefix caching.
- **`GRAPHRAG_CONTRACT_GAP_REPORT.md`**: GraphRAG adapter is interface-real, backend-conditional. Adapter contract finalized in §D-RET-4.

---

## 4. What this enables

- **P3 ingestion adapters** can begin: types are locked; adapters wrap existing surfaces (Qdrant, memory event log) where they exist and stub `source_unavailable` where they don't.
- **P4 retrieval pipeline** can begin: defaults locked, contract locked, SLO locked.
- **P7 trace schema** has the required `retrieval_latency_ms` column.

---

## 5. Acceptance

- Source type enum is final; `unknown` not present; `external_connector` is the catch-all.
- Chunking defaults are concrete numbers.
- Embedding policy is fully delegated to D-EMB; no contradictions.
- Vector backend choice is one of: Qdrant (existing) for `document_collection`, pgvector (conditional) for AS-managed, adapter-only for GraphRAG (per gap report).
- Quality filtering defaults are concrete numbers; per-profile override mechanism specified.
- SLO is measurable via P7 trace columns.

---

## 6. How later phases apply this

- **P2:** `ags_rac_sources.source_type` enum matches D-RET-1; chunk override columns per D-RET-2; embedding columns per D-EMB-1.
- **P3:** Adapter implementations honor D-RET-4 backend mapping; ingestion respects D-RET-2 chunking; failures surface per D-RET-5.
- **P4:** Planner/filter consume D-RET-5 defaults; executor measures latency per D-RET-6.
- **P5:** Context assembler honors D-RET-2 citation format and D-PRM-3 budget.
- **P7:** Trace schema requires `retrieval_latency_ms` non-null for D-RET-6 measurement.
- **P10:** Export readiness reads filter compliance from D-RET-5.
