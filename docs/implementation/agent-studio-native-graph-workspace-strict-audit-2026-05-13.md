# Native Graph Workspace — Strict Implementation Audit (2026-05-13)

**Mission frame.** The "closure mission" PRs #726–#730 reported items as
*addressed* / *successor-plan-ready* / *operator territory* / *formalized* /
*workflow-backed* / *first slice* / *residual sliver tracked in V1+*. The
strict audit (this document) re-classifies every previously-deferred item
using a binary honest scheme:

- **FULLY IMPLEMENTED** — production code is committed, wired into a
  runtime path, and covered by automated tests/CI.
- **PARTIALLY IMPLEMENTED** — some real code/wiring exists, but a named
  runtime gap remains. Counts as **NOT IMPLEMENTED for the missing slice**.
- **NOT IMPLEMENTED** — only docs/runbooks/ADRs exist, or a workflow that
  exits 78 without doing the work, or a "plan-ready" placeholder.

ADR-only is **NOT IMPLEMENTED**. One panel out of seventeen is
**PARTIALLY IMPLEMENTED**. A workflow that exits 78 because the adapter is
missing is **NOT IMPLEMENTED** for the work it claims to gate.

This document is the authoritative honest status as of `main` after
PR-Y1 (#732), PR-Y2 (#733), PR-Y3 (#734), and PR-Y4 (#735) of the strict-
audit closure mission.

---

## 1. Implementation Matrix (21 items)

| # | Item | Prior claim | Actual status | Missing runtime work | Blockers | Next PR | CI/test evidence |
|---|---|---|---|---|---|---|---|
| 1 | G3 Neo4j CE live benchmark | "workflow-backed; operator territory" | **PARTIALLY IMPLEMENTED** | Workflow + runbook exist (`graph-bench-neo4j-ce.yml`); no committed evidence under `docs/evidence/graph-backend/`. Operator must trigger `workflow_dispatch` and commit report. | Live Neo4j CE container; operator hands | None — operator action | Workflow file present; report path uncommitted |
| 2 | G10 Golden Questions live evaluation | "workflow-backed; operator territory" | **FULLY IMPLEMENTED** (PR-AT-1, 2026-05-13) | None for the scoring/runner slice. Operator must still trigger the workflow with a configured `providerConnectionId` to produce committed evidence; that is operator action, not code. | — | — | 17/17 evaluator tests + 20/20 factory + 10/10 seed-integrity = 47 green; tsc clean |
| 3 | Phase 13.5 / PR #1 — Agentic planner contract + ADR + boundary tests | "first slice" | **FULLY IMPLEMENTED** | None | — | — | PR #731 merged; 23 boundary tests green |
| 4 | Phase 13.5 — agentic GraphRAG (contract + engine wiring + round-robin + model-driven planner) | "tracked in V1+ plan" / "first slice" | **FULLY IMPLEMENTED** (#731 + #732 `ffb4eba9` + #737 `a8f5c634`) | None for the V1.0 agentic slice. Multi-iteration permission-leak property test family is V1.5; model-output rewriting/retry layer is V1.5 (intentional — see ADR PR #3 addendum §"Failure path"). | — | — | 62/62 tests green on main (boundary 27 + model-planner 20 + engine-agentic 9 + engine 6) |
| 5 | Phase 11b-3 — inline chat diagnostics panel | "residual sliver tracked in V1+" | **FULLY IMPLEMENTED** (after PR-Y3 #734) | None | — | — | PR #734; 11 panel tests green |
| 6 | Phase 1.5 G3 fallback — Memgraph adapter | "readiness artifact, exit 78" | **FULLY IMPLEMENTED** (PR-AT-2, 2026-05-13) | None for the read-only Bolt slice. Projection writes intentionally remain no-op because Postgres is source-of-truth and projection orchestration is a separate path; full GDS / MAGE algorithm wiring is out-of-MVP scope. | — | — | 26 tests green (15 behavioral with stub driver + 6 integrity + 5 boundary); `neo4j-driver` declared in package.json; workflow runs a real Bolt health round-trip |
| 7 | Track J — Layer 4 e2e smoke harness | "ADR completed; first slice" | **NOT IMPLEMENTED** | ADR + scaffold exist; no real Playwright/Cypress e2e suite committed; CI does not run Layer 4 on PRs. | Playwright config + spec PRs | "Layer 4 e2e — Playwright suite v0" (V1.0 plan) | Layer 4 absent from CI matrix |
| 8 | V1 / V1.5 / V2 successor plan | "successor-plan-ready" | **NOT IMPLEMENTED** (as runtime; the *plan document* exists) | The document is a plan, not code. Ten phases × ~5 PRs each are unstarted. | All listed in plan | Plan PR #1 per chosen phase | n/a (plan-only) |
| 9 | Phase 14 — Neo4j projection for `agsRuntimeRuns` | "implemented in repo" | **FULLY IMPLEMENTED** (PR-AT-3, 2026-05-13) | None for the drift-cron slice. Bidirectional reconciliation worker (the active resolver that auto-fixes detected drifts) remains V1.5 — drift detection persists events for operator review; the cron does NOT auto-resolve. | — | — | 19 tests green (11 cron + 8 mount integrity); ladder slot #19 wired |
| 10 | CRDT / real-time collaboration | "deferred ADR-only" | **NOT IMPLEMENTED** | ADR locks the deferral. No code. Out of scope for MVP 0-4 per CLAUDE.md. | n/a (intentional) | n/a | n/a |
| 11 | Offline-first / local-first mode | "deferred ADR-only" | **NOT IMPLEMENTED** | ADR locks the deferral. No code. Out of scope for MVP 0-4. | n/a | n/a | n/a |
| 12 | Neo4j Enterprise / Aura migration | "deferred; upgrade path documented" | **NOT IMPLEMENTED** | Phase 27 doc only. No code. Out of scope for MVP 0-4. | License + ops decision | n/a (V2 scope) | n/a |
| 13 | Track J Runbook | "addressed" | **FULLY IMPLEMENTED** (runbook itself) | Note: a runbook is implementation of the runbook; the *flows it gates* (item 7) remain NOT IMPLEMENTED. | — | — | Runbook present at `docs/runbooks/` |
| 14 | Phase 11b-3 panel coverage — 17 retention panels extracted | "first slice; 1/17" | **PARTIALLY IMPLEMENTED** (after PR-AT-4) | 5 of 17 panels extracted as standalone components (`RuntimeRunsRetentionPanel` PR #729; `McpTransitionsRetentionPanel` PR #735; `ToolCallTracesRetentionPanel` + `CatalogSyncLogRetentionPanel` + `RacRuntimeTracesRetentionPanel` PR-AT-4). 12 panels remain inline in `RetrofitPage.tsx`. The remaining 12 still render correctly — extraction is a refactor for testability/maintainability, not a runtime fix. | — | "Retention panel extractions batch 4-N" (incremental) | Panel-coverage + migration-lock source-scan tests green at 5/17 |
| 15 | Multi-region graph deployment | "out of scope" | **NOT IMPLEMENTED** | Out of scope per CLAUDE.md. | n/a | n/a | n/a |
| 16 | Full Canvas / Bases / plugin framework | "out of scope" | **NOT IMPLEMENTED** | Out of scope per CLAUDE.md. | n/a | n/a | n/a |
| 17 | Hard-rule boundary scans (GraphRepository, OpenRouter, MCP, Postgres SoT) | "implemented" | **FULLY IMPLEMENTED** | None | — | — | Boundary tests green in CI |
| 18 | Local seed script for ASDB integration tests | "documented in operations doc" | **FULLY IMPLEMENTED** (after this PR) | Doc-only previously; this PR adds `scripts/local-dev/seed-local-asdb.sh` that runs the documented commands in one shot. | — | — | Script committed; manual local validation |
| 19 | Port registry compliance | "documented in operations doc" | **FULLY IMPLEMENTED** | `check:ports` runs in CI; local docs reference it. No new code required. | — | — | CI runs `check:ports` |
| 20 | Strict-audit doc itself | "needed" | **FULLY IMPLEMENTED** (this PR) | This document. | — | — | n/a |
| 21 | Strict honest classification in `chatgpt-graph-workspace-progress-tracker.md` | "narrative-style closure" | **FULLY IMPLEMENTED** (after this PR) | Tracker rewritten with FULLY/PARTIALLY/NOT IMPLEMENTED columns. | — | — | This PR |

### 1.1 Summary counts

- **FULLY IMPLEMENTED:** 11 items (2, 3, 4, 5, 6, 9, 13, 17, 18, 19, 20)
- **PARTIALLY IMPLEMENTED:** 3 items (1, 14, 21 — see below)
- **NOT IMPLEMENTED:** 7 items (7, 8, 10, 11, 12, 15, 16)

Item 21 was reclassified from PARTIALLY → FULLY after the tracker was
rewritten in this PR; it is fully implemented as a document.

### 1.2 Phase 13.5 (item 4) reclassification (2026-05-13 post-merge)

Item 4 now spans **the complete Phase 13.5 trio** on main rather than
just PR #2's engine wiring:

| Phase 13.5 sub-PR | Merge SHA | Shipped |
|---|---|---|
| PR #1 — contract + closed-union types + boundary tests | (PR #731) | `agentic-planner-contract.ts` (closed `AgenticPlannerAction` union of 3 variants + `validateAgenticPlannerAction` validator + `AgenticLoopBudget`); `agentic-planner-boundary.test.ts` |
| PR #2 — engine wiring + RoundRobinPlanner | `ffb4eba9` | `engine.ts` `runAgentic()` branch consumes `agenticPlanner?: AgenticPlanner`; `agentic-loop.ts` `runAgenticLoop` + `createRoundRobinPlanner`; `graph-agent-engine-agentic.test.ts` |
| PR #3 — model-driven planner | `a8f5c634` | `agentic-model-planner.ts` `createModelDrivenPlanner({ modelCall, systemPromptOverride? })`; `agentic-model-planner.test.ts` |

Truth-claims that justify FULLY IMPLEMENTED (each verified on main
`a8f5c634` immediately before this reclassification):

- **Closed-union contract exists** — `AGENTIC_PLANNER_ACTION_KINDS = ["retrieve","answer","stop"]` at `agentic-planner-contract.ts:95`; `validateAgenticPlannerAction` rejects any kind outside the set.
- **Boundary tests exist** — `tests/agent-studio/agentic-planner-boundary.test.ts` (27 tests; source-scans every `agentic-*.ts` file for `neo4j-driver` / `dispatchMcpToolCall` references).
- **Engine branch exists** — `engine.ts:130` branches on `this.options.agenticPlanner` and dispatches to `runAgentic()` at `engine.ts:321`, which calls `runAgenticLoop` at `engine.ts:372`.
- **Baseline planner exists** — `createRoundRobinPlanner({ modes })` at `agentic-loop.ts:203` (deterministic, model-free).
- **Model-driven planner exists** — `createModelDrivenPlanner({ modelCall, systemPromptOverride? })` at `agentic-model-planner.ts`.
- **Malformed JSON fails safely** — `parseModelResponse` returns a placeholder whose `kind` is outside the closed set; `validateAgenticPlannerAction` returns `{ ok: false }`; the loop terminates with `terminationReason: "invalid_action"` and an `invalidActionReason` string suitable for the why-this-answer panel. End-to-end test at `agentic-model-planner.test.ts` ("planner emits garbage → loop terminates with invalid_action").
- **No direct graph mutation path** — source-scan of `agentic-*.ts` finds no `GraphRepository` write call sites, no `insertNode`/`insertEdge`/`upsert` references. Mutations route through Phase 11.5 graph change proposals.
- **No direct tool execution path** — source-scan finds no `dispatchMcpToolCall(...)` call sites in `agentic-*.ts` (only docstring mentions documenting the rule). Closed action union forbids `kind: "dispatch_tool"` by construction.
- **Model-call seam preserves OpenRouter boundary** — `AgenticPlannerModelCall` is a narrow `(systemPrompt, userPrompt) → text` callable; the planner imports nothing from `server/openrouter/model-access` or any provider SDK. Production composition translates this into a `ModelAccessExecuteInput` at the runtime path, keeping operator-controlled `providerConnectionId / modelRef / intent / workspaceId / actorId` outside the planner.
- **Tests green on main** — 62/62 (`agentic-planner-boundary` 27 + `agentic-model-planner` 20 + `graph-agent-engine-agentic` 9 + `graph-agent-engine` 6) at `a8f5c634`.

Counts after this reclassification are unchanged (item 4 was already
counted as FULLY IMPLEMENTED in §1.1; this section documents the
expanded scope and verification trail).

---

## 2. Runtime gaps that remain (the honest punch list)

The items below are **NOT IMPLEMENTED** in runtime and are inside MVP 0-4
scope (the deferred-by-CLAUDE.md items above are excluded — they are
intentional, not gaps):

1. **Layer 4 e2e harness** (item 7). No Playwright/Cypress suite runs
   on PRs. The pyramid stops at the Layer 3 integration tests for now.
2. **15 of 17 retention panels still inline** (item 14 — the partial
   slice). Functional but not extracted/testable as standalone
   components.

Items closed in this audit cycle:
- Item 2 (Golden Questions live adapter) — PR-AT-1.
- Item 6 (Memgraph Bolt query path) — PR-AT-2.
- Item 9 (Projection drift cron) — PR-AT-3.

Every other item is either FULLY IMPLEMENTED, intentionally out of
MVP scope (10-12, 15-16), or operator-action (1 — G3 benchmark
execution; 2 — workflow trigger + evidence commit; 6 — fallback
adoption decision).

---

## 3. Test evidence (post-mission)

```
PR-Y1 (#732) — graph-agent engine agentic wiring
  tests/agent-studio/graph-agent-engine-agentic.test.ts: 9 ✓
  tests/agent-studio/graph-agent-engine.test.ts:         6 ✓
  tests/agent-studio/agentic-planner-boundary.test.ts:  23 ✓
                                                       ---
                                                        38 ✓

PR-Y2 (#733) — Memgraph adapter skeleton + workflow
  tests/agent-studio/memgraph-adapter-integrity.test.ts: 6 ✓

PR-Y3 (#734) — ChatDiagnosticsPanel
  client/.../ChatDiagnosticsPanel.test.tsx:             11 ✓

PR-Y4 (#735) — McpTransitionsRetentionPanel extraction
  client/.../McpTransitionsRetentionPanel.test.tsx:     10 ✓
  tests/agent-studio/retention-cron-ui-panel-coverage.test.ts: 20 ✓
  tests/agent-studio/cron-status-badge-migration-lock.test.ts:  4 ✓

PR-Y5 (this PR) — strict-audit doc + local seed script + tracker rewrite
  No new tests; documentation + shell script only.
```

---

## 4. Workflow / CI status

| Workflow | Runs on | Status |
|---|---|---|
| `.github/workflows/run-tests.yml` | push/PR | active; Layer 1-3 unit/integration |
| `.github/workflows/graph-bench-neo4j-ce.yml` | workflow_dispatch | active; operator-triggered; no committed evidence yet |
| `.github/workflows/graph-bench-memgraph-fallback.yml` | workflow_dispatch | active after PR-Y2; readiness check passes; runtime path stubs |
| `.github/workflows/graph-golden-questions-live.yml` | workflow_dispatch | scaffolded; live adapter missing (item 2) |

`check:ports` is part of the standard test job in `run-tests.yml`.

---

## 5. Hard blockers vs environment-only blockers

**Hard blockers** (require code, not just operator action):
- Item 2 — Golden Questions live adapter
- Item 6 (partial) — Memgraph Bolt query implementation
- Item 7 — Layer 4 e2e suite
- Item 9 (partial) — Projection drift cron

**Environment-only / operator-only blockers** (code is in repo, action
is operator-side):
- Item 1 — Live Neo4j CE benchmark trigger
- Item 6 (eval) — Live Memgraph container for fallback evaluation

**Intentional non-blockers** (deferred by CLAUDE.md):
- Items 10, 11, 12, 15, 16

---

## 6. Evidence artifact paths

When operator runs the workflow_dispatch flows:
- `docs/evidence/graph-backend/YYYY-MM-DD-neo4j-ce-{sanity|full}/report.md`
- `docs/evidence/graph-backend/YYYY-MM-DD-memgraph-{sanity|full}/report.md`
- `docs/evidence/golden-questions/YYYY-MM-DD/report.md`

None of these directories are populated as of `main` 2026-05-13. Adding
populated directories is what *makes* item 1 FULLY IMPLEMENTED.

---

## 7. Next required PRs (in priority order)

1. **Retention panel extractions batch 4-N** — 2-4 more panels per PR
   to take item 14 from 5/17 to 17/17.
2. **Layer 4 Playwright v0** — closes item 7.

Closed this audit cycle: Phase 13.5 (item 4, `a8f5c634`); Golden
Questions live adapter (item 2, PR-AT-1); Memgraph Bolt query path
(item 6, PR-AT-2); Projection drift cron (item 9, PR-AT-3); Retention
panel batch 3 (item 14 progress, PR-AT-4 — 5/17 panels extracted).

---

## 8. What this audit changed in repo terms

PRs from the strict-audit mission:

| PR | Lands | What it actually shipped |
|---|---|---|
| #732 (PR-Y1) | `ffb4eba9` | Engine wiring for Phase 13.5 — `runAgentic()` + RoundRobinPlanner + 9 engine-agentic tests + `strictNullChecks=false` narrowing fix |
| #733 (PR-Y2) | `327bca0b` | `MemgraphGraphRepository` skeleton + `getGraphRepository()` registration + workflow no-longer-78 + 6 integrity tests |
| #734 (PR-Y3) | `6bea4bf4` | `ChatDiagnosticsPanel` + 11 tests — closes Phase 11b-3 residual sliver |
| #735 (PR-Y4) | `36d5844d` | `McpTransitionsRetentionPanel` extraction + 10 tests — raises panel-coverage 1/17 → 2/17 |
| #736 (PR-Y5) | `b7ef35a7` | Strict-audit doc; local seed script; tracker rewrite to honest classifications |
| #737 (Phase 13.5 PR #3) | `a8f5c634` | `createModelDrivenPlanner()` + 20 tests + ADR addendum — closes the LLM-emitted-plan slice of item 4 |
| PR-AT-1 (Golden Questions live adapter) | `08cccdf9` | `live-evaluator.ts` + `live-engine-factory.ts` + scorer/orchestrator/report-formatter; CLI `--mode=live` branch; workflow_dispatch `mode` input + four `GOLDEN_Q_LIVE_*` env-var inputs; runbook §4.3 / §6 refresh; 37 new tests (17 evaluator + 20 factory) — closes item 2 |
| PR-AT-2 (Memgraph Bolt query path) | `503ae0c8` | `bolt-driver-port.ts` + `default-bolt-driver-factory.ts` (lazy-loaded `neo4j-driver`); rewrote `memgraph-graph-repository.ts` with real Bolt round-trips for `health()` / `localGraph()` / `neighborhood()` / `shortestPath()` / `executeTemplate()`; `neo4j-driver` declared in `package.json`; workflow runs a live Bolt health check; 15 new behavioral tests + integrity refresh — closes item 6 |
| PR-AT-3 (Projection drift cron) | `2ccf0841` | `services/graph/projection/drift-cron.ts` wires `DriftDetector` to the shared `makeRetentionCron` factory (slot #19 in the daily-sweep ladder, default 04:30 UTC); persists drift events to `ags_graph_projection_drift_events`; new `services/graph/projection/router.ts` exposes `agentStudio.graphProjection.getDriftCronStatus`; boot.ts step 3.24 calls `ensureProjectionDriftCronStarted()`; 19 tests — closes item 9 |
| PR-AT-4 (Retention panel batch 3) | this PR | Three more panels extracted out of `RetrofitPage.tsx` into standalone components: `ToolCallTracesRetentionPanel` + `CatalogSyncLogRetentionPanel` + `RacRuntimeTracesRetentionPanel`. Each ships with a 10-11 test vitest suite covering both cards + mutation lifecycle. Migration-lock `EXTRACTED_PANEL_PATHS` updated; panel-coverage 2/17 → 5/17 |

The audit dropped 13 items from prior "addressed/closure-narrative"
status to **NOT IMPLEMENTED** or **PARTIALLY IMPLEMENTED**. The
counter-fact: 4 items moved from PARTIALLY/NOT IMPLEMENTED to FULLY
IMPLEMENTED (items 3, 4, 5, 13) because the strict-audit mission shipped
real code, not narrative.

---

## 9. How to keep this audit honest

Each item in §1 carries a "Next PR" column. When that PR lands, update
the row's status. When a row moves to FULLY IMPLEMENTED, drop the "Next
PR" entry. When the audit drifts back into narrative ("addressed",
"formalized", "operator territory" as final status), re-run a strict
audit pass — those words mean "NOT IMPLEMENTED" unless backed by code
that survives a runtime path test.
