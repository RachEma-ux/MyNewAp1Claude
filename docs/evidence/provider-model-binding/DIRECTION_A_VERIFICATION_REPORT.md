# Direction A — Provider/Model Binding Bridge — Verification Report

**Direction A:** *AI Types / Provider Connections → Agent Studio → OpenRouter Model Access*
**Purpose:** Provider/model binding for creating, testing, and running Agent Studio agents.
**Verification mode:** read-only audit (no code changes), per `AGENTS.md` Reviewer + Tester roles.
**Branch:** `audit/provider-model-binding-direction-a` (from `main`)
**Base commit:** `9471ca6017853c94b67598f8a804b2f7f301d1a4` (post Plan v3 Phase 48)
**Date:** 2026-05-05

---

## 1. Executive verdict

**Direction A is PARTIAL.** The new binding-equipped path is implemented end-to-end (AI Types → Provider Connections → Agent Studio bindings → OpenRouter Model Access) and is the preferred runtime path for any agent with a `binding_v1` row. All static checks, scripts, and tests pass.

However, **legacy raw-credential paths still ship in code** for non-binding agents and for the streaming Expert chat handler. These are not new defects — they are **explicitly baseline-allowlisted** under register IDs LR-01, LR-08, LK-01–LK-03, and the runtime path migration matrix names "Phase 27 (Agent Studio raw-key surface elimination)" as their owner. Phase 27 is **not in Plan v3**.

Summary: Direction A's *new* path is verified. Direction A's *exclusivity* (i.e. that no other runtime path exists) is **not** verified, by design, as of `main@9471ca6`.

---

## 2. Branch and commit

```
$ git fetch origin
$ git checkout main
$ git pull --ff-only origin main          # already up to date
$ git checkout -b audit/provider-model-binding-direction-a
$ git rev-parse HEAD
9471ca6017853c94b67598f8a804b2f7f301d1a4
```

Verification branch is local-only at the time this report was written. Push step is at the end of the report.

---

## 3. Claim-by-claim results

