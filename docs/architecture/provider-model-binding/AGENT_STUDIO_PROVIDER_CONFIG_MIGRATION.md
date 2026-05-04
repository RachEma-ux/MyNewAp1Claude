# Agent Studio — Provider Config Migration

**Plan v3 Phase 9 deliverable.** Authoritative spec for migrating Agent Studio drafts from the legacy `providerConfig` jsonb blob (raw `apiKey` / `apiKeyEnvVar`) to the structured `AgentProviderBinding` model that pairs a Provider Connection ID with a model catalog reference.

The goal of this document is to make the Phase 10 migration script writable to spec without further design questions.

---

## 1. Goals + non-goals

### Goals

1. Every existing Agent Studio draft survives the migration with a **resolvable** binding (or an explicitly-marked `legacy_unresolved` placeholder when the source data is insufficient).
2. **No raw API key remains** in `ags_agent_drafts.providerConfig` after the migration — Decision D1 / D2 boundary is enforced at rest.
3. **No mixed-shape persistence** after the migration: a draft is either `binding_v1` (new shape only) or it has been quarantined as `legacy_unresolved` (no `providerConfig.apiKey` / `apiKeyEnvVar` remaining either way).
4. Migration is **idempotent** and supports a **dry-run** that produces a full evidence report before any writes.
5. Migration is **rollback-safe**: a single SQL transaction per draft, plus a Phase 10 evidence file that records the original shape so a rollback script can restore it if needed.

### Non-goals

- Validating that the resolved Provider Connection actually authenticates against the upstream provider. That is `openRouter.modelAccess.validateBinding` (Phase 4) and is invoked separately, not from this migration.
- Migrating the `server/_core/index.ts` `autoProvisionProviders` env-seed block. That is **LR-06** and ships in Phase 10's seed-script extraction, not in this script.
- Touching `ags_agent_releases` (immutable snapshots). Releases keep their historical provider config verbatim — the migration only operates on **draft** rows.

---

## 2. Old shapes (current state)

The legacy `providerConfig` jsonb blob in `ags_agent_drafts.providerConfig` (column `provider_config`, default `{}`) carries one of three shapes today.

### 2.1 Shape A — raw `apiKey`

```json
{
  "providerSlug": "openai",
  "providerType": "openai",
  "apiKey": "sk-proj-…",
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com"
}
```

- **Risk:** High. Raw secret stored at rest in plaintext jsonb.
- **Source register entry:** LK-01 (schema-level), LK-02 / LK-03 (seed fixtures).
- **Migration target:** `legacy_unresolved` binding with `statusReason = legacy_raw_api_key`. Operator must rotate the key, store it through Provider Connections, then re-bind.

### 2.2 Shape B — `apiKeyEnvVar`

```json
{
  "providerSlug": "openai",
  "providerType": "openai",
  "apiKeyEnvVar": "OPENAI_API_KEY",
  "model": "gpt-4o-mini"
}
```

- **Risk:** High. Runtime path resolves `process.env[apiKeyEnvVar]` per LR-01 (`openllm-runtime-adapter.ts:312-321`) — the same path PR #100 fixed against pollution.
- **Migration target:** `legacy_unresolved` binding with `statusReason = legacy_env_var`. Resolver hint preserved as `legacyEnvVarHint` (non-secret, just the name) so an operator can identify which `.env` line corresponds and seed it through the boot-time seed script.

### 2.3 Shape C — already-resolved provider reference (unusual)

```json
{
  "providerSlug": "ollama",
  "providerType": "ollama",
  "model": "llama3.1:8b",
  "baseUrl": "http://localhost:11434"
}
```

