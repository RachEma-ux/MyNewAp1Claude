# Data Acquisition Subdomain

> **Ownership:** `dataAnalysis` RTLM → `dataAcquisition` subdomain.
> **Status:** Phase 2 wired (branch
> `feat/data-acquisition-full-implementation`).
> Phase 1 = universal core + Document Intelligence + worker contract.
> Phase 2 = 9 specialization tables, 11 per-mode pipelines, per-pipeline
> worker RPCs, 6 output modules, 10 split external-connector files,
> 11 per-page client surface + 12 components.
> **Worker:** external Python service at `http://localhost:8485`
> (`DATA_ACQUISITION_WORKER_URL`).

## Mission

> Data Acquisition is the universal, governed, source-agnostic and
> data-type-agnostic acquisition layer inside Data Analysis. It handles
> documents, sensors, streams, APIs, databases, SaaS, web, Git, manual
> forms, media, and webhooks through one acquisition core, then routes
> each item into the appropriate specialized processing pipeline.
> Document Intelligence is the **first** specialized pipeline, not the
> whole system.

## Non-negotiable architecture rules

1. Data Acquisition is **a Data Analysis subdomain**, not an RTLM.
2. Data Analysis is the canonical owner.
3. Data Acquisition is **source-agnostic and data-type-agnostic**.
4. Document Intelligence is one pipeline inside Data Acquisition.
5. GraphRAG may consume Data Acquisition outputs (event-driven).
6. KGRA Agent may consume GraphRAG / Data Analysis outputs but does not
   own Data Acquisition or GraphRAG storage.
7. Data Acquisition must not bypass Governance.
8. Data Acquisition must not import private code from other modules.
9. Data Acquisition must not create fake parser/worker success.
10. External connectors that are not configured must return clear
    `unconfigured` or `degraded` status.
11. External worker unavailable must produce a clean degraded state and
    failed run records — never a crash, never a fake success.
12. No OpenAI / paid parser keys are required for validation.
13. No TypeScript / boundary / governance / AWI / DB-ownership weakening.
14. Coordinator is **not** used for ordinary Data Acquisition actions.

## Core principle

```
Everything is a data source
  → Everything becomes a governed acquisition record
  → Everything is classified, normalized, validated, traceable
  → Everything can feed RAG / GraphRAG / analytics / reports / alerts /
    warehouse / automation
```

## Universal pipeline

```
Source Registry
  ↓
Universal Intake Gate
  ↓
Acquisition Run
  ↓
Data Type Detection
  ↓
Acquisition Mode Router
  ↓
Mode-Specific Processing Pipeline
  ├── Document Intelligence
  ├── Sensor / IoT Processing
  ├── Stream Processing
  ├── API Sync
  ├── Database Sync / CDC
  ├── SaaS Connector Sync
  ├── Web / Crawl Extraction
  ├── Git / Repository Extraction
  ├── Manual / Form Capture
  └── Webhook / Event Capture
  ↓
Validation & Quality Engine
  ↓
Canonical Acquisition Model
  ↓
Output Pipelines
  ├── RAG
  ├── GraphRAG
  ├── Analytics
  ├── Warehouse
  ├── Alerts
  └── Reports
  ↓
Governance / Audit / Provenance
```

Document Intelligence sits in the *Mode-Specific Processing Pipeline*
slot. Other modes share the same intake/routing/validation/canonical/
output infrastructure.

## Backend layout