| Claim | Status | Evidence | Gap / defect |
|---|---|---|---|
| AI Types provider/model availability contract | PASS | `server/ai-types/provider-models-availability.ts` (contract + `FORBIDDEN_AVAILABILITY_KEYS` list); `server/ai-types/manifest.ts:115` registers gateway action `aiTypes.providerModels.listAvailable`; `server/ai-types/public-api.ts:18` re-exports `listAvailableProviderModels`; `provider-models-availability.test.ts` asserts no forbidden credential keys in `AvailableProviderModel`. | None. |
| Provider Connections active binding contract | PASS | `server/provider-connections/public-api.ts:32` `ProviderConnectionRef` with `lifecycleStatus: "active" \| "validated"`, `selectable` only true when `active && healthStatus !== "unreachable"`; `manifest.ts:128–177` registers `listActiveForProvider`, `getConnectionStatus`, `validateConnection` gateway actions; `public-api.test.ts` checks `FORBIDDEN_PUBLIC_KEYS` against the ref shape. | None. |
| Provider Connections public/internal secret split | PASS | `server/provider-connections/internal/credential-resolver.ts:82` defines `withProviderCredential(providerConnectionId, fn)`; `scripts/check-provider-credential-resolver-boundary.ts` exits 0 (only `server/openrouter/model-access/**` may import the resolver); `public-api.ts` JSDoc and tests assert no PAT/apiKey/encryptedPat/Authorization/Bearer/x-api-key in any returned shape. | None. |
| OpenRouter owns Model Access | PASS | `server/openrouter/model-access/{execute.ts,index.ts,types.ts}` exists (no separate `model-access` RTLM); `server/openrouter/manifest.ts:39–172` registers `openRouter.modelAccess.{execute,stream,validateBinding}` gateway actions with `enforceModelAccessReceipt` for the hybrid receipt policy; `server/platform/modules/wiring-inventory.ts:44–66` `KNOWN_MODULES` lists 16 RTLMs — `openRouter` is one, no separate `modelAccess` key. `platform-wiring.test.ts:23` locks the count at 16. | None. |
| Agent Studio provider binding storage | PASS | `drizzle/tables/agent-studio.ts:1224` `agsAgentProviderBindings` columns are refs only: `providerCatalogEntryId`, `modelCatalogEntryId`, `providerConnectionId`, `modelRef`, `status` (`binding_v1 \| legacy_unresolved \| disabled \| archived`), `statusReason`, `legacyEnvVarHint` (name only — column comment explicitly "non-secret by definition"), `lastValidatedAt`. No apiKey / secret / password column. `tests/pmb/boundary.test.ts` invariant 1 enforces this at the column-name level. | The legacy `ags_agent_drafts.providerConfig` jsonb column (line 119) still exists and is permitted (per LK-01) to carry `apiKey` at rest. The boundary test does NOT inspect jsonb shape, only column names. The new bindings table is clean; the legacy column is documented in LK-01 with deadline Phase 10 (still open per register). |
| Agent Studio provider binding backend | PASS | `server/agent-studio/manifest.ts:66–101` declares all six lifecycle actions: `agentStudio.providerBindings.{list,create,update,remove,validate,resolveForRun}`. `server/agent-studio/boot.ts:166–264` registers their handlers. `server/agent-studio/api/provider-bindings-router.ts` adds the picker tRPC procedures: `pickerContext`, `pickerAvailableModels`, `pickerActiveConnections`, `refreshValidation`, `resolveForRun`, `getForDraft`, `upsert`, `validate`. `server/agent-studio/bindings.ts:594` `resolveForRun` returns `{binding, providerConnection, ok, reason}` and uses `validation_stale` for degraded-state detection (Phase 15). `validateBindingPolicy` is the *reference-time* validator; OpenRouter's `validateBinding` is the runtime one. | None. |
| Agent Studio provider binding UI | PASS | `client/src/modules/agent-studio/pages/AgentBindingPage.tsx:253` page header: "Bind to AI Types Catalog" + description "Credentials are not entered here — they live in Provider Connections." Uses `pickerActiveConnections` + `pickerAvailableModels` via tRPC; renders the `legacy_unresolved` warning banner with `legacyEnvVarHint`; no `<input type="password">`, no API-key input field. `validateQuery` consumes `validate` action; `refreshValidationMut` consumes `refreshValidation`. | None. |
| Agent Studio test runs use Model Access | PASS | `server/agent-studio/services/test-run-binding.ts:130` calls `resolveForRun(...)` for the binding; line 199 calls `gatewayCall("openRouter.modelAccess.execute", ...)`. No raw provider key is held by the test-run path; only `providerConnectionId` is passed. `server/agent-studio/services/test-run-binding.test.ts` covers it (Phase 44 marker). | None. |
| Expert chat & runChatWithTools use Model Access | **PARTIAL** | **NEW path exists:** `server/agent-studio/services/chat.ts:400` `runChatWithToolsViaBinding` (Phase 18) — line 887 is its call site; chooses the binding path when `candidateBinding.status === "binding_v1" && providerConnectionId !== null`; line 521 + 732 call `gatewayCall("openRouter.modelAccess.execute", ...)`. **Legacy fallback REMAINS:** `chat.ts:169` `runChatWithTools` (legacy) is invoked at line 1021 for any agent without a `binding_v1` row — it builds `new OpenAI({ apiKey: input.apiKey })` from `resolveProviderApiKey(providerConfig)` (`adapters/openllm-runtime-adapter.ts:311`, which itself reads `process.env[pc.apiKeyEnvVar]` and `process.env[PROVIDER_ENV_VAR[provider]]`). **Streaming Expert chat NOT migrated:** `server/agent-studio/chat-stream.ts:552` calls `resolveProviderApiKey` and line 580 builds `new OpenAI({ apiKey })` — there is *no* binding-aware branch in this file. Mounted at `/api/agent-studio/chat/stream` from `_core/index.ts:908`. | **Three live legacy paths**, all baseline-allowlisted in `scripts/check-provider-key-env-boundary.ts:80–137` and tracked in `LEGACY_EXCEPTION_REGISTER.md` (LR-01) and `RUNTIME_PATH_MIGRATION_MATRIX.md`. All three name "Phase 27 (Agent Studio raw-key surface elimination)" as deadline. **Phase 27 is not part of Plan v3**, so these gaps persist past Plan v3 completion. The register is honest about this; the implementation report needs to be too. |
| Boundary and wiring tests enforce Direction A | PASS for what they test; PARTIAL for what they don't | All required checks/tests/scripts pass — see §4 below. **What they enforce:** no NEW process.env provider-key reads outside the register; no new direct `catalog_entries` writers from AS; no new secret-shaped columns in `ags_*`; no new direct internal-resolver imports outside OpenRouter; cross-module-link rule for AS↔AI Types frontend; receipt descriptors for required actions; gateway action wiring; event subscribe wiring; coverage attestation. | **What they do NOT enforce:** (a) the legacy `ags_agent_drafts.providerConfig` jsonb cannot carry raw `apiKey` — boundary.test.ts only checks column-name literals, not jsonb shape, so LK-01 passes silently. (b) the legacy `runChatWithTools` and the streaming Expert chat handler — invariant 5 only scans `server/openrouter/model-access/**` for process.env reads, so AS legacy paths in LR-01 are out of scope. (c) the runtime guarantee that Model Access is the *only* provider entry — there is no test that fails if a new file under `server/agent-studio/` calls `new OpenAI(...)`; the only enforcement is the env-key boundary script which still allowlists the AS dynamic-zone files at LR-01. The tests verify that *new* code respects Direction A, not that Direction A is exclusive in the running system. |

