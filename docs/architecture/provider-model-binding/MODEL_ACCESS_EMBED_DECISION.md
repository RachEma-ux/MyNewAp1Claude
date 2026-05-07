# Model Access — Embedding Execute Primitive Decision Record

**Captured:** 2026-05-07 against `main@ba83f0d` (post-Phase-28.3 deferral merge).
**Branch:** `feat/pmb-phase-28-4-model-access-embed`.
**Owner:** Builder + Governance roles per AGENTS.md.

---

## Why this primitive exists

Phase 27.4's decision matrix flipped LR-02 (`embeddings/service.ts:54, 59`), LR-03 (`documents/processor.ts:339`), and LR-04 (`operators/provider-hub.ts:78`) deadlines from Phase 27 to Phase 28 with the rationale: "Model Access today is chat/stream/validateBinding only, no embedding-execute primitive yet." Phase 28.4 builds that primitive.

**Phase 28.3 scope discovery (see `PHASE_28_LR_08_DEFERRAL_DECISION.md`) revealed that the LR-02/03/04 callers all share the same workspace-default-binding upstream dependency that drove the LR-08 deferral.** Their migrations therefore land in Phase 29 alongside LR-08. Phase 28.4 builds the primitive anyway because:

1. The primitive's shape is decoupled from the binding-resolution question — it takes a `providerConnectionId` like `execute` does.
2. Phase 29's LR-02/03/04 sub-phases need this primitive to exist.
3. Conflating "build primitive" with "migrate caller + decide workspace-default-binding" produces the same kind of overstuffed PR that 28.3's deferral was meant to avoid.

**Note:** LR-04 is no longer in this group. Investigation during 28.4 prep showed `operators/provider-hub.ts:78` is a **chat-completion** caller (`/v1/chat/completions` with `gpt-4o-mini`), not an embedding caller. The register row had it grouped with LR-02/03 under "embedding-endpoint dependency" because the original Phase 27.4 grouping logic was wrong. LR-04's migration uses the existing `execute` primitive in Phase 29; this embedding primitive serves LR-02/03 only.

---

## Locked decisions

### D-MA-EMBED-1 — Wire shape

The action is `openRouter.modelAccess.embed`. Input mirrors `ModelAccessExecuteInput` minus the chat-specific fields:

```ts
interface ModelAccessEmbedInput {
  providerConnectionId: number;
  modelRef: string;            // e.g. "text-embedding-3-small"
  inputs: string | string[];   // single text or batch
  intent: ModelAccessIntent;
  workspaceId: number;
  actorId: number;
  correlationId?: string;
}

interface ModelAccessEmbedResult {
  status: "ok" | "error";
  providerConnectionId: number;
  modelRef: string;
  latencyMs: number;
  embeddings: number[][];      // always batch-shaped, even for single input
  usage?: ModelAccessUsage;    // input/output/total tokens
  error?: string;
  correlationId?: string;
}
```

`embeddings` is always a `number[][]` — the caller doesn't have to branch on input shape. For a single-string input, the result is a one-element array. This matches OpenAI's response shape exactly (`response.data[i].embedding`).

### D-MA-EMBED-2 — Provider support

| Provider | Endpoint | Status |
|---|---|---|
| OpenAI / OpenAI-compatible | `POST /v1/embeddings` | Supported |
| Anthropic | (no embedding API today) | Refused with `ModelAccessError("unsupported_provider_type", ...)` |
| Local OpenAI-compatible (Ollama, llama.cpp) | `POST /v1/embeddings` | Supported when the local server exposes the OpenAI shape |

The `isAnthropic(providerType, baseUrl)` check from `execute.ts` is reused — same heuristic, same provider-type list.

### D-MA-EMBED-3 — Governance / receipt policy

Mirror `execute` exactly: hybrid receipt policy. `receiptRequired: false` on the descriptor; runtime-enforced via `enforceModelAccessReceipt(payload.intent, sealed, "embed")`. Same exemption for `intent === "agent-test"`.

### D-MA-EMBED-4 — Failure modes

Same shape as `execute`:

- `credential_resolution_failed` — when `withProviderCredential` rejects.
- `upstream_http_error` — non-2xx from upstream.
- `upstream_network_error` — fetch threw.
- `upstream_timeout` — abort signal fired (60s default, mirrored from `execute`).
- `upstream_invalid_response` — JSON parse failed or expected fields missing.
- `unsupported_provider_type` — provider's not OpenAI-compatible (e.g., Anthropic).

All return a `ModelAccessEmbedResult` with `status: "error"` for the gateway-call form; the direct-import form throws `ModelAccessError`. Same dual-shape pattern as `execute`.

### D-MA-EMBED-5 — Dimension contract

The primitive does **not** enforce dimensions. Callers that need dimension assertions (e.g., RAC's `embedding_model_dim`) check the result length themselves. Reasoning: the primitive should be model-agnostic; OpenAI's `text-embedding-3-small` is 1536, `text-embedding-3-large` is 3072, and future models will vary. Dimension is a contract between the calling subsystem and the model row in `provider_connections`, not a primitive concern.

### D-MA-EMBED-6 — Batch behavior

Single-call batch: pass `inputs: string[]` and the primitive sends one HTTP call to the upstream with the array. OpenAI handles the batch natively (limit ~2048 inputs per request per their docs). The primitive does **not** internally split large batches. Callers that need >2048 inputs are responsible for chunking — the primitive errors with `upstream_http_error` on oversize requests rather than silently re-batching.

### D-MA-EMBED-7 — Test strategy

Mirror `execute.test.ts`:

- Happy-path test for OpenAI shape (single + batch inputs).
- Boundary invariant: refuses Anthropic provider type with `unsupported_provider_type`.
- Receipt enforcement test (gateway-call form requires receipt for non-test intents).
- Failure modes (timeout, http error, network error, invalid response).

Live-upstream tests are skipped per `describe.skipIf(!hasOpenAIKey())` pattern.

---

## What this primitive does NOT do

- No dimension enforcement (D-MA-EMBED-5).
- No automatic batch splitting (D-MA-EMBED-6).
- No caching — Phase 29 callers wrap the primitive if they want caching.
- No rerank / similarity / vector-store integration — those are the consumers' jobs (Qdrant, pgvector, etc.).
- No Anthropic embedding support (Anthropic has no embedding API; if/when they add one, D-MA-EMBED-2 amendment).

---

## Cross-references

- `MODEL_ACCESS_CONTRACT.md` — current public contract (will be amended by this PR with the new `embed` action and an `embed` test reference).
- `server/openrouter/model-access/execute.ts` — pattern template for `embed.ts`.
- `server/openrouter/model-access/types.ts` — adds `ModelAccessEmbedInput` + `ModelAccessEmbedResult`.
- `server/openrouter/manifest.ts` — adds the gateway action registration.
- `LEGACY_EXCEPTION_REGISTER.md` LR-02/03 — primitive built; caller migrations deferred to Phase 29 (see `PHASE_29_SCOPING.md`).
- `LEGACY_EXCEPTION_REGISTER.md` LR-04 — register-row reclassification: chat-completion caller, not embedding; uses existing `execute` primitive in Phase 29.