```
server/data-analysis/
├── manifest.ts                     # adds Data Acquisition routes,
│                                   # governance, events, runtime port,
│                                   # public-API handlers
├── router.ts                       # mounts dataAcquisition router
├── public-api.ts                   # re-exports Data Acquisition surface
├── ports.ts                        # adds dataAcquisitionWorker endpoint
├── data-analysis.health.ts         # probes both workers
└── data-acquisition/
    ├── dataAcquisition.router.ts
    ├── dataAcquisition.service.ts
    ├── dataAcquisition.repository.ts
    ├── dataAcquisition.validation.ts (zod inputs)
    ├── dataAcquisition.contracts.ts  (cross-boundary types)
    ├── dataAcquisition.types.ts      (internal pipeline types)
    ├── dataAcquisition.events.ts
    ├── dataAcquisition.public-api.ts (registry helpers)
    ├── dataAcquisition.worker.ts     (HTTP client at :8485)
    ├── dataAcquisition.health.ts
    ├── dataAcquisition.constants.ts  (source/item/pipeline/output enums)
    ├── connectors/
    │   ├── connector.types.ts
    │   ├── connector.registry.ts        (explicit imports — no factory)
    │   ├── local.connector.ts           (real)
    │   ├── manual.connector.ts          (real)
    │   ├── webhook.connector.ts         (real)
    │   ├── s3.connector.ts              (Phase 2)
    │   ├── gdrive.connector.ts          (Phase 2)
    │   ├── github.connector.ts          (Phase 2)
    │   ├── api.connector.ts             (Phase 2)
    │   ├── database.connector.ts        (Phase 2)
    │   ├── sensor.connector.ts          (Phase 2)
    │   ├── stream.connector.ts          (Phase 2)
    │   ├── saas.connector.ts            (Phase 2)
    │   ├── web.connector.ts             (Phase 2)
    │   ├── objectStorage.connector.ts   (Phase 2)
    │   └── externalConnector.factory.ts (legacy thin shim)
    │       (each external connector declares its env vars + config
    │        schema; reports `unconfigured` until env/source-row config
    │        arrives — never fakes success)
    ├── pipelines/
    │   ├── document/
    │   │   ├── documentClassifier.ts
    │   │   ├── parserRouter.ts
    │   │   ├── parserExecution.ts       (Phase 2 — calls /parse with
    │   │   │                              timeout + fallback chain)
    │   │   ├── reconstruction.ts        (Phase 2 — assembles parser
    │   │   │                              output into ordered sections)
    │   │   ├── canonicalDocumentModel.ts
    │   │   └── documentValidation.ts
    │   ├── sensor/                      (Phase 2)
    │   │   ├── sensorNormalizer.ts
    │   │   └── timeSeriesValidator.ts
    │   ├── stream/                      (Phase 2)
    │   │   ├── streamDecoder.ts
    │   │   └── eventNormalizer.ts
    │   ├── api/                         (Phase 2)
    │   │   ├── apiSync.ts
    │   │   └── responseNormalizer.ts
    │   ├── database/                    (Phase 2)
    │   │   ├── schemaIntrospection.ts
    │   │   └── cdcSync.ts
    │   ├── object-storage/              (Phase 2)
    │   │   ├── objectDiscovery.ts
    │   │   └── objectClassifier.ts
    │   ├── saas/                        (Phase 2)
    │   │   ├── saasNormalizer.ts
    │   │   └── collaborationExtractor.ts
    │   ├── web/                         (Phase 2)
    │   │   ├── crawler.ts
    │   │   └── htmlExtractor.ts
    │   ├── git/                         (Phase 2)
    │   │   ├── repoExtractor.ts
    │   │   └── codeClassifier.ts
    │   ├── manual/                      (Phase 2)
    │   │   └── formNormalizer.ts
    │   ├── webhook/                     (Phase 2)
    │   │   ├── webhookNormalizer.ts
    │   │   └── signatureVerifier.ts
    │   ├── media/                       (Phase 2)
    │   │   ├── mediaClassifier.ts
    │   │   └── mediaMetadataExtractor.ts
    │   └── output/
    │       ├── outputRunner.ts
    │       ├── ragOutput.ts             (Phase 2)
    │       ├── graphRagOutput.ts        (Phase 2)
    │       ├── analyticsOutput.ts       (Phase 2)
    │       ├── warehouseOutput.ts       (Phase 2)
    │       ├── alertOutput.ts           (Phase 2)
    │       └── reportOutput.ts          (Phase 2)
    └── __tests__/
        ├── dataAcquisition.service.test.ts
        ├── dataAcquisition.router.test.ts
        ├── dataAcquisition.public-api.test.ts
        ├── dataAcquisition.worker.test.ts
        ├── dataAcquisition.events.test.ts
        └── dataAcquisition.phase2.test.ts  (Phase 2 — connector
                                              registry, per-mode
                                              pipelines, output
                                              modules, specialization
                                              tables)
```

