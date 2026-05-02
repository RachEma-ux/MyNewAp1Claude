# Data Acquisition Subdomain

> **Ownership:** `dataAnalysis` RTLM → `dataAcquisition` subdomain.
> **Status:** Phase 1 wired (PR `feat/data-analysis-data-acquisition`).
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
    │   ├── connector.registry.ts
    │   ├── local.connector.ts        (real)
    │   ├── manual.connector.ts       (real)
    │   ├── webhook.connector.ts      (real)
    │   └── externalConnector.factory.ts
    │       └── creates: s3, gdrive, github, api, database, sensor,
    │           stream, saas, web, objectStorage
    │           (each reports `unconfigured` until env vars/source-row
    │           config arrive — never fakes success)
    ├── pipelines/
    │   ├── document/
    │   │   ├── documentClassifier.ts
    │   │   ├── parserRouter.ts
    │   │   ├── canonicalDocumentModel.ts
    │   │   └── documentValidation.ts
    │   └── output/
    │       └── outputRunner.ts
    └── __tests__/
        ├── dataAcquisition.service.test.ts
        ├── dataAcquisition.router.test.ts
        ├── dataAcquisition.public-api.test.ts
        ├── dataAcquisition.worker.test.ts
        └── dataAcquisition.events.test.ts
```

Non-document pipelines (sensor, stream, api, database, web, git, etc.)
share the same intake/classification/routing/processing/canonical/output
flow — the per-mode worker capability does the heavy lifting; the
service layer records every state transition. Per-mode pipeline
specialization files are added as they require their own classifier or
normalizer; today only `document/` and `output/` need their own modules.

## Database

Owned by Data Analysis (Phase-1 staged — physical tables live in the
shared platform DB; logical owner is `dataAnalysis`; the seam for the
future physical move to `dataanalysisdb` is `getDataAnalysisDb()` in
`server/data-analysis/connection.ts`).

Tables (`drizzle/0034_data_acquisition.sql`,
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

Specialization:

- `data_acquisition_documents` — Document Intelligence specialization
  (parser used, fallback used, page count, canonical document JSON)

Future specialization tables (`*_sensor_readings`, `*_stream_events`,
`*_api_records`, `*_db_records`, `*_media_assets`, `*_web_pages`,
`*_git_objects`, `*_form_submissions`, `*_webhook_events`) land
incrementally; the canonical record table absorbs them via
`recordType` until then.

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

The worker is **not** installed as part of this PR. It is an external
runtime dependency and missing it produces clean degraded state, never
a crash. UI banner (`DataAcquisitionWorkerBanner`) renders when the
worker is unhealthy.

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

## Frontend

`client/src/pages/data-analysis/DataAcquisitionPage.tsx` is the
top-level shell at `/data-analysis/data-acquisition`. Tabs cover the
universal lifecycle: Dashboard → Sources → Runs → Items →
Classification → Routing → Processing → Document Intelligence →
Canonical Records → Outputs → Settings.

`DataAcquisitionWorkerBanner` and `DataAcquisitionSummaryCards`
support degraded-state UX and dashboard metrics. The route is
registered through `client/src/modules/data-analysis/manifest.ts` →
`@/platform/modules/route-composer.tsx` (`<ModuleRoutes />`).
Navigation appears under the "Data Analysis" group.

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

- Phase-2 physical DB move: flip `getDataAnalysisDb()` to read
  `DATABASE_URL_DATA_ANALYSISDB` (one-line change once the dedicated
  DB is provisioned).
- Per-mode specialization tables and pipeline modules (sensor, stream,
  api, database, etc.) — added as each mode's worker capability
  matures.
- Worker per-pipeline RPCs (currently the worker reachability is
  probed; per-capability RPC contracts are stubbed to record
  `degraded` runs until the Python service implements them).
