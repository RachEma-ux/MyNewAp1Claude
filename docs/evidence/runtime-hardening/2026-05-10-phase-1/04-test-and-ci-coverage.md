# Phase 1d — Test + CI coverage matrix

**Roadmap reference:** `docs/implementation/agent-studio-runtime-hardening-roadmap.md` Phase 1d
**Date:** 2026-05-10
**Branch baseline:** `main @ 3d12d03`
**Audit type:** Read-only. No tests run. No code changes.

**Source labels:** Observed = read or `wc -l`'d; Inferred = filename + import lines; Unverified = could not determine without running.

---

## 1. Test inventory

### 1a. `tests/agent-studio/**` (84 files, ~19,562 lines — Observed)

| Test file | Lines | What it proves | Runtime path | Layer | In default CI? | Cost | Status |
|---|---:|---|---|---|---|---|---|
| retrofit-acceptance.test.ts | 1016 | Locked retrofit contract (D-NKU/RAC-PLANNER 8-mode/PTC 8-gate/APP-EXT/CAG-RECON/TOOL-1/13 parsers/single-region) | proposed-tool-call + approval-gate + RAC trace + CAG | Contract | **Yes (Layer 6)** | fast | Observed |
| proposed-tool-call.test.ts | 455 | All 7 PTC validation gates incl. risk + approval claim | ProposedToolCall | Unit | No | fast | Observed |
| proposed-tool-call-runtime.test.ts | 174 | PTC runtime resolver path | ProposedToolCall | Unit | No | fast | Inferred |
| proposed-tool-call-runtime-gate.test.ts | 220 | `gateRuntimeDispatch` branch coverage | ProposedToolCall | Unit | No | fast | Observed |
| proposed-tool-call-runtime-trace.test.ts | 378 | PTC validation → trace patch wiring | ProposedToolCall + RAC trace | Unit | No | fast | Inferred |
| approval-gate.test.ts | 105 | `decideApprovalState` D-APP-EXT-2 lattice + TTL math | approval gate | Unit | No | fast | Observed |
| approval-gate-draft-hash-unique.test.ts | 263 | Draft hash uniqueness invariant | approval gate | Unit | No | fast | Inferred |
| approval-gate-lastusedat-guarded.test.ts | 94 | lastUsedAt write guard | approval gate | Unit | No | fast | Inferred |
| approval-decide-concurrent.test.ts | 261 | Concurrent decide-race safety | approval gate | Unit | No | fast | Inferred |
| approval-event-bus.test.ts | 183 | Approval event bus emission | approval gate | Unit | No | fast | Inferred |
| approval-expiry-sweep.test.ts | 161 | TTL expiry sweep behavior | approval gate | Unit | No | fast | Inferred |
| approval-list-projection.test.ts | 157 | Pending approval projection | approval gate | Unit | No | fast | Inferred |
| approval-resume-loop.test.ts | 204 | Approval resume → tool-loop continuation | approval gate + tool-call trace | Unit | No | fast | Inferred |
| tool-approvals-decide-authz.test.ts | 140 | AuthZ on `decide` mutation | approval gate | Unit | No | fast | Inferred |
| legacy-decide-removed.test.ts | 103 | Legacy approval surface deleted | approval gate | Static | No | fast | Inferred |
| sandbox-gate.test.ts | 226 | nodeVmSandbox timeout + deny + frozen-intrinsic + UNAVAILABLE | tool-call (sandbox) | Unit | No | fast | Observed |
| dispatcher-audit-coverage.test.ts | 150 | All dispatch paths emit audit | MCP dispatcher | Unit | No | fast | Inferred |
| dispatcher-error-sanitization.test.ts | 163 | Error message scrubbing | MCP dispatcher | Unit | No | fast | Inferred |
| dispatcher-layering-coverage.test.ts | 124 | Dispatcher layer ordering | MCP dispatcher | Unit | No | fast | Inferred |
| dispatcher-output-schema-validation.test.ts | 181 | MCP output schema validation | MCP dispatcher | Unit | No | fast | Inferred |
| dispatcher-sandbox-error-mapping.test.ts | 238 | Sandbox error → DispatchError code | MCP dispatcher | Unit | No | fast | Inferred |
| dispatcher-tool-call-timeout.test.ts | 185 | `tool_call_timeout` sentinel + 60s ceiling | MCP dispatcher | Unit | No | fast | Observed |
| sanitize-mcp-error-message.test.ts | 277 | Error sanitizer purity | MCP dispatcher | Unit | No | fast | Inferred |
| graceful-child-close.test.ts | 161 | MCP child-process close | MCP dispatcher (lifecycle) | Unit | No | fast | Inferred |
| mcp-auto-sync.test.ts | 245 | Tool-knowledge auto-sync wiring | MCP dispatcher | Unit | No | fast | Inferred |
| mcp-tool-knowledge-sync.test.ts | 90 | Tool snapshot canonical hash | MCP dispatcher | Unit | No | fast | Inferred |
| auto-sync-boot-wireup.test.ts | 112 | Boot wires auto-sync subscriber | MCP dispatcher | Static/Unit | No | fast | Inferred |
| boot-ordering-doc.test.ts | 85 | Boot ordering doc lockstep | MCP / RAC | Static | No | fast | Inferred |
| tool-schema-hash.test.ts | 183 | Schema hash determinism | MCP dispatcher | Unit | No | fast | Inferred |
| tool-knowledge-fk-decl.test.ts | 110 | FK declaration on tool_knowledge | MCP dispatcher (schema) | Static | No | fast | Inferred |
| rac-orchestrator.test.ts | 411 | Orchestrator step machine | RAC trace | Unit | No | fast | Inferred |
| rac-assembler.test.ts | 322 | Context block assembler | RAC trace | Unit | No | fast | Inferred |
| rac-evaluation.test.ts | 306 | RAC evaluation policy | RAC trace | Unit | No | fast | Inferred |
| rac-ingestion.test.ts | 220 | RAC ingestion adapter | RAC trace / KB | Unit | No | fast | Inferred |
| rac-planner-mode.test.ts | 182 | 8-mode planner derivation | RAC trace | Unit | No | fast | Inferred |
| rac-retrieval.test.ts | 530 | Retrieval planner/executor/filter | RAC trace | Unit | No | fast | Inferred |
| rac-trace.test.ts | 222 | `buildContextBlockRows` happy + citation + score | RAC trace | Unit | No | fast | Observed |
| runtime-trace-writer.test.ts | 361 | `buildToolCallTraceRow` + `buildRacTracePatch` + verdict mapping | tool-call trace + RAC trace | Unit | No | fast | Observed |
| trace-writer-patch-race.test.ts | 141 | Concurrent trace patch race | tool-call trace | Unit | No | fast | Inferred |
| trace-audit-asymmetry-doc.test.ts | 131 | Asymmetry-rule lockstep | RAC trace | Static | No | fast | Inferred |
| trace-timeout-reason-decl.test.ts | 86 | `timeoutReason` enum decl | RAC trace | Static | No | fast | Inferred |
| cag-boundaries.test.ts | 360 | D-PRM-2 section order, D-PRM-5 cache key, check-cag-boundary classifier | CAG | Unit + Static | No | fast | Observed |
| cag-compile-metadata.test.ts | 70 | CAG compile-metadata fields | CAG | Unit | No | fast | Inferred |
| canonical-determinism.test.ts | 255 | Canonical serializer determinism | CAG / PTC | Unit | No | fast | Inferred |
| context-window.test.ts | 229 | Context-window math | RAC trace | Unit | No | fast | Inferred |
| chat-resume-helper-coverage.test.ts | 127 | Chat-resume helper paths | chat-stream | Unit | No | fast | Inferred |
| h6-c7-client-awaiting-handler.test.ts | 189 | client-awaiting state handler | chat-stream | Unit | No | fast | Inferred |
| h7-c7-loop-reentrancy-guard.test.ts | 284 | Tool-loop reentrancy guard | chat-stream / tool-call | Unit | No | fast | Inferred |
| h8-c7-context-windowing-integration.test.ts | 255 | Context windowing in tool-loop | chat-stream | Unit | No | fast | Inferred |
| h9-l1-c7-trace-warn-rate-limit.test.ts | 430 | Trace-warn rate limiter | RAC trace | Unit | No | fast | Inferred |
| h1–h5/m1–m9 cross-flow + doc tests (h1, h2, h3, h5, m4–m9, l1–l4, c2/c6/c7/c8 doc bundles, pr-a) | ~ 4,600 total | Cross-flow lockstep + doc-block lockstep tests added by cycles 5–8 | RAC trace / MCP / orchestration | Static | No | fast | Inferred |
| risk-classifier-layering.test.ts | 107 | Risk-classifier layer order | MCP dispatcher | Unit | No | fast | Inferred |
| governed-procedure-coverage.test.ts | 363 | Every mutation uses governedProcedure | governance | Static | No | fast | Inferred |
| migrate-provider-config-classifier.test.ts | 173 | Provider migration classifier | provider boundary | Unit | No | fast | Inferred |
| kb-router-governance.test.ts | 65 | KB router governance hookup | KB | Unit | No | fast | Inferred |
| kb-retrieval-adapter.test.ts | 92 | KB retrieval adapter | RAC | Unit | No | fast | Inferred |
| pgvector-adapter.test.ts | 448 | Optional pgvector engine adapter | RAC retrieval | Unit | No | fast | Inferred |
| pii-detector.test.ts, license-extractor.test.ts | 330 total | Ingestion governance scrubbers | KB / governance | Unit | No | fast | Inferred |
| Parser tests (audio, csv, docx, ocr, ocr-pdf, pii, video, xlsx, ingestion-parsers, result-validator) | ~2,250 | 13-parser MVP coverage | KB / ingestion | Unit | No | fast | Inferred |

