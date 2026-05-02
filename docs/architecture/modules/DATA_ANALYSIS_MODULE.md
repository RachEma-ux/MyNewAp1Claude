# Data Analysis Module

> Canonical RTLM owner of the **GraphRAG** and **Data Acquisition**
> subdomains. Both are *subdomains inside Data Analysis*, **not** RTLMs
> of their own. Document Intelligence is one specialized pipeline
> inside Data Acquisition; it is not its own RTLM either.

## Identity

| | |
|---|---|
| Module key | `dataAnalysis` |
| Router key | `dataAnalysis` |
| Backend folder | `server/data-analysis/` |
| Frontend folder | `client/src/modules/data-analysis/` (canonical), `client/src/pages/data-analysis/` (page implementations) |
| Base route | `/data-analysis` (redirects to `/data-analysis/graphrag`) |
| Canonical DB accessor | `getDataAnalysisDb()` (Phase-1 staged: shares the platform DB) |

## Subdomains

```
Data Analysis (RTLM)
├── GraphRAG                       — knowledge-graph index/query (Microsoft graphrag worker)
├── Data Acquisition               — universal, source-agnostic, data-type-agnostic acquisition layer
│   └── Document Intelligence      — one specialized pipeline (parser routing + canonical document model)
├── Data Warehouse                 — analytical fact tables
├── OmniRAG adapter                — Phase-1 external OmniRAG facade
└── (future) ...
```

GraphRAG and Data Acquisition are exposed via the manifest's public-API
surface. Data Warehouse + OmniRAG remain accessible through the legacy
sub-routers (`dataAnalysis.dataWarehouse.*`,
`dataAnalysis.graphRag.omnirag*`) and will be promoted into the
manifest as their own ownership work lands.

For the Data Acquisition design — connectors, pipelines, canonical
model, worker contract, DB ownership, governance, events, AWI visibility —
see [`DATA_ACQUISITION_SUBDOMAIN.md`](../modularity/DATA_ACQUISITION_SUBDOMAIN.md).

## Database ownership (Phase-1 staged)

Data Analysis declares `database.kind: "shared"` over the platform DB
and lists these tables as `ownedTables`:

GraphRAG tables:

- `graphrag_sources`
- `graphrag_sync_runs`
- `graphrag_index_runs`
- `graphrag_query_runs`
- `graphrag_artifact_registry`

Data Acquisition tables (subdomain — owned by Data Analysis):

- `data_acquisition_sources`
- `data_acquisition_runs`
- `data_acquisition_items`
- `data_acquisition_classifications`
- `data_acquisition_routes`
- `data_acquisition_processing_runs`
- `data_acquisition_quality_results`
- `data_acquisition_canonical_records`
- `data_acquisition_output_runs`
- `data_acquisition_audit_events`
- `data_acquisition_documents` *(Document Intelligence specialization)*

Physical migration to a dedicated `dataanalysisdb` (env:
`DATABASE_URL_DATA_ANALYSISDB`) is tracked under the follow-up:

> **Data Analysis RTLM hardening: GraphRAG subdomain ownership, DB
> ownership, worker contract, and Digital HQ/AWI visibility**

The `getDataAnalysisDb()` accessor in `server/data-analysis/connection.ts`
is the single seam for the future split — `service.ts` and `jobs.ts`
already call through it.

## Public-API surface (Module Gateway)

| Action | Risk | Receipt |
|---|---|---|
| `dataAnalysis.graphRag.workerStatus` | low | no |
| `dataAnalysis.graphRag.listSources` | low | no |
| `dataAnalysis.graphRag.listSyncRuns` | low | no |
| `dataAnalysis.graphRag.listIndexRuns` | low | no |
| `dataAnalysis.graphRag.listQueryRuns` | low | no |
| `dataAnalysis.graphRag.registerSource` | low | no |
| `dataAnalysis.graphRag.syncSource` | low | no |
| `dataAnalysis.graphRag.buildIndex` | medium | **yes** (`reason`) |
| `dataAnalysis.graphRag.query` | low | no |

## Events

All emitted via `publishEvent(makeEnvelope({ sourceModule: "dataAnalysis" }))`.

