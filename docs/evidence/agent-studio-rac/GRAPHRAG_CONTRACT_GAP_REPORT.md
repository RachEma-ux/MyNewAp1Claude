# GraphRAG Public Retrieval Contract — Gap Report

**Detected during:** RAC P0 audit (2026-05-05)
**Status:** Open — does not block RAC P0–P2; affects P3 / P4 strategy
**Owner:** Data Analysis module (with Agent Studio as RAC consumer)

---

## 1. Finding

The `dataAnalysis` module exposes:

- An external GraphRAG worker (`GRAPHRAG_WORKER_URL`-style integration) that runs as a background process.
- Async query-job records: `graphragQueryRuns` table with status fields.
- Public type exports in `server/data-analysis/public-api.ts`: `GraphRagQueryMethod`, `DataAnalysisGraphRagQueryRunSummary`.

It does **not** expose:

- A synchronous public function for cross-module GraphRAG retrieval.
- A registered Module Gateway action key matching `dataAnalysis.graphrag.retrieve` (or any retrieval-shaped name) in `server/governance/action-key-map.ts`.
- An export from `public-api.ts` that an external module could call as `await gatewayCall({...})` to retrieve evidence and receive chunks.

Result: cross-module callers (RAC retrieval pipeline, P4) have no synchronous-shaped public surface to consume GraphRAG evidence today.

## 2. Why this matters for RAC

RAC P3 (ingestion adapters) and P4 (retrieval pipeline) plan to consume `dataAnalysis.graphrag.retrieve` per:

- `RAC_EXECUTION_PLAN.md` Phase 3: *"`graphrag-adapter.ts` — wraps `dataAnalysis.graphrag.retrieve` for read"*
- `RAC_EXECUTION_PLAN.md` Phase 4 Executor: *"Calls public retrieval contracts only. `dataAnalysis.graphrag.retrieve`, …"*

Neither name nor function exists today.

## 3. Decision (per execution plan §0 stop conditions)

> "No public retrieval contract from Data Analysis / GraphRAG → P2 source registry can still proceed (refs only); P3 and P4 stop until contract exists."

**Adopted resolution (does not halt RAC):**

1. **P2 (source registry) proceeds.** RAC stores GraphRAG source references (workspace-scoped, owner_module=`dataAnalysis`, external_ref_id=GraphRAG source ID). Storing a reference is not a contract violation — it's a config record.
2. **P3 (ingestion adapter) ships an adapter contract** but the `graphrag-adapter.ts` impl returns a structured `source_unavailable` warning when called, not an error. The interface is real; the backend is conditional.
3. **P4 (retrieval pipeline) calls the adapter** and propagates the warning into the trace (P7). `safe_degraded` mode continues without GraphRAG; `strict` mode fails fast with `retrieval_source_unavailable`.
4. **A separate Data Analysis follow-up** (not part of RAC execution scope) defines and registers the public contract:
   - Action key: `dataAnalysis.graphrag.retrieve`
   - Input: `{ workspaceId, sourceId, query, topK, filters? }`
   - Output: `{ chunks: Array<{content, score, citation, sourceChunkId}>, latencyMs, warnings }`
   - Wiring: register in `server/governance/action-key-map.ts`, declare in `platform_action_registry.yaml`, expose from `server/data-analysis/public-api.ts`.

When that follow-up lands, the GraphRAG adapter swaps backends without touching the planner/executor/filter. The P3 adapter contract is designed for this swap.

## 4. Adapter contract (locked here for P3)

```ts
// server/agent-studio/services/rac/ingestion/types.ts
export interface RacIngestionAdapter {
  search(input: RacRetrievalRequest): Promise<RacRetrievalResult>;
  health(): Promise<RacRetrievalHealth>;
}

export interface RacRetrievalRequest {
  workspaceId: number;
  sourceId: number;        // ags_rac_sources.id
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
  warnings: string[];        // 'source_unavailable' if backend not wired
}

export interface RacRetrievalHealth {
  ok: boolean;
  reason?: 'source_unavailable' | 'auth_failed' | 'index_stale' | 'index_empty';
}
```

The GraphRAG adapter (`graphrag-adapter.ts`) implements this interface. Until the Data Analysis follow-up lands, `search()` returns `{ chunks: [], latencyMs: 0, warnings: ['source_unavailable'] }` and `health()` returns `{ ok: false, reason: 'source_unavailable' }`.

## 5. What this gap does NOT block

- P0 / P0.5 / P0.6 (all docs)
- P1A / P1B / P1C / P1D / P1E (CAG MVP — does not retrieve)
- P2 (source registry — refs only)
- P3 (adapter contract is real; backend is conditional)

## 6. What this gap WILL affect once unlocked

- P4 retrieval over `graphrag` source type begins returning real chunks.
- P5 context assembler picks up GraphRAG citations.
- P7 RAC trace records GraphRAG latency.
- P8 evaluation can run groundedness checks against GraphRAG-sourced answers.
- P10 export readiness can use GraphRAG citation coverage as input.

## 7. Tracking

- This file is the gap declaration.
- Data Analysis owners receive a follow-up issue (not yet filed) referencing this gap.
- When the public contract lands, this file is updated with the merge SHA and `RAC_REPO_REALITY_MAP.md` §F is amended.

---

**Decision recorded by:** RAC P0 audit
**Stop condition triggered:** Yes — handled per execution plan §0 (proceed with adapter contract, do not halt RAC).
