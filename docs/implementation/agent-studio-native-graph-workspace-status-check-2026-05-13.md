# Agent Studio Native Graph Workspace — Execution Plan Status Check

**Date:** 2026-05-13
**Session:** post-retention-arc + integrity-test hardening session (19 PRs, #704–#722) + formal closure addendum
**main @** `44fa76ec` at the snapshot; closure addendum lands on top

**Plan source:** `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md` (398 lines) + the 28-phase roadmap at `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` + the 2026-05-10 continuation-state snapshot at `docs/implementation/agent-studio-native-graph-workspace-continuation-state.md`.

**Classification vocabulary (used consistently throughout this doc):**

- **Implemented** — code shipped + behavior covered by tests.
- **Executed** — operator-side action performed; evidence archived.
- **Formalized** — operator runbook with explicit pass/fail criteria + (where applicable) CI-safe static integrity tests in repo; live execution pending.
- **Deferred by plan, not failed** — explicitly out of MVP 0–4 per the execution plan; tracked for V1+ or successor phases.
- **Blocked** — named hard blocker (environment, credential, permission); flagged and waiting.

---

## MVP-level status

| MVP | Plan scope | Status today |
| --- | --- | --- |
| **MVP 0** — Reconciliation + ADRs + benchmark spike | Phase 0, 0.5, 1.1–1.7, decision gates G1/G2/G3 | **Implemented** — ~28 ADRs shipped; GraphRepository skeleton + capability registry + TestGraphRepository + boundary tests in place; 5 leftover Drizzle tables (graph-promotion / skill / agent / rag / quality) **all shipped** since the continuation-state was written. Benchmark harness runner + CLI present at `scripts/graph-bench/`. Operator-side benchmark execution **Formalized** (see runbook ↓). |
| **MVP 1** — Vault foundation | Phases 2–6 (vault core, editor, properties, wikilinks, search) | **Implemented** — `server/agent-studio/services/vault/` exists with `manifest`, `public-api`, `repository-asdb`, `router`, `contracts`, `links.ts`, `attachments.ts`, `markdown-import-export.ts`, `saved-views.ts`. Frontend pages routed via `AgentStudioShell` lazy imports. |
| **MVP 2** — Neo4j CE typed graph | Phases 7, 7.5, 8, 9 + G4–G6 | **Implemented** — `Neo4jCommunityGraphRepository` exists, graph table set (19 tables in `agent-studio-graph.ts`), projection sync set (10 tables in `agent-studio-graph-projection.ts`). `graph-permission-visibility-property.test.ts` lands the Phase 21 property-based visibility test family. |
| **MVP 3** — Promotion + runtime trace | Phases 10, 11, 11.5, 14 + G7 | **Implemented** — `services/promotion/` has `manifest` / `lifecycle` / `router` / `adapter-asdb`. **This session's PR #710 fixed a latent mount bug here** (promotionRouter was unmounted since PR #408). Phase 11.5 graph-change-proposals service exists. Phase 14 runtime trace graph: workspace-observability tables + retention crons live. |
| **MVP 4** — GraphRAG + Graph Agent Lite | Phases 12, 12.5, 13, 13.5, 14, 20–23 + G8/G9/G10 | **Implemented** — `services/graph/retrieval/` has retrieval-router, safety-filter, text2cypher-validator. `services/graph-skill/` has `eligibility`, `runtime-usage`, `seed-cypher-templates`, `seed-default-packs`, `seed-golden-questions`, `template-execution-gate`. `services/graph-agent/` has `engine`, `contracts`, `decision-trace-writer`, `explain-reader`, `projection-cag-block-expander`. UI: `GraphAgentExplainPanel`, `GraphSkillUsagePanel`, `GraphWorkspacePage` all present + tested. Golden-questions evaluation **Formalized** (runbook + static integrity tests, see ↓). |

---

## Where this session sat within the plan

This session's 19 PRs (#704–#722) + closure addendum landed primarily in:

| Plan area | Session contribution |
| --- | --- |
| **Phase 22 retention / feedback infrastructure** | The full retention surface (18 daily-sweep crons + workspace-observability bundle) is the implementation of Phase 22's retention requirements. This session shipped 4 source-scan integrity layers (ladder, mounts, boot wiring, UI panels) defending it. |
| **Phase 11 promotion governance** | **Latent bug fix at PR #710** — `promotionRouter` had been declared but never mounted on `agentStudioRouter` since PR #408 (~5 months). The MVP 3 promotion-router consumers from RetrofitPage (`trpc.agentStudio.promotion.*`) had been failing at runtime. Fix mounted the router + added a mount-integrity test. |
| **Phase 21 testing infra** | Added `graph-permission-visibility-property.test.ts`-style **source-scan integrity tests** (#706, #709–#715, #718, #720, #721) — a complementary defensive layer to the Phase 21 property-based tests. |
| **Universal client→server mount parity** | PR #714 added a repo-wide test enforcing the invariant across all 15 `MODULE_ROUTERS` — defends the entire tRPC surface, not just graph-workspace. |
| **Operator surface refactors** | `EligibilityExplainer` (#708) + `CronStatusPanel` (#722) extracted to standalone components with focused tests. These were part of the `RetrofitPage` operator dashboard ancillary to MVP 3 promotion + MVP 4 graph-quality surfaces. |
| **Closure addendum (this doc)** | Neo4j CE benchmark runbook + golden-questions evaluation runbook + 10-test golden-questions static integrity suite. Closes the two remaining operator-validation gaps as Formalized. |

---

## Hard rules from the plan (CLAUDE.md "Native Graph Workspace — Non-Build List") — compliance check

| Hard rule | Compliance this session |
| --- | --- |
| Graph access through `GraphRepository` only; no `neo4j-driver` imports outside repository / KGIA | ✅ Not touched |
| Postgres = source of truth; Neo4j CE = projected backend | ✅ Not touched |
| Graph Agent Lite must not mutate graph facts directly; mutations through Phase 11.5 | ✅ Not touched |
| Cypher templates parameterized; no raw query strings outside `ags_query_templates` | ✅ Not touched |
| Read-only Text2Cypher; mutations forbidden | ✅ Not touched |
| MCP dispatcher single chokepoint; Graph Agent must route through it | ✅ Not touched |
| OpenRouter single model-execution path; Graph Agent must use approved path | ✅ Not touched |

---

## Decision gates (per execution plan §3)

| Gate | Status |
| --- | --- |
| **G1** Reconciliation Closed (Phase 0) | **Implemented** — Closed pre-session |
| **G2** Architecture Frozen (Phase 1.1–1.3) | **Implemented** — Closed pre-session |
| **G3** Backend Decision (Phase 1.5) | **Formalized; operator execution pending** — Neo4j CE is the architecture-driven default; live benchmark runbook lands at `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md` with explicit pre-flight, fixture, execution, pass/fail, archival, and rollback steps. Live execution requires Docker + Neo4j CE deploy + 10k-row fixture (not available on the day-to-day device environment). |
| **G4** Ontology Locked (Phase 1.6) | **Implemented** — Closed |
| **G5** Projection Sync Ready (Phase 1.7 + 7.5) | **Implemented** — Closed |
| **G6** Active Backend Live (Phase 7.5) | **Implemented** — Closed |
| **G7** Promotion Governance Live (Phase 11) | **Implemented** — Closed — **and the latent mount bug in this surface was fixed at PR #710 this session** |
| **G8** GraphRAG Permissions Verified (Phase 12) | **Implemented** — Closed |
| **G9** Graph Agent Boundary Verified (Phase 13) | **Implemented** — Closed |
| **G10** MVP-4 Closure (Phase 13 + 14 + 20–23) | **Implemented** + **Formalized** — code complete; golden-questions evaluation framework formalized via `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md` plus a 10-test static integrity suite at `tests/agent-studio/graph-skill/golden-questions/seed-integrity.test.ts`. Live evaluation is operator territory. |

---

## Known gaps vs the plan

1. **Golden-questions live evaluation** — **Formalized**. Static integrity test (10 cases, green) ships in CI; live evaluation runs operator-side per `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md`. No code/test gap remaining in repo.
2. **G3 operator-side benchmark execution** — **Formalized**. Runbook at `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md` defines prerequisites, fixture, execution, pass/fail, archival, and rollback. The harness exists at `scripts/graph-bench/`. Execution is operator territory; closure flips G3 to "Closed (validated)" via the runbook's §7 archival step.
3. **Phase 11b-3 (Runtime UI surfaces)** — **Deferred by plan, not failed**. Phase 14 + Phase 24 lens work supersedes; confirmed still deferred in `docs/implementation/runtime-hardening-v3-phase-11b-3-deferral.md`.
4. **V1 / V1.5 / V2 scope** — **Deferred by plan, not failed**. Explicitly out of MVP 0–4 scope per execution plan §13.5 ("Phase 13.5 deferred to V1"); tracked for the post-MVP planning cycle. Not a closure gap.

---

## This session's PR ledger

| PR | Type | Summary |
| --- | --- | --- |
| #704 | doc | SOU memo post-closure addendum (approval-lifecycle deferral resolution) |
| #705 | test | 3 per-cron tests for publish-requests / approval-steps / note-promotions (36 cases) |
| #706 | test | Ladder slot-uniqueness integrity (6 cases) |
| #707 | doc | Track 1+2 spec status → SHIPPED |
| #708 | refactor | `EligibilityExplainer` extract + 7 component tests |
| #709 | test | publishRouter 10-procedure mount integrity (11 cases) |
| **#710** | **fix** | **Mount `promotionRouter` on `agentStudioRouter` (latent bug since PR #408) + 10-case test** |
| #711 | test | Agent-studio client→server mount parity (3 cases) |
| #712 | test | Harden mount-parity regex (false-positive fix) |
| #713 | test | `boot.ts` `ensure*Started` wiring integrity (20 cases) |
| #714 | test | All-15-modules client→server mount parity (31 cases) |
| #715 | test | RetrofitPage UI panel coverage (20 cases) |
| #716 | refactor | `CronStatusBadge` extract (7 tests) + 3-panel migration |
| #717 | refactor | Migrate remaining 14 panels to `CronStatusBadge` |
| #718 | refactor | Final 2-panel migration + 4-case regression lock |
| #719 | refactor | `formatRelative` helper extract + 9 boundary tests |
| #720 | test | `listActiveHolds` fail-soft contract (8 cases) |
| #721 | test | Terminal-state set membership locks (12 cases) |
| #722 | refactor | `CronStatusPanel` extract + 10 component tests |
| **closure addendum** | **doc + test** | **Neo4j CE benchmark runbook + golden-questions runbook + 10-case golden-questions seed-integrity test + this status doc + mandatory continuing rule memory** |

**Totals (this session, pre-closure):** 19 PRs, ~220 new test cases, 1 latent bug fix, 3 doc refreshes, 4 auto-memory entries. RetrofitPage shrank from 5384 → 5118 lines via 4 UI extractions. All CI-green at merge.

**Closure addendum adds:** 2 runbooks, 1 test file (10 cases, green), 1 status doc, 1 mandatory standing memory rule.

---

## Bottom line

The Native Graph Workspace plan is **MVP 0 through MVP 4 substantively delivered** (G1–G10). G1, G2, G4–G9 are **Implemented**. G3 and G10's evaluation surface are now **Formalized** (runbooks + static integrity tests in repo); live execution is operator territory. Phase 11b-3 and V1 / V1.5 / V2 scope are **Deferred by plan, not failed** — both are explicitly out of MVP 0–4 scope and tracked for successor planning cycles.

This session sat squarely **inside** the plan's territory — Phase 11 promotion governance (where it fixed a real latent bug), Phase 22 retention / observability (where it added 4 cross-cutting integrity layers), and the closure addendum (where it formalized the two remaining operator-validation surfaces). No hard-rule violations. No phase-0 boundaries crossed.

---

## Session deferred items (operator-environment-specific, non-blocking)

1. **Local Postgres seed for `pnpm run test:integration:staging`** — Termux `u0_a296` role mismatch. Workaround at `~/.claude/projects/-root/memory/reference_local_asdb_role_mismatch.md`. **Deferred by environment, not by plan.**
2. **Remaining retention-panel extractions** — 16 panels still inline in `RetrofitPage.tsx` (lines 1590–5305). Pattern established by #708 and #722; mechanical work; user can direct one-at-a-time if desired. **Optional refactor, not a plan requirement.**

---

## Reference docs

- `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md` — the plan
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` — the 28-phase roadmap
- `docs/implementation/agent-studio-native-graph-workspace-continuation-state.md` — 2026-05-10 snapshot
- `docs/architecture/agent-studio-native-graph-workspace.md` — top-level overview
- `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md` — G3 operator runbook (closure addendum)
- `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md` — G10 evaluation runbook (closure addendum)
- `tests/agent-studio/graph-skill/golden-questions/seed-integrity.test.ts` — golden-questions CI static integrity suite (closure addendum)
- `CLAUDE.md` — Non-Build List section
- `~/.claude/projects/-root/memory/feedback_native_graph_workspace_continuing_rule.md` — mandatory standing rule (closure addendum)
- `~/.claude/projects/-root/memory/project_phase_22_retention_arcs.md` — retention arc ledger (updated through #722)
- `~/.claude/projects/-root/memory/project_approval_lifecycle_retention_complete.md` — approval-lifecycle ledger
- `~/.claude/projects/-root/memory/reference_source_scan_integrity_test_pattern.md` — the source-scan integrity test pattern established this session
- `~/.claude/projects/-root/memory/reference_tsconfig_excludes_hide_trpc_mount_drift.md` — the diagnostic shape behind PR #710's bug fix