### 1b. `tests/integration/agent-studio/**` (4 files — Observed)

| File | Lines | What it proves | Path | Layer | In CI? | Cost |
|---|---:|---|---|---|---|---|
| approval-gate.integration.test.ts | 484 | Approval gate against live ASDB | approval gate | Integration | **No** (excluded outside `TEST_MODE=staging-integration`; not run by run-tests.yml) | DB-dep |
| kb-router.integration.test.ts | 459 | KB router against live ASDB | KB | Integration | No | DB-dep |
| sync-tool-knowledge.integration.test.ts | 192 | Tool-knowledge sync against live DB | MCP dispatcher | Integration | No | DB-dep |
| trace-writer.integration.test.ts | 228 | Trace writer against live ASDB | tool-call/RAC trace | Integration | No | DB-dep |

### 1c. Colocated `server/agent-studio/**/*.test.ts` (22 files, ~8,761 lines — Observed)

| File | Lines | What it proves | Path | In CI? |
|---|---:|---|---|---|
| services/mcp/__tests__/dispatcher.test.ts | 616 | `dispatchMcpToolCall` end-to-end (parse, sanitize, dispatch) | MCP dispatcher | No |
| services/mcp/__tests__/lifecycle.test.ts | 317 | MCP server lifecycle | MCP dispatcher | No |
| services/mcp/__tests__/registry.test.ts | 343 | MCP registry surface | MCP dispatcher | No |
| services/mcp/__tests__/state-machine.test.ts | 457 | MCP state machine | MCP dispatcher | No |
| services/cag/cag-builder.test.ts | 385 | CAG builder | CAG | No |
| services/cag/cag-store.test.ts | 514 | CAG persistence | CAG | No |
| services/runtime/system-prompt-composer.test.ts | 440 | System prompt composer | chat-stream | No |
| services/chat-binding.test.ts | 470 | Chat binding tool-loop | chat-stream + tool-call | **Yes (Layer 5)** |
| workspace-default-bindings.test.ts | 401 | Default workspace binding | provider boundary | **Yes (Layer 5)** |
| services/provider-config-guard.test.ts | 94 | Provider config guard | provider boundary | No |
| services/provider-use-governance.test.ts | 236 | Provider use governance | provider boundary | No |
| services/governance-adapter.test.ts | 197 | Governance adapter | governance | No |
| services/test-run-binding.test.ts | 257 | Test-run binding lane | test-run-binding | No |
| services/rac-readiness.test.ts | 202 | RAC readiness checks | RAC | No |
| services/readiness.test.ts | 143 | Readiness aggregator | other | No |
| services/catalog-sync-subscribers.test.ts | 290 | Catalog sync subscribers | catalog | No |
| services/export-catalog.test.ts | 823 | Catalog export | catalog | No |
| services/export-eligibility.test.ts | 247 | Export eligibility | catalog | No |
| bindings.test.ts / bindings-policy.test.ts | 681 | Bindings policy | provider boundary | No |
| publish-no-catalog-write.test.ts | 128 | Phase 36 invariant | catalog | No |
| shared/export-candidate.test.ts | 157 | Export candidate | catalog | No |

