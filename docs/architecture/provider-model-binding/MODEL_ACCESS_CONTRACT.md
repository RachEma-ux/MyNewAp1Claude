# Model Access Contract

**Status:** Active. Owned by `server/openrouter/model-access/`.
The Plan v3 Decision D4 facade — the only place credentials and
upstream HTTP calls combine.

---

## What Model Access is

A facade over the upstream-provider runtime client. Three actions:

| Action | Purpose | Receipt |
|---|---|---|
| `openRouter.modelAccess.execute` | Non-streaming completion | hybrid |
| `openRouter.modelAccess.stream` | Streaming completion | hybrid |
| `openRouter.modelAccess.validateBinding` | Reference/policy check, no upstream HTTP | none |

`config.update` is a separate non-runtime action for OpenRouter's
own configuration plane.

---

## Hybrid receipt policy

Descriptor flag is `receiptRequired: false` for `execute` + `stream`.
The handler calls:

```ts
enforceModelAccessReceipt(payload.intent, sealed, "execute" | "stream");
```

`payload.intent` is required and one of:

- `"production"` — receipt required.
- `"test"` / `"playground"` — receipt waived. Used by Agent Studio
  test runs and the in-app provider playground.

The hybrid lets cheap/test paths run without governance overhead
while keeping production calls receipt-traced.
`server/openrouter/manifest-receipt-policy.test.ts` pins the policy.

---

## The execute call

```ts
const result = await gatewayCall<ExecuteInput, ModelAccessResult>({
  ctx: {
    sourceModule: "agentStudio",
    targetModule: "openRouter",
    actionKey: "openRouter.modelAccess.execute",
    governanceReceiptId: receiptId,    // production-intent only
  },
  input: {
    providerConnectionId: 42,
    modelRef: "gpt-4-turbo",
    intent: "production",
    correlationId: "run-abc-123",
    messages: [...],
    parameters: { temperature, maxTokens, ... },
  },
});

// Returns:
//   { status, providerConnectionId, modelRef, latencyMs, output,
//     usage: { inputTokens, outputTokens, ... }, correlationId,
//     finishReason }
```

The handler:

1. Looks up the connection through Provider Connections' internal
   resolver via `withProviderCredential(providerConnectionId)`.
2. Decrypts the secret in process memory only.
3. Builds the upstream client (`openai`, `anthropic`, etc.).
4. Issues the call with the credential.
5. Returns the structured result. The credential is never logged or
   returned.

---

## Boundary invariants

`server/openrouter/model-access/` source files cannot:

- Read `process.env.<X>_API_KEY` for any provider key
  (`tests/pmb/boundary.test.ts` invariant 5 enforces this).
- Import `server/provider-connections/internal/credential-resolver`
  directly except via the `withProviderCredential` exported boundary
  (verified by `scripts/check-provider-credential-resolver-boundary.ts`).
- Persist any credential to a database, file, log line, or audit row.

The `withProviderCredential(...)` resolver enforces:

- The connection exists, is `lifecycleStatus="active"`, and has a
  decrypted secret.
- The caller is reached from a Module Gateway-traced call (not a
  hot-loaded import).

---

## Validation gate (`validateBinding`)

`openRouter.modelAccess.validateBinding` is the Phase 15 staleness
refresh. It runs reference + policy checks (no upstream HTTP) and
updates `ags_agent_provider_bindings.last_validated_at` on success.
The Agent Binding UI's Refresh button calls it. `resolveForRun`
blocks bindings older than `VALIDATION_STALENESS_MS`.

---

## Streaming (`stream`)

The streaming variant emits chunks shaped as:

```ts
{ delta: string, usage?: TokenUsage, done: boolean, finishReason?: string }
```

The gateway-call form collects the full stream and returns a
`ModelAccessResult`-shaped object so the gateway boundary stays
synchronous. Direct streaming consumers should import
`stream` from `server/openrouter/model-access` instead — but only
modules that have already adopted streaming patterns (chat-stream,
playground) do this.

---

## Test coverage

- `server/openrouter/model-access/execute.test.ts` — happy path,
  error paths, intent enforcement, credential boundary.
- `server/openrouter/manifest-receipt-policy.test.ts` — hybrid receipt
  policy for execute/stream.
- `tests/pmb/boundary.test.ts` invariant 5 — `process.env` read scan.
- `tests/check-provider-credential-resolver-boundary.test.ts` —
  resolver-boundary script declarations.

---

## Where to read more

- `DECISION_RECORD.md` D2 + D4
- `RECEIPT_POLICY.md` — Phase 20 hybrid receipt detail
- `RUNTIME_PATH_MIGRATION_MATRIX.md` — Phase 17 indirection removal
- `PROVIDER_MODEL_BINDING_BRIDGE.md` — bridge overview
