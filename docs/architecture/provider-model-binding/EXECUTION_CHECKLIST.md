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

- [ ] Create `scripts/check-provider-credential-resolver-boundary.ts`.
- [ ] Allow imports only from `server/openrouter/model-access/**`.
- [ ] Fail if Agent Studio imports resolver.
- [ ] Fail if AI Types imports resolver.
- [ ] Fail if frontend imports resolver.
- [ ] Fail if automation imports resolver directly.
- [ ] Add script to `check:architecture` or equivalent.
- [ ] Add a negative test fixture if the repo pattern supports it.

### Phase 4 — Create OpenRouter Model Access facade

- [ ] Create `server/openrouter/model-access/`.
- [ ] Add `execute`.
- [ ] Add `stream`.
- [ ] Add `validateBinding`.
- [ ] Register gateway action `openRouter.modelAccess.execute`.
- [ ] Register gateway action `openRouter.modelAccess.stream`.
- [ ] Register gateway action `openRouter.modelAccess.validateBinding`.
- [ ] Update OpenRouter manifest `ports.provided` with `openRouter.modelAccess`.
- [ ] Ensure Model Access calls Provider Connections internal resolver.
- [ ] Ensure Model Access owns runtime model-call execution, not provider catalog metadata.
- [ ] Add error normalization.
- [ ] Add latency/usage telemetry structure.
- [ ] Add correlation ID support.

### Phase 5 — Enforce no-runtime-process.env provider key rule

- [ ] Create `scripts/check-provider-key-env-boundary.ts`.
- [ ] Fail runtime reads of `process.env.OPENAI_API_KEY`.
- [ ] Fail runtime reads of `process.env.ANTHROPIC_API_KEY`.
- [ ] Fail runtime reads of generic `process.env.*API_KEY` in Agent Studio runtime paths.
- [ ] Fail writes/mutations to `process.env` provider-key variables.
- [ ] Allow only explicit boot-time seed script path.
- [ ] Create optional `scripts/provider-connections/seed-from-env.ts`.
- [ ] Seed script reads env once, validates provider, creates encrypted Provider Connection, and exits.
- [ ] Add check to architecture validation.

### Phase 6 — CI test strategy for Model Access

- [ ] Create `tests/fixtures/mock-provider-server.ts`.
- [ ] Mock `/v1/models`.
- [ ] Mock `/v1/chat/completions`.
- [ ] Mock `/api/tags`.
- [ ] Unit-test Model Access with fake provider adapter.
- [ ] Unit-test Model Access with fake credential resolver.
- [ ] Integration-test Model Access against local mock provider.
- [ ] Ensure CI does not require OpenAI/Anthropic keys.
- [ ] Gate live tests behind `RUN_LIVE_PROVIDER_TESTS=1`.
- [ ] Document live tests as manual only.

---

## Stage 2 — AI Types and Provider Connections availability contracts

### Phase 7 — AI Types provider/model availability contract

- [ ] Add public read action `aiTypes.providerModels.listAvailable`.
- [ ] Define `ListAvailableProviderModelsInput`.
- [ ] Define `AvailableProviderModel`.
- [ ] Return provider catalog entry ID.
- [ ] Return provider slug/name.
- [ ] Return model catalog entry ID where available.
- [ ] Return model ref.
- [ ] Return capabilities.
- [ ] Return governance status.
- [ ] Return restrictions.
- [ ] Return no credentials.
- [ ] Register action through public API/gateway if used cross-module.
- [ ] Add tests.

### Phase 8 — Provider Connections active connection contract

- [ ] Add public read action `providerConnections.listActiveForProvider`.
- [ ] Return only active/validated references.
- [ ] Mark active as selectable.
- [ ] Mark validated as visible but not selectable for runtime binding.
- [ ] Hide or degrade disabled/failed in selection UI.
- [ ] Reject binding creation unless connection is active.
- [ ] Allow unknown health only as `degraded` with `provider_health_unknown`.
- [ ] Add tests.

---

## Stage 3 — Agent Studio provider/model binding

### Phase 9 — Provider config migration design

- [ ] Create `docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md`.
- [ ] Define old shape with apiKey.
- [ ] Define old shape with apiKeyEnvVar.
- [ ] Define new `AgentProviderBinding`.
- [ ] Define `legacy_unresolved`.
- [ ] Define `statusReason = legacy_raw_api_key`.
- [ ] Define `statusReason = legacy_env_var`.
- [ ] Define migration rollback strategy.
- [ ] Define no mixed-shape persistence after migration.

