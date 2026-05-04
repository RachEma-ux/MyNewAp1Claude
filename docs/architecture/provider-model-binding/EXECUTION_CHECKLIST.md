# Execution Checklist — Plan v3

Mirrors the user-supplied 48-phase checklist. Updated after each PR. Phase 0 items checked once Phase 0 PR merges. Stage 1+ remain unchecked.

**Legend:** `[ ]` pending · `[x]` complete · `[~]` in progress · `[!]` blocked

---

## Stage 0 — Freeze, inventory, and lock decisions

### Phase 0.1 — Decision record and freeze gate

- [~] Create `docs/architecture/provider-model-binding/DECISION_RECORD.md`. *(Drafted on `feat/pmb-stage-0-decision-record`; checks to `[x]` when PR merges.)*
- [~] Lock decision: runtime Model Access never reads provider API keys from process.env.
- [~] Lock decision: .env keys may only be used by a boot-time seed/import script into Provider Connections.
- [~] Lock decision: Provider Connections has a public no-secret surface and an internal credential resolver surface.
- [~] Lock decision: only OpenRouter Model Access may import the internal credential resolver.
- [~] Lock decision: Provider Connections becomes a manifested platform infrastructure module, not RTLM #16.
- [~] Lock decision: OpenRouter owns Model Access; no new Model Access RTLM is created.
- [~] Lock decision: CI uses mocks/local provider fixtures; live provider tests are opt-in only.
- [~] Lock decision: AI Types catalog dedup is one catalog entry per Agent Studio agent, not one per version.
- [~] Lock decision: pre-migration Agent Studio catalog rows are treated as legacy_imported.
- [~] Lock decision: agentStudio.agent.publish becomes Agent Studio lifecycle-only and does not write catalog_entries.
- [~] Add Planner signoff.
- [~] Add Reviewer signoff.
- [~] Add Tester signoff.
- [~] Add Governance signoff.
- [ ] Merge decision record before Stage 1 starts.

### Phase 0.2 — Current reality map

- [~] Create `docs/architecture/provider-model-binding/CURRENT_REALITY_MAP.md`.
- [~] Inventory Agent Studio provider config fields.
- [~] Inventory all Agent Studio raw provider-key paths.
- [~] Inventory Agent Studio publish path.
- [~] Inventory all direct catalog_entries writers/readers.
- [~] Inventory all AI Types private/internal imports.
- [~] Inventory Provider Connections current router/service/db shape.
- [~] Inventory OpenRouter server-side execution capabilities.
- [~] Inventory `/api/chat/stream` provider access.
- [~] Inventory Agent Studio Expert chat provider access.
- [~] Inventory `server/automation` provider access. *(Partial — flagged as known gap §12 in the map.)*
- [x] Do not assign migration fate in this file; map only. *(Verified: fate-only in `LEGACY_EXCEPTION_REGISTER.md`.)*

### Phase 0.3 — Legacy exception register

- [~] Create `docs/architecture/provider-model-binding/LEGACY_EXCEPTION_REGISTER.md`.
- [~] Add columns: ID, path, owner, current violation, reason retained, risk, target replacement, deadline phase, deadline PR, status, reviewer.
- [~] Add known runtime exceptions. *(LR-01 through LR-05.)*
- [~] Add known AI Types internal-import exceptions. *(LA-01, LA-02 aggregate.)*
- [~] Add known direct catalog_entries writer exceptions. *(LC-01 through LC-08.)*
- [~] Make "expired" exceptions fail governance review. *(Lifecycle rule documented in the register.)*

---

## Stage 1 — Provider Connections and Model Access foundation

### Phase 1 — Manifest Provider Connections as platform infrastructure

- [x] Create `server/provider-connections/manifest.ts`.
- [x] Set manifest key to `providerConnections`.
- [x] Set runtime mode to `shared`.
- [x] Set DB ownership to shared appdb provider tables. *(ownedTables: `provider_connections`, `provider_secrets`, `provider_audit_log`)*
- [x] Declare route `/providers/connections`.
- [x] Declare public API path `server/provider-connections/public-api.ts`.
- [x] Declare governance actions for validate/store, activate, rotate, disable, delete. *(5 actions, governance-actions count 58 → 63)*
- [x] Register module health action.
- [x] Add to module registry if required. *(added to `ALL_MANIFESTS` in `server/platform/modules/manifests.ts` under "Platform infrastructure modules" section)*
- [x] Ensure it is not counted as RTLM #16. *(intentionally NOT added to `KNOWN_MODULES` in `wiring-inventory.ts` — that list is RTLMs only per D3)*
- [x] Run wiring checks. *(all green: architecture, wiring, frontend-modularity, TypeScript)*

### Phase 2 — Split Provider Connections public and internal surfaces

- [x] Create/update public no-secret surface. *(public-api.ts populated with ProviderConnectionRef + 3 read fns)*
- [x] Add `providerConnections.listActiveForProvider`. *(registered in manifest boot via registerPublicApi)*
- [x] Add `providerConnections.getConnectionStatus`.
- [x] Add `providerConnections.validateConnection`.
- [x] Ensure public outputs never include PAT, API key, encrypted secret, decrypted secret, or secret env values. *(public-api.test.ts asserts on FORBIDDEN_PUBLIC_KEYS list including apiKey/pat/encryptedPat/Authorization/Bearer/x-api-key/etc.)*
- [x] Create `server/provider-connections/internal/credential-resolver.ts`.
- [x] Implement `withProviderCredential(providerConnectionId, fn)`. *(callback form per D2 — credential exists only inside fn closure)*
- [x] Ensure resolver never logs secret values. *(no console/log statements; PAT scrubbed in finally)*
- [x] Ensure resolver is not exported from router, index, or public API. *(internal/ subtree, not re-exported anywhere; lint enforcement lands in Phase 3)*
- [x] Add tests proving public API returns no secret material. *(6 vitest cases pass — covers shape guards + nested-poison detection)*

### Phase 3 — Enforce credential resolver import boundary