---

## 4. Commands run and exit codes

| Command | Exit | Notes |
|---|---|---|
| `git fetch origin` | 0 | clean |
| `git checkout main && git pull --ff-only origin main` | 0 | already up to date |
| `git checkout -b audit/provider-model-binding-direction-a` | 0 | new branch |
| `git rev-parse HEAD` | 0 | `9471ca6` |
| `npm run check` | 0 | tsc --noEmit, no errors |
| `npm run check:architecture` | 0 | 0 failures, 27 baseline AI-Types-public-API warnings (LA-02 — pre-existing) |
| `npm run check:wiring` | 0 | 0 findings across handoff/frontend/runtime/coordinator wiring |
| `npm run check:frontend-modularity` | 0 | 0 failures, 0 baseline warnings |
| `npm run build` | 0 | client + server bundle succeed (55.65s; final `dist/index.js` 5.0 MB) |
| `npx vitest run tests/pmb/boundary.test.ts --reporter=verbose` | 0 | **12 / 12 PASS** across the 7 invariants |
| `npx vitest run tests/pmb/wiring.test.ts --reporter=verbose` | 0 | **13 / 13 PASS** |
| `npx vitest run tests/pmb/runtime-coverage.test.ts --reporter=verbose` | 0 | **33 / 33 PASS** (10 coverage concerns) |
| `npx tsx scripts/check-provider-credential-resolver-boundary.ts` | 0 | OK — D2 boundary clean |
| `npx tsx scripts/check-provider-key-env-boundary.ts` | 0 | OK — D1 boundary clean *given the LR-01–LR-06 baseline allowlist* |
| `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/{,agent-studio}` | n/a | HTTP 000 — dev server PID found but port 3000 not responding. UI runtime smoke is **BLOCKED** (see §6); static UI source review confirms claim 7. |

(The brief asked for `pnpm`; this repo uses `npm` per `package.json` and `CLAUDE.md`.)

---

## 5. Files inspected

### Server (read-only)
- `server/ai-types/provider-models-availability.ts`
- `server/ai-types/public-api.ts`
- `server/ai-types/manifest.ts`
- `server/provider-connections/public-api.ts`
- `server/provider-connections/manifest.ts`
- `server/provider-connections/internal/credential-resolver.ts`
- `server/openrouter/manifest.ts`
- `server/openrouter/model-access/` (directory listing only — no file edits)
- `server/agent-studio/manifest.ts`
- `server/agent-studio/boot.ts`
- `server/agent-studio/bindings.ts`
- `server/agent-studio/api/provider-bindings-router.ts`
- `server/agent-studio/services/test-run-binding.ts`
- `server/agent-studio/services/chat.ts` (`runChatWithToolsViaBinding` and the legacy `runChatWithTools` fallback)
- `server/agent-studio/chat-stream.ts` (the streaming Expert chat handler)
- `server/agent-studio/adapters/openllm-runtime-adapter.ts` (`resolveProviderApiKey` definition)
- `server/_core/index.ts` (Express route mounts)
- `server/platform/modules/wiring-inventory.ts` (`KNOWN_MODULES`)

### Client (read-only)
- `client/src/modules/agent-studio/pages/AgentBindingPage.tsx`
- `client/src/modules/agent-studio/components/AgentStudioShell.tsx` (route wire-up)

### Schema
- `drizzle/tables/agent-studio.ts:110–135` (legacy `ags_agent_drafts.providerConfig`)
- `drizzle/tables/agent-studio.ts:1224–1294` (`ags_agent_provider_bindings`)

