# RAC Vendor Lock-in Assessment

**Owner:** Agent Studio module
**RAC phase:** P12 (Rollout Readiness)
**Status:** Adopted — published with the rollout plan
**Authority:** Reference doc; no decisions are renegotiated here. Decisions live in their original DR (D-TOOL / D-EMB / D-SBX / D-PRM / D-RET).

---

## 1. Why this document exists

Three vendor surfaces show up in the Agent Studio Native RAC stack:

1. The **sandbox runtime** (P9 — `node:vm`).
2. The **embedding provider** (P0.5 / D-EMB — initially OpenAI, but the binding is per-source).
3. The **vector store** for ingestion + retrieval (P3 — local pgvector, with GraphRAG as a sibling adapter).

For each, this doc records:
- What we depend on.
- What changes if we swap it out.
- The mitigations we already encoded in DRs so the swap is local rather than viral.

The goal is **not** to claim "no lock-in" — every choice is a commitment. The goal is to make the swap cost legible so future-us doesn't surprise present-us.

---

## 2. Sandbox runtime

### 2.1 What we depend on

`server/agent-studio/services/sandbox/node-vm-sandbox.ts` uses two Node-specific surfaces:

- `vm.createContext(globals)` + `vm.runInContext(code, ctx, { timeout, codeGeneration })`. The `timeout` option is the wall-clock guarantee; `codeGeneration: { strings: false, wasm: false }` is what blocks `eval` / `new Function`.
- The implicit isolation of intrinsics inside a `vm.Context` — `Array`, `JSON`, `Math`, etc. resolve to context-local copies, distinct from the host's. This is what makes prototype mutation inside the sandbox not leak.

### 2.2 What changes if we swap it out

Per **D-SBX-IMPL-2**, the dispatcher imports `getToolSandbox()` from a registry. Concrete impls register themselves; there is no compile-time binding between the dispatcher and `nodeVmSandbox`. The interface (`ToolSandbox`) is six methods:

```ts
execute<R>(input: ToolSandboxInput): Promise<ToolSandboxResult<R>>
health(): Promise<ToolSandboxHealth>
```

…plus a small policy shape and a small error union. To swap `nodeVmSandbox` for a subprocess- or container-backed sandbox:

1. Implement the interface.
2. Replace the default registration in `services/sandbox/index.ts`.
3. Validate via the existing P9 test suite (`tests/agent-studio/sandbox-gate.test.ts`) — those tests run the **real** registered sandbox per **D-SBX-4**, so the new impl's isolation guarantees are checked the same way.

### 2.3 What is the swap cost?

| Failure mode | Where node:vm fails | What a subprocess sandbox buys us |
|---|---|---|
| Memory exhaustion in tool code | `node:vm` cannot enforce memory caps (D-SBX-IMPL-1 §4) | OS-level cgroup memory cap |
| Long-running async timers | Wall-clock cap covers the synchronous slice; async hangs need our `raceAgainstTimeout` helper | OS-level CPU + wall-clock cap |
| Network egress | Default policy denies `fetch` / `XMLHttpRequest` via Proxy traps | Network namespace isolation |
| Filesystem read | `require` is denied; `process.cwd()` is denied; but a tool that asks the host for a file via a different vector still works | Filesystem namespace isolation |

The list is short on purpose: `node:vm` is enough for the tool surface we ship today, and the swap cost is bounded by the interface. **The swap is local to the registry call site.** No other code path imports the impl directly.

### 2.4 Mitigations encoded in DRs

- **D-SBX-IMPL-2**: stable interface contract. Without this, swapping requires touching the dispatcher.
- **D-SBX-3**: dispatcher routes only `code_execution` through the sandbox. Without this, swapping affects every tool call.
- **D-SBX-4**: tests run the real impl. Without this, a swap regression isn't caught until production.
- **D-SBX-IMPL-3**: error code mapping (`SBX_TIMEOUT`, `SBX_DENY_GLOBAL`, `SBX_UNAVAILABLE`, `SBX_THROWN`). Without this, the dispatcher would have to differentiate between sandboxes.

