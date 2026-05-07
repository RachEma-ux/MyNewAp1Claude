# Phase 28 — Execution Plan

**Captured:** 2026-05-07 against `main@ff26796` (post-D-CAG-RECON-2 closure).
**Branch (this doc):** `docs/pmb-phase-28-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07.

---

## 1. Why Phase 28 exists

Phase 27 (`f89ffed`, PR #150) closed Plan v3 by eliminating the runtime provider-key surface across Agent Studio's chat paths. The `LEGACY_EXCEPTION_REGISTER.md` matrix (`PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md`) flipped six exception entries to a **Phase 28 deadline**:

| LR | Surface | Phase 27 decision |
|---|---|---|
| LR-01 (subset) | `agent-studio/services/simulation.ts:808, 826` (`runViaOpenAIDirect` + `runViaOpenllmAgent`) | TEMPORARY_EXCEPTION_WITH_DEADLINE — single approved Phase 27 exception, formalized in `PHASE_27_SIMULATION_ENGINE_DECISION.md`. |
| LR-02 | `embeddings/service.ts:54, 59` | TEMPORARY_EXCEPTION_WITH_DEADLINE — Model Access has no embedding-execute primitive yet. |
| LR-03 | `documents/processor.ts:339` | Same shape as LR-02. |
| LR-04 | `operators/provider-hub.ts:78` | Same shape as LR-02. |
| LR-06 | `_core/index.ts:120-140` `autoProvisionProviders()` boot block | RETIRE — extract to `scripts/provider-connections/seed-from-env.ts`; the actual extract was deferred from Phase 27 because it requires moving the encrypted-secret write target. |
| LR-08 | `chat/stream.ts` (`/api/chat/stream`) + `automation/block-executors.ts:executeInvokeAgent` | TEMPORARY_EXCEPTION_WITH_DEADLINE — both consume `getProviderRegistry()`. |
| LR-09 | `code-studio/opencode/provider-sync.ts:96` (subprocess env-write) | TEMPORARY_EXCEPTION_WITH_DEADLINE — decision call (out-of-scope vs. migrate). |

Phase 28 batches all six closures under one plan with **autonomous execution authority** (memory: `project_phase_28_authority.md`).

---

## 2. Scope and out-of-scope

### In scope

- The seven LR closures above (LR-01, LR-02, LR-03, LR-04, LR-06, LR-08, LR-09).
- New Model Access primitives required to unblock those closures (embedding-execute, streaming-with-tool-calls + MCP-bridge).
- Migration scripts for the LR-06 extract.
- Test coverage for new primitives, migrated callers, and the boundary-lint allowlist purge at the end.

### Out of scope (existing CLAUDE.md deferrals)

- D2 multi-region deployment (`agent-studio-multi-region.md` ADR locks the deferral).
- D-PARSE-DOCX-N, D-PARSE-OCRPDF-N parsers.
- Frontend Module-Gateway plan (`FUTURE_FRONTEND_TRPC_CLEANUP.md`).
- Plan v3 follow-ups (Phase 26.1 barrel-strip, Direction B's D-LC-5 promotion) — separate plans.
- Issue #226 drizzle-kit metadata drift — separate filed issue, not blocking.

---

## 3. Sub-phase decomposition

The cheap-dependency-first ordering. Sub-phases are PR-sized; sub-phases marked `[bundle]` may ship as multiple PRs if scope grows during execution, but the bundle's acceptance criteria stay fixed.

### 28.0 — Plan freeze (this PR)

- [ ] Land `PHASE_28_EXECUTION_PLAN.md` (this doc).
- [ ] Land an updated `LEGACY_EXCEPTION_REGISTER.md` `Phase 28 sub-phase` column linking each LR to its target sub-phase below.
- [ ] **Acceptance:** doc lands on main; `pnpm run check` clean; CI green.
- [ ] **Authority:** plan-only; no code changes.

### 28.1 — LR-09 decision PR (opencode subprocess env-write) — **CLOSED**

**Decision: ALREADY_FIXED.** The surface LR-09 describes was eliminated by **PR #100** (`f824d8c`, 2026-05-04) **before the register was created** in PR #104 (2026-05-04, seven hours later). The register row was a documentation gap — line 96 of `provider-sync.ts` is now inside a comment block explaining the historical bug, not a code mutation. Boundary lint Rule 2 (`scripts/check-provider-key-env-boundary.ts:166-283`) carries the regression guard going forward; its error message even names PR #100.

Closed by `PHASE_28_OPENCODE_SUBPROCESS_DECISION.md`. LR-09 row in register flipped to `migrated`.

**Lesson:** when closing a register row, re-grep the file against current `main` rather than trusting the prior doc's snapshot. Same chain-of-trust drift that PR #223 (migration 0042) and PR #224 (`useCount` field) surfaced.

### 28.2 — LR-06 extract: `seed-from-env.ts` (Scope A) — **CLOSED**

Scoped narrowly to the env-read elimination; preserved the legacy `providers` table as the write target for back-compat with three readers (`provider-sync.ts`, `web-instance-manager.ts`, `kgra-agent/nodes.ts`). Migrating those readers to `provider_connections` is deferred to a follow-up sub-phase.

**Shipped:**

- [x] `scripts/provider-connections/seed-from-env.ts` — full implementation with `--dry-run` / `--force` flags, idempotent skip-existing default, four outcome states (`created` / `rotated` / `skipped_already_exists` / `skipped_no_env`), DI-friendly `seedProvidersFromEnv()` for testing.
- [x] `_core/index.ts` — removed `autoProvisionProviders` block + `ENV_PROVIDER_MAP` constant + `encrypt` import; replaced with `maybeWarnUnseededProviders()` dev-mode hint that only logs when `DEV_MODE=true` AND env vars are set AND providers table is empty.
- [x] `scripts/check-provider-key-env-boundary.ts` — purged the `_core/index.ts` `<dynamic>` allowlist entry. The `<seed-script>` sentinel for `seed-from-env.ts` was already in place from Phase 5.
- [x] `CLAUDE.md` — added step 4d to the Local App Launch Procedure.
- [x] `tests/scripts/seed-from-env.test.ts` — 7 unit tests covering all four outcome states + encryption pipeline + DB-unavailable error path.

**Acceptance — met:**

- [x] Boundary lint green without the `_core/index.ts` allowlist entry.
- [x] Seed-script tests 7/7.
- [x] LR-06 row in register flipped to `migrated`.

**Out of scope (filed as latent follow-up):** porting the three `providers`-table readers (`provider-sync.ts:48`, `web-instance-manager.ts:71`, `kgra-agent/nodes.ts:33`) to `provider_connections`. The pre-existing latent bug in `provider-sync.ts` / `web-instance-manager.ts` (encrypted blob written to `auth.json` / spawn env without decrypt) is documented but not fixed in this sub-phase.

### 28.3 — LR-08 migration — **DEFERRED → Phase 29**

Scope discovery during execution surfaced that LR-08's prescribed fix materially underestimated the migration. The register treats LR-08 as "two callers consume `getProviderRegistry()`," but reality is that the workspace-scoped **routing layer** (`server/inference/provider-router.ts:resolvePlan`) is itself a registry consumer at lines 17, 137, 205. Closing LR-08 cleanly requires migrating the routing layer, not just the two named callers. Plus two unresolved decisions: workspace-default binding (chat-stream has no `agentId`), and legacy-`agents`-table support (`executeInvokeAgent` operates on `agents`, not `ags_agent_drafts`).

**Decision: DEFER to Phase 29.** Deadline rolls forward; per the Phase 27.4 precedent, a deadline roll is not a new TEMPORARY_EXCEPTION. User authorized the deferral on 2026-05-07 after surfacing the scope discovery.

Closed by:

- `docs/evidence/provider-model-binding/PHASE_28_LR_08_DEFERRAL_DECISION.md` — full rationale.
- `docs/architecture/provider-model-binding/PHASE_29_SCOPING.md` — Phase 29 scope, tentative sub-phase decomposition, sizing.

**Lesson reinforced (third time this Phase 28 batch):** when closing a register row, re-grep against current `main` AND walk the call graph one or two hops out. Same chain-of-trust drift caught in 28.1 (LR-09 already fixed) and 28.2 (LR-06 had downstream readers the register didn't name).

### 28.4 — Model Access embedding-execute primitive — **CLOSED**

Built the primitive even though all three of LR-02/03/04's caller migrations defer to Phase 29 (workspace-default-binding upstream dependency, same as LR-08). The primitive's shape is decoupled from the binding-resolution question; bundling its build with caller migration would re-create the conflation that drove the LR-08 deferral.

**Reclassification surfaced during 28.4 prep:** **LR-04** (`operators/provider-hub.ts:78`) is a **chat-completion** caller (`/v1/chat/completions` with `gpt-4o-mini`), NOT an embedding caller. The Phase 27.4 matrix grouped it with LR-02/03 under "embedding-endpoint dependency" — that was wrong. LR-04 uses the existing `execute` primitive in Phase 29 (alongside LR-08); only LR-02/03 consume this new `embed` primitive.

**Shipped:**

- [x] `MODEL_ACCESS_EMBED_DECISION.md` — D-MA-EMBED-1..7 locked: input/output shape; OpenAI-compatible only (Anthropic refused with `unsupported_provider_type`); hybrid receipt policy; failure-mode taxonomy mirrored from `execute`; dimension contract is caller-side; single-call batch (no auto-split); test strategy.
- [x] `server/openrouter/model-access/embed.ts` — implementation (~190 LOC) mirroring `execute.ts` shape. Targets `/v1/embeddings`. Returns `ModelAccessEmbedResult` with batch-shaped `embeddings: number[][]`.
- [x] `types.ts` — added `ModelAccessEmbedInput` + `ModelAccessEmbedResult`.
- [x] `index.ts` — re-exported `embed`.
- [x] `manifest.ts` — registered `openRouter.modelAccess.embed` gateway action; widened `enforceModelAccessReceipt` action union to include `"embed"`.
- [x] `MODEL_ACCESS_CONTRACT.md` — updated to 4 actions; embed test references added.
- [x] `embed.test.ts` — 12 unit tests covering D-MA-EMBED-1..7. `manifest-receipt-policy.test.ts` extended with 3 embed-specific receipt tests (10 total, was 7).
- [x] `pnpm run check` clean; 22/22 tests across embed + receipt-policy.

**Acceptance — met.** No new TEMPORARY_EXCEPTION introduced; Phase 28 cap stays 0 / 1.

### 28.5 — LR-02/03/04 caller migrations — **DEFERRED → Phase 29**

All three callers share the workspace-default-binding upstream dependency that drove the LR-08 deferral:

- `embeddings/service.ts` is a singleton (`getEmbeddingService()`); `generateEmbedding(text)` has no workspace context.
- `documents/processor.ts:339` calls into `embeddings/service.ts`.
- `operators/provider-hub.ts:78` is a `callProviderHub({operator, prompts, ...})` no-workspace caller — also reclassified during 28.4 prep as a chat-completion caller (not embedding); it uses the existing `execute` primitive, not this PR's new `embed`.

`PHASE_29_SCOPING.md` already lists workspace-default binding in §29.1; LR-02/03/04 caller migrations land alongside LR-08 in Phase 29 sub-phases that consume that decision. Per the Phase 27.4 precedent, deadline rolls are not new exceptions.

**Closed by:** scope deferral lands as part of 28.4 / 28.5 paired updates in the Phase 28 plan. No separate evidence doc needed beyond the embed decision record (which already captures the LR-04 reclassification).

### 28.6 — Model Access openllm-agent bridge primitive `[bundle]`

**Scope reality check during 28.6a (28.6's decision record):** the original plan named two primitives (streaming-with-tool-calls + MCP-bridge). Investigation showed:

- `runViaOpenAIDirect` is non-streaming single-turn — the existing `execute` primitive covers it. No new primitive needed.
- `runViaOpenllmAgent` is the actual complexity (WebSocket bridge with `permissionResolver` callback, MCP-server `configure_session`, typed event stream). One primitive, not two.

There is no current consumer for a generic streaming-with-tool-calls primitive — building one now violates "don't add features beyond what the task requires." 28.6 ships **only the openllm-agent bridge primitive**.

- [x] **28.6a — Decision record.** `MODEL_ACCESS_TOOL_LOOP_DECISION.md` locks D-MA-TOOL-1..8: direct-import shape (mirroring `stream()` precedent because `permissionResolver` callback can't pass through gateway-call serialization), location inside Model Access subtree (D2 boundary requirement), `permissionResolver` callback contract unchanged from today, input/output shape via `withProviderCredential`, hybrid receipt policy (callers gate upstream), MCP-server lifecycle preserved (configure_session sent when array non-empty), bridge does NOT do multi-turn tool loops.
- [x] **28.6b — Implementation + tests.** Shipped:
  - `server/openrouter/model-access/run-via-openllm-bridge.ts` (~440 LOC) — full bridge implementation. `withProviderCredential` resolves credentials inside Model Access (D2 boundary preserved); WS URL derived from `baseUrl`; apiKey extracted from `Authorization: Bearer X` (with x-api-key fallback for Anthropic-style headers). Direct-import async function, no gateway-call wrapper.
  - `server/openrouter/model-access/run-via-openllm-bridge.test.ts` — 18 unit tests with hoisted fake `ws` mock + `awaitWs()` helper to wait past the credential-resolver microtask. Covers happy path / permission flow (allow / deny-fallback / needs_human / resolver throws) / configure_session (ack / no-ack timeout / not-sent-when-empty) / WebSocket failures (error event / close-before-done / overall timeout) / credential resolution failure / Bearer + x-api-key extraction.
  - `types.ts` — added `BridgePermissionDecision`, `BridgePermissionResolver`, `BridgeMcpServerConfig`, `BridgeSessionConfigResult`, `BridgeUsage`, `RunViaOpenllmBridgeInput`, `RunViaOpenllmBridgeResult`.
  - `index.ts` — re-exported `runViaOpenllmBridge`, `deriveOpenllmWsUrl`, all 7 new types.
  - `MODEL_ACCESS_CONTRACT.md` — documents the new direct-import surface.
  - AS adapter unchanged in this PR — its `runViaOpenllmAgent` / `runViaOpenAIDirect` / `resolveProviderApiKey` continue to exist alongside the new primitive. They die in 28.7 when simulation swaps over.
- [x] **Acceptance — met:** 18/18 tests pass; `pnpm run check` clean; contract doc updated.

### 28.7 — LR-01 simulation migration — **DEFERRED → Phase 29**

The 28.6b primitive (`runViaOpenllmBridge`) is shipped and ready to consume. The caller-side migration on `simulation.ts` was scoped during 28.7 prep at ~300 LOC across 8+ files (binding lookup + 2 call-site rewrites + 6 metadata-payload reshapes + adapter dead-code purge + comment cleanups + boundary lint update). Combined with the absence of simulation runtime tests on this device, the regression risk on a critical agent-test path argued for grouping the migration with Phase 29's caller batch (LR-02/03/04/08) under one coordinated smoke-test rollout.

**Decision: DEFER to Phase 29.** Deadline rolls forward; per the Phase 27.4 precedent, a deadline roll is not a new TEMPORARY_EXCEPTION. User authorized the deferral on 2026-05-07 after surfacing the migration scope.

Closed by:

- `docs/evidence/provider-model-binding/PHASE_28_LR_01_DEFERRAL_DECISION.md` — full rationale + Phase 28 lesson summary.
- LR-01 row in register flipped to point at Phase 29; sub-phase mapping updated.
- `PHASE_29_SCOPING.md` — caller list expanded to 5 (LR-01 added); LR-01 marked as the natural first sub-phase since it's independent of the workspace-default-binding decision (`simulation.ts` already has `draft.id` in scope).

**Lesson reinforced (sixth time this Phase 28 batch):** the prescribed sub-phase shape doesn't always match what the call site actually needs. Five of the six discoveries came from re-grepping current code rather than static review of the docs.

### 28.8 — Plan-close audit + register reconciliation — **CLOSED**

Closure report shipped at `docs/evidence/provider-model-binding/PHASE_28_CLOSURE_REPORT.md`. Phase 28 final state:

- **2 LRs migrated:** LR-06 (`autoProvisionProviders` extracted to `seed-from-env.ts`) + LR-09 (ALREADY_FIXED, register documentation gap).
- **1 LR reclassified:** LR-04 (chat-completion caller, not embedding).
- **4 LRs deferred to Phase 29:** LR-01, LR-02, LR-03, LR-08 — all caller-side migrations grouped under one phase.
- **2 new Model Access primitives:** `embed` (D-MA-EMBED-1..7) + `runViaOpenllmBridge` (D-MA-TOOL-1..8).
- **1 boundary lint allowlist entry purged** (LR-06).
- **Zero new TEMPORARY_EXCEPTION_WITH_DEADLINEs.** Cap stayed 0 / 1 allowed.
- **47 net new tests** added.
- **CI 5/5 green** through every Phase 28 PR.

The original goal ("close LR-01..09 register entries") is half-met: 2 of 7 migrated, 5 deferred to Phase 29. The honest framing is: **Phase 28 = primitive layer + low-risk closures; Phase 29 = caller migration layer.** That's the structure of the work the call sites actually require.

Phase 29 is **not yet authorized** for autonomous execution. User re-grant required before Phase 29 starts.

**Lessons summarized in the closure report (the six-instance pattern):** when locking a sub-phase scope, walk the actual call sites first AND walk the call graph one or two hops out. The register snapshots scope at write-time; code drifts. PR #223 (migration 0042) and PR #224 (`useCount` field) established the same shape; six Phase 28 sub-phases reinforced it.

---

## 4. Decision matrix

Mirrors `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md`. Cap: **zero** new TEMPORARY_EXCEPTION_WITH_DEADLINE entries unless plan triggers a pause.

| # | Path | Register | Decision | Owner | Sub-phase | Risk |
|---|---|---|---|---|---|---|
| 1 | `simulation.ts:808` (`runViaOpenAIDirect`) | LR-01 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.6 + 28.7a | Medium — depends on new streaming-with-tool-calls primitive shape locking cleanly. |
| 2 | `simulation.ts:826` (`runViaOpenllmAgent`) | LR-01 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.6 + 28.7b | Medium — depends on MCP-bridge primitive. WebSocket lifecycle is the highest-risk new surface in Phase 28. |
| 3 | `embeddings/service.ts:54, 59` | LR-02 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.4 + 28.5a | Low — single hard-coded var; primitive is straightforward. |
| 4 | `documents/processor.ts:339` | LR-03 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.4 + 28.5b | Low. |
| 5 | `operators/provider-hub.ts:78` | LR-04 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.4 + 28.5c | Low. |
| 6 | `_core/index.ts:120-140` (`autoProvisionProviders`) | LR-06 | RETIRE → `seed-from-env.ts` | Platform | 28.2 | High — boot path; getting it wrong silently breaks dev startup. Mitigation: manual-test note + dev-mode fallback hint. |
| 7 | `chat/stream.ts` (`/api/chat/stream`) | LR-08 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.3a | Low — read-side; closing LR-06 closes the env source transitively. |
| 8 | `automation/block-executors.ts:executeInvokeAgent` | LR-08 | MIGRATE_TO_MODEL_ACCESS | Builder | 28.3b | Low — same shape as #7. |
| 9 | `code-studio/opencode/provider-sync.ts:96` (subprocess env-write) | LR-09 | TBD (28.1 decision) — preferred PERMANENT_EXEMPTION | Code Studio | 28.1 | Low — write to subprocess env, not a runtime read. |

**Cap: 0 / 1 allowed new exceptions.** All decisions are MIGRATE or RETIRE except LR-09's decision call, which is preferred to land as a permanent exemption (clarification of the existing temporary exception).

---

## 5. Test strategy

### Per sub-phase

- **28.2 (LR-06):** unit test for the seed script's idempotency + rotation behavior; integration test that exercises the dev-mode fallback hint when `provider_connections` is empty.
- **28.3 (LR-08):** integration test for `/api/chat/stream` end-to-end (binding → modelAccess.stream); update existing automation tests for `executeInvokeAgent` to assert the new gateway-call path.
- **28.4 (embedding primitive):** mirror `execute.test.ts` — happy path, boundary invariants, governance/receipt policy.
- **28.5 (callers):** unit tests for each migrated caller asserting the gateway-call path; integration test if a real upstream embedding response is needed (skip with `describe.skipIf(!hasOpenAIKey())` per the existing pattern).
- **28.6 (tool-loop primitive):** new test file `stream-with-tools.test.ts` covering tool-call delta parsing, tool-result interleaving, permission-resolver invocation; new test file `mcp-bridge.test.ts` covering WebSocket connect/disconnect/refusal.
- **28.7 (simulation migration):** existing `simulation.test.ts` updated to expect the gateway-call path; assert the dead-code purge.

### Cross-cutting

- **Boundary lint:** every sub-phase that purges an allowlist entry runs `pnpm exec tsx scripts/check-provider-key-env-boundary.ts` post-migration.
- **CI fingerprint:** Phase 28 baseline is **5/5 green** (D5 / `e645713` baseline). Any sub-phase that regresses below 5/5 pauses for diagnosis; per-shard flake protocol applies (memory: `feedback_ci_test_shard_flakes.md`).
- **Smoke testing:** sub-phases 28.2, 28.3, 28.7 require live-app smoke verification (lessons from PR #223 and #224 — schema/runtime-counter changes deserve smoke even when CI is green). Smoke procedure for each is documented in the sub-phase PR body.

---

## 6. Open questions (resolved during execution)

### 6.1 — Default binding for non-AS `/api/chat/stream` callers

The legacy chat UI is workspace-scoped, not agent-scoped. `agentStudio.providerBindings.resolveForRun` requires an agentId. Options:

- **(A)** Add a workspace-default-binding lookup (`workspace_default_provider_binding` table or column).
- **(B)** Refuse non-AS chat-stream calls; force migration to AS chat path.
- **(C)** Use a synthetic "platform agent" binding owned by the workspace.

**Default decision (executable without sign-off):** Land 28.3a behind a runtime check: if the workspace has a default AS agent (most do, per Plan v3 Phase 11), use its binding; otherwise return `binding_required` 4xx and document the workaround. Workspace-default-binding table (option A) is a separate plan if the 4xx error rate is non-trivial in dev — flag in the closure report.

### 6.2 — MCP-bridge home: Model Access action vs. sibling module

Decision lands in 28.6a. Tentative: a sibling `server/openrouter/model-access/mcp-bridge.ts` module that exposes `runViaMcpBridge(input): Stream<...>`. Reasons: WebSocket lifecycle is too stateful to fit cleanly inside the gateway-call/receipt-policy shape that the existing `modelAccess.*` actions assume; pulling it through gateway-call would require receipt enforcement on every WS frame, which is wrong.

### 6.3 — `executeInvokeAgent` test coverage

The function is reached via automation workflows. Current test file unknown — locate during 28.3b. If no test exists, write one (this is a Phase 28 acceptance criterion; uncovered runtime paths shouldn't ship through Phase 28 unchanged).

---

## 7. Sizing

| Sub-phase | PRs | LOC estimate | Smoke required |
|---|---|---|---|
| 28.0 (this) | 1 | ~400 (docs only) | No |
| 28.1 (LR-09 decision) | 1 | ~150 (docs only) | No |
| 28.2 (LR-06 extract) | 1–2 | ~200 + ~50 boundary | Yes |
| 28.3 (LR-08) | 1–2 | ~250 + tests | Yes |
| 28.4 (embed primitive) | 1 | ~300 + tests | No |
| 28.5 (LR-02/03/04) | 1–3 | ~150 (3 callers, ~50 each) | No |
| 28.6 (tool-loop + MCP bridge) | 1–2 | ~600–800 + tests | No |
| 28.7 (LR-01 simulation) | 1 | ~200 + dead-code purge | Yes |
| 28.8 (closure) | 1 | ~300 (docs) | No |
| **Total** | **9–14** | **~2,500–3,000 LOC** | 3 sub-phases |

Comparable to Phase 27 (6 sub-phases, ~2,800 LOC). The novel work is concentrated in 28.6 (tool-loop primitives); the rest is mechanical migration.

---

## 8. CI fingerprint expectation

Phase 28 baseline is **5/5 green** as of `ff26796`:

```
[completed/success] Governance Compliance Checks
[completed/success] Governance Enforcement Harness
[completed/success] build
[completed/success] ci
[completed/success] test
```

Any sub-phase that regresses below 5/5 pauses for diagnosis. The test-shard-flake protocol (rerun-failed-jobs once before diagnosing) applies.

---

## 9. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, per memory `project_phase_28_authority.md`.

**Pause and surface for sign-off if:**

- A sub-phase requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
- 28.1 LR-09 decision turns out to need an opencode CLI change (option A) — that's outside Phase 28 scope; surface and add as 28.1a follow-up before deciding.
- 28.6 reveals that the openllm-agent2 WS protocol is undocumented or incompatible with a Model Access primitive shape — surface, don't improvise.
- Pre-existing red CI on a sub-phase PR that's not on the known-flaky-shard list.

**Reporting:** local/committed/pushed format; single end-of-phase summary at 28.8.

---

## 10. Cross-references

- `LEGACY_EXCEPTION_REGISTER.md` — source of truth for LR rows; updated incrementally per sub-phase.
- `MODEL_ACCESS_CONTRACT.md` — current Model Access surface contract; will be amended in 28.4 + 28.6.
- `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md` — the prior matrix that flipped LR-02/03/04/06/08/09 to Phase 28.
- `PHASE_27_SIMULATION_ENGINE_DECISION.md` — locks the LR-01 acceptance criterion ("Model Access exposes a streaming-with-tool-calls + MCP-bridge primitive").
- `EXECUTION_CHECKLIST.md` — note: the original "Phase 28 — Readiness owner" entry there is from Plan v3 (closed at PR #132); this Phase 28 LR-closure batch is a separate followup. 28.8 disambiguates.
