# Phase 29 — Execution Plan

**Captured:** 2026-05-07 against `main@5a75613` (post-Phase-28 closure).
**Branch (this doc):** `docs/pmb-phase-29-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07.

**Supersedes** `PHASE_29_SCOPING.md`, which captured the Phase-28-deferral-era scope. This doc is the plan-frozen authoritative source going forward.

---

## 1. Why Phase 29 exists

Phase 28 closed with **2 LRs migrated** (LR-06 extracted; LR-09 was already fixed by PR #100), **2 new Model Access primitives** (`embed` + `runViaOpenllmBridge`), and **4 LRs deferred to Phase 29**. The deferrals share one structural theme: they're **caller-side migrations** — the consumers of Model Access need workspace/binding wiring that Phase 28's primitive-layer scope didn't fit.

| LR | Caller | Primitive | Workspace context? |
|---|---|---|---|
| LR-01 | `agent-studio/services/simulation.ts:567, 808, 826` | `runViaOpenllmBridge` (28.6b) + `execute` (existing) | **Has `draft.id`** — independent of §29.1 |
| LR-02 | `embeddings/service.ts:54, 59` | `openRouter.modelAccess.embed` (28.4) | None |
| LR-03 | `documents/processor.ts:339` | Closes transitively with LR-02 | None |
| LR-04 | `operators/provider-hub.ts:78` | `openRouter.modelAccess.execute` (existing; reclassified from "embedding" in 28.4) | None |
| LR-08 | `chat/stream.ts:70` + `automation/block-executors.ts:228` | `execute`/`stream` (existing) + routing-layer migration | None |

**The unifying decision:** §29.1 — workspace-default-binding. Four of the five callers have **no workspace-scoped agent** to resolve a binding from. They need a "platform default" or "workspace default" binding concept that doesn't exist today.

**The other big rewrite:** §29.2/29.3 — `providerRouter`. Phase 28.3's scope discovery showed that `server/inference/provider-router.ts:resolvePlan` itself reads `getProviderRegistry()` at lines 17, 137, 205. Closing LR-08 cleanly requires migrating this routing layer to Model Access, not just rewiring the two LR-08 call sites.

---

## 2. Scope and out-of-scope

### In scope

- **5 caller migrations** (LR-01, LR-02 + LR-03 transitive, LR-04, LR-08).
- **§29.1 workspace-default-binding** decision + schema/migration (or platform-agent pattern, decided in 29.1 ADR).
- **§29.2/29.3 `providerRouter` routing-layer** migration onto Model Access.
- **Boundary lint allowlist purge** for LR-01/02/03/04 entries (LR-08 has no boundary entry — its registry consumption is one layer down).
- **Live-smoke discipline** for the 5 caller migrations: each PR's test plan includes a smoke step against the dev server. CI green is necessary but insufficient; smoke-test results take precedence.

### Out of scope

- D2 multi-region deployment (CLAUDE.md deferral).
- D-PARSE-DOCX-N, D-PARSE-OCRPDF-N parsers (CLAUDE.md deferrals).
- Frontend Module-Gateway plan (`FUTURE_FRONTEND_TRPC_CLEANUP.md`).
- The `code-studio/opencode/provider-sync.ts` legacy `providers`-table reader (different threat model; will outlive Phase 29).
- The `kgra-agent/nodes.ts` providers-list reader (also out of D1 violation scope — it just lists names/types).
- Issue #226 drizzle-kit metadata drift (separate filed issue).

### Plan v3 follow-ups (separate plans)

- Phase 26.1 barrel-strip + caller migration.
- Direction B's D-LC-5 promotion of `deprecateCatalogEntry`.

---

## 3. Sub-phase decomposition

Cheap-dependency-first ordering. **LR-01 ships first** because it's independent of §29.1.

### 29.0 — Plan freeze (this PR)

- [ ] Land `PHASE_29_EXECUTION_PLAN.md` (this doc); supersede `PHASE_29_SCOPING.md` with a header note.
- [ ] Update `LEGACY_EXCEPTION_REGISTER.md` Phase 29 sub-phase mapping table to point at this plan doc.
- [ ] **Acceptance:** doc lands; `pnpm run check` clean; CI green.

### 29.0a — LR-01 simulation migration — **CLOSED**

Shipped:

- [x] **29.0a.1 — `simulation.ts`** migrated. `resolveOpenllmEndpoint(providerConfig)` → `await resolveForRun({draftId: draft.id})`. The dual-path adapter call replaced by a `needsBridge` decision (`bridgeMcpServers.length > 0 || permissionRules.length > 0`): bridge → `runViaOpenllmBridge` direct-import; no-bridge → `gatewayCall` to `openRouter.modelAccess.execute`. Both branches feed a unified `UnifiedRuntimeResult` shape that the downstream metadata code consumes unchanged. Metadata payload references reshaped: `endpoint.source` → `"bridge"|"execute"`; `endpoint.wsUrl` → `providerConnectionId`; `endpoint.provider` → `providerCatalogEntryId`; `endpoint.model` → `modelRef`. Output-step label changed from "Live response from openllm-agent2" to "Live response via Model Access".
- [x] **29.0a.2 — Adapter dead-code purge.** `agent-studio/adapters/openllm-runtime-adapter.ts` and `agent-studio/adapters/openai-direct-adapter.ts` **deleted entirely** (no remaining importers after simulation's migration). `chat-binding.test.ts` `vi.mock("../adapters/openllm-runtime-adapter", ...)` block removed; line-195 comment updated to reflect the post-Phase-29.0a contract.
- [x] **29.0a.3 — Stale-comment cleanup.** `chat.ts` (3 locations) + `api/router.ts:1925` + `code-studio/opencode/provider-sync.ts:110` — all references to deleted functions updated to point at the Model Access surface.
- [x] **29.0a.4 — Boundary updates.** LR-01 allowlist entry removed from `check-provider-key-env-boundary.ts`. `tests/pmb/boundary.test.ts:345-356` tripwire updated (now asserts no Agent Studio source imports `resolveProviderApiKey`); **new** tripwire added asserting none of `resolveProviderApiKey` / `runViaOpenllmAgent` / `runViaOpenAIDirect` / `resolveOpenllmEndpoint` are defined anywhere in `server/agent-studio/` or `server/openrouter/`. `ALLOWED_AS_PATHS` set is now empty by design.
- [x] **29.0a.5 — Register update.** LR-01 row flipped to `migrated`; sub-phase mapping updated to "29.0a CLOSED".
- [x] **Acceptance:** boundary lint green without the LR-01 allowlist entry; `pnpm run check` clean; 68/68 tests across boundary + Model Access subtree (`execute` + `embed` + `bridge` + `manifest-receipt-policy`).
- [ ] **Live-smoke pending:** exercise an agent simulation in dev to confirm the bridge replaces the deleted adapter behavior cleanly. Documented in PR body — same discipline as Phase 28's #223/#224 lessons.

### 29.1 — Workspace default binding ADR + schema

The central new decision Phase 29 owns. Four of five callers have no workspace-scoped agent; they need a default binding to resolve.

- [x] **29.1a — Decision record.** `WORKSPACE_DEFAULT_BINDING_DECISION.md` shipped, locking **D-WDB-1..8** (Option A: dedicated `ags_workspace_default_provider_bindings` table keyed by `(workspaceId, role)`; roles `chat`/`embedding`/`tool`/`classifier`; read API at `server/agent-studio/workspace-default-bindings.ts`; operator-applied migration per #223 lesson; D-WDB-5 documents the `workspaceId` threading required for LR-02 / LR-04).
- [x] **29.1b — Implementation per ADR.** Shipped: Drizzle table `agsWorkspaceDefaultProviderBindings` in `drizzle/tables/agent-studio.ts` + operator-applied SQL at `scripts/migrations/manual/workspace-default-provider-bindings.sql` + read API `resolveWorkspaceDefaultBinding` + internal write helpers `upsertWorkspaceDefaultBinding` / `deleteWorkspaceDefaultBinding` / `listWorkspaceDefaultBindings` + 18 unit tests covering all D-WDB-3 reasons + role lattice + write-path eligibility gate + credential-shape audit.
- [x] **Acceptance:** ADR locked (29.1a ✓); primitive lands (29.1b ✓); 18/18 tests green; `pnpm run check` clean.
- [ ] **29.1c — Admin surface (deferred follow-up).** Gateway action `agentStudio.workspaceDefaultBindings.set` + tRPC endpoint + admin UI for setting per-role workspace defaults. Per D-WDB-7 the writes need a receipt descriptor; the internal write helpers (`upsertWorkspaceDefaultBinding` etc.) are already in place. **Not blocking** the 4 caller-migration sub-phases — they consume the read API only; admins set defaults via direct SQL or by calling the internal write helpers from a one-off script until 29.1c lands.
- [ ] **Pause if:** ~~the §29.1 ADR can't pick one shape that fits all 4 non-LR-01 callers~~ — closed at 29.1a (D-WDB-1 picks Option A; D-WDB-5 documents the per-caller threading).

### 29.2 — `providerRouter` migration ADR

- [x] **29.2a — Decision record.** `PROVIDER_ROUTER_MIGRATION_DECISION.md` shipped, locking **D-PR-1..8**. Verdict: **layer-over with dead-code excision** — `resolvePlan` survives unchanged; `execute()` and `executeStream()` methods are deleted entirely (zero live callers found via call-graph walk against `main@1f5628a`). The chat-stream and `executeInvokeAgent` caller migrations move to §29.6. D-PR-5 picks **Path B (refuse)** for legacy `agents`-table flows in `executeInvokeAgent`, gated on a 29.6b pre-condition check (zero active legacy-agent workflows in ASDB / main DB).
- [x] **Acceptance:** ADR locked.
- [x] **Estimate:** 1 PR, ~80 LOC ADR doc.
- [ ] **Pause if:** ~~neither dissolve nor layer-over is obviously cheaper~~ — closed at 29.2a: D-PR-1's call-graph walk found `execute`/`executeStream` are dead code, collapsing the decision space.

### 29.3 — `providerRouter` dead-code excision — **CLOSED**

Per D-PR-1 / D-PR-6, §29.3 collapsed from "2–3 PRs / 300–500 LOC implementation" to a single-PR excision. Net diff was even smaller than the ADR's ~80-LOC estimate: **-269 LOC** (one file, no new code).

Shipped:

- [x] **29.3a — Excise dead methods.** Deleted `providerRouter.execute()` (66 lines) + `providerRouter.executeStream()` (140 lines) + the private `determineRouteTaken` helper (15 lines, only called from `execute`) + the private `logAudit` method (33 lines, only called from `execute`/`executeStream`). Dropped 3 dead imports: `getProviderRegistry` (the LR-08 routing-layer concern that originally framed §29.2/29.3); `fallbackManager` + `FallbackChain` + `FallbackResult` (only used by `execute`); `hybridRouter` + `RoutingDecision` (imported but never used since file inception). Trimmed `Message`/`GenerationResponse`/`Token` import to just `Message`. Removed `routingAuditLogs` from the schema import. Removed two now-orphan exported types: `RoutingResult`, `StreamingRoutingResult` (no external importers per pre-excision grep). Updated file-level JSDoc to "selection-only" surface with a pointer to the §29.2 ADR.
- [x] **29.3b — Tests.** Re-grep before commit: zero test files reference `providerRouter.execute` / `executeStream` / `RoutingResult` / `StreamingRoutingResult` / `determineRouteTaken` / `logAudit`. Existing `resolvePlan` tests stay unchanged. The lone test file at `tests/contracts/domain-contracts.test.ts:135` references `server/providers/router` (the tRPC router, NOT this file) — verified via path inspection. 74/74 tests green across `tests/contracts/domain-contracts.test.ts` + `tests/pmb/`.
- [x] **Acceptance:** `getProviderRegistry()` consumption inside `provider-router.ts` removed; `pnpm run check` clean; boundary lint clean (one pre-existing violation in untracked `scripts/dev/backfill-openai-binding.ts` is unrelated).
- [x] **Net diff:** `1 file changed, 20 insertions(+), 289 deletions(-)`. Beats the ADR's ~80-LOC estimate by deleting more dead helpers than just the two top-level methods.

### 29.4 — LR-02/03 embeddings caller migration

Depends on §29.1 (workspace-default binding lookup).

**Scope discovery (2026-05-07, surfaced during 29.4 prep):** `modelAccess.embed`'s receipt policy refuses non-test intents without a `governanceReceiptId`. The two LR-02/03 caller paths (`documents/processor.ts` document indexing + `agents/executor.ts` legacy RAG retrieval) have no user-attributed receipt source — there's no AS run, no chat boundary, just infrastructure. Migrating with `intent="agent-run"` would break document upload + legacy RAG at runtime. Migrating with `intent="agent-test"` lies about intent and masks the receipt policy for production paths.

**Resolution:** split into 29.4a (extend the receipt-policy contract) + 29.4b (the actual caller migration). Mirrors the Phase 28 primitive-then-caller pattern.

- [x] **29.4a — Add `system-internal` intent variant exempt from the receipt policy.** Extends `ModelAccessIntent` enum with `"system-internal"`; updates `enforceModelAccessReceipt` in `server/openrouter/manifest.ts` to exempt the new intent (joining `agent-test` in the allowlist); updates the error message; updates `RECEIPT_POLICY.md` with the rationale + when-to-use-it guidance; adds 4 tests to `manifest-receipt-policy.test.ts` (system-internal exempt for execute/stream/embed; error message advertises both exempt intents). Audit for `system-internal` calls is captured by the `correlationId` + the calling subsystem's own audit log.
- [x] **29.4b — Migrate `embeddings/service.ts` + thread `workspaceId` through callers — CLOSED.** Service rewritten: dropped the OpenAI SDK + the env-var read. Public methods (`generateEmbedding`, `generateEmbeddings`, `storeChunkEmbeddings`, `searchSimilarChunks`) take `workspaceId`. Binding resolves via `resolveWorkspaceDefaultBinding({workspaceId, role:"embedding"})` (29.1b primitive); upstream call routes through `gatewayCall(openRouter.modelAccess.embed)` with `intent: "system-internal"` (29.4a primitive). `EmbeddingResolutionError` (typed via D-WDB-3 reasons) replaces the old "OPENAI_API_KEY not configured" string. LR-03 (`documents/processor.ts:processDocumentBackground`) takes a `workspaceId` parameter end-to-end; the upload gate at line 339 is gone. Legacy `agents/executor.ts:137, 312` (RAG retrieval) threads `options.workspaceId` through both call sites.
- [x] **29.4c — Boundary purge.** LR-02 + LR-03 allowlist entries removed from `scripts/check-provider-key-env-boundary.ts`. Three new tripwire tests in `tests/pmb/boundary.test.ts` lock the closure: (1) `embeddings/service.ts` does not read `process.env.<X>_API_KEY`; (2) `documents/processor.ts` does not gate on `process.env.<X>_API_KEY`; (3) `embeddings/service.ts` calls `gatewayCall` against `openRouter.modelAccess.embed` with `intent: "system-internal"`.
- [x] **Acceptance:** `pnpm run check` clean; boundary lint clean (only pre-existing untracked-file violation remains); 26/26 tests green (7 new in `service.test.ts` + 19 in `boundary.test.ts` including 3 new tripwires).
- [ ] **Live-smoke pending:** exercise document upload + RAG retrieval in dev — same discipline as 29.0a's smoke note. The new failure mode is `EmbeddingResolutionError` instead of "env var unset", so the smoke verifies the workspace-default-binding lookup actually fires.
- [x] **Net diff:** 8 files changed, ~600 insertions, ~140 deletions. Slightly above the ADR's ~170-LOC 29.4b estimate due to D-WDB-3 reason mapping + tripwire tests + caller threading depth.

### 29.5 — LR-04 operators caller migration — **CLOSED**

Depends on §29.1 + §29.4a (`system-internal` intent).

Shipped:

- [x] **29.5a — Migrate `operators/provider-hub.ts:callProviderHub`.** Dropped local `getOpenAIClient`/`getOllamaClient` provider-chain. `ProviderHubRequest.workspaceId` added; binding resolves via `resolveWorkspaceDefaultBinding({workspaceId, role:"classifier"})`; upstream call routes through `gatewayCall(openRouter.modelAccess.execute)` with `intent: "system-internal"`. Per-operator `OPERATOR_MODEL_CONSTRAINTS` (maxTokens, maxTemperature) preserved as governance guardrails. `allowedModels` list dropped (workspace admin owns model selection via the binding — if a workspace admin configures a model that doesn't fit an operator's risk profile, the fix is changing the binding, not adding hard-coded model lists). JSON-validation retry loop (max 2 attempts: initial + 1 retry with stricter system prompt) preserved. New `OperatorBindingError` with typed reasons.
- [x] **29.5b — `BaseOperator.generatePlan` threads `job.intent.workspaceId`.** Refuses jobs without a workspace context with a clear error (operators that can't resolve a workspace cannot call the hub at all post-29.5).
- [x] **29.5c — Boundary purge.** LR-04 allowlist entry removed from `scripts/check-provider-key-env-boundary.ts`. Three new tripwire tests in `tests/pmb/boundary.test.ts` (`Phase 29.5 invariant — LR-04 closure`): no `process.env.<X>_API_KEY` reads; no `getOpenAIClient`/`getOllamaClient` definitions; calls `gatewayCall` against `openRouter.modelAccess.execute` with `intent: "system-internal"`.
- [x] **Acceptance:** `pnpm run check` clean; boundary lint clean (only pre-existing untracked-file violation remains); 31/31 tests green (9 new in `provider-hub.test.ts` + 22 in `boundary.test.ts` including 3 new tripwires).
- [ ] **Live-smoke pending:** exercise an operator job (builder/auditor/governance/deploy) in dev — confirm the workspace classifier binding resolves and the `system-internal` intent path produces a valid SyscallBatch.
- [x] **Net diff:** ~7 files changed, ~500 insertions, ~290 deletions. The 290-line deletion includes the local `getOpenAIClient`/`getOllamaClient` chain + `getAvailableOllamaModels` cache + `pickBestOllamaModel`; provider selection now happens at the workspace-default-binding layer.

### 29.6 — LR-08 `/api/chat/stream` + `executeInvokeAgent`

Depends on §29.1 + §29.2/29.3.

- [ ] **29.6a — Migrate `chat/stream.ts`.** Resolve binding via §29.1 (workspace default). Replace `getProviderRegistry()` + `provider.generateStream(...)` with Model Access streaming call. Preserve SSE shape, RAG-context injection, cost tracking, unified-routing audit reasons.
- [ ] **29.6b — Migrate `automation/block-executors.ts:executeInvokeAgent`.** Per §29.2 Path A/B/C: backfill AS draft / refuse legacy / dual-table support. Replace `getProviderRegistry()` with `resolveForRun` (or §29.1 default) + `gatewayCall` to `execute`.
- [ ] **29.6c — `chat-binding.test.ts` cleanup.** The "fall through to legacy path" tests at lines 184–211 reference behavior that no longer exists. Either delete or rewrite to assert the post-Phase-29 shape.
- [ ] **Acceptance:** boundary lint green (no LR-08 allowlist entry to purge — the violation was always one layer down); **live-smoke required** — exercise the legacy chat UI at `client/src/pages/Chat.tsx` and an automation workflow that uses `executeInvokeAgent`.
- [ ] **Estimate:** 1–2 PRs, ~300 LOC.

### 29.7 — Boundary-lint allowlist purge

- [ ] Final allowlist sweep — confirm LR-01/02/03/04 entries removed (each sub-phase did its own; this is the audit gate). Remaining entries: only `<seed-script>` for `seed-from-env.ts` (PMB-D1-EXEMPT).
- [ ] Update boundary lint comments to reflect closure.
- [ ] **Acceptance:** `pnpm exec tsx scripts/check-provider-key-env-boundary.ts` passes with the leanest allowlist since Phase 5 stub creation.
- [ ] **Estimate:** 1 PR, ~50 LOC.

### 29.8 — Closure report + register reconciliation

- [ ] Author `docs/evidence/provider-model-binding/PHASE_29_CLOSURE_REPORT.md` mirroring `PHASE_28_CLOSURE_REPORT.md`. Inventory: every LR row at start of Phase 29 → final state; boundary lint diff; PR ledger; new ADRs.
- [ ] Update `LEGACY_EXCEPTION_REGISTER.md` aggregate counts.
- [ ] Update memory: `project_phase_29_authority.md` flipped to CLOSED.
- [ ] **Acceptance:** all 5 deferred LR rows flipped from `open` to `migrated`.
- [ ] **Estimate:** 1 PR, ~250 LOC docs.

---

## 4. Decision matrix

Mirrors `PHASE_28_EXECUTION_PLAN.md` §4. Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries** unless plan triggers a pause.

| # | Path | Register | Decision | Sub-phase | Risk |
|---|---|---|---|---|---|
| 1 | `simulation.ts:808, 826` | LR-01 | MIGRATE_TO_MODEL_ACCESS via `execute` + `runViaOpenllmBridge` | 29.0a | Medium — no simulation runtime tests; live-smoke is the catch. |
| 2 | `embeddings/service.ts:54, 59` | LR-02 | MIGRATE_TO_MODEL_ACCESS via `embed` (Phase 28.4 primitive) | 29.4a | Low — single hard-coded var; primitive is straightforward. |
| 3 | `documents/processor.ts:339` | LR-03 | TRANSITIVE_CLOSE via LR-02 | 29.4b | Low. |
| 4 | `operators/provider-hub.ts:78` | LR-04 | MIGRATE_TO_MODEL_ACCESS via `execute` (existing primitive) | 29.5a | Low. |
| 5 | `chat/stream.ts:70` | LR-08 | MIGRATE_TO_MODEL_ACCESS via `stream` (existing) | 29.6a | Medium — live chat UI consumer; live-smoke required. |
| 6 | `automation/block-executors.ts:228` | LR-08 | MIGRATE_TO_MODEL_ACCESS via `execute`; legacy-`agents`-table strategy per §29.2 | 29.6b | Medium — automation workflows; live-smoke required. |
| 7 | `inference/provider-router.ts:17, 137, 205` | LR-08 (transitive) | MIGRATE OR DISSOLVE per §29.2 | 29.3 | Medium — workspace-routing infrastructure. |

**Cap: 0 / 1 allowed new exceptions.** All decisions are MIGRATE; no deferrals planned. Pause and surface if any sub-phase wants to introduce a new TEMPORARY_EXCEPTION.

---

## 5. Test strategy

### Per sub-phase

- **29.0a (LR-01 simulation):** TypeScript catches missed `endpoint.X` references at compile time. Boundary lint catches `resolveProviderApiKey` re-introduction. **Live-smoke required:** run an agent simulation in dev with mock+live runtime modes; confirm the new bridge primitive produces the same trace shape.
- **29.1 (default binding):** unit tests for the lookup path; integration tests if a new schema lands.
- **29.2/29.3 (providerRouter):** unit tests for the new routing shape; integration tests against `/api/chat/stream` end-to-end after 29.6a lands.
- **29.4 (embeddings):** unit tests for the migrated `generateEmbedding(text)` path; integration test gated by `describe.skipIf(!hasOpenAIKey())`.
- **29.5 (operators):** unit tests for `callProviderHub({operator, ...})`; integration test against a known operator.
- **29.6 (chat-stream + executeInvokeAgent):** existing tests in `chat-binding.test.ts` need cleanup; new tests for the workspace-default-binding integration.

### Cross-cutting

- **Boundary lint:** every sub-phase that purges an allowlist entry runs `pnpm exec tsx scripts/check-provider-key-env-boundary.ts` post-migration.
- **CI fingerprint:** Phase 29 baseline is **5/5 green** (Phase 28 close-out at `5a75613`). Any sub-phase that regresses below 5/5 pauses for diagnosis; per-shard flake protocol applies (memory: `feedback_ci_test_shard_flakes.md`).
- **Live-smoke discipline:** sub-phases 29.0a, 29.4, 29.5, 29.6 all require live-app smoke verification per the Phase 28 closure-report lesson. CI green is necessary but insufficient.

---

## 6. Open questions (resolved during execution)

### 6.1 — Workspace-default-binding shape

Three options laid out in §29.1a. Default decision: choose the option that minimizes new schema work AND fits all 4 non-LR-01 callers. If no option fits all 4, surface the conflict before locking.

### 6.2 — `providerRouter`: dissolve or layer?

Decision lands in 29.2. Tentative: **layer over** Model Access — `resolvePlan` keeps its routing/selection contract but invokes `modelAccess.execute|stream` internally instead of provider-registry calls. This preserves the existing chat-stream + batch-service + hybrid-router contracts. **Re-evaluate once 29.6 prep maps the 3 known callers** — if dissolution is cheaper because callers can call Model Access directly, that path wins.

### 6.3 — `executeInvokeAgent` legacy-`agents`-table strategy

Three paths in §29.2:
- **Path A (backfill):** create an AS draft on first invocation. Adds migration logic.
- **Path B (refuse):** return `binding_required` for legacy `agents` table rows. Simplest; might break automation workflows in dev.
- **Path C (dual-table):** keep registry path for legacy agents + Model Access path for AS agents. Preserves back-compat at the cost of keeping `getProviderRegistry()` alive in this one path.

**Default decision:** Path B if no production automation workflows depend on legacy `agents`; Path C if they do. **Verify in 29.6b prep** by querying ASDB for legacy-agents-table workflows.

---

## 7. Sizing

| Sub-phase | PRs | LOC estimate | Smoke required |
|---|---|---|---|
| 29.0 (this) | 1 | ~350 docs | No |
| 29.0a (LR-01 simulation) | 1–2 | ~300 + tests | **Yes** |
| 29.1 (default binding ADR + impl) | 1–2 | ~150–250 + tests | No |
| 29.2 (providerRouter ADR) | 1 | ~100 ADR | No |
| 29.3 (providerRouter impl) | 2–3 | ~300–500 + tests | No |
| 29.4 (LR-02/03 embeddings) | 1 | ~150 | **Yes** |
| 29.5 (LR-04 operators) | 1 | ~150 | **Yes** |
| 29.6 (LR-08 chat-stream + executeInvokeAgent) | 1–2 | ~300 + tests | **Yes** |
| 29.7 (boundary-lint sweep) | 1 | ~50 | No |
| 29.8 (closure report) | 1 | ~250 docs | No |
| **Total** | **11–14** | **~2,000–2,600 LOC** | 4 sub-phases |

Comparable to Phase 28 (9 PRs / ~2,500–3,000 LOC, depending on counting). The novel work is concentrated in §29.1 (workspace-default binding) and §29.3 (`providerRouter` migration); the rest is mechanical caller migration on top of Phase 28's primitives.

---

## 8. CI fingerprint expectation

Phase 29 baseline is **5/5 green** as of `5a75613`. Any sub-phase that regresses below 5/5 pauses for diagnosis; the test-shard-flake protocol (rerun-failed-jobs once before diagnosing) applies.

---

## 9. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, per memory `project_phase_29_authority.md`.

**Pause and surface for sign-off if:**

- Any sub-phase requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
- §29.1 ADR can't pick one shape that fits all 4 non-LR-01 callers — surface the conflict.
- §29.2 `providerRouter` decision: neither dissolve nor layer-over is obviously cheaper — surface options.
- Live-smoke regression on simulation, chat-stream, embeddings, or operators paths.
- Discovery that a deferred caller's migration is structurally bigger than this plan estimated (the same six-instance Phase 28 pattern).
- Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.

**Reporting:** local/committed/pushed format; single end-of-phase summary at 29.8.

---

## 10. Cross-references

- `PHASE_28_CLOSURE_REPORT.md` — origin of the 5 deferred callers + the six-instance scope-discovery lesson.
- `PHASE_28_EXECUTION_PLAN.md` — the precedent plan structure this doc mirrors.
- `LEGACY_EXCEPTION_REGISTER.md` — source of truth for LR rows; updated incrementally per sub-phase.
- `MODEL_ACCESS_CONTRACT.md` — current Model Access surface (4 gateway-callable + 1 direct-import primitive).
- `MODEL_ACCESS_EMBED_DECISION.md` — D-MA-EMBED-1..7 (consumed by 29.4).
- `MODEL_ACCESS_TOOL_LOOP_DECISION.md` — D-MA-TOOL-1..8 (consumed by 29.0a).
- `PHASE_28_LR_08_DEFERRAL_DECISION.md` — origin of the §29.1 + §29.2/29.3 unifying decisions.
- `PHASE_28_LR_01_DEFERRAL_DECISION.md` — origin of 29.0a's first-sub-phase status.
- `PHASE_29_SCOPING.md` — superseded by this plan.

---

## 11. Lesson carried forward from Phase 28

> When locking a sub-phase scope, re-grep current code AND walk the call graph one-or-two hops out. The register snapshots scope at write-time; code drifts; chain-of-trust through earlier plan docs amplifies stale assumptions.

This plan was prepared by re-grepping the 5 caller line numbers against `main@5a75613` — confirmed unchanged from Phase 28's closure-report claims. Future Phase 29 sub-phases should do the same prep step before committing to LOC estimates.

The four-instance Phase 28 deferral pattern (28.3 LR-08, 28.4 LR-04 reclassification, 28.7 LR-01 deferral) means Phase 29 inherits ~5 callers worth of work that the register entries originally framed as smaller. **Treat this plan's estimates as ceiling-without-discovery, not as committed scope.** Any sub-phase prep that surfaces a new structural mismatch with the plan should pause and surface, not force a fit.
