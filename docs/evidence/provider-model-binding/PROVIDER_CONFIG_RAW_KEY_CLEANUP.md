# Phase 27.2 — providerConfig Raw-Key Cleanup

**Captured:** 2026-05-05 against `fix/pmb-phase-27-runtime-provider-key-surface`.
**Owner:** Builder + Tester roles per AGENTS.md.

## What 27.2 ships

### A. Forward-write guard

New helper:

- `server/agent-studio/services/provider-config-guard.ts`
  - Exports `sanitizeProviderConfig(providerConfig, context)` and `sanitizeProviderConfigForStorage(providerConfig, context)`.
  - Strips four forbidden keys: `apiKey`, `api_key`, `apiKeyEnvVar`, `api_key_env_var`.
  - Logs one `console.warn` per stripped write with context (`agentId`, `draftId`, `source`). The log line **does not** include the secret value.
  - Pure function, no I/O, fully unit-testable.

Wired into both repository write paths:

- `server/agent-studio/repository.ts:updateRuntimeConfig` — the `agentStudio.runtime.update` tRPC mutation chokepoint.
- `server/agent-studio/repository.ts:updateDraft` — the cloning + generic-update chokepoint (`services/cloning.ts` flows through here).

`createAgent` does not set `providerConfig`, so no guard is needed there; the legacy fixture seeds (LK-02, LK-03) bypass these write paths and remain in scope for 27.2B's backfill instead.

Tests: `server/agent-studio/services/provider-config-guard.test.ts` — **7/7 PASS** locally (`npx vitest run server/agent-studio/services/provider-config-guard.test.ts`).

### B. Backfill / migration script

Existing Phase 10 script extended to add the real `--apply` path:

- `scripts/agent-studio/migrate-provider-config-to-bindings.ts`

Modes (all preserved + extended):

| Mode | Behavior |
|---|---|
| `--dry-run` (default) | Scan `ags_agent_drafts` + classify + write evidence report. No DB writes. |
| `--apply` | Now writes: (i) creates a `legacy_unresolved` row in `ags_agent_provider_bindings` for each classified draft (idempotent on `(draftId, role='primary')`), (ii) redacts the source draft's `providerConfig` jsonb to remove `SECRET_DENYLIST` + `apiKeyEnvVar`, (iii) walks every `ags_agent_versions.snapshot` jsonb and recursively redacts forbidden keys at any depth. Releases reference versions (no separate snapshot column), so version cleanup transitively covers releases. |
| `--validate` | Scans both drafts and version snapshots; exits 1 if any forbidden key remains. |

Idempotency guarantees:

- Re-running `--apply` skips drafts that already have a binding row (counted as `bindingsSkipped`).
- A draft with a clean providerConfig is a no-op for the redaction step (counted as zero `draftsRedacted`).
- The version-snapshot scan only writes when forbidden keys are found.

Counts emitted per `--apply` run:

```
bindingsCreated=N1 bindingsSkipped=N2 draftsRedacted=N3 versionSnapshotsRedacted=N4
```

### C. Evidence — execution counts

| Mode | Counts | Notes |
|---|---|---|
| `--dry-run` | **BLOCKED — DB unavailable on this device.** Per AGENTS.md device-workflow rules and the Phase 27.1 sizing report, no DB exists here. | The script is functional; running it requires `DATABASE_URL` to be set. |
| `--apply` | BLOCKED — DB unavailable. | Same. |
| `--validate` | BLOCKED — DB unavailable. | Same. |

The dry-run / apply / validate counts can only be produced by running the script in an environment with ASDB connectivity (dev / staging / prod). The script writes the dry-run report to `docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md` (path established in Phase 10).

### Safety: no decrypt-and-relocate attempt

Per the brief: *"If decrypt-and-relocate to Provider Connections is unsafe or impossible, do not attempt it. Prefer redact + legacy_unresolved + force re-binding."*

The script implements **redact + legacy_unresolved** only:

- It does not try to decrypt encrypted apiKey values out of the legacy jsonb and re-insert them into `provider_secrets`.
- It does not try to map env-var hints into `provider_secrets` rows from `process.env` at script-run time.
- It produces a `legacy_unresolved` binding with `statusReason ∈ {legacy_raw_api_key, legacy_env_var, legacy_no_credential}` so operators can complete the migration through the Phase 14 picker UI.

### Non-secret metadata preservation

The redaction pass strips only the forbidden key set:
```
SECRET_DENYLIST = ["apiKey", "api_key", "pat", "PAT", "encryptedPat",
                   "encrypted_pat", "encryptedSecret", "encrypted_secret",
                   "secret", "secretValue", "secret_value", "Authorization",
                   "authorization", "x-api-key", "Bearer", "bearer"]
ENV_VAR_FIELD   = "apiKeyEnvVar"
```

Everything else — `provider`, `model`, `temperature`, `maxTokens`, `baseUrl`, `endpoint`, custom client config — is preserved verbatim in both the draft jsonb and the version-snapshot jsonbs.

## Commands run on this device

```
npx vitest run server/agent-studio/services/provider-config-guard.test.ts
# 7/7 PASS

npm run check
# tsc --noEmit, exit 0
```

The migration script's `--dry-run` / `--apply` / `--validate` outputs require DB connectivity and are deferred to whichever environment runs the script.

## Acceptance check for 27.2

- [x] **Forward-write guard.** New writes via `updateRuntimeConfig` or `updateDraft` cannot persist `apiKey` / `apiKeyEnvVar` / their snake_case variants. Tested at the unit level.
- [x] **Backfill migration script.** `--apply` creates `legacy_unresolved` bindings, redacts draft + version-snapshot jsonbs, idempotent.
- [x] **Validate mode.** Scans drafts + versions; exits 1 on residual forbidden keys.
- [x] **Non-secret metadata preserved.** Only the forbidden-key set is stripped.
- [x] **No decrypt-and-relocate.** Redact-only path per brief.
- [x] **Evidence written here.** Counts BLOCKED on this device with explicit reason.
