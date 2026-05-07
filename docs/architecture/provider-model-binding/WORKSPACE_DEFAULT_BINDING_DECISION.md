# Workspace Default Provider Binding — Decision Record

**Captured:** 2026-05-07 against `main@c89b391` (post-Phase-29.0a).
**Branch:** `feat/pmb-phase-29-1a-workspace-default-binding-adr`.
**Owner:** Planner + Builder roles per AGENTS.md.

---

## Why this decision exists

Phase 29 closes the 4 caller-side LR rows (LR-02 / LR-03 / LR-04 / LR-08) deferred from Phase 28. Each caller needs a **Provider Connection** to plug into Model Access (`execute` / `embed` / `stream`). Of the 5 deferred call sites:

| Caller | Has workspace context at call site? |
|---|---|
| `agent-studio/services/simulation.ts` (LR-01) | ✓ `draft.id` — *closed in 29.0a* via `resolveForRun({draftId})` |
| `embeddings/service.ts` (LR-02) | **✗** singleton, no workspace |
| `documents/processor.ts` (LR-03) | ✓ `input.workspaceId` exists — but calls `getEmbeddingService()` singleton |
| `operators/provider-hub.ts` (LR-04) | **✗** `ProviderHubRequest` carries no `workspaceId` |
| `chat/stream.ts` (LR-08) | ✓ `workspaceId?: number` (optional) |
| `automation/block-executors.ts:executeInvokeAgent` (LR-08) | ✓ `ExecutionContext.workflowId` → workflow→workspace lookup |

LR-01 had a draft id; the other four either need workspace context threaded through their public surface (LR-02/04) or have it but no `(workspaceId, role) → ProviderConnection` lookup primitive to call (LR-03/08). The unifying primitive Phase 29 owns is therefore **a workspace-default Provider Connection lookup keyed by `(workspaceId, role)`**.

---

## Options evaluated

### Option A — Dedicated table `ags_workspace_default_provider_bindings`

Explicit `(workspaceId, role) → providerConnectionId + modelRef` mapping, ASDB-managed, role-aware.

| | |
|---|---|
| **Pro** | Explicit storage; clear "where do I configure this?" answer for an admin. |
| **Pro** | Role-aware (`chat` / `embedding` / `tool` / `classifier`) → fits all 4 caller types without overloading. |
| **Pro** | Reuses the existing Provider Connections + AI Types catalog gates — no new lifecycle. |
| **Pro** | Fits the existing `ResolveForRunResult` projection shape (just keyed differently). |
| **Con** | New schema work — though small (one table, four columns + audit). |
| **Con** | LR-02 / LR-04 still need `workspaceId` threaded into their public surfaces. |

### Option B — Synthetic Agent Studio agent per workspace

Each workspace gets an internal "platform-default" AS agent whose `agentProviderBindings` rows are the workspace defaults.

| | |
|---|---|
| **Pro** | Zero schema change; reuses `agentProviderBindings`. |
| **Pro** | Existing AS Bindings page is the management UI for free. |
| **Con** | Pollutes the AS catalog — a synthetic pseudo-agent is not a real Agent Studio agent and shows up in catalogs, releases, exports. |
| **Con** | Fuzzy ownership — if a workspace deletes its synthetic agent, the platform-default fails. |
| **Con** | AS bindings infra runs eligibility/staleness/AI-Types-catalog gates that don't all apply to system embedding calls (e.g., the doc-indexer doesn't need an AS readiness verdict). |
| **Con** | Lifecycle bugs (snapshotting, releases) leak into platform-default semantics. |

### Option C — Per-caller default policy

Each caller picks its own default-resolution policy: env var, config file, hard-coded provider name.

| | |
|---|---|
| **Pro** | Zero new infra. |
| **Con** | Fragments the system — five different "where do I configure this?" answers. |
| **Con** | Still needs *some* way to look up a Provider Connection id — moves the problem to the env-var layer (the very layer Plan v3 is closing). |
| **Con** | Re-introduces the D1 violation pattern Phase 27 / 28 / 29 are eliminating. |

---

## Locked decisions

### D-WDB-1 — Choose Option A (dedicated table)

**Decision:** Create `ags_workspace_default_provider_bindings` (ASDB) as a small dedicated table keyed by `(workspaceId, role)` with FK to `provider_connections.id`.

**Why:** Options B and C create downstream load-bearing fragility (AS catalog pollution / config-fragmentation respectively); Option A's only cost — a one-table migration — is the smallest fixable item on the list. Role-awareness is a hard requirement: a workspace's "chat default" provider is rarely the same as its "embedding default" (e.g., GPT-4o for chat, text-embedding-3-small for embeddings).

### D-WDB-2 — Schema shape

```sql
CREATE TABLE ags_workspace_default_provider_bindings (
  id                       SERIAL       PRIMARY KEY,
  workspace_id             INTEGER      NOT NULL,
  role                     TEXT         NOT NULL,           -- 'chat' | 'embedding' | 'tool' | 'classifier'
  provider_connection_id   INTEGER      NOT NULL REFERENCES provider_connections(id),
  model_ref                TEXT         NOT NULL,           -- e.g. 'gpt-4o-mini', 'text-embedding-3-small'
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by               INTEGER,
  UNIQUE (workspace_id, role)
);
```