Non-document pipelines (sensor, stream, api, database, web, git, saas,
object-storage, manual, webhook, media) share the same intake/
classification/routing/processing/canonical/output flow. As of Phase 2
each mode has its own classifier/normalizer module under
`pipelines/<mode>/` producing canonical record shapes; the worker
capability still does the heavy lifting (`/classify`, `/route`,
`/parse`, `/ocr`, `/reconstruct`, `/validate`, `/output`), and the
service layer dispatches per-pipeline RPCs and records every state
transition. Worker unreachable / timeout / non-2xx still produces a
clean `failed`/`degraded` run row — never fake success.

## Database

Owned by Data Analysis (Phase-1 staged — physical tables live in the
shared platform DB; logical owner is `dataAnalysis`; the seam for the
future physical move to `dataanalysisdb` is `getDataAnalysisDb()` in
`server/data-analysis/connection.ts`).

Tables (`drizzle/0034_data_acquisition.sql`,
`drizzle/0035_data_acquisition_phase2.sql`,
`drizzle/tables/data-acquisition.ts`):

Core (universal — every source type writes here):

- `data_acquisition_sources` — registered sources (one row per
  `(workspace, sourceType, sourceUri)`)
- `data_acquisition_runs` — each "go fetch" invocation
- `data_acquisition_items` — discovered/acquired units
- `data_acquisition_classifications` — classifier verdicts
- `data_acquisition_routes` — routing decisions + fallback chain
- `data_acquisition_processing_runs` — pipeline executions
- `data_acquisition_quality_results` — confidence + issues
- `data_acquisition_canonical_records` — normalized canonical records
- `data_acquisition_output_runs` — output pipeline emissions
- `data_acquisition_audit_events` — narrow audit trail
- `data_acquisition_batches` — Phase 2: groups items inside a run for
  batched per-mode pipelines (sensor windows, stream micro-batches,
  api page-cursors, etc.)

Specialization:

- `data_acquisition_documents` — Document Intelligence specialization
  (parser used, fallback used, page count, canonical document JSON)
- `data_acquisition_sensor_readings` — Phase 2 — IoT/time-series
  readings (deviceId, metricKey, value, unit, ts)
- `data_acquisition_stream_events` — Phase 2 — decoded stream events
  (topic, partition, offset, payload, eventTime)
- `data_acquisition_api_records` — Phase 2 — normalized API responses
  (endpoint, method, requestKey, payload, fetchedAt)
- `data_acquisition_db_records` — Phase 2 — DB sync / CDC rows
  (schemaName, tableName, primaryKey, op, rowSnapshot)
- `data_acquisition_media_assets` — Phase 2 — media metadata
  (mediaType, mimeType, durationMs, dimensions, exif)
- `data_acquisition_web_pages` — Phase 2 — extracted web pages
  (url, title, html, text, links, fetchedAt)
- `data_acquisition_git_objects` — Phase 2 — Git extraction
  (repo, ref, path, kind, sha, language, summary)
- `data_acquisition_form_submissions` — Phase 2 — manual/form intake
  (formId, fields, attachments, submittedBy, submittedAt)
- `data_acquisition_webhook_events` — Phase 2 — webhook envelopes
  (provider, eventName, signatureValid, deliveryId, payload)

Phase-2 tables ship as physical tables in the platform DB under the
`dataAnalysis` logical owner (same Phase-1 staging seam — one-line
flip in `getDataAnalysisDb()` when the dedicated DB is provisioned).
The canonical record table still absorbs records that do not match a
specialization shape via `recordType`.

## Worker contract

```ts
DATA_ACQUISITION_WORKER_DEFAULT_URL  = "http://localhost:8485";
DATA_ACQUISITION_WORKER_ENV          = "DATA_ACQUISITION_WORKER_URL";
DATA_ACQUISITION_WORKER_TIMEOUT_MS   = 5000;
capabilities                         = ["classify", "route", "parse",
                                        "ocr", "reconstruct",
                                        "validate", "output"];
```

Behavior:

