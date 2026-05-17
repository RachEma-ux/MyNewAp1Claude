# Self-correction loop closure — items 38–44 (2026-05-17)

> Item 44 closure document. Tracks the full self-correction loop
> from quality signal → applied + reversible mutation → audit. Each
> step links to the code / test / evidence that demonstrates it.

## 1. Loop overview

```
┌─────────────────────────┐    ┌─────────────────────────┐
│ Quality / golden-       │    │ Semantic enrichment     │
│ question signal         │    │ scanner                 │
└───────────┬─────────────┘    └───────────┬─────────────┘
            │                              │
            ▼                              ▼
┌────────────────────────────────────────────────┐
│ Failure event recorded                         │
└───────────────────────┬────────────────────────┘
                        ▼
┌────────────────────────────────────────────────┐
│ submitCorrectionProposal()                     │
│ (lifecycle.ts) → status: pending               │
└───────────────────────┬────────────────────────┘
                        ▼
┌────────────────────────────────────────────────┐
│ Human / governance review                      │
│ approve  → status: approved                    │
│ reject   → status: rejected (audit, NO mut)   │
└───────────────────────┬────────────────────────┘
                        ▼ (approved only)
┌────────────────────────────────────────────────┐
│ applyApprovedProposal() →                      │
│ RepositoryBackedApplierRegistry →              │
│ GraphRepository.enqueueProjectionJob()         │
└───────────────────────┬────────────────────────┘
                        ▼
┌────────────────────────────────────────────────┐
│ Postgres SoT updated; Neo4j reprojection       │
│ runs via worker; projection audit row written  │
└───────────────────────┬────────────────────────┘
                        ▼ (if wrong)
┌────────────────────────────────────────────────┐
│ createRollbackProposal() → submits             │
│ rollback_<originalKind> proposal pending       │
│ approval (audit-linked via rollbackOf marker)  │
└────────────────────────────────────────────────┘
```

## 2. Step-by-step evidence ledger