`workspace_id` is **not** a hard FK because workspaces live on the main DB, not ASDB (Phase 12.5). The shape mirrors how `agentProviderBindings` already cross-references `providerConnections` without a hard FK on `workspaceId`. **No `ENCRYPTED` column** — this table never stores secrets; the `apiKey` lives behind `withProviderCredential` keyed off `provider_connection_id`.

`role` is a free TEXT column, NOT a Postgres enum — same rationale as the AI Types tables. Roles are an evolving set; an enum forces a migration on every new role.

### D-WDB-3 — Read API surface

A single read function in `server/agent-studio/workspace-default-bindings.ts`:

```ts
export interface ResolveWorkspaceDefaultBindingInput {
  workspaceId: number;
  role: WorkspaceDefaultBindingRole;
}

export interface ResolveWorkspaceDefaultBindingResult {
  providerConnectionId: number;
  providerCatalogEntryId: number;
  workspaceId: number;
  modelRef: string;
  ok: boolean;
  reason?: WorkspaceDefaultBindingReason;
}

export type WorkspaceDefaultBindingReason =
  | "default_not_set"
  | "provider_connection_missing"
  | "provider_connection_disabled"
  | "provider_connection_unhealthy";

export async function resolveWorkspaceDefaultBinding(
  input: ResolveWorkspaceDefaultBindingInput,
): Promise<ResolveWorkspaceDefaultBindingResult | null>;
```

**Critical contract (mirrors `resolveForRun`):** the result projection carries `providerConnectionId` and `providerCatalogEntryId` but **no credential**. Forbidden keys (`apiKey`, `pat`, `Authorization`, etc.) are intentionally absent. The caller passes `providerConnectionId` to Model Access; Model Access fetches the credential through `withProviderCredential` exactly like every other Model Access call.

`null` return = no row exists for `(workspaceId, role)`. Caller decides whether to refuse the call (preferred) or fall back to a system default. **There is no automatic system-default fallback inside this primitive** — explicit-over-implicit avoids the "why is my call going to the wrong provider?" debug class.

### D-WDB-4 — Roles enumerated

The four roles consumed by the 5 Phase 29 caller migrations:

| Role | Caller | Model Access primitive |
|---|---|---|
| `chat` | `chat/stream.ts` (LR-08), `automation/block-executors.ts:executeInvokeAgent` (LR-08) | `stream` / `execute` |
| `embedding` | `embeddings/service.ts` (LR-02), `documents/processor.ts` (LR-03 transitive) | `embed` |
| `tool` | (reserved — not used by any Phase 29 caller, but on the contract because tool-loop callers will need it post-29.6) | `runViaOpenllmBridge` |
| `classifier` | `operators/provider-hub.ts` (LR-04) | `execute` |

The reserved `tool` role is locked here so post-29.6 work doesn't have to extend the table. **Adding a role does not require a migration** (it's a free TEXT column); the value listed above is the contract for Phase 29's purposes.

### D-WDB-5 — `workspaceId` threading for the two callers without it

LR-02 (`embeddings/service.ts`) and LR-04 (`operators/provider-hub.ts`) currently have no `workspaceId` parameter. Each has a different fix shape:

- **LR-02 — `EmbeddingService`:** add a `workspaceId` argument to `generateEmbedding(text, workspaceId)` and `generateEmbeddings(texts, workspaceId)`. Drop the `getEmbeddingService()` singleton in favor of a per-call lookup keyed on the workspace. The 1-place caller (`documents/processor.ts:339`) already has `workspaceId` and threads it through.
- **LR-04 — `ProviderHubRequest`:** add `workspaceId: number` to the `ProviderHubRequest` interface in `shared/operator-types/index.ts`. Every operator call site (`server/operators/base-operator.ts:38`) already runs inside an operator job that has a workspace — verify in 29.5 prep.

Neither of these needs a Phase-29 ADR of its own — the `workspaceId` threading IS the Phase 29 caller migration. This bullet documents the contract so the §29.4 / §29.5 PRs don't re-litigate it.

### D-WDB-6 — Boundary lint shape

`scripts/check-provider-key-env-boundary.ts`'s allowlist gets **no new entry** for the workspace-default reader. The reader does not call `process.env`; it reads from ASDB. The boundary lint catches `process.env[providerKey]` patterns; this primitive doesn't introduce one.

### D-WDB-7 — Receipt and governance

Reads of `ags_workspace_default_provider_bindings` are not gateway-callable — they're an internal lookup primitive used by callers as part of `resolveX → Model Access` composition. **No receipt descriptor is required.** Writes (admin-set defaults) DO need a gateway action with receipts, captured in the §29.1b implementation PR alongside a tRPC endpoint.

### D-WDB-8 — Migration responsibility

The migration script lives at `scripts/migrations/manual/workspace-default-provider-bindings.sql` and is **operator-applied**, mirroring the pgvector / KB-listing-partial-index pattern (`#223` lesson: ASDB does not run drizzle SQL migrations — table-by-table seed reconciler builds tables from Drizzle declarations only). The Drizzle table declaration in `drizzle/tables/agent-studio.ts` is the authoritative shape; the seed reconciler picks up the table on next boot.

