# Phase 22 — Failure-state emission audit (T-I.4)

**Date:** 2026-05-15
**Status:** Audit snapshot. Maps the 25 closed-taxonomy failure states (#1002) onto existing emitters in `server/agent-studio/services/**`, so the future wiring slices have a fixed scope.

This document is the bridge between two artifacts:
- **Closed-taxonomy contract** (`services/failure-states/contracts.ts`, #1002) — the 25 named failure states + categories + severity + recoverable metadata.
- **Existing emission surface** (`services/workspace-observability/error-events.ts`) — the `recordErrorEvent({ errorClass, … })` recorder writing to `ags_workspace_error_events`.

Today the recorder accepts free-form `errorClass: string`. The wiring slices (T-I.5+) introduce a typed bridge that maps the 25 closed failure states onto the underlying `errorClass` column so operator dashboards can group by closed taxonomy without changing the storage shape.

---

## 1. Audit summary

| Status | Count | Description |
|---|---|---|
| ✅ Has existing emitter | 2 | Code already calls `recordErrorEvent` with a free-form class that maps to one of the 25 |
| ⚠️ Has detection code but no emission | 6 | The condition is detected (cron, retention sweep, drift detector, etc.) but doesn't route through `recordErrorEvent` |
| 🟡 Detection state exists in DB but no observability surface | 9 | A status column / audit table carries the state; no observability event is written |
| ❌ No detection yet | 8 | Neither detection nor emission exists; gated on a downstream phase |

---

## 2. Per-state audit

| # | Failure state | Category | Status | Existing emitter / detection | Wiring needed (target slice) |
|---|---|---|---|---|---|
| 1 | `promotion_failed` | governance | 🟡 | `ags_runtime_runs.finalStatus = "failed"` for promotion runs; no `recordErrorEvent` | New `recordPromotionFailureEvent` adapter in `services/promotion/` |
| 2 | `note_conflict` | runtime | 🟡 | Conflict-resolution UI surfaces conflicts; not emitted as event | Adapter in `services/vault-notes/` |
| 3 | `entity_resolution_conflict` | governance | ⚠️ | Detected in entity-resolution scanners (#977, etc.); writes findings rows not events | Adapter in `services/graph-quality/entity-resolution-scanner.ts` |
| 4 | `neo4j_unavailable` | infrastructure | ⚠️ | Health-alert cron (J-1-β, #748) writes alert rows; no error event | Add bridge in `services/graph/health-alert-cron.ts` |
| 5 | `neo4j_degraded` | infrastructure | ⚠️ | Same as #4 — health-alert cron writes alert rows | Same bridge |
| 6 | `neo4j_query_timeout` | infrastructure | 🟡 | Cypher timeout configured at executor; no event on per-query timeout | Adapter in `services/graph/repository/neo4j-community-graph-repository.ts` |
| 7 | `neo4j_projection_stale` | infrastructure | 🟡 | Freshness lag detected in projection-sync cron; no event | Adapter in `services/graph-projection/sync-cron.ts` |
| 8 | `neo4j_projection_drift_detected` | infrastructure | ⚠️ | Drift cron (PR-AT-3) writes drift findings; no `recordErrorEvent` | Adapter in `services/graph-projection/drift-cron.ts` |
| 9 | `projection_sync_failed` | infrastructure | ⚠️ | Projection-sync cron logs errors; doesn't record event | Same bridge as #7/#8 |
| 10 | `graph_query_timeout` | retrieval | 🟡 | GraphRAG router timeout configured; no per-query event | Adapter in `services/rac/retrieval-executor.ts` |
| 11 | `backlink_refresh_failed` | runtime | 🟡 | Backlink refresh job catches errors; no event | Adapter in `services/backlinks/refresh-cron.ts` |
| 12 | `runtime_reference_hidden_by_permission` | governance | 🟡 | Permission post-filter redacts but no event | Adapter in `services/rac/permission-filter.ts` |
| 13 | `cag_reference_invalidated` | governance | 🟡 | CAG compile metadata marks invalid; no event | Adapter in `services/cag/compile.ts` |
| 14 | `graph_skill_reference_invalidated` | governance | 🟡 | Skill-pack version table tracks invalidation; no event | Adapter in `services/graph-skill-packs/` |
| 15 | `tool_schema_changed` | governance | ❌ | MCP auto-sync (#776+) updates mirror; no schema-diff event | Adapter in `services/mcp/auto-sync.ts` |
| 16 | `search_index_stale` | retrieval | 🟡 | Search-index lag tracked in retention; no event | Adapter in `services/document-search/index-cron.ts` |
| 17 | `query_cache_stale` | retrieval | 🟡 | TTL on cache rows; no event when row served stale | Adapter in `services/graph-query-cache/` |
| 18 | `text2cypher_rejected` | retrieval | ✅ | Text2Cypher guardrails reject + log; mappable to closed kind via wrapper | Closed-taxonomy wrapper in `services/text2cypher/` |
| 19 | `cypher_query_template_failed` | retrieval | ⚠️ | Template registry executor catches errors; no event | Adapter in `services/cypher-templates/executor.ts` |
| 20 | `retrieval_safety_filter_blocked_content` | retrieval | ⚠️ | Safety filter prunes content; no event | Adapter in `services/rac/safety-filter.ts` |
| 21 | `graph_agent_answer_incomplete` | agent | ⚠️ | Iteration-budget exhaustion is logged in `ags_runtime_runs`; no event | Adapter in `services/graph-agent-lite/engine.ts` |
| 22 | `golden_question_failed` | agent | ⚠️ | Evaluator writes failure to `ags_golden_questions`; no event | Adapter in `services/golden-questions/evaluator.ts` |
| 23 | `graph_correction_rejected` | governance | 🟡 | Approval rejection updates correction row; no event | Adapter in `services/graph-quality/approve-and-apply.ts` |
| 24 | `semantic_enrichment_rejected` | governance | ❌ | Semantic enrichment doesn't exist yet | Gated on T-D.3 (semantic enrichment agent runtime) |
| 25 | `background_job_failed` | runtime | ✅ | `background-jobs.ts:868,954` writes `errorClass: "BackgroundJobFailed"` | Wrapper that maps to closed `background_job_failed` kind |

---

## 3. Existing emitter inventory

Surface today:

```
server/agent-studio/services/workspace-observability/
├── error-events.ts                — recordErrorEvent / recordErrorEvents (writes ags_workspace_error_events)
├── trpc-error-capture.ts          — captures tRPC errors: errorClass = "TRPCError:<code>" or err.name
└── background-jobs.ts             — stale-running sweep: errorClass = "BackgroundJobFailed" (2 callsites)
```

These 2 emitter callsites cover failure state #25 (`background_job_failed`); #1–#24 have no observability event emission today.

---

## 4. Recommended wiring shape (T-I.5)

Add a thin **closed-taxonomy bridge** so existing emitters route through the contract without changing their storage shape:

```ts
// services/failure-states/observability-bridge.ts (NEW)
import { type FailureState, FAILURE_STATE_METADATA } from "./contracts.js";
import { recordErrorEvent } from "../workspace-observability/error-events.js";

export interface RecordFailureStateEventInput {
  readonly failureState: FailureState;
  readonly sourceKind: string;
  readonly sourceId?: string | null;
  readonly userId?: number | null;
  readonly errorMessage: string;
  /** Optional per-emission severity override (defaults to taxonomy
   *  metadata's `defaultSeverity`). */
  readonly severityOverride?: "info" | "warning" | "critical";
  readonly metadata?: Record<string, unknown> | null;
}

export async function recordFailureStateEvent(
  input: RecordFailureStateEventInput,
): Promise<void> {
  const meta = FAILURE_STATE_METADATA[input.failureState];
  await recordErrorEvent({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId ?? null,
    userId: input.userId ?? null,
    errorClass: `failure_state:${input.failureState}`,
    errorMessage: input.errorMessage,
    metadata: {
      ...input.metadata,
      failureStateCategory: meta.category,
      failureStateSeverity: input.severityOverride ?? meta.defaultSeverity,
      failureStateRecoverable: meta.recoverable,
    },
  });
}
```

This shape:
- **Reuses** the existing `ags_workspace_error_events` storage — no schema migration.
- **Encodes** the closed kind into `errorClass` via the `failure_state:<kind>` prefix — `LIKE 'failure_state:%'` queries surface the typed subset.
- **Propagates** the taxonomy metadata into the JSON column so operator dashboards can filter by category / severity / recoverable without re-deriving from the closed enum.
- **Allows** per-emission severity override for cases where the default doesn't fit (e.g. a `neo4j_query_timeout` event that breached the SLO budget warrants `critical` rather than the default `warning`).

---

## 5. Wiring slice ordering

The 23 ⚠️/🟡/❌ states are ordered by emitter-callsite proximity. Reading down the list, slices 1–6 are 1-callsite touch-ups; 7–15 are multi-callsite; 16–23 need new detection paths first.

### Cheap (1-callsite wiring) — T-I.5 batch A

1. #25 `background_job_failed` — wrap the existing `recordErrorEvent` calls in `background-jobs.ts:868,954`. **Pre-existing emitter**, no detection work.
2. #18 `text2cypher_rejected` — wrap the existing rejection logger.
3. #4/#5 `neo4j_unavailable` / `neo4j_degraded` — health-alert cron already raises alerts; add a 2-line bridge.
4. #8 `neo4j_projection_drift_detected` — drift cron already writes findings; add 1-line bridge.
5. #19 `cypher_query_template_failed` — template executor already catches; add 1-line bridge.
6. #20 `retrieval_safety_filter_blocked_content` — safety filter already prunes; add 1-line bridge.

### Medium — T-I.5 batch B

7. #6 `neo4j_query_timeout` — per-query timer in graph repo; add timing-band bridge.
8. #7/#9 `neo4j_projection_stale` / `projection_sync_failed` — projection-sync cron; add 2-bridge in sync paths.
9. #11 `backlink_refresh_failed` — backlink refresh cron.
10. #12 `runtime_reference_hidden_by_permission` — permission post-filter; add per-redaction emission.
11. #13/#14 `cag_reference_invalidated` / `graph_skill_reference_invalidated` — invalidation paths in compile.ts / skill-pack versioner.
12. #16/#17 `search_index_stale` / `query_cache_stale` — staleness detection paths.
13. #21 `graph_agent_answer_incomplete` — engine iteration-budget exhaustion path.
14. #22 `golden_question_failed` — evaluator failure path.
15. #23 `graph_correction_rejected` — approval rejection path.

### Detection-first — T-I.5 batch C

16. #1 `promotion_failed` — new promotion failure adapter (no detection today).
17. #2 `note_conflict` — conflict UI emits but no event.
18. #3 `entity_resolution_conflict` — scanners write findings rows but no event.
19. #15 `tool_schema_changed` — MCP auto-sync needs schema-diff detection added.
20. #10 `graph_query_timeout` — needs per-plan-item timing instrumentation.

### Phase-gated

21. #24 `semantic_enrichment_rejected` — gated on T-D.3 (semantic enrichment agent runtime).

---

## 6. Acceptance criteria for T-I.5 (wiring follow-up)

- [ ] `services/failure-states/observability-bridge.ts` shipped.
- [ ] Bridge tests cover all 25 closed kinds: each emits via `recordErrorEvent` with `errorClass = "failure_state:<kind>"`.
- [ ] At least 6 batch-A wiring callsites converted (cheap-tier).
- [ ] Operator dashboard query `LIKE 'failure_state:%'` surfaces the closed-taxonomy subset.
- [ ] No regressions in existing free-form `errorClass` emissions — the bridge is **additive**, not replacement.

---

## 7. References

- Closed taxonomy: `server/agent-studio/services/failure-states/contracts.ts` (#1002)
- Existing recorder: `server/agent-studio/services/workspace-observability/error-events.ts`
- Storage table: `drizzle/tables/agent-studio-graph-quality.ts` — `agsWorkspaceErrorEvents`
- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` §Phase 22
- Remaining plan: `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md` §T-I