| Probe outcome      | Worker status | Run row written by service |
| ------------------ | ------------- | -------------------------- |
| reachable (`200`)  | `healthy`     | progresses to `running` →  |
|                    |               | (per-pipeline RPC)         |
| reachable, non-2xx | `degraded`    | `failed` with HTTP message |
| unreachable        | `degraded`    | `failed` with error text   |
| timeout            | `degraded`    | `failed` with timeout text |

Phase 2 wires real per-pipeline HTTP POST callers in
`dataAcquisition.worker.ts` for each capability above, with timeout +
JSON parse + structured error handling. `service.runProcessing`
dispatches by pipeline mode and calls the matching worker capability
— recording a `failed`/`degraded` run on unreachable/timeout/bad
response. **Never fakes success.**

The worker is **not** installed as part of this PR. It is an external
runtime dependency and missing it produces clean degraded state, never
a crash. UI banner (`WorkerStatusBanner` —
`client/src/modules/data-analysis/data-acquisition/components/`)
renders when the worker is unhealthy.

`workerUnavailable` / `workerRecovered` events emit on transition only,
not on every probe.

## Public API (Module Gateway)

All actions are registered via `registerPublicApi(...)` from the Data
Analysis manifest `boot()`. The gateway proxies to the service layer —
no governance bypass, no direct worker calls, no fake success.

Generic actions:

- `dataAnalysis.dataAcquisition.workerStatus`
- `dataAnalysis.dataAcquisition.summary`
- `dataAnalysis.dataAcquisition.registerSource`
- `dataAnalysis.dataAcquisition.updateSource`
- `dataAnalysis.dataAcquisition.disableSource`
- `dataAnalysis.dataAcquisition.runAcquisition`
- `dataAnalysis.dataAcquisition.discoverItems`
- `dataAnalysis.dataAcquisition.classifyItem`
- `dataAnalysis.dataAcquisition.routeItem`
- `dataAnalysis.dataAcquisition.runProcessing`
- `dataAnalysis.dataAcquisition.runOutputPipeline`
- `dataAnalysis.dataAcquisition.exportCanonicalRecord`
- `dataAnalysis.dataAcquisition.getCanonicalRecord`

Document-specific actions (Document Intelligence is one specialized
pipeline, exposed under `*.document.*`):

- `dataAnalysis.dataAcquisition.document.classify`
- `dataAnalysis.dataAcquisition.document.routeParser`
- `dataAnalysis.dataAcquisition.document.runParser`
- `dataAnalysis.dataAcquisition.document.validate`
- `dataAnalysis.dataAcquisition.document.runOutputPipeline`
- `dataAnalysis.dataAcquisition.document.getCanonical`

## Governance actions

All declared in `dataAnalysisManifest.governanceActions` with explicit
risk and `receiptRequired` flags. Wildcards are forbidden.

| Key                                                            | Risk   | Receipt |
| -------------------------------------------------------------- | ------ | ------- |
| `dataAnalysis.dataAcquisition.registerSource`                  | low    | no      |
| `dataAnalysis.dataAcquisition.updateSource`                    | low    | no      |
| `dataAnalysis.dataAcquisition.disableSource`                   | low    | no      |
| `dataAnalysis.dataAcquisition.runAcquisition`                  | low    | no      |
| `dataAnalysis.dataAcquisition.classifyItem`                    | low    | no      |
| `dataAnalysis.dataAcquisition.routeItem`                       | low    | no      |
| `dataAnalysis.dataAcquisition.runProcessing`                   | medium | **yes** |
| `dataAnalysis.dataAcquisition.runOutputPipeline`               | medium | **yes** |
| `dataAnalysis.dataAcquisition.exportCanonicalRecord`           | medium | **yes** |
| `dataAnalysis.dataAcquisition.document.runParser`              | medium | **yes** |
| `dataAnalysis.dataAcquisition.document.validate`               | low    | no      |
| `dataAnalysis.dataAcquisition.document.runOutputPipeline`      | medium | **yes** |

`server/governance/action-key-map.ts` maps every router/public-API
action to a declared governance action key (no implicit fallthrough).
`config/governance/platform_action_registry.yaml` is the policy-
authority view; the same keys are listed there with module
attribution = `dataAnalysis`.

