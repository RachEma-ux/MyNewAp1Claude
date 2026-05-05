# RAC Embedding Binding Decision — Pre-bundle Decision Record

**Owner:** Agent Studio module (with Provider/Model Binding co-ownership)
**RAC phase:** P0.5 (Retrieval Foundation Decision)
**Status:** Draft — pre-bundle, not yet adopted
**Authority:** Required prerequisite for P3 (Ingestion adapters) and P4 (Retrieval pipeline)

---

## 1. Problem statement

The RAC roadmap says *"use the existing provider/model binding system"* for the embedding-model policy in P0.5. But the binding contract delivered by Plan v3 Phase 27.3 (`server/agent-studio/bindings.ts`) and `ags_agent_provider_bindings`:

- carries a single role per draft, with `role="primary"` and a unique constraint `uniq_ags_agent_provider_bindings_draft_role` on `(draftId, role)`,
- treats `binding.modelRef` as a chat-completion model identifier,
- uses `getAgentProviderBinding(draftId, "primary")` everywhere — `chat-stream.ts:593`, `services/chat.ts:478`, etc.

There is no second role for embeddings. There is no embedding-time staleness check. There is no embedding-aware credential resolution path in `server/openrouter/model-access/`. P0.5 cannot honestly say *"reuse existing bindings"* without committing to one of three concrete options:

A. Extend `ags_agent_provider_bindings` with `role="embedding"` rows and treat embeddings as a per-agent capability.
B. Carry embedding refs on the source row (`ags_rac_sources`), making embeddings a property of the *source* not the *agent*.
C. Carry embedding refs at the workspace level (`ags_rac_workspace_embedding_default`) with per-source override.

This document picks one and locks the contract before P3 ingestion code lands.

---

## 2. Decisions (D-EMB-1 … D-EMB-5)

### D-EMB-1 — Embeddings bind to the **source**, not the agent (Option B)

`ags_rac_sources` is the unique row that owns an indexed corpus. Embedding model identity is a property of *how that corpus was vectorized*, not *which agent is reading it*. Two agents reading the same corpus MUST share the embedding space; two corpora read by one agent MAY use different embedding models if hosted/local provenance differs.

Therefore the source row carries the embedding ref:

```sql
-- ags_rac_sources (P2 schema, anchored here in P0.5)
embedding_provider_connection_id  integer NOT NULL,
embedding_model_ref               varchar(255) NOT NULL,
embedding_model_dim               integer NOT NULL,
embedding_model_version           varchar(64),
embedding_model_pinned_at         timestamp NOT NULL,
```

Why this and not Option A:

- Re-embedding a corpus is expensive and rare; re-binding an agent is cheap and common. Coupling embedding identity to agent draft would force re-embedding on every binding change, which is the wrong default.
- Phase 27.3's `binding_v1` invariants (chat staleness, per-draft uniqueness, primary-role lookup at `chat-stream.ts:593`) do not transfer cleanly to embeddings (different latency profile, no staleness need, batch-friendly). Mixing them under one `ags_agent_provider_bindings` table forces every existing reader of "the binding" to special-case embedding-vs-chat — the bug factory.

### D-EMB-2 — Embedding model ref points at a Provider Connection, not a raw provider/model ID

