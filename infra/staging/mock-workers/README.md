# Staging Mock Workers

Single Node 20 / `node:http` server image used by all five staging
worker slots (graphrag-worker, data-acquisition-worker,
external-orchestrator, sandbox-wf-worker, kgra-service).

**This is staging-mock infrastructure, not production code.**
Real workers ship from their own repos. The mocks exist so the
PR 4 / PR 9 / PR 10 evidence chains have a `/health` endpoint to
poll, a `/run` endpoint to invoke, and a way to simulate failure.

## API

### `GET /health`

```json
{
  "status": "healthy",
  "worker": "graphrag-worker",
  "mode": "staging-mock",
  "uptimeMs": 1234
}
```

### `POST /run`

Body: any JSON. Special body `{"simulate":"fail"}` triggers a
synthetic 503 so Phase 4 can prove the degraded-state code path.

Successful body:

```json
{
  "runId": "mock-graphrag-worker-1",
  "worker": "graphrag-worker",
  "mode": "staging-mock",
  "state": "completed",
  "inputEcho": { ... },
  "startedAt": "2026-05-03T13:00:00.000Z"
}
```

### `GET /run/:id`

Returns the previously created run record with `retrieved: true`,
or a 404 with `{ error: "not-found", runId }`.

## How it differentiates "real" vs "mock" evidence

Every response includes `"mode": "staging-mock"`. PR 4 evidence
must record this field; if a phase claims PASS but the recorded
`mode` is `staging-mock`, the row is downgraded to PARTIAL and
the dependency on a real worker URL is named explicitly.