| # | Step | Status | Code / Test / Evidence |
|---|---|---|---|
| 1 | Quality / golden-question signal generation | **FULLY IMPLEMENTED** | Scanners: `server/agent-studio/services/graph-quality/scan-orchestrator.ts` + 6 detector files (duplicate-entity, dangling-edge-endpoint, excessive-fanout, etc.). Golden-question: `server/agent-studio/services/graph-skill/golden-questions/live-evaluator.ts`. Tests: `graph-quality-{scanner}*.test.ts` (multiple). |
| 2 | Failure event recorded | **FULLY IMPLEMENTED** | `recordFailureStateEvent()` in `server/agent-studio/services/failure-states/observability-bridge.ts`; 25-value closed-taxonomy via `FAILURE_STATES`. T-D.5 bridge (`failure-correction-bridge.ts`) wires golden-question failures here. |
| 3 | Correction proposal creation | **FULLY IMPLEMENTED** | `submitCorrectionProposal()` in `server/agent-studio/services/graph-correction/lifecycle.ts`. Quality findings: `finding-to-proposal.ts`. Golden-question failures: `failure-correction-bridge.ts` (PR #1395 T-D.5) — `emitGoldenQuestionFailureProposal`, fail-soft on writer errors. Tests: `graph-correction-lifecycle.test.ts`, `td-5-golden-question-failure-correction.test.ts` (21 tests). |
| 4 | Human / governance approval | **FULLY IMPLEMENTED** | `approveCorrectionProposal()` / `rejectCorrectionProposal()` / `withdrawCorrectionProposal()` / `bulkApprove*` / `bulkReject*` — all in `lifecycle.ts`. `approveAndApplyProposal()` in `graph-quality/approve-and-apply.ts` is the one-shot variant. Audit events via `listAuditEvents`. Tests: `graph-correction-lifecycle.test.ts`, `graph-quality-approve-and-apply.test.ts` (7 tests). |
| 5 | Approved correction → mutation | **FULLY IMPLEMENTED** (NEW in this PR) | `createRepositoryBackedApplierRegistry()` in `server/agent-studio/services/graph-quality/repository-backed-applier.ts`. Replaces the prior stub appliers with real `repository.enqueueProjectionJob()` calls for `archive_node` / `merge_into_canonical` / `re_promote_with_source_version`. `manual_review` remains no-op-by-design. Test: `item-41-42-*.test.ts` §1 (5 tests). |
| 6 | Neo4j reprojection | **FULLY IMPLEMENTED** | `enqueueProjectionJob` on `Neo4jCommunityGraphRepository` (PR #1397 P0 closure) writes to `ags_graph_projection_sync_jobs`; the projection worker drains and reprojects. The applier (step 5) is the upstream gateway that calls into it. Tests: `graph-repository-boundary.test.ts`, `p0-neo4j-traversal-permission-explain.test.ts` (47 P0 cases). |
| 7 | Rollback path | **FULLY IMPLEMENTED** (NEW in this PR) | `createRollbackProposal()` in `server/agent-studio/services/graph-correction/rollback.ts`. Closed-taxonomy reversal derivation (3 kinds: archive_node→restore_node, merge_into_canonical→unmerge_duplicate, re_promote_with_source_version→unpin_source_version). Rollback proposal goes through normal approve flow — NO direct mutation. `rollbackOf: originalId` marker preserves audit linkage. Test: `item-41-42-*.test.ts` §3–§4 (11 tests). |
| 8 | Audit path | **FULLY IMPLEMENTED** | Per-decision rows in `ags_graph_correction_proposal_decisions` (lifecycle.ts writes them). Per-event rows in `ags_graph_correction_proposal_audit_events` (`listAuditEvents`). Retention via `graph-correction-proposals-retention.ts` (+ cron + router). Tests: `graph-correction-lifecycle.test.ts`, `graph-correction-proposals-retention*.test.ts` (3 files). |
| 9 | Evidence + tests per step | **FULLY IMPLEMENTED** | See per-row cells above. Combined test surface for items 38–44: **79 tests across 5 suites green** (`item-41-42-*` 18 + `graph-correction-lifecycle` 26 + `graph-quality-approve-and-apply` 7 + `td-5-golden-question-failure-correction` 21 + `graph-change-proposal-lifecycle` 7) via `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork`. |

## 3. Per-item honest classification

| # | Item | Status |
|---|---|---|
| 38 | Golden-question execution evidence | **FULLY IMPLEMENTED** at script + workflow level (`scripts/agent-studio/run-golden-questions.ts` + `.github/workflows/graph-golden-questions-live.yml` dry-run mode); **BLOCKED BY MISSING CREDENTIALS / INFRA** for the live execution evidence file. Operator-runnable via workflow_dispatch. |
| 39 | Failure → correction proposal merged | **FULLY IMPLEMENTED** (PR #1395 T-D.5; `failure-correction-bridge.ts` + 21 tests covering passed-no-proposal / failed-creates-proposal / writer-error-fail-soft) |
| 40 | Correction proposal approval / rejection evidence | **FULLY IMPLEMENTED** (`lifecycle.ts` approve/reject/audit + `approve-and-apply.ts` one-shot; 26 + 7 tests covering all 4 status transitions + audit row creation + no-mutation-on-rejection) |
| 41 | Approved correction → Neo4j reprojection proof | **FULLY IMPLEMENTED** (NEW: `repository-backed-applier.ts` + 5 tests proving 3 real applier kinds call `enqueueProjectionJob` with the correct payload, `manual_review` stays no-op, failures propagate); live evidence **BLOCKED BY MISSING CREDENTIALS / INFRA** — operator-runnable via existing `graph-p0-smoke-neo4j-ce.yml`. |
| 42 | Rollback proof | **FULLY IMPLEMENTED** (NEW: `rollback.ts` + 11 tests proving 3 reversal taxonomies + status guards + non-reversible-kind guard + duplicate-rollback guard + rollback-goes-through-approval) |
| 43 | Benchmark CI evidence | **FULLY IMPLEMENTED** at workflow level — 6 workflows on main: `graph-bench-neo4j-ce.yml`, `graph-bench-memgraph-fallback.yml`, `graph-p0-smoke-neo4j-ce.yml`, `graph-golden-questions-live.yml`, `graph-agent-reasoning-bench.yml` (PR #1400), `code-graph-spike-measurement.yml`. Operator-runnable via `workflow_dispatch`. Deterministic bench evidence committed at `docs/evidence/graph-backend/2026-05-17-graph-agent-reasoning-bench/report.md`. Live-Neo4j bench artifact **BLOCKED BY MISSING CREDENTIALS / INFRA**. |
| 44 | Self-correction loop closure doc | **FULLY IMPLEMENTED** (this file) |

## 4. Loop invariants preserved

The closure prompt's 10 non-negotiable rules are all held:

| Rule | How |
|---|---|
| Golden-question failures create proposals, NOT direct mutations | `failure-correction-bridge.ts` calls `submitCorrectionProposal()`; never calls repository mutation methods. Engine doesn't either — boundary tests pin this. |
| Semantic enrichment creates proposals, NOT direct mutations | `semantic-enrichment-agent.ts` writes to `ags_semantic_enrichment_proposals`; no graph mutation. |
| Human/governance approval required before mutation | `applyApprovedProposal()` refuses non-approved status (`ProposalNotApprovedError`); rollback proposal also requires approval. |
| Approved correction updates Postgres SoT first | Projection job carries the SoT-update payload; worker writes ASDB row before reprojecting Neo4j. |
| Neo4j update is projection/reprojection only | Applier calls `enqueueProjectionJob`, not direct write. Only the worker (which the applier doesn't bypass) performs Neo4j writes through `GraphRepository`. |
| Rejected proposals don't mutate | Lifecycle's `rejectCorrectionProposal()` writes a decision row + audit event; never calls applier. `applyApprovedProposal()` refuses non-approved (test-covered). |
| Rollback is auditable | `rollbackOf: originalId` marker in `proposedChange`; rollback proposal has its own audit trail; original's audit trail unchanged. |
| All state transitions evidenced | Per-decision rows + per-event audit rows + retention cron. |
| Don't mark "closed" based on table existence alone | Each row above cites code + tests + (where possible) evidence files. |
| Don't mark "closed" on workflow-only readiness | Workflows that haven't run live are classified **BLOCKED BY MISSING CREDENTIALS / INFRA**, not FULLY IMPLEMENTED for live evidence. |

## 5. Remaining blockers

- **Live golden-question evidence file (item 38 live variant)** — BLOCKED BY MISSING CREDENTIALS / INFRA. Operator-runnable via `graph-golden-questions-live.yml`.
- **Live Neo4j reprojection round-trip evidence (item 41 live variant)** — BLOCKED BY MISSING CREDENTIALS / INFRA. The applier's contract is proven; live Cypher round-trip requires a credentialed CE container (operator-runnable via `graph-p0-smoke-neo4j-ce.yml`).
- **Live benchmark CI artifact (item 43 live variant)** — BLOCKED BY MISSING CREDENTIALS / INFRA. Deterministic graph-agent-reasoning-bench evidence ships now; Neo4j-bench live artifact awaits operator dispatch.

No code-level blockers in items 38–44 scope remain.

## 6. Files touched (this PR)

- NEW `server/agent-studio/services/graph-quality/repository-backed-applier.ts`
- NEW `server/agent-studio/services/graph-correction/rollback.ts`
- NEW `tests/agent-studio/item-41-42-repository-backed-applier-and-rollback.test.ts` (18 tests / 5 sections)
- NEW `docs/evidence/agent-studio-self-correction-loop-closure-2026-05-17.md` (this file)
- Modified `server/agent-studio/services/graph-quality/public-api.ts` (export new applier factory)
- Modified `server/agent-studio/services/graph-correction/public-api.ts` (export rollback service)
- Modified `docs/implementation/chatgpt-graph-workspace-progress-tracker.md` (§13 added)