### 1d. Adjacent (non-`agent-studio/` but Phase-2-relevant) — Observed

| File | Lines | Path | In CI? |
|---|---:|---|---|
| `tests/integration/chat/stream.test.ts` | 205 | chat-stream (SSE) | **No** (TEST_MODE-gated; not in any run-tests.yml step) |
| `server/chat/chat.test.ts` | 63 | chat router stub | No |
| `server/openrouter/model-access/execute.test.ts` | 510 | Model Access execute + validateBinding + tool-call schema | Model Access | No |
| `server/openrouter/model-access/embed.test.ts` | 417 | Model Access embed | **Yes (Layer 5)** |
| `server/openrouter/model-access/run-via-openllm-bridge.test.ts` | 499 | Model Access OpenLLM bridge | **Yes (Layer 5)** |
| `server/openrouter/manifest-receipt-policy.test.ts` | 388 | Manifest + receipt policy | **Yes (Layer 5)** |
| `tests/check-provider-credential-resolver-boundary.test.ts` | 87 | D2 boundary script | provider boundary | No (script itself runs as a step) |
| `tests/check-provider-key-env-boundary.test.ts` | 135 | D1 boundary script | provider boundary | No (script itself runs as a step) |
| `tests/pmb/{boundary,wiring,runtime-coverage}.test.ts` | — | Plan v3 invariants | RAC + provider | **Yes (Layer 7)** |

