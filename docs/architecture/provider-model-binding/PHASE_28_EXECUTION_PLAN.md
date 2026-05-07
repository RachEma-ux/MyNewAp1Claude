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

### 28.2 — LR-06 extract: `seed-from-env.ts` `[bundle]`

Highest-risk register entry per the register itself ("High — this IS the env-to-runtime path Decision D1 forbids"). No upstream Model Access dep.

**Today's flow** (`_core/index.ts:120-140`):

```
boot → autoProvisionProviders(): for each PROVIDER_ENV_VAR pair, if process.env[var] set → upsert into legacy `providers` table with apiKey field
```

**Target flow:**

```
operator/CI runs `pnpm tsx scripts/provider-connections/seed-from-env.ts` → for each env var, write encrypted secret into `provider_connections` (the Plan v3 source-of-truth table)
boot → no env-key reading; fails closed if `provider_connections` is empty in dev (with a one-line "did you run seed-from-env.ts?" hint)
```

- [ ] **28.2a** — Author `scripts/provider-connections/seed-from-env.ts`. Read same env-var set as today (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`); write to `provider_connections` via the existing encryption path (mirror what the operator UI uses). Idempotent: re-running with the same env values is a no-op; with new values, rotates the secret.
- [ ] **28.2b** — Remove the `autoProvisionProviders()` block from `_core/index.ts`. Replace with a dev-mode check: if `provider_connections` is empty AND `DEV_MODE=true`, log a one-liner pointing at the new script, but don't block boot.
- [ ] **28.2c** — Update boundary lint: `check-provider-key-env-boundary.ts` removes the `<dynamic>` allowlist entry for `_core/index.ts:120-140`.
- [ ] **28.2d** — Update CLAUDE.md "Local App Launch Procedure" to add `seed-from-env.ts` as a one-time setup step before first `npm run dev`.
- [ ] **Acceptance:** boundary lint green without the allowlist entry; dev boot works on a fresh DB after running the seed script; LR-06 row in register flips to `migrated`.
- [ ] **Authority:** full autonomous merge. Risk note: this is the "silently breaks dev startup" surface; the PR must include a manual-test note exercising fresh-DB boot.

### 28.3 — LR-08 migration: `/api/chat/stream` + `executeInvokeAgent` `[bundle]`

Both surfaces today consume `getProviderRegistry()`. After 28.2 closes, the registry is no longer env-seeded — but both surfaces still bypass Plan v3 binding/Model Access.

- [ ] **28.3a — `/api/chat/stream` migration.** Migrate `server/chat/stream.ts` to: resolve the workspace's default provider binding via `agentStudio.providerBindings.resolveForRun` (or the equivalent for non-AS sessions — see open question §6.1) → call `openRouter.modelAccess.stream` via gateway. Removes `getProviderRegistry` dependency. The legacy chat UI is the only caller.
- [ ] **28.3b — `executeInvokeAgent` migration.** Migrate `server/automation/block-executors.ts:executeInvokeAgent` (lines 202–270) to: resolve the agent's binding via `agentStudio.providerBindings.resolveForRun` → call `openRouter.modelAccess.execute`. Removes `getProviderRegistry` dependency.
- [ ] **28.3c** — Boundary-lint allowlist purge for both surfaces.
- [ ] **Acceptance:** chat-stream + executeInvokeAgent integration tests pass against Model Access; LR-08 row flips to `migrated`; legacy chat UI still works in dev.
- [ ] **Authority:** full autonomous merge.

### 28.4 — Model Access embedding-execute primitive

LR-02/03/04 all need this. Build the primitive once, migrate all three callers in 28.5.

- [ ] **28.4a — Decision record.** Author `docs/architecture/provider-model-binding/MODEL_ACCESS_EMBED_DECISION.md` (D-MA-EMBED-1..N): wire shape, governance/receipt policy, supported providers (OpenAI today; door open for others), failure modes, dimension contract.
- [ ] **28.4b — Implementation.** New action `openRouter.modelAccess.embed` in `server/openrouter/model-access/embed.ts`. Mirror `execute.ts` shape: gateway-call, `enforceModelAccessReceipt(payload.intent, sealed, "embed")`, builds upstream client, returns `{ embedding: number[], model: string, usage: {...} }`. Hybrid receipt policy.
- [ ] **28.4c — Boundary updates.** Add `embed` to the action key map; allowlist for the primitive itself; tests for happy path + boundary invariants.
- [ ] **Acceptance:** primitive lands; `embed` action governed; `pnpm run check` + new unit tests pass.
- [ ] **Authority:** full autonomous merge.

### 28.5 — LR-02/03/04 caller migrations `[bundle]`

- [ ] **28.5a — `embeddings/service.ts:54, 59` migration.** Replace `process.env.OPENAI_API_KEY` + `new OpenAI(...)` with a `gatewayCall` to `openRouter.modelAccess.embed`. Service signature stays compatible — call sites don't change.
- [ ] **28.5b — `documents/processor.ts:339` migration.** Same shape.
- [ ] **28.5c — `operators/provider-hub.ts:78` migration.** Same shape.
- [ ] **28.5d** — Boundary-lint allowlist purge for LR-02/03/04.
- [ ] **Acceptance:** integration tests for each caller pass against the new primitive; LR-02/03/04 rows flip to `migrated`.
- [ ] **Authority:** full autonomous merge.

### 28.6 — Model Access streaming-with-tool-calls + MCP-bridge primitive

The largest new Model Access surface. LR-01 (simulation) is the only caller, but the primitive itself is reusable for any future tool-loop runtime.

Two physical primitives are likely needed:

1. **Streaming-with-tool-calls** — token-by-token streaming + tool-call deltas + tool-result interleaving. Today's `modelAccess.stream` is streaming-only with no tool-call support.
2. **MCP-bridge** — bridge into the openllm-agent2 WebSocket runtime that simulation uses. The bridge handles the `permissionResolver` callback shape that today flows through the AS adapter.

- [ ] **28.6a — Decision record.** Author `docs/architecture/provider-model-binding/MODEL_ACCESS_TOOL_LOOP_DECISION.md` (D-MA-TOOL-1..N): primitive shape, where the WebSocket bridge lives (Model Access vs. a sibling module), `permissionResolver` callback contract, MCP server lifecycle, governance/receipt policy.
- [ ] **28.6b — Streaming-with-tool-calls primitive.** New action `openRouter.modelAccess.streamWithTools` in `server/openrouter/model-access/stream-with-tools.ts`. Returns an async-iterator of typed deltas (`{kind:"text",text} | {kind:"tool_call_delta",...} | {kind:"tool_result_request",...}`). Direct streaming consumers can import from `server/openrouter/model-access` per the existing pattern.
- [ ] **28.6c — MCP-bridge primitive.** Either a new `modelAccess.runViaMcpBridge` action OR a sibling `server/openrouter/model-access/mcp-bridge.ts` module (decided in 28.6a). Hosts the WebSocket lifecycle the AS adapter holds today.
- [ ] **28.6d** — Tests: tool-call stream parsing, tool-result round-trip, permission-resolver invocation, MCP-bridge connect/disconnect/refusal modes.
- [ ] **Acceptance:** primitives land with full test coverage; decision doc references the locked DRs.
- [ ] **Authority:** full autonomous merge.

### 28.7 — LR-01 simulation migration

- [ ] **28.7a — Migrate `simulation.ts:808` `runViaOpenAIDirect` call.** Replace with `gatewayCall` to `openRouter.modelAccess.streamWithTools`.
- [ ] **28.7b — Migrate `simulation.ts:826` `runViaOpenllmAgent` call.** Replace with the MCP-bridge primitive from 28.6c.
- [ ] **28.7c — Adapter cleanup.** If both `runViaOpenAIDirect` and `runViaOpenllmAgent` have no other callers (they shouldn't), delete them along with `resolveProviderApiKey` (definition at `openllm-runtime-adapter.ts:311`). Acceptance check: `grep -r "resolveProviderApiKey\|runViaOpenAIDirect\|runViaOpenllmAgent"` returns nothing outside test fixtures.
- [ ] **28.7d** — Boundary-lint allowlist purge for LR-01 simulation.
- [ ] **Acceptance:** simulation tests green against the new primitives; LR-01 row flips to `migrated` (full closure, not "subset"); the dead `resolveProviderApiKey` definition is gone from the codebase.
- [ ] **Authority:** full autonomous merge.

### 28.8 — Plan-close audit + register reconciliation

- [ ] Author `docs/evidence/provider-model-binding/PHASE_28_CLOSURE_REPORT.md` mirroring `DIRECTION_A_REVERIFICATION_AFTER_PHASE_27.md`. Inventory: every LR row at start of Phase 28 → current state; boundary lint diff; allowlist diff; new primitives; new tests added.
- [ ] Update `LEGACY_EXCEPTION_REGISTER.md` aggregate counts at the bottom.
- [ ] Update `EXECUTION_CHECKLIST.md` to mark Phase 28 closed (note: the checklist's "Phase 28" entry is the original Plan v3 Readiness owner work, NOT this LR-closure batch — disambiguate with a footnote).
- [ ] Update `CLAUDE.md` if any new operator runbook step lands (LR-06 in particular).
- [ ] **Acceptance:** all six LR rows flipped from "open" to "migrated" or "permanently exempted"; closure report evidence-complete.
- [ ] **Authority:** full autonomous merge — final sub-phase.

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