- No secret at all (Ollama doesn't authenticate). Drafts using local providers may already be in this shape.
- **Migration target:** `binding_v1` directly, with `providerConnectionId = NULL` permitted **only for kind=local providers** (Ollama, llama.cpp). For cloud providers the absence of a credential remains `legacy_unresolved`.

### 2.4 Shape D — empty / partially-filled (orphaned drafts)

```json
{}
```

- Migration target: leave the draft untouched **iff** the column is `{}` or `null`. Such a draft is not yet bound to anything and the new binding shape is created on next save through the Phase 11 write path.

---

## 3. New `AgentProviderBinding` shape

Stored in a **new ASDB table** `ags_agent_provider_bindings`, not in `providerConfig`. This decision is intentional:

- Gives us proper indexing (`workspace_id`, `agent_id`, `draft_id`, `provider_connection_id`).
- Lets the binding evolve independently of agent draft revisions.
- Makes auditing/listing legacy_unresolved bindings a single query.

### 3.1 Logical shape

```ts
interface AgentProviderBinding {
  id: number;                              // serial primary key
  workspaceId: number;
  agentId: number;                         // ags_agents.id
  draftId: number;                         // ags_agent_drafts.id
  role: string;                            // e.g. "primary" | "tools" | "embedding"
                                            //   (Phase 11+ multi-role support)

  providerCatalogEntryId: number | null;   // catalog_entries.id where entryType=provider
  modelCatalogEntryId: number | null;      // catalog_entries.id where entryType=model
  providerConnectionId: number | null;     // provider_connections.id
                                            //   NULL only when status=legacy_unresolved
                                            //   OR provider kind=local (no credential)
  modelRef: string;                        // e.g. "gpt-4o-mini" or "claude-3.5-sonnet"

  status: BindingStatus;                   // see 3.2
  statusReason: BindingStatusReason | null;// see 3.3

  /** Non-secret hint preserved from legacy `apiKeyEnvVar`; null otherwise. */
  legacyEnvVarHint: string | null;

  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.2 `status` enum

| Value                 | Meaning                                                                     |
|-----------------------|-----------------------------------------------------------------------------|
| `binding_v1`          | Resolved, ready for runtime use. Provider Connection + model ref both valid.|
| `legacy_unresolved`   | Migration could not determine a Provider Connection. Visible to operators; agent runtime refuses to call until resolved. |
| `disabled`            | Operator-disabled. No runtime calls allowed.                                |
| `archived`            | Reserved for Phase 11+ when releases retire bindings.                       |

### 3.3 `statusReason` enum

Free-form `null` for healthy `binding_v1` rows. For `legacy_unresolved`, exactly one of:

| Value                  | Meaning                                                                |
|------------------------|------------------------------------------------------------------------|
| `legacy_raw_api_key`   | Source draft contained a raw `providerConfig.apiKey`. Key was discarded; operator must re-create a Provider Connection. |
| `legacy_env_var`       | Source draft used `apiKeyEnvVar`; env var name preserved as `legacyEnvVarHint` so the operator can match it to the seed-script run. |
| `legacy_no_credential` | Source draft had a cloud-provider slug but neither `apiKey` nor `apiKeyEnvVar`. Likely never functional. |
| `provider_slug_unknown`| `providerSlug` did not resolve to any catalog provider. Manual triage. |
| `migration_skipped`    | Reserved — the migration script chose to leave this draft alone (e.g. Shape D).|

### 3.4 Forbidden fields

The binding row MUST NOT carry `apiKey`, `pat`, `encryptedPat`, `Authorization`, `x-api-key`, `Bearer`, `secret`, `apiKeyEnvVar` (the last is renamed to `legacyEnvVarHint` on purpose so the field name itself is no longer a credential lookup). Phase 11's schema migration includes a row-level CHECK or app-level guard to enforce this.

---

## 4. Migration sequence (script behavior)

The Phase 10 script (`scripts/agent-studio/migrate-provider-config-to-bindings.ts`) implements this sequence. Each step is idempotent — re-running on already-migrated drafts is a no-op.

### Step 4.1 — Scan

```sql
SELECT id, agent_id, workspace_id, provider_config, created_by
FROM ags_agent_drafts
WHERE provider_config IS NOT NULL
  AND provider_config != '{}'::jsonb;
```

For each row, classify the shape (A/B/C/D — see §2). Skip if a binding for this `(draftId, role)` already exists in `ags_agent_provider_bindings` (idempotency).

### Step 4.2 — Classify and resolve

| Source shape       | Resolution                                                                                                                |
|--------------------|---------------------------------------------------------------------------------------------------------------------------|
| A (raw `apiKey`)   | DROP the key. Insert `legacy_unresolved` binding with `statusReason=legacy_raw_api_key`. Provider Connection: NULL.       |
| B (`apiKeyEnvVar`) | Insert `legacy_unresolved` binding with `statusReason=legacy_env_var`, `legacyEnvVarHint` = env var name.                 |
| C (local provider) | Look up provider catalog entry by `providerSlug`. Insert `binding_v1` if found, `provider_slug_unknown` otherwise.        |
| C (cloud provider, no PAT)| `legacy_no_credential` placeholder; operator must run seed-from-env or create a Provider Connection manually.       |
| D (empty)          | No binding inserted; `migration_skipped` is *not* used here — empty drafts simply have no row.                            |

For C-cloud cases that *do* have a matching Provider Connection in the same workspace (`workspace_id`, `providerSlug` match), set `providerConnectionId` and produce `binding_v1`. Multiple matching connections: pick the most recently `validated`/`active` and record the others in the evidence report.

### Step 4.3 — Redact

For every migrated draft (A/B/C), update the source row:

```sql
UPDATE ags_agent_drafts
SET provider_config = (
  -- Preserve non-secret keys: providerSlug, providerType, model, baseUrl,
  -- displayName, anything else that is NOT in the secret denylist.
  provider_config
    - 'apiKey'
    - 'apiKeyEnvVar'
    - 'pat'
    - 'encryptedPat'
    - 'Authorization'
    - 'authorization'
    - 'x-api-key'
    - 'bearer'
)
WHERE id = $1;
```

The redaction is intentionally additive — we keep model/provider metadata so the binding row can be repopulated if rolled back. Only the secret-shaped keys are removed.

### Step 4.4 — Evidence report

Write `docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md` with:

- Run timestamp (UTC).
- Counts: total drafts scanned, by classification (A/B/C/D), by resulting status.
- For each row produced: `{ draftId, agentId, workspaceId, classification, resultingStatus, statusReason, providerConnectionId | null }`. **Never** include the original `apiKey` value — only the **shape** and the `legacyEnvVarHint` (which is the name only).
- Original `provider_config` snapshot per draft, secret keys masked as `"<redacted>"` so the report is safe to commit.

### Step 4.5 — Modes

The script supports three modes:

- `--dry-run` — Steps 4.1, 4.2, 4.4 only. No DB writes. Default for the first run in any environment.
- `--apply` — All four steps within one transaction per draft.
- `--validate` — Re-scans after `--apply` and verifies no `apiKey`/`apiKeyEnvVar` remains in any `ags_agent_drafts.provider_config`. Exits non-zero if any are found.

---

## 5. Rollback strategy

Rollback is rare but supported because Phase 12 retires the old shape — a bug discovered post-migration must be reversible.

### 5.1 Rollback artifact

The evidence report (§4.4) is the rollback artifact. It records:

- The exact `before` shape of every redacted draft (with secrets masked — a rollback restores the *non-secret* fields; secrets must be re-supplied by the operator separately).
- The exact `after` row inserted into `ags_agent_provider_bindings`.

### 5.2 Rollback script (Phase 10 sibling, optional at first)

If needed, `scripts/agent-studio/rollback-provider-config-migration.ts`:

1. Reads the evidence report file.
2. Deletes binding rows whose `(draftId, role)` matches the report.
3. Restores `ags_agent_drafts.provider_config` to the masked snapshot. Secrets are NOT restored — the operator must re-attach a stored credential through Provider Connections.

This is intentionally **non-symmetric**: a rollback removes the binding and restores non-secret metadata, but it does not resurrect a key that was correctly destroyed.

### 5.3 Rollback safety net

Phase 11's schema migration introduces `ags_agent_provider_bindings` BEFORE Phase 12 drops support for the old shape. Between Phase 11 and Phase 12 the runtime tolerates **either** shape (read paths only — write paths take only the new shape after Phase 11 lands). This window is the rollback window. Phase 12's deadline is determined by 100% binding coverage of active drafts.

---

## 6. No mixed-shape persistence rule

After Phase 11 lands:

- Every **write** to `ags_agent_drafts.provider_config` filters out the secret denylist at the application layer (Phase 11 patch to the repository write path).
- Every **read** by the runtime adapter (`openllm-runtime-adapter.ts`) refuses any draft whose `provider_config` still carries a secret-shaped key — the read path throws and the agent fails fast.
- Phase 12's lint script (`scripts/check-agent-studio-no-raw-keys.ts`, deferred) walks all `ags_*` write call sites and ensures none reintroduce the secret keys.

---

## 7. Phase 11 / 12 hooks

### Phase 11 contract

- **Schema:** `ags_agent_provider_bindings` table with the columns listed in §3.1, indexes on `(workspaceId, agentId, draftId, role)` and `(providerConnectionId)`.
- **Write path:** new function `upsertAgentProviderBinding(input)` in `server/agent-studio/repository.ts` (or a dedicated `bindings.ts`). MUST call `providerConnections.getBindingEligibility` (Phase 8) before persisting `binding_v1`.
- **Read path:** new function `getAgentProviderBinding(draftId, role)` returning the resolved binding plus joined Provider Connection ref + AI Types catalog ref (read-only, no credentials).

### Phase 12 contract

- **Reader retirement:** `openllm-runtime-adapter.ts:301-321` (LR-01) replaced with a `getAgentProviderBinding` read followed by `openRouter.modelAccess.execute`. The `process.env[pc.apiKeyEnvVar]` indirection is deleted.
- **Schema follow-up:** the `provider_config` jsonb column is NOT dropped (existing non-secret metadata stays), but the lint script enforces the secret denylist on every write.
- **Seed fixtures:** LK-02, LK-03 — replaced with binding-row seeds that reference `provider_connections.id`.

---

## 8. Open questions deliberately deferred

The following are NOT decided in this doc and live in the corresponding phase:

- Multi-role bindings (one agent uses `primary` + `embedding` providers): Phase 11 `role` column is enum-free for now; the canonical role names land in Phase 11 alongside the Agent Studio binding picker UI.
- Per-environment overrides (dev vs prod Provider Connection): out of scope for Plan v3, deferred to a future "deployment environments" plan.
- Encrypted-at-rest legacy keys: even if `providerConfig.apiKey` is encrypted under platform encryption helpers (per the existing field comment), the migration treats it as raw — the value is destroyed, not migrated to Provider Connections, because we have no per-key intent record. The operator re-establishes the credential through the normal path.

---

## 9. Acceptance criteria for Phase 9 (this doc)

- [x] Old shapes A–D enumerated with examples.
- [x] New `AgentProviderBinding` shape and column list specified.
- [x] `legacy_unresolved` defined; statusReasons enumerated and mapped to source shapes.
- [x] `legacy_raw_api_key`, `legacy_env_var` defined.
- [x] Migration sequence (scan → classify → resolve → redact → evidence → validate) specified.
- [x] Rollback strategy specified, including the asymmetry on secrets.
- [x] No-mixed-shape rule specified.
- [x] Phase 11 / 12 hooks listed so the next two phases can build to this spec without further design.