Governance audit/provenance records: source, connector used, routing
decision, parser/processor, fallback chain, cost estimate, confidence
score, pipeline version, actor, workspace, timestamp.

## Events

Catalog: `server/data-analysis/data-acquisition/dataAcquisition.events.ts`.
Twenty-one events, all under the `dataAnalysis.dataAcquisition.*`
namespace and emitted via the platform event bus
(`publishEvent(makeEnvelope({ sourceModule: "dataAnalysis", ... }))`).
Events fire only after real state changes — never speculatively.

Generic lifecycle: `sourceRegistered`, `acquisitionStarted`,
`acquisitionCompleted`, `acquisitionFailed`, `itemDiscovered`,
`itemClassified`, `itemRouted`, `processingStarted`,
`processingCompleted`, `processingFailed`, `canonicalRecordCreated`,
`qualityValidated`, `outputPipelineStarted`,
`outputPipelineCompleted`, `outputPipelineFailed`,
`workerUnavailable`, `workerRecovered`.

Document-specific:
`document.parserSelected`, `document.parserFallbackTriggered`,
`document.reconstructed`, `document.validated`.

## Output pipelines

Output runs are recorded in `data_acquisition_output_runs`. Output
types: `rag`, `graphrag`, `analytics`, `warehouse`, `alerts`,
`reports`, `markdown`, `html`, `pdf`.

Cross-module output (RAG, GraphRAG, Warehouse, Analytics) flows over
the platform event bus, not via direct cross-module function calls.
Data Acquisition records the output run, marks it completed once the
intent is recorded, and emits `outputPipelineCompleted`. Subscribing
modules (e.g. GraphRAG) ingest the canonical record on receipt.

Phase 2 splits each output type into its own module under
`pipelines/output/`:

| Module               | Behavior                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `ragOutput.ts`       | record output run; attempt internal RAG service if available; degraded otherwise |
| `graphRagOutput.ts`  | record output run; attempt GraphRAG service if available; degraded otherwise |
| `analyticsOutput.ts` | record output run; attempt analytics service if available; degraded otherwise |
| `warehouseOutput.ts` | record output run; attempt warehouse service if available; degraded otherwise |
| `alertOutput.ts`     | record output run; attempt alert service if available; degraded otherwise |
| `reportOutput.ts`    | record output run; attempt report service if available; degraded otherwise |

Each module emits `outputPipelineCompleted` or `outputPipelineFailed`
through the event bus. None fakes success when the downstream service
is unavailable — the run row is marked `failed` or `degraded` with a
readable error.

## Frontend

Phase 2 splits the single-page shell into a per-route module surface
under `client/src/modules/data-analysis/data-acquisition/`:

```
data-acquisition/
├── routes.tsx                          # 11 module routes
├── nav.ts                              # nav-group entries
├── pages/
│   ├── DataAcquisitionDashboardPage.tsx
│   ├── DataAcquisitionSourcesPage.tsx
│   ├── DataAcquisitionRunsPage.tsx
│   ├── DataAcquisitionItemsPage.tsx
│   ├── DataAcquisitionClassificationPage.tsx
│   ├── DataAcquisitionRoutingPage.tsx
│   ├── DataAcquisitionProcessingPage.tsx
│   ├── DocumentIntelligencePage.tsx
│   ├── DataAcquisitionCanonicalRecordsPage.tsx
│   ├── DataAcquisitionOutputsPage.tsx
│   └── DataAcquisitionSettingsPage.tsx
└── components/
    ├── DataAcquisitionSummaryCards.tsx
    ├── SourceList.tsx
    ├── DocumentList.tsx
    ├── IngestionRunTimeline.tsx
    ├── ClassificationPanel.tsx
    ├── ParserRoutePanel.tsx
    ├── ParserRunList.tsx
    ├── CanonicalRecordViewer.tsx
    ├── CanonicalDocumentViewer.tsx
    ├── ValidationResultPanel.tsx
    ├── OutputPipelinePanel.tsx
    └── WorkerStatusBanner.tsx
```

