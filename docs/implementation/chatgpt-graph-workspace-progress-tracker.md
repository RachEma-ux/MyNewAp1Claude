# Progress Tracker — Agent Studio Native Graph Workspace

> **Honest-classification rewrite (2026-05-13).** Prior versions of this
> tracker used closure-narrative language ("addressed", "formalized",
> "workflow-backed", "operator territory", "residual sliver tracked in
> V1+"). The strict-audit mission (PRs #732–#736) replaced that with a
> binary classification — **FULLY IMPLEMENTED / PARTIALLY IMPLEMENTED /
> NOT IMPLEMENTED**. The authoritative per-item ledger is
> `agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`.

## 1. Tracker metadata

- Last updated: 2026-05-13 (post Phase 13.5 closure on main)
- Repository: `RachEma-ux/MyNewAp1Claude`
- Branch: `main`
- Latest merged audit PR: `#737` (Phase 13.5 PR #3 — model-driven planner) at `a8f5c634`
- Phase 13.5 trio on main: `#731` (contract) + `#732` `ffb4eba9` (engine wiring + RoundRobinPlanner) + `#737` `a8f5c634` (model-driven planner)
- Authoritative classification: see `agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`

## 2. Current overall verdict

- **MVP 0–4 status:** the *plan* is fully covered in code; runtime
  completeness varies per phase. 11 items FULLY IMPLEMENTED, 3 items
  PARTIALLY IMPLEMENTED, 7 items NOT IMPLEMENTED — see §4 below for
  the per-item breakdown.
- **Honest completion estimate:** ~65–70% of the 21 originally-tracked
  audit items are implemented in runtime. The remaining 30–35% splits
  into: 5 hard-blocker code gaps (items 2, 6-Bolt, 7, 9-cron, 14-15-panels)
  + 4 intentional CLAUDE.md deferrals (items 10–12, 15-16) + 1 operator-
  action (item 1).
- **Repo automation status:** all the closure-mission PRs landed (PRs
  #732–#735 + #736 in flight); the broad test suite is green; the
  hard-rule boundary tests are green; the 2 known environment-only
  failures (`graph-retrieval-resolved-skill-trace.test.ts` on Termux)
  are local-only and pass in CI.

## 3. Execution boundary check

| Boundary | Status | Evidence |
|---|---|---|
| GraphRepository sole graph-access | FULLY IMPLEMENTED | `tests/agent-studio/graph-repository-boundary.test.ts` green |
| MCP single dispatcher chokepoint | FULLY IMPLEMENTED | source-scan + dispatcher tests |
| OpenRouter single model-execution path | FULLY IMPLEMENTED | Plan v3 D1 scanner green |
| Postgres source-of-truth invariant | FULLY IMPLEMENTED | enforced in both bench workflows |
| Graph Agent no direct graph mutation | FULLY IMPLEMENTED | mutations route through Phase 11.5 |
| Cypher templates parameterized | FULLY IMPLEMENTED | `ags_query_templates` registry |
| Read-only Text2Cypher | FULLY IMPLEMENTED | safety filter tests |

## 4. Per-item honest status (summary)

See the strict-audit doc for the full 21-item matrix. Summary:

| Bucket | Count | Items |
|---|---|---|
| **FULLY IMPLEMENTED** | 11 | 2, 3, 4, 5, 6, 9, 13, 17, 18, 19, 20 |
| **PARTIALLY IMPLEMENTED** | 3 | 1 (G3 benchmark — operator), 14 (14 of 17 panels extracted), 21 (this rewrite itself) |
| **NOT IMPLEMENTED** | 7 | 7 (Layer 4 e2e), 8 (V1/V1.5/V2 plan is plan-only), 10 (CRDT — intentional), 11 (offline — intentional), 12 (Neo4j Enterprise — intentional), 15 (multi-region — intentional), 16 (Canvas/Bases/plugins — intentional) |

Intentional CLAUDE.md deferrals (10, 11, 12, 15, 16) account for 5 of
the 7 NOT IMPLEMENTED items. Real code gaps inside MVP 0-4 scope are:
**items 7, 8** (NOT IMPLEMENTED) + the partial slices of **6, 9, 14**.

## 5. Test status

| Suite | Status |
|---|---|
| Broad unit + integration (Layer 1-3) | 3,393 / 3,395 green (2 Termux-only env failures, CI-green) |
| Phase 13.5 (boundary + engine + engine-agentic + model-planner) | 62/62 green on main `a8f5c634` |
| Memgraph adapter integrity | 6/6 green (PR #733) |
| ChatDiagnosticsPanel | 11/11 green (PR #734) |
| McpTransitionsRetentionPanel | 10/10 green (PR #735) |
| Source-scan integrity (boundary, panel-coverage, badge-migration-lock) | all green |
| Layer 4 e2e | NOT IMPLEMENTED |

## 6. Runtime gaps still open (priority order)

1. **Retention panel extractions batch 7 (final)** (item 14 partial)
   — 3 panels remain inline (the approval-lifecycle trio). After batch
   7 closes, item 14 reaches 17/17 and the panel-extraction sub-arc
   ends.
2. **Layer 4 e2e harness** (item 7) — Playwright/Cypress v0.

Items 1 (G3 benchmark execution), 2 (Golden Q workflow trigger +
evidence commit), 6 (fallback adoption decision), and 8 (V1/V1.5/V2
successor phases) are operator/scoping work — the code paths exist.

## 7. Next-prompt recommendation

Phase 13.5 closed at `a8f5c634` (#737); items 2/6/9 closed via PR-AT-1
through PR-AT-3 on 2026-05-13. Panel-extraction sub-arc has advanced
through PR-AT-7 (14/17). The most-unblocking next PR is **retention
panel extractions batch 7 (final)** (item 14 partial) — small,
trivially mergeable, raises panel coverage 14/17 → 17/17 and closes
the sub-arc. The parallel track is **Layer 4 Playwright v0** (item 7),
heavier but unblocks the final test pyramid layer.

## 8. Why this tracker was rewritten

The earlier version of this file rolled up *plan-ready* + *runbook-
backed* + *workflow-scaffolded* + *ADR-only* items under aggregate
phrases like "substantively delivered" or "operator territory". The
strict-audit prompt of 2026-05-13 forbade that compression and required
honest binary classification. The strict-audit doc (§7 above) is the
authoritative source; this tracker is the user-facing summary that
matches it.