---

## 3. Embedding provider

### 3.1 What we depend on

The default embedding provider is OpenAI's `text-embedding-3-small` (1536-dim) per the P0.5 default. The binding is **per-source row**, not global, via:

- `ags_rac_sources.embedding_provider_connection_id` (FK into `provider_connections`)
- `ags_rac_sources.embedding_model_ref`
- `ags_rac_sources.embedding_model_dim`
- `ags_rac_sources.embedding_model_version`

The credential resolver (`server/provider-connections/internal/credential-resolver.ts`) gates access via `withEmbeddingCredential` — only `services/rac/ingestion/` is on the allow list (P3 boundary check).

### 3.2 What changes if we swap it out

A new provider connection in `provider_connections` + an updated `embeddingModelRef` on the source row is all the configuration change. No code edits.

The dim must match the index dim — pgvector indexes are dim-locked at creation time. Switching from 1536 to 768 means a re-index. The `validateIndex` action (P3) detects the mismatch on next ingestion.

### 3.3 What is the swap cost?

| Provider | Dim | Cost vs OpenAI 3-small | Latency p50 | Notes |
|---|---|---|---|---|
| OpenAI text-embedding-3-small | 1536 | 1× (baseline) | ~80 ms | Default |
| OpenAI text-embedding-3-large | 3072 | 6.5× | ~120 ms | Larger index, marginal recall improvement on small corpora |
| Cohere embed-multilingual-v3 | 1024 | 2× | ~140 ms | Better non-English |
| Local sentence-transformers | 384–768 | 0× ($) | ~250 ms | Self-hosted; latency variance under load |
| HuggingFace TEI | varies | 0× ($) | varies | Same calculus as local sentence-transformers |

Cost numbers are illustrative; actuals depend on the provider's pricing at swap time. **The point is the swap doesn't require code, only configuration**, because **D-EMB** locked the binding to the source row.

### 3.4 Mitigations encoded in DRs

- **D-EMB-1**: per-source binding, not global config. Without this, the swap is a workspace-wide flag day.
- **D-EMB-2**: credential resolution via `withEmbeddingCredential` and the boundary allow list. Without this, the provider connection layer would be coupled to the embedder layer.
- **D-EMB-3**: dim + model + version persisted on the source row. Without these, you can't tell from the ledger which embedding produced a given index, so a re-index is forced even when not needed.

---

## 4. Vector store

### 4.1 What we depend on

P3 ships two adapters behind a common `RacIngestionAdapter` interface (`server/agent-studio/services/rac/ingestion/`):

- `local-pgvector-adapter.ts` — uses `pgvector` extension on the local Postgres. Indexes live alongside ASDB.
- `graphrag-adapter.ts` — calls into the existing GraphRAG worker via the data-analysis module gateway. Lower-volume, higher-relevance for graph-shaped corpora.

### 4.2 What changes if we swap it out

The dispatcher (`services/rac/ingestion/dispatcher.ts`) selects the adapter by `source.sourceType`. Adding a new vector store means:

1. New adapter file implementing the interface.
2. New `RacSourceType` enum entry in `services/rac/sources/types.ts`.
3. New `case` in the dispatcher's switch.

That is the entire seam. The retrieval planner / executor / filter (P4) consume `RacRetrievalChunk`; the adapter normalises to that shape.

### 4.3 What is the swap cost?

| Store | Cost shape | Latency p50 | Notes |
|---|---|---|---|
| pgvector (local) | $0; storage = DB size | ~30 ms | Default. Limits at ~1M chunks per index |
| Qdrant (self-hosted) | Operator-cost; storage scales | ~20 ms | Better for >1M chunks |
| Pinecone (managed) | Per-pod $$; metered queries | ~40 ms | Network round-trip dominates |
| Weaviate / Chroma / Vespa | varies | varies | Same adapter pattern applies |

