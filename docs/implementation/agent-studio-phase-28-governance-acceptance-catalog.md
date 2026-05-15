# Phase 28 — Governance, Evaluation, Hardening Acceptance Catalog

**Track:** T-I cross-cutting (interleaved with T-D..T-G).
**Roadmap:** §"Phase 28 — Governance, Evaluation, Hardening".
**Status:** Catalog snapshot 2026-05-15 mapping roadmap acceptance criteria + CI blockers onto current code state. **22/30 acceptance criteria met; 8 remain — all tracked under remaining-plan T-D..T-G.**

This document mirrors `agent-studio-phase-21-continuous-graph-testing-catalog.md` for Phase 28. Where Phase 21 maps catalog tests, this maps catalog acceptance criteria + CI blockers.

---

## 1. Acceptance criteria status

| # | Criterion | Status | Closure track |
|---|---|---|---|
| 1 | All core tests pass | ✅ Met (CI green) | n/a |
| 2 | GraphRepository boundary is enforced | ✅ Met (boundary tests + T-C.1 #985 hard-rule integrity mortgage) | n/a |
| 3 | Neo4j CE backend decision is documented | ✅ Met (Phase 1.5 closure ADR) | n/a |
| 4 | Postgres/Neo4j responsibility split is enforced | ✅ Met (ADR + boundary tests) | n/a |
| 5 | Graph projections are correct | ✅ Met (projection-sync tests) | n/a |
| 6 | Projection sync is auditable | ✅ Met (drift-cron audit events + PR-AT-3) | n/a |
| 7 | Ontology constraints are enforced | ✅ Met (ontology registry tests) | n/a |
| 8 | Entity resolution works | ✅ Met (entity-resolution-*.test.ts) | n/a |
| 9 | Provenance is recorded | ✅ Met (T-D.1 #986 scanner catches violations) | n/a |
| 10 | Permission enforcement works | ✅ Met (graph-permission-visibility-property.test.ts) | n/a |
| 11 | Promotion governance works | ✅ Met (PMB Plan v3 closure) | n/a |
| 12 | CAG note references are version-pinned | ✅ Met (Phase 10 closure) | n/a |
| 13 | Graph Skill note references are version-pinned | ✅ Met (Phase 12.5 closure) | n/a |
| 14 | Promotion rollback works | ✅ Met (Phase 11 closure) | n/a |
| 15 | Graph correction proposals are governed | ✅ Met (Phase 23 lifecycle + ApprovalSteps gate adapter #776) | n/a |
| 16 | Semantic enrichment proposals are governed | ⚠️ Partial — Semantic Enrichment Agent runtime is plan-only (T-D.3 stub in remaining plan) | T-D.3 |
| 17 | Concurrent edit detection works | ✅ Met (Phase 2.5 closure) | n/a |
| 18 | Soft editing locks work | ✅ Met (Phase 2.5 closure) | n/a |
| 19 | MCP boundary remains intact | ✅ Met (boundary tests + CLAUDE.md hard rule) | n/a |
| 20 | Graph Agent boundary remains intact | ✅ Met (Phase 13.5 closure + #731/#732/#737) | n/a |
| 21 | Runtime trace graph is auditable | ✅ Met (agsRuntimeRuns + graphAgentDecisionTrace) | n/a |
| 22 | Decision trace graph is auditable | ✅ Met (Phase 13.5 closure) | n/a |
| 23 | Retention policy works | ✅ Met (17 retention panels per PR-AT-8) | n/a |
| 24 | Query cache respects permissions | ✅ Met (graph-query-cache tests) | n/a |
| 25 | Context safety filter works | ✅ Met (context-safety-filter tests) | n/a |
| 26 | User feedback states work | ✅ Met (workspace-observability retention + 14 panels) | n/a |
| 27 | Golden question suite runs | ✅ Met (PR-AT-1 closure) | n/a |
| 28 | Performance benchmarks are reported | ⚠️ Partial — workflow_dispatch ready; baseline evidence is operator-action (strict-audit item 1 PARTIALLY) | n/a (operator) |
| 29 | Neo4j Enterprise/Aura upgrade path is documented | ✅ Met (Phase 27 ADR + runbook) | n/a |
| 30 | Documentation complete | ⚠️ Partial — Phase 21 catalog (#999) + this Phase 28 catalog (#1000) close two big gaps; **Phase 22 emission audit shipped @ #1012** (closes a third); Phase 23 user-facing docs still light | T-I.4 (#1012 partial closure) |

**Summary: 27/30 ✅, 3 partial — all with named closure paths.**

---

## 2. CI blocker status

The roadmap §Phase 28 enumerates 29 CI blockers — situations that MUST prevent a build from going green. Existing source-scan tests + boundary tests cover most.

| # | CI Blocker | Defended? | Where |
|---|---|---|---|
| 1 | Note without permission context accepted | ✅ | `tests/agent-studio/vault-permission-*.test.ts` |
| 2 | Knowledge Unit promotion without source note version | ✅ | Promotion governance gate (#776) |
| 3 | CAG promotion without governance validation | ✅ | Phase 10 closure |
| 4 | Graph Skill promotion without governance validation | ✅ | Phase 12.5 closure |
| 5 | CAG block reference to mutable note instead of note version | ✅ | Source-scan test |
| 6 | Graph Skill reference to mutable note instead of note version | ✅ | Source-scan test |
| 7 | Tool Knowledge promotion without schema compatibility | ⚠️ Partial | Schema-compat test exists; not blocker-gated yet |
| 8 | Raw artifact injected into runtime prompt | ✅ | `tests/agent-studio/raw-artifact-injection-blocked.test.ts` |
| 9 | Unauthorized graph node visible | ✅ | Property-based visibility (rule 1) |
| 10 | Unauthorized graph edge visible | ✅ | Property-based visibility (rule 1) |
| 11 | Hidden node leaked by edge or count | ✅ | Property-based visibility (rules 1–3) |
| 12 | Graph query cache serves unauthorized data | ⚠️ Partial — cache test exists; property-based rule #5 (cache) is documented gap in Phase 21 catalog | T-I.3 |
| 13 | Neo4j query bypasses GraphRepository | ✅ | `tests/agent-studio/graph-repository-boundary.test.ts` |
| 14 | Graph backend bypasses GraphRepository | ✅ | Same as #13 |
| 15 | Text2Cypher executes mutation | ✅ | `tests/agent-studio/text2cypher-mutation-blocked.test.ts` |
| 16 | Cypher query template bypasses permission filter | ✅ | Cypher template guardrails |
| 17 | Graph Agent bypasses MCP dispatcher | ✅ | `graph-agent-boundaries.test.ts` |
| 18 | Graph Agent mutates graph facts directly | ✅ | Boundary tests + CLAUDE.md hard rule + #985 mortgage |
| 19 | Approval bypass | ✅ | Approval scaffolding tests |
| 20 | Silent overwrite on concurrent edit | ✅ | Optimistic-lock tests |
| 21 | Performance target violation without explicit waiver | ⚠️ Partial — workflow exists; baseline + waiver process is operator territory | n/a (operator) |
| 22 | Migration projects records incorrectly | ✅ | Migration audit tests |
| 23 | Entity merge loses provenance | ✅ | T-D.1 #986 + entity-resolution tests |
| 24 | Unsafe auto-merge occurs | ✅ | Safe-merge policy tests |
| 25 | Graph correction applies without approval | ✅ | Phase 23 lifecycle + ApprovalSteps |
| 26 | Semantic enrichment applies without approval | ⚠️ Partial — Semantic Enrichment Agent runtime not shipped (plan-only); but the guard pattern is in place | T-D.3 |
| 27 | Neo4j projection mutates without source-of-truth update | ✅ | Postgres-SoT boundary + #985 mortgage |
| 28 | Projection drift ignored | ✅ | PR-AT-3 drift cron + writes audit events |
| 29 | Golden question regression without waiver | ⚠️ Partial — workflow exists; regression-vs-waiver gate is operator territory | n/a (operator) |

**Summary: 23/29 fully defended, 6 partial — all named.**

---

## 3. Performance SLO catalog (T-I.2 contribution)

The roadmap enumerates performance gates but doesn't pin a single SLO table. This section consolidates:

| Surface | Target | Workflow / test | Status |
|---|---|---|---|
| GraphRepository read (warm cache) | p95 < 50 ms | `graph-bench-neo4j-ce.yml` | Workflow ready; baseline pending operator-trigger |
| Projection sync tick | p95 < 500 ms per workspace | Drain status panel (#943) | Visible; threshold not enforced as a CI gate |
| Drift cron tick | p95 < 30 s for ~5k node scope | `projection-drift-cron.test.ts` | Tested; threshold not in CI |
| Golden question regression | ≥95% pass rate | `graph-golden-questions-live.yml` | Workflow ready; baseline pending operator-trigger |
| Lens snapshot build | p95 < 200 ms | T-F.7 future | Pending |
| Impact-analysis traversal | p95 < 500 ms at maxDepth=3 | T-F.7 future | Pending |
| Cypher query template execution | p95 < 100 ms | Existing query cache tests | Threshold not in CI |
| RAG retrieval planner | p95 < 100 ms | Existing RAG router tests | Threshold not in CI |

**Action recommended:** T-I.3 — wire the unenforced thresholds as soft CI gates (warn-not-fail) for ~2 weeks, then promote to hard gates after baseline stabilizes.

---

## 4. Forward work

| Track | Slice | Closes |
|---|---|---|
| T-D.3 (existing remaining-plan) | Semantic Enrichment Agent runtime | Acceptance #16, CI Blocker #26 |
| T-I.3 (new — this doc proposes) | Soft-CI SLO gates | Performance SLO catalog enforcement |
| ~~T-I.4 (new)~~ → **shipped @ #1012** | Phase 22 emission audit | Acceptance #30 (partial — Phase 22 half) |
| T-I.4.b (proposed) | Phase 23 user-facing docs (quality-agent runbook) | Acceptance #30 (final) |
| T-I.5 (in flight) | Failure-state emission bridge + per-emitter wirings | Acceptance #26 reinforcement; observability for kinds the audit named |

---

## 5. References

- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` §Phase 28
- Phase 21 catalog: `docs/implementation/agent-studio-phase-21-continuous-graph-testing-catalog.md`
- Phase 22 emission audit: `docs/implementation/agent-studio-phase-22-failure-state-emission-audit.md` (T-I.4 / #1012)
- Strict audit: `docs/implementation/agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`
- Remaining plan: `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md`
- CLAUDE.md hard rules + integrity mortgage (#985)

---

## 6. Phase 22 closed-taxonomy emission shipment (added 2026-05-15)

The Phase 22 failure-state taxonomy (`FAILURE_STATES`, 25 closed kinds, #1002) reached live multi-emitter status:

| Shipment | PR | Notes |
|---|---|---|
| Closed taxonomy contract | #1002 | 25 kinds + 5 categories + 3 severities + recoverable metadata |
| Emission audit (this doc references) | #1012 | Per-state map vs existing emitters; T-I.5 batch ordering |
| `recordFailureStateEvent` bridge | #1013 | `failure_state:<kind>` prefix; canonical metadata stamps LAST; severityOverride for SLO escalation |
| Wire health-alert scanner | #1014 | `neo4j_unavailable` + `neo4j_degraded` + latency-high (collapsed) |
| Wire projection drift cron | #1015 | `neo4j_projection_drift_detected` |
| Wire safety-filter | #1016 | `retrieval_safety_filter_blocked_content` (per-call, not per-block) |
| Wire MCP auto-sync | #1017 | `tool_schema_changed` (pure-function schema diff) |
| Wire text2cypher rejections | #1018 | `text2cypher_rejected` (closed reason enum) |
| Wire cypher template execution failures | #1019 | `cypher_query_template_failed` (no PII — `parameterKeys` only) |
| Bridge wiring coverage guard | #1020 | Lockstep on all 6 batch-A wirings |
| Phase 21 §7 ancillary coverage catalog | #1021 | Lockstep on 27 ancillary contract / validator / wiring tests |
| Phase 28 catalog §6 emission shipment | #1022 | This section; lockstep guard at `phase-28-catalog-emission-section-coverage.test.ts` |
| Wire graph-agent budget exhaustion | #1023 | `graph_agent_answer_incomplete` (first batch-B wiring); fires for `max_iterations` / `wall_clock_budget` only |
| Wire projection sync worker | #1025 | `projection_sync_failed` (second batch-B wiring); fires when apply step returns ≥1 error, including partial-success |
| Wire quality-agent duplicate-entity scan | #1026 | `entity_resolution_conflict` (third batch-B wiring); fires per-agent-run when duplicate_entity scanner emits ≥1 finding |
| Wire promotion lifecycle (submit + reject) | #1027 | `promotion_failed` (fourth batch-B wiring); fires on validation-rejected submit AND operator-initiated reject; `rejectionStage` metadata distinguishes the two paths |
| Bridge bulk-emission helper | #1029 | `recordFailureStateEvents` plural; shared `encodeForRecorder` between singular + plural; empty-batch short-circuit; per-input severityOverride preserved |
| Wire permission-denied references (dedicated emit) | #1030 | `runtime_reference_hidden_by_permission` (fifth batch-B wiring); SIBLING to existing `retrieval_safety_filter_blocked_content` for the permission-denied subset; metadata includes both `permissionDeniedCount` and `blockedCount` |

**11 of 25 closed kinds have live emitters today** (batch A: 6 + batch B: 5). The audit (#1012) names the remaining 14 with batch-B / detection-first / phase-gated tier assignments.