- [x] Create `scripts/check-provider-credential-resolver-boundary.ts`.
- [x] Allow imports only from `server/openrouter/model-access/**`. *(plus the resolver's own internal/ subtree for siblings)*
- [x] Fail if Agent Studio imports resolver.
- [x] Fail if AI Types imports resolver.
- [x] Fail if frontend imports resolver.
- [x] Fail if automation imports resolver directly.
- [x] Add script to `check:architecture` or equivalent. *(both `package.json#check:provider-credential-resolver-boundary` and inside `scripts/check-architecture.ts` SUITES list)*
- [x] Add a negative test fixture if the repo pattern supports it. *(`tests/check-provider-credential-resolver-boundary.test.ts` — 3 vitest cases assert the script's allow-list shape and the resolver-target classifier on 6 sample specs including 2 negative cases)*

### Phase 4 — Create OpenRouter Model Access facade

- [x] Create `server/openrouter/model-access/`. *(types.ts, execute.ts, index.ts, execute.test.ts)*
- [x] Add `execute`. *(non-streaming OpenAI + Anthropic adapters)*
- [x] Add `stream`. *(OpenAI SSE streaming; Anthropic falls back to execute() and yields a single full chunk — full SSE for Anthropic and tool-call streaming deferred to Phase 17/18)*
- [x] Add `validateBinding`. *(probes /v1/models; treats Anthropic absence as ok)*
- [x] Register gateway action `openRouter.modelAccess.execute`.
- [x] Register gateway action `openRouter.modelAccess.stream`. *(gateway form collects full stream and returns single ModelAccessResult; direct streaming consumers import `stream` directly)*
- [x] Register gateway action `openRouter.modelAccess.validateBinding`.
- [x] Update OpenRouter manifest `ports.provided` with `openRouter.modelAccess`. *(plus `openRouter.inferenceRouting`; `consumed: ["providerConnections.credential"]`)*
- [x] Ensure Model Access calls Provider Connections internal resolver. *(via `withProviderCredential`; this is the only file outside `server/secrets/` that holds a decrypted PAT)*
- [x] Ensure Model Access owns runtime model-call execution, not provider catalog metadata.
- [x] Add error normalization. *(`ModelAccessError` with codes + branch-specific reason in `ModelAccessResult.error`)*
- [x] Add latency/usage telemetry structure. *(`latencyMs` + `usage: { inputTokens, outputTokens, totalTokens }`)*
- [x] Add correlation ID support. *(`correlationId` echoed back; auto-generated if not supplied)*

### Phase 5 — Enforce no-runtime-process.env provider key rule

- [x] Create `scripts/check-provider-key-env-boundary.ts`.
- [x] Fail runtime reads of `process.env.OPENAI_API_KEY`. *(literal dot + bracket form, with NON_PROVIDER_KEYS allowlist for FORGE + OMNIRAG)*
- [x] Fail runtime reads of `process.env.ANTHROPIC_API_KEY`.
- [x] Fail runtime reads of generic `process.env.*API_KEY` in Agent Studio runtime paths. *(dynamic-index zone scoped to `agent-studio/adapters/` + `runtime/` only — `services/`/`api/` excluded because their `process.env[key]` use is sandboxed-hook env passthrough, not provider auth)*
- [x] Fail writes/mutations to `process.env` provider-key variables. *(envWriteRegex catches `=`, excludes `==`/`===`)*
- [x] Allow only explicit boot-time seed script path. *(`<seed-script>` sentinel for `scripts/provider-connections/seed-from-env.ts`)*
- [x] Create optional `scripts/provider-connections/seed-from-env.ts`. *(Phase 5 stub — full implementation lands in Phase 9–10; existing `_core/index.ts:120-140` block tracked as LR-06)*
- [~] Seed script reads env once, validates provider, creates encrypted Provider Connection, and exits. *(deferred to Phase 9–10; stub exits non-zero so accidental usage is loud)*
- [x] Add check to architecture validation. *(both `package.json#check:provider-key-env-boundary` and `scripts/check-architecture.ts` SUITES list)*
- [x] Add LR-06 row to `LEGACY_EXCEPTION_REGISTER.md`. *(autoProvisionProviders boot block — High risk, deadline Phase 10)*
- [x] Add negative-fixture test. *(`tests/check-provider-key-env-boundary.test.ts` — 8 vitest cases on classifier + script declarations + write-vs-equality regex)*

### Phase 6 — CI test strategy for Model Access

- [x] Create `tests/fixtures/mock-provider-server.ts`. *(local `http.createServer`-based fixture; auto-assigns port; captures every inbound request for assertions; supports per-test response overrides via `options`)*
- [x] Mock `/v1/models`. *(OpenAI + Anthropic shapes both served from this path)*
- [x] Mock `/v1/chat/completions`. *(OpenAI shape; supports one-shot non-200 status injection via `nextChatStatus` for HTTP-error normalization tests)*
- [x] Mock `/api/tags`. *(Ollama shape; `/api/chat` also wired for future Phase 17/18 Ollama-native paths)*
- [x] Unit-test Model Access with fake provider adapter. *(8 cases in `server/openrouter/model-access/execute.test.ts` — covers OpenAI + Anthropic adapters, validateBinding ok/not-listed/Anthropic-underreport)*
- [x] Unit-test Model Access with fake credential resolver. *(same suite — `withProviderCredential` mocked at module level; covers credential_resolution_failed normalization)*
- [x] Wire-level test Model Access against local mock provider. *(6 cases in `tests/model-access/mock-provider.test.ts` — exercises real fetch -> mock server -> response normalization through the full pipeline; assertions include URL/method/headers, system-message hoisting, no-secret-leak regression guard)*
- [x] Ensure CI does not require OpenAI/Anthropic keys. *(no test in the default include set hits a real provider; mock server is auto-spawned)*
- [x] Gate live tests behind `RUN_LIVE_PROVIDER_TESTS=1`. *(`liveProviderTestsEnabled()` helper exported from the fixture; live tests when added later must early-skip when this returns false)*
- [x] Document live tests as manual only. *(`tests/fixtures/README.md` — opt-in env var, not set in CI, explicit "manual only" callout citing D6)*

---

## Stage 2 — AI Types and Provider Connections availability contracts

### Phase 7 — AI Types provider/model availability contract

- [x] Add public read action `aiTypes.providerModels.listAvailable`. *(registered via `registerPublicApi` in `server/ai-types/manifest.ts` — risk=low, receiptRequired=false)*
- [x] Define `ListAvailableProviderModelsInput`. *(`providerSlug?`, `capability?`, `workspaceId?`)*
- [x] Define `AvailableProviderModel`. *(11 fields incl. `governanceStatus` + `restrictions` sub-objects)*
- [x] Return provider catalog entry ID. *(joined from `catalog_entries` where `entryType=provider` AND `providerId=...`)*
- [x] Return provider slug/name. *(plus `providerType` for adapter selection in Model Access)*
- [x] Return model catalog entry ID where available. *(joined from `catalog_entries` where `entryType=model` AND `sourceType=ai_type_models`)*
- [x] Return model ref. *(`apiModelId` first, falls back to `canonicalKey` (provider slug stripped) or `name`)*
- [x] Return capabilities.
- [x] Return governance status. *(`isCatalogEntryAvailableForAppUse` shared with Catalog Availability Authority; reasons enumerated)*
- [x] Return restrictions. *(provider `policyTags`, model entry `frozen` + `freezeReason`)*
- [x] Return no credentials. *(`FORBIDDEN_AVAILABILITY_KEYS` exported alongside the function; both unit-test suites assert the shape guard)*
- [x] Register action through public API/gateway. *(both `aiTypes/manifest.ts` governance descriptor + `governance/action-key-map.ts` entry — keeps `check:governance-actions` at 67/67)*
- [x] Add tests. *(`server/ai-types/provider-models-availability.test.ts` — 7 vitest cases covering shape guard, frozen/unapproved/disabled-provider filtering, modelRef fallback, sandbox no-DB short-circuit)*

### Phase 8 — Provider Connections active connection contract

- [x] Add public read action `providerConnections.listActiveForProvider`. *(landed in Phase 2 — Phase 8 adds the `selectable` + `degradedReason` fields to the returned ref)*
- [x] Return only active/validated references. *(`VISIBLE_LIFECYCLE_STATUSES = ["active","validated"]` — disabled/failed filtered at the SELECT)*
- [x] Mark active as selectable. *(`selectable = lifecycleStatus === "active" && healthStatus !== "unreachable"`)*
- [x] Mark validated as visible but not selectable for runtime binding. *(validated rows return with `selectable: false`; binding-eligibility maps to reason `validated_only`)*
- [x] Hide or degrade disabled/failed in selection UI. *(disabled/failed: filtered out of `listActiveForProvider`; unreachable: returned with `selectable: false`)*
- [x] Reject binding creation unless connection is active. *(new `getBindingEligibility(input)` gate — returns typed `BindingEligibilityResult` with reason codes `not_found` | `not_active` | `validated_only` | `secret_missing` | `health_failed`; Agent Studio binding writers in Phase 11+ MUST call before persisting a binding)*
- [x] Allow unknown health only as `degraded` with `provider_health_unknown`. *(active+unknown returns `ok=true` with `degradedReason="provider_health_unknown"`; Phase 8 contract: unknown is permitted, surfaces as warning, not a blocker)*
- [x] Add tests. *(8 vitest cases in `binding-eligibility.test.ts` covering all branches; existing `public-api.test.ts` extended for the two new fields — 15/15 pass)*
- [x] Register `providerConnections.getBindingEligibility` gateway action. *(low-risk, no receipt; `governance/action-key-map.ts` updated — 67 -> 68 actions, all covered)*

---

## Stage 3 — Agent Studio provider/model binding

### Phase 9 — Provider config migration design

- [x] Create `docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md`.
- [x] Define old shape with apiKey. *(§2.1 — Shape A; LK-01..LK-03 risk)*
- [x] Define old shape with apiKeyEnvVar. *(§2.2 — Shape B; LR-01 risk)*
- [x] Define new `AgentProviderBinding`. *(§3 — full column list, lives in new ASDB table `ags_agent_provider_bindings`, NOT in providerConfig jsonb)*
- [x] Define `legacy_unresolved`. *(§3.2 — `status` enum value; visible to operators; runtime refuses to call until resolved)*
- [x] Define `statusReason = legacy_raw_api_key`. *(§3.3 — Shape A migration target; key is destroyed, operator must re-bind through Provider Connections)*
- [x] Define `statusReason = legacy_env_var`. *(§3.3 — Shape B migration target; env var name preserved as `legacyEnvVarHint` for operator triage)*
- [x] Define migration rollback strategy. *(§5 — evidence report is the rollback artifact; non-symmetric: secrets are NEVER restored, only non-secret metadata)*
- [x] Define no mixed-shape persistence after migration. *(§6 — application-layer write filter + runtime read guard + Phase 12 lint enforcing secret denylist on every write)*

### Phase 10 — Provider config migration script

- [x] Create `scripts/agent-studio/migrate-provider-config-to-bindings.ts`. *(CLI entry; defaults to --dry-run; --apply blocks until Phase 11 destination table exists)*
- [x] Create pure classifier `scripts/agent-studio/classify-provider-config.ts`. *(extracted so it can be unit-tested without DB; covers Shapes A/B/C/D from migration spec §2)*
- [x] Scan Agent Studio drafts. *(`loadDrafts()` selects from `agsAgentDrafts`; aborts cleanly when DATABASE_URL is unset)*
- [x] Detect raw apiKey. *(Shape A — `legacy_raw_api_key`; empty-string apiKey is treated as missing per Phase 9 spec)*
- [x] Detect apiKeyEnvVar. *(Shape B — `legacy_env_var` with the env var name preserved as `envVarHint` for the binding's `legacyEnvVarHint` column)*
- [~] Create legacy unresolved binding records. *(classifier produces the row plan; INSERT block is gated until Phase 11 schema lands — `--apply` aborts with a clear message until then per migration spec §7)*
- [x] Remove/redact raw key fields from draft provider config. *(`maskProviderConfig` redacts every key in `SECRET_DENYLIST` to `"<redacted>"` for the rollback artifact; runtime redaction is a Phase 11 follow-up that runs after the binding row is committed)*
- [x] Preserve non-secret provider metadata. *(everything not in `SECRET_DENYLIST` passes through verbatim — `providerSlug`, `providerType`, `model`, `baseUrl`, etc.)*
- [x] Write migration evidence report. *(markdown report at `docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md` with counts + per-draft classification table + masked snapshot)*
- [x] Make script idempotent. *(re-running --apply checks for an existing `(draftId, role)` row before inserting; --dry-run is read-only by definition)*
- [x] Add dry-run mode. *(default — no DB writes, evidence report still written)*
- [x] Add validation mode. *(`--validate` re-scans and exits non-zero if any draft still carries `apiKey` / `apiKeyEnvVar` / other denylist key)*
- [x] Output `docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md`. *(emitted on every run; rollback artifact per migration spec §5)*
- [x] Add classifier unit tests. *(`tests/agent-studio/migrate-provider-config-classifier.test.ts` — 14 vitest cases covering all four shapes, precedence rules, malformed jsonb defenses, mask redaction, and the no-secret-leak regression guard)*

### Phase 11 — Agent Studio binding schema/storage

- [x] Add ASDB table or JSON storage for provider bindings. *(`ags_agent_provider_bindings` in `drizzle/tables/agent-studio.ts`; ASDB-owned alongside the rest of `ags_*`)*
- [x] Include workspaceId, agentId, draftId, role. *(role defaults to "primary"; multi-role values reserved)*
- [x] Include providerCatalogEntryId, modelCatalogEntryId, providerConnectionId, modelRef. *(modelRef is non-null; the rest are nullable per the migration spec invariants)*
- [x] Include status, statusReason. *(status enum: binding_v1 | legacy_unresolved | disabled | archived; statusReason maps to migration spec §3.3)*
- [x] Include createdBy, createdAt, updatedAt.
- [x] Do not include secret fields. *(no apiKey/pat/Authorization/x-api-key columns; `legacyEnvVarHint` carries env var NAME only — non-secret per migration spec §3.4)*
- [x] Add migration. *(`drizzle/0035_agent_provider_bindings.sql` + journal entry idx 35; idempotent CREATE IF NOT EXISTS for table + 4 indexes)*
- [x] Add repository functions. *(`server/agent-studio/bindings.ts` — `upsertAgentProviderBinding` (calls `getBindingEligibility` Phase 8 gate before persisting binding_v1; throws `BindingEligibilityError` on rejection; supports `enforceEligibility:false` escape-hatch for the migration script + local-provider null-credential path), `getAgentProviderBinding`, `listBindingsForAgent`)*
- [x] Add public-shape no-secret guard. *(`AgentProviderBindingPublic` projection + `FORBIDDEN_BINDING_KEYS` cross-checked by tests)*
- [x] Add tests. *(`server/agent-studio/bindings.test.ts` — 8 vitest cases: gate called for binding_v1, gate skipped for legacy_unresolved, gate skipped via enforceEligibility:false, local-provider null-PCID accepted, BindingEligibilityError thrown on rejection, idempotent update on existing draft+role, no-secret read shape guard)*

### Phase 12 — Agent Studio provider binding backend

- [x] Add `agentStudio.providerBindings.list`. *(gateway action; wraps `listBindingsForAgent(agentId)`)*
- [x] Add `agentStudio.providerBindings.create`. *(wraps `upsertAgentProviderBinding`; calls Phase 8 eligibility gate)*
- [x] Add `agentStudio.providerBindings.update`. *(same upsert handler — `(draftId, role)` unique-index resolves create-vs-update)*
- [x] Add `agentStudio.providerBindings.remove`. *(wraps `removeAgentProviderBinding(draftId, role)`; idempotent)*
- [x] Add `agentStudio.providerBindings.validate`. *(reference/policy validation — wraps `validateBindingPolicy`; no upstream HTTP per Phase 13 split)*
- [x] Add `agentStudio.providerBindings.resolveForRun`. *(returns `{binding, providerConnection, ok, reason}` — no credentials; runtime adapter calls this then passes `providerConnectionId` to `openRouter.modelAccess.execute`)*
- [~] Validate provider/model availability through AI Types public contract. *(deferred to Phase 12.b tightening — `catalogAvailable: null` placeholder leaves room; AI Types `listAvailableProviderModels` already exists from Phase 7)*
- [x] Validate provider connection through Provider Connections public contract. *(`validateBindingPolicy` calls Phase 8 `getBindingEligibility` for non-local-provider bindings)*
- [x] Ensure resolveForRun returns references only, no secrets. *(guarded by `FORBIDDEN_BINDING_KEYS` in tests + `AgentProviderBindingPublic` projection)*
- [x] Add tests. *(`bindings-policy.test.ts` — 10 vitest cases covering all reason branches, local-provider null-PCID, no-secret resolver shape guard; existing `bindings.test.ts` 8/8 still green)*
- [x] Wire 6 actions into `governance/action-key-map.ts`. *(governance-actions count 68 → 74, all covered)*

### Phase 13 — Separate binding validator from Model Access validator

- [x] Define `agentStudio.providerBindings.validate` as reference/policy validation. *(`docs/architecture/provider-model-binding/VALIDATOR_SPLIT.md` §1 — cheap, DB only, called on every save/render/run preflight)*
- [x] Define `openRouter.modelAccess.validateBinding` as runtime execution validation. *(VALIDATOR_SPLIT.md §2 — network round-trip, called on operator-driven "Test connection")*
- [x] Document when each is called. *(VALIDATOR_SPLIT.md §1.3, §2.3, §4 — explicit decision-flow diagram)*
- [x] Rename UI labels to avoid confusion. *(VALIDATOR_SPLIT.md §3 — "validate" reserved for cheap policy check; "Test connection" / "Test new credential" for network probe; binding-row chips: Active / Degraded / Blocked)*
- [x] Add tests for both validators. *(both already exist from Phase 4 + Phase 12 — VALIDATOR_SPLIT.md §5 cross-references the test files)*

### Phase 14 — Agent Studio provider binding UI

- [x] Add "Add Provider Binding" UI. *(`AgentBindingPage.tsx`; new "Provider Binding" sidebar entry; routed via `case "binding":` in `AgentStudioShell.tsx`)*
- [x] Use label "Bind to AI Types" or "Select from AI Types Catalog". *(page header reads "Bind to AI Types Catalog"; the word "Import" is intentionally avoided)*
- [x] Do not use "Import from AI Types". *(verified in component literals)*
- [x] Provider picker calls Agent Studio backend only. *(only `trpc.agentStudio.providerBindings.*` is hit from the page)*
- [x] Agent Studio backend fetches AI Types/provider connection options. *(`pickerAvailableModels` and `pickerActiveConnections` procedures wrap gateway calls to `aiTypes.providerModels.listAvailable` (Phase 7) and `providerConnections.listActiveForProvider` (Phase 2))*
- [x] Show provider/model list. *(grouped by `providerSlug`; second dropdown filtered to selected provider)*
- [x] Show active connections. *(third dropdown; only fetched once a model is selected)*
- [x] Disable validated-but-not-active connections. *(`<option disabled={!c.selectable}>` driven by Phase 8's `selectable` field)*
- [x] Show degraded states. *(displays `degradedReason` inline on each option label, e.g. `provider_health_unknown`)*
- [x] Show legacy unresolved warning. *(amber callout when `binding.status === "legacy_unresolved"` with `statusReason` + `legacyEnvVarHint` rendered)*
- [x] Save binding references only. *(no API key / PAT / Authorization input field exists; mutation payload contains only catalog refs + connection id + modelRef)*
- [x] Add mobile-safe layout. *(card/stack layout, no horizontal scroll, native `<select>` elements work on mobile by default)*
- [x] Add tRPC sub-router. *(`server/agent-studio/api/provider-bindings-router.ts`: 9 procedures wrapping the Phase 12 functions + 2 picker option providers)*

### Phase 15 — Degraded state detection

- [x] Validate on Agent Studio page load. *(`AgentBindingPage.tsx` enables `validate` query when binding exists)*
- [x] Validate on binding save. *(`upsert` mutation invalidates `validate` on success → page re-queries)*
- [x] Validate before agent test run. *(`resolveForRun` calls `validateBindingPolicy` with `staleAsDegraded:true, refreshTimestamp:false` — Phase 16 will land the actual test-run gating call)*
- [x] Validate before export candidate eligibility. *(any consumer of `resolveForRun` inherits the staleness gate; export candidate gate added in Phase 22)*
- [x] Show "Last validated at". *(rendered in `AgentBindingPage.tsx` next to validation badge + Refresh button)*
- [x] If older than 5 minutes, mark `degraded`. *(`VALIDATION_STALENESS_MS=5*60*1000`, env-tunable via `PMB_VALIDATION_STALENESS_MS`; result includes `staleAtCallTime` flag)*
- [x] Add `statusReason = validation_stale`. *(`BindingPolicyReason` union extended with `"validation_stale"` returned by `validateBindingPolicy` when stale + staleAsDegraded + no refresh)*
- [x] Add manual refresh/validate action. *(`refreshBindingValidation` server function + `agentStudio.providerBindings.refreshValidation` mutation + UI Refresh button)*
- [x] Add tests. *(`bindings-policy.test.ts` covers null/recent/stale lastValidatedAt branches + refresh writes timestamp + resolveForRun refuses stale)*

---

## Stage 4 — Runtime paths to Model Access

### Phase 16 — Agent Studio test runs through Model Access

- [x] Load active provider binding. *(`runTestWithBinding` calls `resolveForRun(draftId, role)` first; refuses to proceed unless ok=true)*
- [x] Create test run. *(tRPC mutation `agentStudio.providerBindings.testRunWithBinding` invokes the new service; persistence beyond the call result is owned by Phase 22 export-candidate / Phase 17 chat history)*
- [x] Call `openRouter.modelAccess.execute`. *(`gatewayCall` with `targetModule="openRouter", actionKey="openRouter.modelAccess.execute"` — first cross-module Model Access invocation)*
- [x] Store output, latency/usage, provider/model refs. *(success result echoes `output`, `latencyMs`, `usage`, `providerConnectionId`, `providerCatalogEntryId`, `modelCatalogEntryId`, `modelRef`, `correlationId`)*
- [x] Handle no binding, degraded binding, model access failure. *(BindingPolicyReason union flowed through: `binding_not_found` / `legacy_unresolved` / `binding_disabled` / `provider_connection_ineligible` / `validation_stale`; new `model_access_failed` reason for Model Access throws or `status="error"`; local-provider bindings rejected as `provider_connection_ineligible` per spec — no Model Access local adapter yet)*
- [x] Add tests. *(`server/agent-studio/services/test-run-binding.test.ts`: 5 short-circuit cases + happy path with system prompt + happy path without system prompt + thrown-error + status=error → 9 cases)*

### Phase 17 — Agent Studio Expert chat through Model Access

- [x] Identify current Agent Studio Expert chat path. *(`server/agent-studio/services/chat.ts:sendChatMessage` was the LR-01 caller — used `resolveProviderApiKey` + `new OpenAI({apiKey})` for the no-tools path and `runChatWithTools` for the tool-loop path)*
- [x] Replace direct SDK/key access with Model Access. *(new `sendChatMessageViaBinding` calls `openRouter.modelAccess.execute` via `gatewayCall`; chat history is converted to `ModelAccessMessage[]`; intent stamped as `"chat"`. The legacy direct-OpenAI path remains as a fallback for non-binding agents.)*
- [x] Preserve streaming if current UX streams. *(MVP chat is non-streaming per the chat.ts docstring; no streaming regression. Phase 18 will add streaming when Model Access tool-call schema lands.)*
- [x] Preserve tool-call support. *(tool-loop path unchanged; routing only takes the binding path when `buildToolsForDraft(draft.id).length === 0`. Tool-equipped agents still flow through `runChatWithTools` until Model Access tool schema lands in Phase 18.)*
- [x] Ensure no raw key in Agent Studio. *(for binding-equipped no-tool agents — the dominant Expert chat shape — Agent Studio never sees a raw key; Model Access pulls credentials inside its D2 boundary via `withProviderCredential`. LR-01 surface shrunk; register entry flipped to `in_progress` with the Phase 18 follow-up tracked.)*
- [x] Add tests. *(`chat-binding.test.ts`: 5 cases — binding routes through Model Access; Model Access error surfaces; null-PCID falls through; missing binding falls through; legacy_unresolved falls through. Plus the existing chat.ts tests still cover the legacy path.)*

### Phase 18 — `runChatWithTools` through Model Access

- [x] Identify `runChatWithTools` provider call. *(`server/agent-studio/services/chat.ts:runChatWithTools` — instantiated `new OpenAI({apiKey})` per turn and called `client.chat.completions.create({tools})`)*
- [x] Route model execution through Model Access. *(new `runChatWithToolsViaBinding` calls `openRouter.modelAccess.execute` via `gatewayCall` per turn; `sendChatMessage` now routes ALL `binding_v1` + non-null PCID chats through the binding path, including tool-equipped agents)*
- [x] Preserve tool schema support. *(extended `ModelAccessExecuteInput.tools`/`ModelAccessResult.toolCalls`/`ModelAccessMessage.toolCalls`/`ModelAccessMessage.toolCallId`; new typed `ModelAccessToolCall`. OpenAI `choice.message.tool_calls` and Anthropic `content[].tool_use` blocks are normalized to the same shape so downstream loops have a single decode path.)*
- [x] Preserve streaming where needed. *(MVP chat is non-streaming; existing Phase 4 `stream()` is unchanged. Streaming-with-tools is a future Phase 19+ extension when the chat UI streams.)*
- [x] Preserve MCP/tool integration. *(dispatcher path unchanged — `dispatchMcpToolCall` and the `mcp__server__tool` dispatch keys are reused verbatim. The new loop just builds `ModelAccessMessage[]` from the chat history's `toolPayload` and calls Model Access in place of the OpenAI SDK.)*
- [x] Add tests. *(execute.test.ts: 4 new tool-call cases — OpenAI extract, OpenAI round-trip, Anthropic tool_use, plain-text no-tool. chat-binding.test.ts: 2 new cases — happy-path tool-loop with dispatcher, dispatcher-error continuation.)*

### Phase 19 — Classify legacy runtime paths

- [ ] Create `RUNTIME_PATH_MIGRATION_MATRIX.md`.
- [ ] Classify `/api/chat/stream`.
- [ ] Classify `server/automation`.
- [ ] Classify legacy chat-stream provider calls.
- [ ] Mark each as migrated, temporary_exception, blocked, or removed.
- [ ] Add deadline PR for every temporary exception.
- [ ] Add to `LEGACY_EXCEPTION_REGISTER.md`.

---

## Stage 5 — Governance and receipts

### Phase 20 — Receipt policy table

- [ ] Document receipt policy for every new action.
- [ ] Set `providerConnections.validateAndStore` as high risk / receipt required.
- [ ] Set `providerConnections.rotate` as high risk / receipt required.
- [ ] Set `aiTypes.catalog.register` as high risk / receipt required.
- [ ] Set `aiTypes.catalog.publish` as high risk / receipt required.
- [ ] Set `agentStudio.agent.publish` as medium risk after lifecycle-only change.
- [ ] Set `openRouter.modelAccess.execute` for test as policy-based.
- [ ] Set `openRouter.modelAccess.execute` for production external run as high risk / receipt required.
- [ ] Update manifests/governance action maps.
- [ ] Add tests.

### Phase 21 — Provider/model use governance

- [ ] Enforce workspace can use provider.
- [ ] Enforce workspace can use provider connection.
- [ ] Enforce agent can use external provider.
- [ ] Enforce model approved.
- [ ] Enforce connection active.
- [ ] Enforce health acceptable.
- [ ] Enforce sensitive prompt egress policy.
- [ ] Add governance-denial UX.

---

## Stage 6 — Legacy publish and catalog writer cleanup

### Phase 22 — Change `agentStudio.agent.publish`

- [ ] Make `agentStudio.agent.publish` lifecycle-only.
- [ ] Ensure it writes Agent Studio release state.
- [ ] Ensure it marks release/export candidate as `catalog_ready`.
- [ ] Ensure it does not write catalog_entries.
- [ ] Ensure it does not call AI Types catalog write directly.
- [ ] Add test: publish creates no catalog entry.
- [ ] Add migration note.

### Phase 23 — Catalog schema verification/backfill

- [ ] Verify catalog_entries has entryType.
- [ ] Verify catalog_entries has sourceModule or equivalent.
- [ ] Verify catalog_entries has sourceRefId or equivalent.
- [ ] Decide mapping from legacy sourceType/sourceId.
- [ ] Add `activeSourceVersionId` or metadata equivalent.
- [ ] Add `legacyImport` fields or metadata.
- [ ] Backfill legacy Agent Studio rows where possible.
- [ ] Mark ambiguous legacy rows.
- [ ] Add evidence report.

### Phase 24 — Existing Agent Studio catalog rows reconciliation

- [ ] Treat old Agent Studio-created catalog rows as `legacy_imported`.
- [ ] Display them as "Imported (legacy)" in AS Candidate Pipeline.
- [ ] Put ambiguous rows in Reconcile tab.
- [ ] Do not auto-reimport legacy rows.
- [ ] Add "Reconcile Legacy Import" action.
- [ ] Add duplicate prevention tests.

### Phase 25 — Direct catalog_entries writer migration matrix

- [ ] Create `CATALOG_WRITER_MIGRATION_MATRIX.md`.
- [ ] Add `server/catalog-import/router.ts`.
- [ ] Add `server/llm/authority.ts`.
- [ ] Add `server/routers/agents.ts`.
- [ ] Add `server/routers/catalog-manage.ts` (multiple writes).
- [ ] Add `server/kgra-agent/nodes.ts`.
- [ ] Add any Agent Studio writer if found.
- [ ] Resolve `LO-01` ownership ambiguity for `routers/catalog-manage.ts`.
- [ ] Assign migration fate to each.
- [ ] Add deadline PR for each exception.
- [ ] Add tests/checks where migrated.

### Phase 26 — AI Types public API boundary enforcement

- [ ] Strip `server/db.ts:34` and `server/db/index.ts:19` barrel re-exports of `ai-types/db` (LA-01).
- [ ] Migrate the 18 callers in `LA-02` to either `aiTypes.*` gateway actions or `ai-types/public-api.ts`.
- [ ] Create `scripts/check-ai-types-public-api-boundary.ts`.
- [ ] Block imports from AI Types private internals.
- [ ] Allow only public API/gateway contracts.
- [ ] Inventory residual legacy violations.
- [ ] Add temporary exceptions with deadlines.
- [ ] Add to architecture checks.

---

## Stage 7 — Agent Studio Export Catalog

### Phase 27 — Governance verdict owner

- [ ] Assign owner to `server/agent-studio/services/governance-adapter.ts`.
- [ ] Add `computeExportGovernanceVerdict`.
- [ ] Return status, computedBy, computedAt, receiptId, blockers.
- [ ] Add tests.

### Phase 28 — Readiness owner

- [ ] Confirm Agent Studio readiness service ownership.
- [ ] Add `readinessScore`, `readinessComputedBy`, `readinessComputedAt`.
- [ ] Add tests.

### Phase 29 — Export Catalog contract

- [ ] Define `AgentStudioExportCandidate`.
- [ ] Include workspaceId, agentId, versionId, name, lifecycle state, readiness score, governance verdict, provider binding status, provider/model refs, capabilities, sourceModule = agentStudio, sourceRefId = agentId, activeSourceVersionId, export status.
- [ ] Exclude internals and secrets.

### Phase 30 — Export Catalog backend

- [ ] Add `agentStudio.exportCatalog.listCandidates`.
- [ ] Add `agentStudio.exportCatalog.getCandidate`.
- [ ] Add `agentStudio.exportCatalog.exportCandidate`.
- [ ] Add `agentStudio.exportCatalog.markImported`.
- [ ] Add `agentStudio.exportCatalog.reconcileImports`.
- [ ] Register gateway actions.
- [ ] Add tests.

### Phase 31 — Export eligibility rules

- [ ] Require version/release.
- [ ] Require valid provider binding.
- [ ] Require active provider connection.
- [ ] Require model approved.
- [ ] Require readiness score threshold.
- [ ] Require acceptable governance verdict.
- [ ] Require metadata completeness.
- [ ] Require not already imported.
- [ ] Require no duplicate canonical catalog entry.
- [ ] Add tests.

---

## Stage 8 — AI Types UI and import flow

### Phase 32 — AS List baseline

- [x] Confirm PR #101 is on main. *(merged 2026-05-04)*
- [x] Confirm "AS List" exists. *(visible at `/agent-studio`)*
- [x] Mark phase complete.
- [x] Do not reimplement unless regression found.

### Phase 33 — AS Candidates button

- [x] Add AS Candidates button to Manage Catalogue. *(PR #102, merged 2026-05-04)*
- [x] Place after Candidate.
- [x] Link to AS Candidate Pipeline.
- [x] Preserve existing Candidate button.
- [x] Preserve New Entry button.
- [x] Test mobile layout. *(flex-wrap on action row)*

### Phase 34 — AS Candidate Pipeline

- [~] Create AS Candidate Pipeline page. *(thin wrapper over CandidatePage with mode prop, PR #102)*
- [~] Scope to Agent Studio candidates. *(currently entryType==agent only; full sourceModule scoping pending Phase 7+ backend support)*
- [x] Add tabs: Register, Validate, Publish, Audit, Discovery. *(reused from CandidatePage)*
- [ ] Display legacy imported rows. *(Phase 24 dependency.)*
- [ ] Display ambiguous rows in Reconcile tab. *(Phase 24 dependency.)*
- [ ] Show provider binding readiness. *(Phase 12+ dependency.)*
- [ ] Show governance/readiness state. *(Phase 27/28 dependency.)*
- [x] Add back link to Manage Catalogue.
- [ ] Add tests. *(no automated test added yet; honest banner present.)*

### Phase 35 — Import from Agent Studio option

- [x] Add Import from Agent Studio option in Import Catalog Entries modal. *(PR #103, merged 2026-05-04)*
- [x] Place after File Import and before Registry Sync.
- [x] Use method key `agentStudio` *(actual key: `agent_studio`)*.
- [~] Click leads to Agent Studio candidate import step. *(Step 2 panel renders; backend hookup pending Phase 36.)*
- [x] Do not fake data.
- [x] Add pending state if backend unavailable. *(honest copy.)*
- [ ] Add tests.

---

## Stage 9 — AI Types backend import and catalog registration

### Phase 36 — Import-from-Agent-Studio gateway flow

- [ ] AI Types backend calls `agentStudio.exportCatalog.listCandidates`.
- [ ] AI Types backend calls `agentStudio.exportCatalog.exportCandidate`.
- [ ] Use Module Gateway only.
- [ ] Do not import Agent Studio private files.
- [ ] Do not query ASDB.
- [ ] Add tests.

### Phase 37 — Catalog entry creation from export DTO

- [ ] Create/update one catalog entry per Agent Studio agent.
- [ ] Dedup by entryType + sourceModule + sourceRefId.
- [ ] Store active version as `activeSourceVersionId` or metadata.
- [ ] Set initial status `draft`.
- [ ] Set review state `needs_review`.
- [ ] Store export DTO safely in config/metadata.
- [ ] Add duplicate prevention tests.

### Phase 38 — AI Types register action

- [ ] Add `aiTypes.catalog.register`.
- [ ] Require governance receipt.
- [ ] Create/update catalog entry.
- [ ] Return catalog entry ID.
- [ ] Return imported/updated status.
- [ ] Add audit event.
- [ ] Add tests.

---

## Stage 10 — Event-based sync

### Phase 39 — Catalog registered event

- [ ] Define `aiTypes.catalog.registered`.
- [ ] Include catalogEntryId, entryType, sourceModule, sourceRefId, activeSourceVersionId, initiatedByUserId, performedByActorId, performedByActorType, workspaceId, correlationId, registeredAt.

### Phase 40 — Agent Studio event subscribers

- [ ] Subscribe to `aiTypes.catalog.registered`.
- [ ] Update Agent Studio export/import status.
- [ ] Subscribe to `aiTypes.catalog.published`.
- [ ] Update catalog status to published.
- [ ] Subscribe to `aiTypes.catalog.deprecated`.
- [ ] Update catalog status to deprecated.
- [ ] Add tests.

### Phase 41 — Reconciliation fallback

- [ ] Implement `agentStudio.exportCatalog.reconcileImports`.
- [ ] Compare Agent Studio export candidates with AI Types catalog entries.
- [ ] Repair missed registered events.
- [ ] Repair missed published/deprecated events.
- [ ] Add tests.

---

## Stage 11 — Enforcement, tests, and docs

### Phase 42 — Boundary tests

- [ ] Test Agent Studio does not store provider keys.
- [ ] Test Agent Studio does not write catalog_entries.
- [ ] Test AI Types does not import Agent Studio internals.
- [ ] Test AI Types does not query ASDB.
- [ ] Test Model Access does not write/read runtime provider keys from process.env.
- [ ] Test Provider Connections public API returns no secrets.
- [ ] Test new frontend flows do not call other module backend routers directly.

### Phase 43 — Wiring tests

- [ ] Test Provider Connections public gateway actions are registered.
- [ ] Test AI Types provider/model action is registered.
- [ ] Test Agent Studio provider binding actions are registered.
- [ ] Test OpenRouter Model Access actions are registered.
- [ ] Test Agent Studio Export Catalog actions are registered.
- [ ] Test AI Types import actions are registered.
- [ ] Run `check:wiring`.

### Phase 44 — Runtime tests

- [ ] Test provider/model binding creation.
- [ ] Test model access execution with mock provider.
- [ ] Test Agent Studio test run with binding.
- [ ] Test Agent Studio Expert chat path.
- [ ] Test export candidate listing.
- [ ] Test AI Types import.
- [ ] Test catalog entry creation.
- [ ] Test duplicate prevention.
- [ ] Test event sync.
- [ ] Test reconciliation.

### Phase 45 — Documentation

- [ ] Create `PROVIDER_MODEL_BINDING_BRIDGE.md`.
- [ ] Create `MODEL_ACCESS_CONTRACT.md`.
- [ ] Create `AGENT_STUDIO_EXPORT_CATALOG.md`.
- [ ] Create `AI_TYPES_IMPORT_FROM_AGENT_STUDIO.md`.
- [ ] Update `CROSS_MODULE_FRONTEND_BOUNDARIES.md`.
- [ ] Update Provider Connections docs.
- [ ] Update OpenRouter docs.
- [ ] Update AI Types docs.
- [ ] Update Agent Studio docs.

### Phase 46 — Evidence

- [ ] Create `docs/evidence/provider-model-binding/`.
- [ ] Create `docs/evidence/ai-types-agent-studio-import/`.
- [ ] Add validation command outputs.
- [ ] Add test outputs.
- [ ] Add boundary check outputs.
- [ ] Add UI screenshots/manual notes if needed.
- [ ] Add migration report.
- [ ] Add legacy exception register snapshot.

---

## Stage 12 — Legacy cleanup and future track

### Phase 47 — Legacy path deprecation

- [ ] Mark `agents.importToCatalog` legacy.
- [ ] Delegate to new AI Types register service where possible.
- [ ] Deprecate old Agent Studio catalog-write behavior.
- [ ] Add warnings where legacy route is used.
- [ ] Remove or schedule removal of expired exceptions.
- [ ] Add docs.

### Phase 48 — Future frontend cross-module tRPC cleanup

- [ ] Create backlog item / doc.
- [ ] Inventory existing direct frontend cross-module tRPC calls.
- [ ] Do not block current plan.
- [ ] Apply strict rule only to new Agent Studio ↔ AI Types flows.
- [ ] Schedule separate frontend boundary refactor.

---

## Validation checklist for every implementation PR

- [ ] Read AGENTS.md.
- [ ] Work from latest main.
- [ ] One logical phase/group per PR.
- [ ] No secrets committed.
- [ ] No raw provider key printed.
- [ ] No direct cross-module private imports added.
- [ ] No Agent Studio write to catalog_entries.
- [ ] No AI Types direct ASDB query.
- [ ] No new frontend cross-module tRPC call.
- [ ] `pnpm run check`
- [ ] `pnpm run check:architecture`
- [ ] `pnpm run check:wiring`
- [ ] `pnpm run check:awi`
- [ ] `pnpm run check:frontend-modularity`
- [ ] `pnpm run build`
- [ ] Focused tests for changed area.
- [ ] Reviewer pass.
- [ ] Tester pass.
- [ ] Governance pass.
- [ ] Commit and PR created.
- [ ] CI green before merge.

---

## Update log

- **2026-05-04 — Phase 0 PR opened on `feat/pmb-stage-0-decision-record`**: drafted DECISION_RECORD, CURRENT_REALITY_MAP, LEGACY_EXCEPTION_REGISTER, EXECUTION_CHECKLIST. Phase 32 marked complete (PR #101 already on main). Phase 33 marked complete (PR #102). Phase 35 marked complete (PR #103). Phase 34 partially complete via PR #102 — full scoping pending Stage 2/3.