The 11 routes are registered through
`client/src/modules/data-analysis/manifest.ts` →
`@/platform/modules/route-composer.tsx` (`<ModuleRoutes />`) under the
"Data Analysis" navigation group. The legacy single-page
`DataAcquisitionPage.tsx` shell is retained as a redirect to the new
Dashboard route.

## AWI / Digital HQ visibility

The Data Acquisition subdomain inherits Data Analysis's AWI surface.
Inventory (`server/platform/modules/wiring-inventory.ts`) parses
the Data Analysis manifest and surfaces every Data Acquisition
governance action, event, route, and runtime endpoint. The Digital HQ
AWI panel reads from the inventory; no private-DB access is added.

The `DATA_ANALYSIS_RUNTIME_ENDPOINTS` array (`server/data-analysis/
ports.ts`) declares both workers; the AWI port-registry consumer
shows the `dataAcquisitionWorker` health alongside `graphRagWorker`.

## Tests

| Suite                                                          | Asserts                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `__tests__/dataAcquisition.service.test.ts`                    | classifier / router / validation / canonical-builder / connector reg  |
| `__tests__/dataAcquisition.router.test.ts`                     | router shape; mounted under `dataAnalysis.dataAcquisition`            |
| `__tests__/dataAcquisition.public-api.test.ts`                 | every required public-API action is registered; receipts present      |
| `__tests__/dataAcquisition.worker.test.ts`                     | worker contract (URL, env, capabilities, paths); degraded-not-crash   |
| `__tests__/dataAcquisition.events.test.ts`                     | 21 events; namespace; manifest-emits superset                         |
| `__tests__/dataAcquisition.phase2.test.ts`                     | Phase-2 — connector registry registers all 13 modes; per-mode pipeline pure-function shapes; output module degraded paths; specialization-table ownership |
| `server/platform/modules/data-analysis-data-acquisition.test.ts` | not-an-RTLM; Data Analysis owns ownedTables / actions / events / routes; KGRA Agent does not import DA tables |

## Ownership map

```
Data Analysis RTLM
└── Data Acquisition subdomain
    ├── Universal Acquisition Core         (sources / runs / items / audit)
    ├── Document Acquisition               (Document Intelligence pipeline)
    ├── Sensor / IoT Acquisition           (worker pipeline)
    ├── Stream Acquisition                 (worker pipeline)
    ├── API Acquisition                    (worker pipeline)
    ├── Database Acquisition               (worker pipeline)
    ├── File / Object Storage Acquisition  (worker pipeline)
    ├── SaaS / Collaboration Acquisition   (worker pipeline)
    ├── Web / Crawl Acquisition            (worker pipeline)
    ├── Git / Repository Acquisition       (worker pipeline)
    ├── Manual / Form Acquisition          (real connector)
    ├── Event / Webhook Acquisition        (real connector)
    └── Output Pipelines
        ├── RAG
        ├── GraphRAG          ← Data Analysis subdomain
        ├── Analytics
        ├── Warehouse
        ├── Alerts
        └── Reports
```

## Cross-module communication map (excerpt)

```
Data Acquisition → emits canonical record + outputPipelineCompleted
                 → GraphRAG subscribes, ingests
                 → KGRA Agent reasons over GraphRAG output

Data Acquisition ← consumes nothing from KGRA / Documents / RAG
```

The boundary is enforced by
`server/platform/modules/data-analysis-data-acquisition.test.ts`:
KGRA Agent does not import any `dataAcquisition*` table directly.

## Follow-ups

- Phase-3 physical DB move: flip `getDataAnalysisDb()` to read
  `DATABASE_URL_DATA_ANALYSISDB` (one-line change once the dedicated
  DB is provisioned).
- External worker implementation: the per-pipeline HTTP RPCs are now
  wired (Phase 2). The Python worker at `:8485` still needs to
  implement `/classify`, `/route`, `/parse`, `/ocr`, `/reconstruct`,
  `/validate`, `/output` for each pipeline mode. Until then
  pipelines record `degraded` runs cleanly — no fake success.
- Connector credentials: per-source credential storage + rotation
  for the 10 split external connectors (each declares its env var +
  config schema today; long-term goes through `server/secrets/`).