---

## 2. CI coverage matrix (`.github/workflows/`)

| Workflow / Job | What runs | Suite / glob | Cost | OOM-safe | Required for merge | Notes |
|---|---|---|---|---|---|---|
| **run-tests.yml — Layer 1** | Contract tests | `tests/contracts/` | fast | default pool | Yes (PR + push to main) | Domain/Catalog/Runtime contracts |
| **run-tests.yml — Layer 2** | Governance tests | `tests/governance/` | fast | default pool | Yes | Policy blocking, audit |
| **run-tests.yml — Layer 3a** | Scenario integration | `tests/integration/ai-types/` | medium-DB | default pool | Yes | `TEST_MODE=staging-integration` |
| **run-tests.yml — Layer 3b** | DB integrity | `tests/integration/runtime-db/` | medium-DB | default pool | Yes | Same TEST_MODE |
| **run-tests.yml — Layer 4** | UI selectors | `tests/ui/` | fast | default pool | Yes | |
| **run-tests.yml — Layer 5** | Curated PMB unit | `workspace-default-bindings`, `chat-binding`, `embeddings/service`, `operators/provider-hub`, `manifest-receipt-policy`, `run-via-openllm-bridge`, `embed`, `pricing` | fast | **`--pool=forks --poolOptions.forks.singleFork`** | Yes | Picks 8 files; OpenRouter Model Access boundary represented |
| **run-tests.yml — Layer 6** | **Retrofit acceptance** | `tests/agent-studio/retrofit-acceptance.test.ts` | fast | **singleFork** | Yes | **Confirmed wired** (V1 audit suspicion was wrong) |
| **run-tests.yml — Layer 7** | PMB invariant suites | `tests/pmb/` | fast | **singleFork** | Yes | Static source-string scans |
| **run-tests.yml — Static governance scan** | `scripts/governance/check-invariants.ts` | — | fast | n/a | Yes | |
| **run-tests.yml — D1/D2 boundary scripts** | provider env-key + credential-resolver scans | — | fast | n/a | Yes | |
| **ci.yml** | tsc only (tests commented out as "require PG+OPA") | — | medium | n/a | Yes | Redundant with build.yml type-check; tests not run here |
| **build.yml** | tsc + vite/esbuild build | — | slow (build) | 4 GB heap | Yes | Tests commented out |
| **enforcement-validation.yml** | 8-probe governance harness | scripts/governance-validation | fast | n/a | Yes | Behavioral, not test-suite |
| **governance-gate.yml** (474 lines) | Governance pipeline | n/a | medium | n/a | Yes (Inferred) | Out-of-scope for runtime hardening |
| **governance-validation.yml** | AJV schema validation, Template/Shell only | — | fast | n/a | path-filtered | Not runtime-relevant |