The data migration cost dominates the swap cost. The code cost is a single new file.

### 4.4 Mitigations encoded in DRs

- **D-RET-1**: locked source-type enum, with `external_connector` as the catch-all. New stores can land as `external_connector` first, get a dedicated enum value once stable.
- **D-RET-2**: retrieval planner is store-agnostic; it consumes `RacRetrievalChunk`. Without this, swapping a store would mean rewriting the planner.

---

## 5. Drizzle ORM + Postgres

### 5.1 What we depend on

The 7 RAC tables (`ags_rac_*`) live on ASDB (the dedicated Agent Studio DB; see CLAUDE.md). Schema is defined in `drizzle/tables/agent-studio.ts`; migrations are in `drizzle/0040_rac_source_registry.sql` and `drizzle/0041_rac_trace.sql`.

The Drizzle schema layer is portable across PG-compatible stores (CockroachDB, AlloyDB, etc.). The pgvector extension is the harder dependency: a non-PG store would force vector storage out of the relational layer.

### 5.2 What changes if we swap it out

- **PG → PG-compatible (Cockroach / AlloyDB):** Drizzle migrations apply unchanged. pgvector availability is the gating factor. Cockroach has it; AlloyDB has its own equivalent.
- **PG → MySQL/SQLite:** Drizzle adapters exist; the migrations need rewriting. pgvector is unavailable, so vector storage moves to a sibling vector store (§4) and the source registry is reduced to a metadata table.
- **PG → DynamoDB / Spanner:** A bigger lift. The relational queries in `rac/sources/store.ts` use joins; rewriting them for a key-value store is a project, not a swap.

### 5.3 Mitigations encoded in DRs

The plan never had a "Drizzle/PG decision record" because the choice predates RAC. We inherit the same lock-in surface as the rest of the platform; RAC does not deepen it.

---

## 6. CAG / prompt composer

### 6.1 What we depend on

The composer (`services/cag/composer.ts`) is plain TypeScript with no external dependencies beyond `@anthropic-ai/tokenizer` for the token estimate. The capability pack is JSON; the rendered output is plain text. Section IDs are a fixed string union (`D-PRM-1`).

### 6.2 What changes if we swap it out

There is nothing vendor-specific to swap. The token estimate is provider-agnostic (it's an estimate, not a billing figure). The composer's output is plain text consumed by whatever provider the agent's binding points at.

### 6.3 Lock-in

None worth recording. The composer is a domain primitive, not a vendor surface.

---

## 7. Net assessment

| Surface | Lock-in tier | Swap effort | Encoded mitigation |
|---|---|---|---|
| Sandbox runtime | Low | Small (one new file + registry update) | D-SBX-IMPL-2 / D-SBX-3 / D-SBX-4 / D-SBX-IMPL-3 |
| Embedding provider | Low | Configuration only | D-EMB-1 / D-EMB-2 / D-EMB-3 |
| Vector store | Medium | One new adapter + data migration | D-RET-1 / D-RET-2 |
| Drizzle / Postgres | Medium-High | Inherits platform lock-in; not RAC's concern | (n/a) |
| Composer | None | n/a | n/a |

The reason every RAC-specific surface lands at "low/medium" lock-in is that **the boundary work happened in the pre-bundle DRs (P0 / P0.5 / P0.6)** before any code shipped. Without those DRs the same surfaces would be high lock-in: dispatcher coupled to one sandbox, retrieval coupled to one vector store, embeddings hard-wired to one provider. Locking the boundaries first kept the swap cost legible.

---

## 8. Acceptance for this assessment

- [x] Each vendor surface has a "what we depend on" subsection.
- [x] Each has a swap-cost estimate (qualitative + table where useful).
- [x] Each lists the DR that contains the mitigation, so future-us can find the original commitment.
- [x] No new decisions are introduced in this doc; it summarises and indexes the ones already locked.