The credential resolver (`server/provider-connections/internal/credential-resolver.ts`) is the **only** place a decrypted PAT exists outside `server/secrets/` (Plan v3 D2). RAC ingestion / re-embedding MUST go through the same resolver. Therefore the source row stores `embedding_provider_connection_id` (FK into `provider_connections`) plus `embedding_model_ref` (free-text model name passed to the provider's `/v1/embeddings` endpoint), exactly mirroring the chat binding pattern of `(provider_connection_id, model_ref)`.

A new credential-resolver entry point may be required:

```ts
// server/provider-connections/internal/credential-resolver.ts (extend)
export async function withEmbeddingCredential<T>(
  connectionId: number,
  modelRef: string,
  callback: (ctx: ResolvedProviderCredentialContext) => Promise<T>,
): Promise<T>;
```

This reuses the same `withProviderCredential` callback discipline (credential lives only in closure scope, never returned to caller). The boundary check `scripts/check-provider-credential-resolver-boundary.ts` MUST be extended to allowlist `server/agent-studio/services/rac/ingestion/**` once the entry point exists. Until then, the boundary check correctly rejects ingestion code that tries to read `OPENAI_API_KEY` directly.

### D-EMB-3 — Embedding model ref is **pinned at ingestion time** and **versioned for re-embedding**

`embedding_model_ref` and `embedding_model_dim` are written when the source is first indexed. They MUST NOT change without a corresponding re-embedding job:

- Same provider, same model, same dim → no migration needed.
- Same provider, different model → re-embed required, source enters `embedding_status="re-embedding"`.
- Different provider connection → re-embed required.
- Dimension change → re-embed required (vector index rebuild).

`embedding_model_version` is an optional advisory tag (e.g. `"text-embedding-3-small@v2"`) that surfaces when the upstream provider transparently changes the model behind the same name. Mismatch produces a P7 trace warning, not a hard failure — the user decides whether to re-embed.

### D-EMB-4 — Workspace default exists, source override permitted

To avoid forcing every source to specify an embedding model:

```sql
-- ags_rac_workspace_embedding_default (new)
workspace_id                       integer PRIMARY KEY,
embedding_provider_connection_id   integer NOT NULL,
embedding_model_ref                varchar(255) NOT NULL,
embedding_model_dim                integer NOT NULL,
created_by                         integer NOT NULL,
updated_at                         timestamp NOT NULL,
```

When `ags_rac_sources.embedding_provider_connection_id` is NULL at insert time, the source inherits the workspace default. The default cannot change after sources reference it without a workspace-wide re-embedding plan — this is documented in P10 export readiness (sources whose embedding ref disagrees with the active workspace default get a `degraded` warning).

### D-EMB-5 — Local-embedding fallback policy

If the workspace has zero `provider_connections` with embedding capability (empty cloud setup, dev-mode boot), RAC MUST NOT silently fall back to a hardcoded model.

Two acceptable behaviors:

1. **Block ingestion** with a clear `embedding_provider_missing` error and surface a setup CTA (link to Provider Connections → Add Connection page).
2. **If local embedding stack is present** (Ollama running, `nomic-embed-text` etc.), allow a Provider Connection of `kind="local"` with a `localhost:11434/v1/embeddings`-style baseURL. Same `(provider_connection_id, model_ref)` shape; no special-cased local code path.

Hard-coded vendor embeddings (e.g. silently using `text-embedding-3-small` because `OPENAI_API_KEY` happens to be in `.env`) is forbidden. The legacy `autoProvisionProviders` path that reads `OPENAI_API_KEY` from env is for chat onboarding only and MUST NOT be extended for embeddings.

---

## 3. Why (open notes)

- **Why not "let the agent pick its embedding at runtime"?** Because retrieval quality depends on *the same* embedding model being used at index time and at query time. Letting the agent pick implies dynamic re-embedding per query — that's not RAC, that's a search engine.
- **Why a separate `withEmbeddingCredential` function?** Because the auth header style differs by provider (OpenAI: `Authorization: Bearer`; Anthropic: `x-api-key`; Ollama: none) and the chat-vs-embedding endpoint differs. A separate entry point keeps `withProviderCredential` from carrying conditionals about which endpoint the caller intends to hit.
- **Why workspace default rather than app-global?** Because workspaces in this repo are real isolation boundaries (`ws=2 "Default"`, `ws=0 "System (sentinel)"`); cross-workspace credential sharing is a governance problem we don't want.

---

## 4. Acceptance

- `ags_rac_sources` schema includes the five embedding columns from D-EMB-1
- `ags_rac_workspace_embedding_default` table exists with workspace-id PK
- `withEmbeddingCredential` exists in the credential resolver and is on the boundary allowlist
- Ingestion (P3) reads embedding ref from the source row, never from `process.env`
- Provider Connections list endpoint surfaces `kind="local"` connections so dev-mode embedding works without cloud credentials
- Re-embedding is implemented as a state transition on the source row, not an in-place update

## 5. How to apply (later phases)

- **P3 ingestion adapter** consumes `(connectionId, modelRef, dim)` from the source row and uses `withEmbeddingCredential`
- **P4 retrieval executor** verifies query embedding uses the same `(connectionId, modelRef, dim)` as the source — mismatch is a hard error, not a warning
- **P10 export readiness** flags sources whose embedding ref is stale relative to the workspace default
- **P11 RAC UI** exposes per-source embedding ref and a "re-embed with workspace default" action
