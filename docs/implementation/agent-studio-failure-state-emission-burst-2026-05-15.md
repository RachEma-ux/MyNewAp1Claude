# Phase 22 emission burst — 2026-05-15 closure summary

**Status:** **31-PR continuation closed @ main `1acafbc0`**. The artifact landed in 4 self-update slices: #1037 (initial doc + lockstep) → #1038 (self-reference fix to reflect post-merge count) → #1040 (closure note, extended to 29 PRs after #1039 closed Phase 28 acceptance #30) → #1041 (this update reflecting Phase 22 acceptance checkbox flip + #1041 itself). Phase 22 closed-taxonomy emission surface is **live with 12 / 25 closed kinds emitting**; Phase 28 acceptance #30 ("Documentation complete") is **substantially closed @ #1039**; **Phase 22 roadmap acceptance checkboxes flipped @ #1041**.

This doc consolidates the 2026-05-15 emission burst (#1011 → #1039) into a single artifact so operators + future-Claude have one place to look. The audit doc (`agent-studio-phase-22-failure-state-emission-audit.md`) is the per-state map; this doc is the burst-level narrative.

---

## 1. Burst at a glance

| Metric | Before burst | After burst |
|---|---|---|
| Closed taxonomy kinds with live emitters | 0 | 12 of 25 (48%) |
| Quality scanners (Phase 23 detection) | 9 | 10 |
| CLAUDE.md hard rules locked by integrity mortgage | 13 | 30 |
| Ancillary contract / validator tests indexed in Phase 21 §7 | 0 | 31 |
| Phase 22 documentation artifacts | 0 | 4 (audit + bridge + dashboard queries + burst summary) |
| Phase 28 catalog sections | 5 | 6 (added §6 emission shipment) |
| Phase 28 acceptance criterion #30 | ⚠️ partial | substantially closed (#1039) |
| Phase 23 operator runbook | — | shipped (#1039) |
| Phase 22 roadmap acceptance checkboxes | ⚠️ partial | flipped to [x] (#1041) |

Main moved `1a90db57 → 1acafbc0` over 31 PRs in a single autonomous continuation.

---

## 2. Shipment narrative

### Arc A — Contract + Bridge (#1011 → #1013)

The arc opened with one final closed-taxonomy contract (#1011: security graph path navigation). The remaining-execution-plan T-G arc was substantially complete at this point.

Then the arc pivoted to **Phase 22 emission infrastructure**:
- #1012 — Per-state audit doc mapping the 25 closed kinds onto existing emitter surfaces.
- #1013 — `recordFailureStateEvent` bridge with closed-kind encoding (`failure_state:<kind>` prefix) + canonical metadata stamping (kind/category/severity/recoverable always-true regardless of caller metadata).

### Arc B — Batch-A wirings (#1014 → #1019)

Six 1-callsite wirings landing as separate PRs:
- #1014 `neo4j_unavailable` + `neo4j_degraded` (health-alert scanner).
- #1015 `neo4j_projection_drift_detected` (projection drift cron).
- #1016 `retrieval_safety_filter_blocked_content` (safety filter, per-call aggregated).
- #1017 `tool_schema_changed` (MCP auto-sync, with new pure-function schema diff helper).
- #1018 `text2cypher_rejected` (Cypher validator, per-rejection).
- #1019 `cypher_query_template_failed` (executeTemplateAudited catch — **no PII**, only `parameterKeys`).

Pattern: each wiring is ≤ 30 lines of additive emission inside an existing fire-and-forget envelope. Pre-existing tests remain green; observability writes never propagate.

### Arc C — Coverage + Catalog refreshes (#1020 → #1022)

- #1020 — Bridge wiring coverage guard (lockstep over all 6 batch-A wirings; flexible kind-reference for mapping-style wirings).
- #1021 — Phase 21 §7 ancillary catalog (27 ancillary tests indexed; gap #18 flagged as projection-helper-shipped).
- #1022 — Phase 28 §6 emission shipment table (forward-work T-I.4 marked shipped; lockstep over per-PR fragments).

### Arc D — Batch-B wirings (#1023 → #1027, #1030)

Five batch-B wirings with bundled guard-extensions (pattern shift from #1024's separate guard PR):
- #1023 `graph_agent_answer_incomplete` (engine budget exhaustion; excludes clean convergence).
- #1024 — Standalone guard-extension for #1023 (last separate guard PR).
- #1025 `projection_sync_failed` (sync worker; bundled guard from here on).
- #1026 `entity_resolution_conflict` (duplicate-entity scanner; per-agent-run, not per-finding).
- #1027 `promotion_failed` (two emit sites distinguished by `rejectionStage`).
- #1030 `runtime_reference_hidden_by_permission` (sibling emit alongside safety-filter; preserves both views).

### Arc E — Bridge enhancements + Audit deep-refresh (#1028 → #1029, #1034)

- #1028 — Audit doc per-state table updated with 🟢 LIVE markings for the 10 shipped kinds.
- #1029 — Bulk emission helper `recordFailureStateEvents` (shared `encodeForRecorder`, empty-batch short-circuit, per-input severityOverride preserved).
- #1034 — Documented the sibling-emit blocker for kind #25 (`background_job_failed`): 3 pre-existing tests pin row-count + spy-call-count at exactly 1, so adding a second `recordFailureStateEvent` breaks them. Defers to count-update slice after dashboard query migration.

### Arc F — Operator-facing artifacts + Forward locks (#1031 → #1033, #1035 → #1036)

- #1031 — 10th Phase 23 scanner: `missing_source_version` (subtler case than `missing_provenance`).
- #1032 — Phase 21 catalog refresh capturing #1031.
- #1033 — Extended CLAUDE.md hard-rules integrity mortgage (13 → 30 rules).
- #1035 — Phase 22 audit §7 with **10 operator-facing SQL queries** (ready-to-paste dashboards).
- #1036 — Lockstep test for Phase 21 gap #18 (projection helper readiness — closes the forward claim against drift).
- #1041 — Phase 22 roadmap acceptance checkbox flip with PR citations + Implementation Artifacts subsection + 10-test lockstep.

---

## 3. Closed taxonomy live coverage

| Kind | Status | PR | Wiring site |
|---|---|---|---|
| `promotion_failed` | 🟢 LIVE | #1027 | `services/promotion/lifecycle.ts` |
| `note_conflict` | 🟡 | — | (deferred — no detection emit) |
| `entity_resolution_conflict` | 🟢 LIVE | #1026 | `services/graph-quality/agent-run.ts` |
| `neo4j_unavailable` | 🟢 LIVE | #1014 | `services/graph/health-alert.ts` |
| `neo4j_degraded` | 🟢 LIVE | #1014 | (same) |
| `neo4j_query_timeout` | 🟡 | — | (deferred — needs timeout enforcement) |
| `neo4j_projection_stale` | 🟡 | — | (deferred) |
| `neo4j_projection_drift_detected` | 🟢 LIVE | #1015 | `services/graph/projection/drift-cron.ts` |
| `projection_sync_failed` | 🟢 LIVE | #1025 | `services/graph/projection/sync-worker.ts` |
| `graph_query_timeout` | 🟡 | — | (deferred) |
| `backlink_refresh_failed` | ❌ | — | (no module yet) |
| `runtime_reference_hidden_by_permission` | 🟢 LIVE | #1030 | `services/graph/retrieval/retrieval-router.ts` (sibling) |
| `cag_reference_invalidated` | ❌ | — | (no invalidation runtime) |
| `graph_skill_reference_invalidated` | ❌ | — | (no invalidation runtime) |
| `tool_schema_changed` | 🟢 LIVE | #1017 | `services/mcp/auto-sync.ts` |
| `search_index_stale` | ❌ | — | (no module) |
| `query_cache_stale` | ❌ | — | (no module) |
| `text2cypher_rejected` | 🟢 LIVE | #1018 | `services/graph/retrieval/retrieval-router.ts` |
| `cypher_query_template_failed` | 🟢 LIVE | #1019 | `services/graph/retrieval/retrieval-router.ts` |
| `retrieval_safety_filter_blocked_content` | 🟢 LIVE | #1016 | `services/graph/retrieval/retrieval-router.ts` |
| `graph_agent_answer_incomplete` | 🟢 LIVE | #1023 | `services/graph-agent/engine.ts` |
| `golden_question_failed` | ⚠️ | — | (script-only invocation) |
| `graph_correction_rejected` | ❌ | — | (no reject path) |
| `semantic_enrichment_rejected` | 🔒 | — | (T-D.3 phase-gated) |
| `background_job_failed` | ⚠️ | — | (count-pin blocker — see #1034) |

12 LIVE / 2 ⚠️ partial / 4 🟡 detection-only / 6 ❌ phase-gated / 1 🔒 T-D.3.

---

## 4. Lessons carried forward into memory

Lessons 14-22 in `~/.claude/projects/-root/memory/project_v1_plus_session_2026_05_15.md`:

14. Audit-then-bridge-then-wire is a 3-PR template for closed-taxonomy emission rollouts.
15. Avoid breaking literal-string `errorClass` assertions when extending the recorder — prefer ADDITIVE emission to renaming.
16. Always `git checkout -b` BEFORE staging a wiring commit (tooling discipline).
17. Coverage-guard bundling evolved: separate PR (#1024) → bundled with wiring (#1025+). Bundle when diff is ≤ 150 lines.
18. Audit doc's recommendation can be wrong on specific items but right on the overall scope — re-read for "what's fixable cheaply" rather than treating it as binding.
19. Per-emit-site reason exclusions are part of the closed-taxonomy contract (graph-agent emits only on budget-exhaustion, NOT clean convergence).
20. Sibling-emission > re-tag when an existing kind's metadata already carries the subset signal.
21. Bulk emission helpers fit the contract pattern — ship them with the singular at the contract level.
22. Sibling-emit only works when the underlying observability write isn't count-pinned by tests — grep for `.toHaveLength`, `.toBe(1)`, `.toHaveBeenCalledTimes(1)` BEFORE adding sibling emit.

---

## 5. Forward work after this burst

| Track | Description | Blocker |
|---|---|---|
| T-I.5.B.6 (deferred) | Wire `background_job_failed` sibling | Count-pin: requires test-update slice (#1034 records the analysis) |
| T-I.5.B.7 (future) | Wire `neo4j_query_timeout` | Needs timeout enforcement (not just SLO warning) at the graph repository level |
| T-I.5.B.8 (future) | Wire `golden_question_failed` | Evaluator currently script-only; move into server runtime first |
| T-I.5.C (phase-gated) | Wire detection-first kinds (note_conflict, cag/skill_reference_invalidated, etc.) | Underlying detection runtimes don't exist yet |
| T-I.5.D (phase-gated) | Wire `semantic_enrichment_rejected` | T-D.3 (semantic enrichment agent) |

---

## 6. References

- Per-state audit + dashboard queries: `agent-studio-phase-22-failure-state-emission-audit.md`
- Phase 28 catalog (§6 shipment table): `agent-studio-phase-28-governance-acceptance-catalog.md`
- Phase 21 catalog (§7 ancillary tests): `agent-studio-phase-21-continuous-graph-testing-catalog.md`
- Lesson ledger: `~/.claude/projects/-root/memory/project_v1_plus_session_2026_05_15.md`
- Roadmap: `agent-studio-native-graph-workspace-roadmap.md` §Phase 22
- Remaining plan: `agent-studio-native-graph-workspace-remaining-execution-plan.md` §T-I