The §29.1b PR includes:
- Drizzle table declaration (`drizzle/tables/agent-studio.ts`).
- Operator-applied migration script (`scripts/migrations/manual/workspace-default-provider-bindings.sql`).
- Read API (`server/agent-studio/workspace-default-bindings.ts`) with unit tests.
- Smoke-verification step in the §29.1b PR body — confirm the table appears in `\d` output on local ASDB after applying the migration.

---

## Caller-by-caller migration plan

Each Phase 29 caller-migration sub-phase consumes this primitive as follows:

| Sub-phase | Caller | Resolution path |
|---|---|---|
| **29.4a** | `embeddings/service.ts:54, 59` | `resolveWorkspaceDefaultBinding({workspaceId, role:"embedding"})` → `gatewayCall(modelAccess.embed, {providerConnectionId, modelRef, ...})` |
| **29.4b** | `documents/processor.ts:339` (transitive) | unchanged — `getEmbeddingService().generateEmbeddings(texts, workspaceId)` once 29.4a flips the service signature |
| **29.5a** | `operators/provider-hub.ts:78` | `resolveWorkspaceDefaultBinding({workspaceId, role:"classifier"})` → `gatewayCall(modelAccess.execute, ...)`. Drop the local `getOpenAIClient()` / `getOllamaClient()` provider-chain logic; Model Access owns provider selection. |
| **29.6a** | `chat/stream.ts:70` | branch: if `useUnifiedRouting && workspaceId` keep `providerRouter` path (post-29.3 wiring); else `resolveWorkspaceDefaultBinding({workspaceId, role:"chat"})` → `gatewayCall(modelAccess.stream, ...)`. Refuse with `binding_required` when `workspaceId` is undefined. |
| **29.6b** | `automation/block-executors.ts:executeInvokeAgent` | resolve `agent.workflow.workspaceId` from ASDB; `resolveWorkspaceDefaultBinding({workspaceId, role:"chat"})` → `gatewayCall(modelAccess.execute, ...)`. Per §29.2 ADR Path A/B/C decision for legacy-`agents`-table strategy. |

**Estimate:** ~250 LOC for the §29.1b primitive PR (Drizzle table + migration script + read API + 12 unit tests). The 5 caller-migration PRs each pay ~150 LOC on top, all of which is bounded by the contracts above.

---

## Open follow-ups (out of §29.1 scope)

- **Admin UI for workspace defaults** — set/edit/clear per-role defaults from the workspace settings page. Filed as a Phase 29 follow-up but **not** required for the caller migrations to land. Phase 29 ships with the table + read API; admins set defaults via tRPC or direct SQL until the UI lands.
- **System-default fallback** — explicitly NOT in scope per D-WDB-3. If a future need surfaces (e.g., a no-workspace background job needs an embedding), a separate `system_default_provider_bindings` table or a reserved `workspace_id = 0` row gets a Phase-30 ADR — don't backdoor it into this primitive.
- **Stale-validation / health-check gating** — D-WDB-3 surfaces `provider_connection_disabled` and `provider_connection_unhealthy` reasons but the primitive doesn't enforce a Phase-15-style `lastValidatedAt` staleness gate. If the provider connection's health changes mid-flight, the caller's Model Access call will fail with `credential_resolution_failed` or `upstream_*_error`. Adding a staleness gate is a Phase-30 candidate; today's contract is "trust the provider_connections row's `lifecycleStatus` + `healthStatus` columns at lookup time".

---

## Cross-references

- `LEGACY_EXCEPTION_REGISTER.md` — LR-02 / LR-03 / LR-04 / LR-08 rows updated to reference §29.1 dependency.
- `PHASE_29_EXECUTION_PLAN.md` §29.1 — the execution plan this ADR completes.
- `MODEL_ACCESS_CONTRACT.md` — current Model Access surface; `embed` / `execute` / `stream` are the three primitives consumed.
- `MODEL_ACCESS_EMBED_DECISION.md` — D-MA-EMBED-1..7 (consumed by 29.4).
- `RECEIPT_POLICY.md` — D-WDB-7's "no receipt for reads" rationale anchors here.
- `AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md` — Phase-12.5 ASDB ownership boundary (reason `workspaceId` is not a hard FK).
- `#223` migration-path lesson — operator-applied SQL goes under `scripts/migrations/manual/`, not the numbered `drizzle/` directory.

---

## Lesson carried forward from Phase 28 (and applied here)

> When locking a sub-phase scope, re-grep current code AND walk the call graph one-or-two hops out. The register snapshots scope at write-time; code drifts.

This ADR was prepared by re-grepping the 5 deferred caller line numbers against `main@c89b391` (post-29.0a) and walking each caller's workspace-context shape one hop into its public surface. Three of the five callers already have `workspaceId` in scope at the call site; two (LR-02, LR-04) need a one-line signature change. The ADR's D-WDB-5 documents this so §29.4 / §29.5 don't re-litigate.