| Event | Emitter |
|---|---|
| `dataAnalysis.graphRag.sourceRegistered` | `service.registerSource` |
| `dataAnalysis.graphRag.syncStarted/Completed/Failed` | `jobs.runSyncJob` |
| `dataAnalysis.graphRag.indexStarted/Completed/Failed` | `jobs.runIndexJob` |
| `dataAnalysis.graphRag.queryStarted/Completed/Failed` | `jobs.runQueryJob` |
| `dataAnalysis.graphRag.workerUnavailable/Recovered` | `worker-client.checkWorkerHealth` (state transition only) |

## Worker contract

GraphRAG depends on a Python worker (Microsoft `graphrag` library).
The worker is declared as a **Data Analysis runtime port**:

```ts
{
  key: "graphRagWorker",
  env: "GRAPHRAG_WORKER_URL",
  defaultUrl: "http://localhost:8484",
  mode: "external",
  required: false,
}
```

When the worker is unreachable:
- `dataAnalysis.graphRag.workerStatus` returns `{healthy: false, ...}` with a readable message
- `buildIndex` and `query` record a `failed` run row with the worker error
- `dataAnalysis.graphRag.workerUnavailable` event fires (once per transition)
- The UI banner renders the degraded state — **no crash, no blank screen, no silent failure**

## Governance

The four governance keys are registered in
`config/governance/platform_action_registry.yaml`:

- `dataAnalysis.graphRag.registerSource` — R2, capability `knowledge.manage`, no approval
- `dataAnalysis.graphRag.syncSource` — R2, capability `knowledge.manage`, no approval
- `dataAnalysis.graphRag.buildIndex` — **R3**, capability `knowledge.manage`, `role_any` approval, **evidence: reason required**
- `dataAnalysis.graphRag.query` — R2, capability `knowledge.manage`, no approval

`buildIndex` without evidence returns 409 CONFLICT with the message
"Evidence requirement not met …; Missing evidence types: reason."

## KGRA boundary

KGRA Agent (`server/kgra-agent/*`) is a **consumer** of Data Analysis
outputs. It must not import any GraphRAG storage table (`graphragSources`,
`graphragSyncRuns`, `graphragIndexRuns`, `graphragQueryRuns`,
`graphragArtifactRegistry`) directly. The boundary test
`graphrag-ownership.test.ts` enforces this.

## Coordinator boundary

Coordinator is **not** used for ordinary GraphRAG indexing or query.
Cross-module workflows (e.g. PS handing a curated dataset to Data
Analysis for indexing) are reserved future work — handoff types live
in `server/data-analysis/handoffs.ts` (currently empty).

## Files

| Path | Purpose |
|---|---|
| `server/data-analysis/manifest.ts` | Canonical RTLM manifest + boot-time `registerPublicApi` calls |
| `server/data-analysis/public-api.ts` | Public-surface barrel |
| `server/data-analysis/contracts.ts` | Cross-boundary types |
| `server/data-analysis/events.ts` | 12 GraphRAG event constants |
| `server/data-analysis/handoffs.ts` | Reserved for future cross-module handoffs |
| `server/data-analysis/ports.ts` | Worker contract + provided ports + runtime endpoints |
| `server/data-analysis/connection.ts` | `getDataAnalysisDb()` Phase-1 seam |
| `server/data-analysis/data-analysis.health.ts` | Composite health (DB + worker) |
| `server/data-analysis/router.ts` | tRPC router (graphRag + dataWarehouse sub-routers) |
| `server/data-analysis/graphrag/graphRag.worker.ts` | Canonical worker status entrypoint |
| `server/data-analysis/graphrag/{service,jobs,router,types,source-registry,worker-client}.ts` | GraphRAG subdomain implementation |
| `server/data-analysis/graphrag/adapters/*.ts` | Source adapters (Documents, sample books) |

## Tests

`server/data-analysis/__tests__/` — 5 suites:
- `data-analysis-manifest.test.ts` — manifest contract assertions
- `graphrag-ownership.test.ts` — boundary tests (no separate RTLM, KGRA boundary, MODULE_MAP, accessor usage)
- `graphrag-public-api.test.ts` — 9 actions registered with correct receipts
- `graphrag-worker-status.test.ts` — worker contract + degraded-state behavior
- `graphrag-events.test.ts` — 12 events aligned with manifest emits