### Tests
- `tests/pmb/boundary.test.ts`
- `tests/pmb/wiring.test.ts`
- `tests/pmb/runtime-coverage.test.ts`
- `server/ai-types/provider-models-availability.test.ts` (read-only sample)
- `server/provider-connections/public-api.test.ts` (read-only sample)

### Scripts
- `scripts/check-provider-credential-resolver-boundary.ts`
- `scripts/check-provider-key-env-boundary.ts`

### Docs reviewed
- `docs/architecture/provider-model-binding/LEGACY_EXCEPTION_REGISTER.md`
- `docs/architecture/provider-model-binding/RUNTIME_PATH_MIGRATION_MATRIX.md`
- `docs/architecture/provider-model-binding/DECISION_RECORD.md`

---

## 6. Defects found

The following are **defects against the claim language**, not against Plan v3's actual scope. Plan v3 explicitly carves these out via the legacy register; the implementation report previously written overstated finality.

### D-1 — Streaming Expert chat is not on Model Access (claim 9, LR-01 / LR-08 territory)
- **File:** `server/agent-studio/chat-stream.ts:552, 580` and Express mount at `server/_core/index.ts:908`.
- **What:** `handleAgentStudioChatStream` resolves a provider key with `resolveProviderApiKey(providerConfig)` (which reads `process.env`) and constructs `new OpenAI({ apiKey })`. There is no binding-aware branch in this file.
- **Why it survives:** allowlisted indirectly via the LR-01 dynamic-zone allowlist on `server/agent-studio/adapters/**` (`resolveProviderApiKey` lives there). Plan v3 Phases 17/18 migrated only the non-streaming Expert chat path in `services/chat.ts`.
- **Owner per register:** Phase 27 (out of Plan v3 scope).

### D-2 — Legacy `runChatWithTools` fallback retains direct OpenAI key path (claim 9, LR-01)
- **File:** `server/agent-studio/services/chat.ts:169` (definition) and `:1021` (call site under the "legacy fallback" branch).
- **What:** when an agent has no `binding_v1` row, the chat path invokes the legacy `runChatWithTools(input)` which holds the apiKey in memory and calls `new OpenAI({ apiKey })`.
- **Owner per register:** Phase 27 (out of Plan v3 scope).

