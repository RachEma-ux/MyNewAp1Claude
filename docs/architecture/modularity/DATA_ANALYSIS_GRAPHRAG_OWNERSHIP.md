# Data Analysis owns GraphRAG (subdomain ownership)

> Authoritative ownership statement.

## The rule

```
Data Analysis = registered top-level RTLM module
GraphRAG       = Data Analysis subdomain
GraphRAG worker = Data Analysis runtime dependency
GraphRAG tables = Data Analysis-owned tables
KGRA Agent      = consumer of GraphRAG/Data Analysis outputs
                  (does NOT own GraphRAG storage)
Digital HQ / AWI = observers (read-only)
Coordinator     = used only for cross-module workflows,
                  NOT for ordinary GraphRAG indexing/query
```

GraphRAG **must not** be promoted to its own RTLM. Treat it as a
subdomain inside Data Analysis. Do not propose a separate "GraphRAG
RTLM extraction" — the canonical follow-up name is:

> **Data Analysis RTLM hardening: GraphRAG subdomain ownership, DB
> ownership, worker contract, and Digital HQ/AWI visibility**

## What changed in this PR

1. **`server/data-analysis/manifest.ts`** created — declares Data
   Analysis as a registered top-level RTLM with GraphRAG as a
   subdomain (governance actions, events, ports, routes, owned tables).
2. **MODULE_ROUTERS** — `dataAnalysis` registered (was previously
   mounted explicitly in `routers.ts`).
3. **MODULE_MAP** — `graphrag` schema ownership moved from `rag` to
   `dataAnalysis`. New connection accessor `getDataAnalysisDb`.
4. **`server/data-analysis/connection.ts`** — `getDataAnalysisDb()`
   accessor added. `service.ts` and `jobs.ts` migrated to call it.
5. **Events** — 12 `dataAnalysis.graphRag.*` events declared in the
   manifest and emitted from real lifecycle transitions in
   `service.ts`, `jobs.ts`, and `worker-client.ts`.
6. **Governance** — 4 `dataAnalysis.graphRag.*` action keys in the
   action-key map (already present in `platform_action_registry.yaml`
   from prior session, preserved).
7. **AWI / Digital HQ** — `dataAnalysis` now appears in
   `KNOWN_MODULES`, `wiring-inventory`, and the dependency graph.
   Readiness: 90, fully-wired, 0 blockers.
8. **Frontend manifest** — `client/src/modules/data-analysis/manifest.ts`
   created and registered so the AWI/nav composer treats GraphRAG
   pages as Data Analysis-owned.

## DB ownership status (Phase 1 staged)

| Aspect | Today | Follow-up |
|---|---|---|
| Manifest declaration | `kind: "shared"`, `ownedTables: [graphrag_*]` | promote to `kind: "owned"` after physical split |
| Physical location | `mynewap1claude.public.graphrag_*` (shared platform DB) | move to `dataanalysisdb` |
| Accessor | `getDataAnalysisDb()` delegates to `getDb()` | `getDataAnalysisDb()` returns dedicated drizzle instance |
| Env var | `DATABASE_URL_DATA_ANALYSISDB` documented | wire actual connection |
| `STRONG_MODULES` membership | not yet (would require `kind: "owned"`) | add after Phase 2 |

The `getDataAnalysisDb()` seam means Phase 2 is a one-line behavior
change inside `connection.ts` — no service/jobs code needs to be
touched.

## Worker contract (Data Analysis-owned)

| | |
|---|---|
| Default URL | `http://localhost:8484` |
| Env var | `GRAPHRAG_WORKER_URL` |
| Health | `GET /health` |
| Index | `POST /index` |
| Query | `POST /query` |
| Probe timeout | 5000 ms |
| Required at startup? | **No** — missing worker = Data Analysis health = `degraded` |

When unavailable:
- `dataAnalysis.graphRag.workerStatus` returns `{healthy: false, ...}`
- `buildIndex` and `query` record a `failed` run row with the worker
  error preserved
- A `dataAnalysis.graphRag.workerUnavailable` event fires once per
  transition (and `workerRecovered` when the worker comes back)
- The UI banner renders the degraded state

## KGRA boundary

KGRA Agent is a **consumer** of GraphRAG outputs, not an owner. The
boundary test `graphrag-ownership.test.ts` greps `server/kgra-agent/`
for any reference to `graphragSources`, `graphragSyncRuns`,
`graphragIndexRuns`, `graphragQueryRuns`, or `graphragArtifactRegistry`
and asserts there are zero matches.

## Out-of-scope (intentional)

- Physical move of `graphrag_*` tables to a dedicated `dataanalysisdb`.
- Promotion of Data Analysis to `database.kind: "owned"` /
  membership in `STRONG_MODULES`.
- Migration of Data Warehouse + OmniRAG sub-routers into the
  manifest's public-API surface.
- Coordinator wiring for cross-module Data Analysis workflows.

These are tracked under the canonical follow-up name above.
