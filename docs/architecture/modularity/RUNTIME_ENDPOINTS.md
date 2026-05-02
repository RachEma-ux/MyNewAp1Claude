# Module Runtime Endpoints

Runtime endpoints are external services a module depends on at
runtime (Python workers, external HTTP APIs, etc.). They are
declared in each module's manifest under `ports` (as provided ports)
and additionally exposed by `manifest.ts`-adjacent constants for the
AWI/Digital HQ port-registry consumer.

A missing runtime endpoint should keep the owning module in
`degraded` state (not `failed`) — the UI must remain usable and
render a clean unavailable banner.

## Endpoint registry

| Module | Endpoint key | Env var | Default URL | Mode | Required | Notes |
|---|---|---|---|---|---|---|
| `dataAnalysis` | `graphRagWorker` | `GRAPHRAG_WORKER_URL` | `http://localhost:8484` | external | no | Microsoft `graphrag` Python worker. Required for `buildIndex` / `query` happy path. Missing → Data Analysis health = `degraded`. |
| `dataAnalysis` | `dataAcquisitionWorker` | `DATA_ACQUISITION_WORKER_URL` | `http://localhost:8485` | external | no | Data Acquisition worker (subdomain). Capabilities: `classify / route / parse / ocr / reconstruct / validate / output`. Required for Document Intelligence + per-mode processing happy path. Missing → processing runs recorded as `failed`/`degraded` with the worker error preserved; no fake success. UI banner renders the degraded state. |

(Additional runtime endpoints are declared in each module's
`ports.ts` and surfaced here as they land.)

## Contract

Each runtime endpoint is described by:

```ts
{
  key: string;          // stable runtime identifier
  env: string;          // env var the runtime reads
  defaultUrl: string;   // fallback when env unset
  mode: "external" | "embedded";
  required: boolean;    // is module non-functional without it?
  description?: string;
}
```

Owning module rules:

1. Declare the endpoint in `server/<module>/ports.ts` and re-export
   from `manifest.ts` so AWI sees it.
2. Wrap probes in a non-throwing health function returning a
   `{ healthy, url, message }` shape.
3. Emit `<module>.<...>.workerUnavailable` and `workerRecovered`
   events on the actual cached transition (not on every probe).
4. For lifecycle operations gated on the endpoint, **always record a
   run row** with `status: "failed"` and the error message — never
   throw without a run row.