**Top-line CI finding:** `run-tests.yml` Layer 6 **already runs `retrofit-acceptance.test.ts` on every PR** with the singleFork OOM-safe pool. The V1 audit's suspicion that retrofit acceptance was outside default CI is **falsified** as of the file at HEAD. None of the other 83 `tests/agent-studio/*.test.ts` files run in default CI — they are reachable only by manual `workflow_dispatch` with a `test_path` input.

---

## 3. Gap analysis (Phase-2 categories)

| Category | Status | Existing tests | Gap |
|---|---|---|---|
| Retrofit acceptance suite | **Covered + in CI** | `tests/agent-studio/retrofit-acceptance.test.ts` (Layer 6) | None |
| Chat-stream contract (SSE event matrix, persistence, error paths) | **Covered, not in CI** (partial) | `tests/integration/chat/stream.test.ts` (DB-gated; not run); `chat-resume-helper-coverage.test.ts`, `h6/h7/h8`, `services/chat-binding.test.ts` (chat-binding **is** in Layer 5) | No PR-required SSE event matrix test. Need a pure-surface SSE emitter test that doesn't require Postgres. **Net gap: SSE event-shape contract.** |
| MCP dispatcher boundary | **Covered, not in CI** | `services/mcp/__tests__/dispatcher.test.ts` (616 lines), plus 8 `dispatcher-*.test.ts` + `sandbox-gate.test.ts` + `risk-classifier-layering.test.ts` | Strong unit coverage exists; none in default CI. Add to Layer 5 or new Layer 8. |
| ProposedToolCall validation | **Covered, not in CI** | `proposed-tool-call.test.ts` (8-gate), runtime, runtime-gate, runtime-trace (4 files, 1,227 lines) — **plus** retrofit-acceptance §D-PTC-2 already in CI | Retrofit acceptance covers the 8-gate lattice today. Standalone unit files would tighten failure-locality but are not strictly missing. |
| Approval gate state machine | **Covered, not in CI** | `approval-gate.test.ts`, `approval-gate-draft-hash-unique`, `approval-decide-concurrent`, `approval-event-bus`, `approval-expiry-sweep`, `approval-list-projection`, `approval-resume-loop`, `tool-approvals-decide-authz`, `legacy-decide-removed` (9 files, ~1,568 lines) — retrofit-acceptance §D-APP-EXT-2 covers the lattice in CI | Lattice covered in CI via retrofit acceptance; granular state-machine tests not in CI. |
| Permission default behavior (no rules → today's behavior) | **Inferred missing or weakly covered** | No file matches the name. Likely partially exercised by `governed-procedure-coverage.test.ts` (363 lines) and `kb-router-governance.test.ts` (65 lines). | **Net gap: explicit "no rules → permitted" or "no rules → fail-closed" assertion test.** This is the highest-value Phase-2 add. |
| OpenRouter Model Access boundary (no raw SDK) | **Covered + in CI** | Layer 5 runs `manifest-receipt-policy`, `run-via-openllm-bridge`, `embed`. Plus D1/D2 boundary scan scripts run as separate CI steps. `execute.test.ts` (510 lines) is **not** in Layer 5 and could be added. | Mostly covered; gap = `execute.test.ts` not in default CI. |
| RAC/CAG trace contract | **Covered, not in CI** (except via retrofit-acceptance) | `runtime-trace-writer.test.ts`, `rac-trace.test.ts`, `trace-writer-patch-race.test.ts`, `trace-audit-asymmetry-doc.test.ts`, `trace-timeout-reason-decl.test.ts`, `m6-c8-trace-fire-and-forget-doc.test.ts`, `cag-compile-metadata.test.ts`, `cag-boundaries.test.ts` | Retrofit acceptance covers compile-metadata + 8-mode + trace-validator-rejection; granular trace contracts not in CI. |
| Provider credential boundary | **Covered + in CI** | D1 + D2 scripts run in run-tests.yml as named steps. `tests/check-provider-{credential-resolver,key-env}-boundary.test.ts` (test-the-test) plus Layer 7 `tests/pmb/boundary.test.ts` cover it. | None |

---

## 4. Test classification recommendation (Phase 2 input)

### PR-required (recommend adding to default CI, fast, deterministic, no DB)
1. `tests/agent-studio/proposed-tool-call.test.ts` — failure locality on PTC gates
2. `tests/agent-studio/approval-gate.test.ts` — lattice + TTL math
3. `tests/agent-studio/sandbox-gate.test.ts` — node:vm sandbox safety (timeout, deny-global, frozen-intrinsic, UNAVAILABLE)
4. `tests/agent-studio/dispatcher-tool-call-timeout.test.ts` — 60 s ceiling sentinel
5. `tests/agent-studio/dispatcher-error-sanitization.test.ts` + `sanitize-mcp-error-message.test.ts` — error scrubbing
6. `tests/agent-studio/dispatcher-output-schema-validation.test.ts` — MCP output schema
7. `tests/agent-studio/dispatcher-sandbox-error-mapping.test.ts` — sandbox error classes
8. `tests/agent-studio/runtime-trace-writer.test.ts` + `rac-trace.test.ts` — trace-row builders (pure-functional)
9. `tests/agent-studio/cag-boundaries.test.ts` — CAG goldens + boundary script
10. `tests/agent-studio/canonical-determinism.test.ts` — canonical serializer
11. `tests/agent-studio/h6-c7-client-awaiting-handler.test.ts` + `h7-c7-loop-reentrancy-guard.test.ts` — chat-stream tool-loop guards
12. `server/agent-studio/services/mcp/__tests__/dispatcher.test.ts` — full MCP dispatcher unit suite (already mocked, no DB)
13. `server/openrouter/model-access/execute.test.ts` — completes Model Access boundary coverage
14. **NEW (to author)** — Permission default behavior test (`tests/agent-studio/permission-default.test.ts`) — this is the only Phase-2 category without an existing file

### Nightly (slower or DB-dependent)
- All four `tests/integration/agent-studio/*.integration.test.ts`
- `tests/integration/chat/stream.test.ts`
- `tests/integration/runtime/*.test.ts`
- `server/agent-studio/services/cag/cag-store.test.ts` (514 lines, likely DB-touching — Inferred)
- `server/agent-studio/services/test-run-binding.test.ts`
- `server/agent-studio/services/export-catalog.test.ts` (823 lines)

### Manual / on-demand
- Parser-suite tests for media (audio, video, ocr-pdf, ocr) — already ship via retrofit acceptance §D-UI-5; granular tests are regression-only
- Cross-flow/doc-bundle lockstep tests (`c2/c6/c7/c8-doc-bundle*`, `cross-flow-c7-h5-m4-m5`, `pr-a-c8-orchestrator-typing-warnings`) — these are static lockstep guards added by the cycle-5/6/7/8 retrofit; useful on-demand but low PR ROI

### Obsolete / candidates for review
- `tests/agent-studio/legacy-decide-removed.test.ts` — single-use static check; keep but on-demand
- `tests/agent-studio/m6-c7-runtime-run-id-approval-doc.test.ts`, `trace-audit-asymmetry-doc.test.ts`, `boot-ordering-doc.test.ts`, `trace-timeout-reason-decl.test.ts`, `c2-c7-message-trace-asymmetry-doc.test.ts` — all are doc-block lockstep tests written for one-shot ADR enforcement. Not obsolete, but PR-required only if their referenced docs are touched (could move to a `paths`-filtered nightly).

---

## 5. Cost note

**Estimated PR-required additions (items 1–14 above):**
- ~14 files, ~3,800 lines combined.
- Pure-surface (no DB, no network); each file ~0.3–1.5 s on a warm vitest with the existing 30 s testTimeout.
- **Estimated added wall time: 8–15 s** when run in a single batch with `--pool=forks --poolOptions.forks.singleFork` (already the project standard per CLAUDE.md).
- Layer 6 (retrofit acceptance, 1016 lines) currently runs in ~4–6 s per the cycle-5/6/7/8 closure-report norms — the proposed Layer 8 doubles that workload at most.

**OOM-safe execution flags:**
- All recommended PR-required additions **must** run with `--pool=forks --poolOptions.forks.singleFork` per the standing OOM-safe pattern. The Layer 5/6/7 jobs already use this; reuse the same flag for any new layer.
- `server/agent-studio/services/mcp/__tests__/dispatcher.test.ts` (616 lines) and `tests/agent-studio/proposed-tool-call.test.ts` (455 lines) are the largest by-line; **flagged** for singleFork — they import the dispatcher + sandbox transitively, which can spawn worker isolates if forked.
- `server/agent-studio/services/cag/cag-store.test.ts` and `services/export-catalog.test.ts` are DB-likely (Inferred) and **must not** be promoted to PR-required without a DB service container — defer to nightly.

**Highest-leverage Phase-2 deliverable:** a single new CI layer ("Layer 8 — Runtime Hardening Safety Subset") wiring items 1–14 with singleFork, plus authoring the missing **permission-default** test. That closes Gate 2 with minimal new authorship — the surface area is mostly already-written tests that just don't run on PRs today.

---

## Key findings (TL;DR)

- **Retrofit acceptance is in default CI today** (`run-tests.yml` Layer 6, line 134). The V1 audit's hypothesis is falsified; this is the high-value confirmation.
- **84 tests under `tests/agent-studio/` exist; only 1 runs on PR** (retrofit acceptance). The other 83 collectively cover every Phase-2 category — the gap is wiring, not authorship.
- **One genuine authorship gap:** no test file explicitly proves "no permission rules → default behavior." Every other Phase-2 category has at least one existing file.
- **OpenRouter Model Access boundary is partially in CI** (Layer 5: 3 of 4 files). Adding `execute.test.ts` to Layer 5 closes it.
- **Provider credential boundary is fully in CI** (D1 + D2 scripts as named steps; `tests/pmb/boundary.test.ts` in Layer 7).
- **Integration tests under `tests/integration/agent-studio/**` are TEST_MODE-gated and never run by default** — they should remain nightly until DB service infra is provisioned for the agent-studio paths.