### D-3 — Legacy `ags_agent_drafts.providerConfig` jsonb permits raw apiKey at rest (claim 5, LK-01)
- **File:** `drizzle/tables/agent-studio.ts:119`.
- **What:** the column is unconstrained `jsonb` and the column comment explicitly says "apiKey is encrypted at rest by the platform encryption helpers". This is the **legacy** storage shape that the Phase 11 bindings table replaces; the legacy column still ships and existing rows can carry secret material.
- **Why boundary.test.ts misses it:** the test only inspects column-name literals (`api_key`, `password`, `client_secret`, etc.); it does not inspect jsonb-content invariants.
- **Owner per register:** Phase 10 deadline (already passed at PR time per the register's "open" status); operationally rolled into Phase 27.

### D-4 — `/api/chat/stream` and automation `executeRunAgent` still use the env-seeded provider registry (claim 9, LR-08)
- **Files:** `server/chat/stream.ts` (mounted at `/api/chat/stream` in `_core/index.ts:879`); `server/automation/block-executors.ts:executeRunAgent` (lines 220–270 per register).
- **What:** both consume `getProviderRegistry()` which was originally seeded by `autoProvisionProviders()` from environment variables. They do not call Model Access.
- **Owner per register:** Phase 27.

### D-5 — Implementation report overstated D1 finality
- **File:** `/sdcard/Download/PMB_PLAN_V3_IMPLEMENTATION_REPORT.md` (the report I wrote earlier in this session).
- **What:** lines 23–25 state *"Runtime never reads provider API keys from `process.env`. All credential access goes through `withProviderCredential(providerConnectionId, fn)` (D2)."* The accurate statement is *"NEW runtime paths do not read process.env for provider API keys; legacy paths LR-01 / LR-08 / LK-01 still do, and are baseline-allowlisted with deadlines owned by Phase 27 (post-Plan-v3)."*
- **Recommended remediation:** doc-only correction in that report (or in a follow-up note next to it). No code change.

### Boundary risks observed
- **B-1.** `tests/pmb/boundary.test.ts` invariant 1's column-name-only test gives false comfort: a future code change could add an `apiKey` field inside `providerConfig` jsonb and pass the test.
- **B-2.** `tests/pmb/boundary.test.ts` invariant 5 only scans `server/openrouter/model-access/**` for process.env. It does not assert that AS or other modules avoid `process.env[*_API_KEY]` — those are governed only by the script-level allowlist, which has open deadlines.
- **B-3.** No runtime test fails when a new file under `server/agent-studio/` instantiates `new OpenAI(...)` directly. The only enforcement is the env-key boundary script, which still allowlists the AS dynamic-zone.

### Runtime / UI smoke
- **BLOCKED.** A `tsx server/_core/index.ts` PID is present (`pgrep` returned `10923`) but `curl http://localhost:3000/` returns HTTP 000 — port not bound. `lsof -ti :3000` is not permitted on this Termux sandbox. Per the brief, the UI smoke is optional; static UI source review confirmed claim 7.

---

## 7. Required fixes

Per the brief: "**Do not fix application code in this verification PR unless the defect is only in documentation/evidence.**" Of the five defects:

- **D-1, D-2, D-3, D-4** are runtime-code defects against the claim language but are **deliberate Plan-v3 scoping decisions**, openly tracked in the legacy register with Phase 27 ownership. Per the brief, **no code change in this audit PR**. The fixes are owned by Phase 27.
- **D-5** is documentation-only. **Recommended correction in this PR or as a small follow-up:** add a one-paragraph note to `/sdcard/Download/PMB_PLAN_V3_IMPLEMENTATION_REPORT.md` (and/or `docs/evidence/provider-model-binding/README.md`) clarifying that the D1 statement is "no NEW process.env reads outside the LR-01–LR-08 allowlist" rather than absolute.
- **B-1, B-2, B-3** are observations about test scope. They are not defects in Plan v3 (which scoped the tests deliberately) but they are facts the next phase plan should know. **No fix in this PR.** Recommended for the future track plan: extend the boundary suite to (i) check that no jsonb column comment claims "encrypted at rest" without an enforcement layer, and (ii) scan all of `server/agent-studio/**` (not just `model-access/**`) for `process.env[*_API_KEY]` patterns once LR-01 is closed.

---

## 8. Is Direction A verified enough to rely on?

**Conditionally yes — for binding-equipped agents only.**

- An Agent Studio agent that has a `binding_v1` row pointing at a healthy `provider_connections` row uses Direction A end-to-end: AI Types provides the model availability contract, Provider Connections provides the no-secret reference + the internal credential resolver (D2-bounded to OpenRouter), Agent Studio holds only refs, OpenRouter Model Access is the single facade. All test runs and the non-streaming tool-equipped Expert chat go through this path. **You can rely on it for new agents that you create through the Phase 14 picker UI.**
- An agent without a `binding_v1` row still falls through to one of the legacy paths (LR-01 / LR-08 / LK-01) and **bypasses Direction A**. The streaming Expert chat handler bypasses Direction A unconditionally. **Do not rely on Direction A as exclusive until Phase 27 lands.**

If "rely on Direction A" means "no path in production reads provider keys from `process.env`," then **No** — Direction A is not yet exclusive at `9471ca6`. The legacy register and the runtime path migration matrix both name Phase 27 as the elimination phase, and Phase 27 is not part of Plan v3.

---

## 9. Recommendations

1. **Treat Direction A as "preferred, not exclusive" until Phase 27.** Continue to use the binding picker UI for all new agents; do not delete the legacy fallback yet because non-binding fixtures and the streaming chat-stream handler still depend on it.
2. **Update the implementation report (D-5).** One-paragraph correction at minimum.
3. **Schedule Phase 27** as the next governance-relevant work after Plan v3, with three named deliverables: (a) migrate `chat-stream.ts` to a binding-aware branch + Model Access stream, (b) delete the legacy `runChatWithTools` fallback path once non-binding fixtures are bound, (c) tighten `ags_agent_drafts.providerConfig` jsonb shape (LK-01) to forbid `apiKey` field on new writes.
4. **Optional — extend boundary tests.** Once Phase 27 closes the legacy paths, expand `boundary.test.ts` invariant 5 to scan all of `server/agent-studio/**` (not just `model-access/**`) and add a jsonb-shape invariant for `providerConfig`. This locks the gain.

---

## 10. Final git status

```
$ git status --short
?? .claude/settings.local.json.bak.1777827707
?? docs/AI_TYPES_MODULE_COMMUNICATION.md
```

(Untracked files above are unrelated to this audit and pre-date the verification branch. The new evidence file `docs/evidence/provider-model-binding/DIRECTION_A_VERIFICATION_REPORT.md` is staged separately at commit time.)