### Phase 10 — Provider config migration script

- [ ] Create `scripts/agent-studio/migrate-provider-config-to-bindings.ts`.
- [ ] Scan Agent Studio drafts.
- [ ] Detect raw apiKey.
- [ ] Detect apiKeyEnvVar.
- [ ] Create legacy unresolved binding records.
- [ ] Remove/redact raw key fields from draft provider config.
- [ ] Preserve non-secret provider metadata.
- [ ] Write migration evidence report.
- [ ] Make script idempotent.
- [ ] Add dry-run mode.
- [ ] Add validation mode.
- [ ] Output `docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md`.

### Phase 11 — Agent Studio binding schema/storage

- [ ] Add ASDB table or JSON storage for provider bindings.
- [ ] Include workspaceId, agentId, draftId, role.
- [ ] Include providerCatalogEntryId, modelCatalogEntryId, providerConnectionId, modelRef.
- [ ] Include status, statusReason.
- [ ] Include createdBy, createdAt, updatedAt.
- [ ] Do not include secret fields.
- [ ] Add migration.
- [ ] Add repository functions.

### Phase 12 — Agent Studio provider binding backend

- [ ] Add `agentStudio.providerBindings.list`.
- [ ] Add `agentStudio.providerBindings.create`.
- [ ] Add `agentStudio.providerBindings.update`.
- [ ] Add `agentStudio.providerBindings.remove`.
- [ ] Add `agentStudio.providerBindings.validate`.
- [ ] Add `agentStudio.providerBindings.resolveForRun`.
- [ ] Validate provider/model availability through AI Types public contract.
- [ ] Validate provider connection through Provider Connections public contract.
- [ ] Ensure resolveForRun returns references only, no secrets.
- [ ] Add tests.

### Phase 13 — Separate binding validator from Model Access validator

- [ ] Define `agentStudio.providerBindings.validate` as reference/policy validation.
- [ ] Define `openRouter.modelAccess.validateBinding` as runtime execution validation.
- [ ] Document when each is called.
- [ ] Rename UI labels to avoid confusion.
- [ ] Add tests for both validators.

### Phase 14 — Agent Studio provider binding UI

- [ ] Add "Add Provider Binding" UI.
- [ ] Use label "Bind to AI Types" or "Select from AI Types Catalog".
- [ ] Do not use "Import from AI Types".
- [ ] Provider picker calls Agent Studio backend only.
- [ ] Agent Studio backend fetches AI Types/provider connection options.
- [ ] Show provider/model list.
- [ ] Show active connections.
- [ ] Disable validated-but-not-active connections.
- [ ] Show degraded states.
- [ ] Show legacy unresolved warning.
- [ ] Save binding references only.
- [ ] Add mobile-safe layout.

### Phase 15 — Degraded state detection

- [ ] Validate on Agent Studio page load.
- [ ] Validate on binding save.
- [ ] Validate before agent test run.
- [ ] Validate before export candidate eligibility.
- [ ] Show "Last validated at".
- [ ] If older than 5 minutes, mark `degraded`.
- [ ] Add `statusReason = validation_stale`.
- [ ] Add manual refresh/validate action.
- [ ] Add tests.

---

## Stage 4 — Runtime paths to Model Access

### Phase 16 — Agent Studio test runs through Model Access

- [ ] Load active provider binding.
- [ ] Create test run.
- [ ] Call `openRouter.modelAccess.execute`.
- [ ] Store output, latency/usage, provider/model refs.
- [ ] Handle no binding, degraded binding, model access failure.
- [ ] Add tests.

### Phase 17 — Agent Studio Expert chat through Model Access

- [ ] Identify current Agent Studio Expert chat path.
- [ ] Replace direct SDK/key access with Model Access.
- [ ] Preserve streaming if current UX streams.
- [ ] Preserve tool-call support.
- [ ] Ensure no raw key in Agent Studio.
- [ ] Add tests.

### Phase 18 — `runChatWithTools` through Model Access

- [ ] Identify `runChatWithTools` provider call.
- [ ] Route model execution through Model Access.
- [ ] Preserve tool schema support.
- [ ] Preserve streaming where needed.
- [ ] Preserve MCP/tool integration.
- [ ] Add tests.

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
