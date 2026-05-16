# Phase 22 — Failure-state emission audit (T-I.4)

**Date:** 2026-05-15 (refreshed after batch-A + first 4 batch-B wirings landed)
**Status:** Audit + active emission tracking. Maps the 25 closed-taxonomy failure states (#1002) onto existing emitters in `server/agent-studio/services/**`, so the future wiring slices have a fixed scope.

**Live emission status:** **12 of 25 closed kinds have live emitters** (6 batch-A + 5 batch-B + 1 sibling-emit @ #1030). Remaining 13: 2 ⚠️ partial (count-pin / script-only) + 4 🟡 detection-only + 6 ❌ phase-gated + 1 🔒 T-D.3.

This document is the bridge between two artifacts:
- **Closed-taxonomy contract** (`services/failure-states/contracts.ts`, #1002) — the 25 named failure states + categories + severity + recoverable metadata.
- **Existing emission surface** (`services/workspace-observability/error-events.ts`) — the `recordErrorEvent({ errorClass, … })` recorder writing to `ags_workspace_error_events`.

Today the recorder accepts free-form `errorClass: string`. The wiring slices (T-I.5+) introduce a typed bridge that maps the 25 closed failure states onto the underlying `errorClass` column so operator dashboards can group by closed taxonomy without changing the storage shape.

---

## 1. Audit summary (post batch-A + first 4 batch-B + T-I.38 golden-question wiring)

| Status | Count | Description |
|---|---|---|
| 🟢 LIVE via closed-taxonomy bridge | **13** | Emission shipped through `recordFailureStateEvent` (kinds #1, #3, #4, #5, #8, #9, #12, #15, #18, #19, #20, #21, #22) |
| ⚠️ Has detection code, partial emission | 1 | Free-form `errorClass` written (kind #25 background-job-failed locked by count-pinned tests — see lesson 22) |
| 🟡 Detection state exists in DB but no observability surface | 4 | A status column / audit table carries the state; emission deferred (kinds #2, #6, #7, #10) |
| ❌ No detection yet — phase-gated | 6 | Underlying runtime doesn't exist; gated on a downstream phase (kinds #11, #13, #14, #16, #17, #23) |
| 🔒 Phase-gated on T-D.3 | 1 | Semantic Enrichment Agent runtime (#24) |

**Live coverage: 13/25 closed kinds (52%).** Batch-B target: 15/25 (60%) once `note_conflict` / `neo4j_projection_stale` / additional follow-ups close. T-I.38 (#1213) corrected the premise of the prior audit row for #22 — `runLiveEvaluation` was already callable from server runtime; the evaluator just needed the emitter wired in-process rather than gated on a runtime move. Sum: 13 + 1 + 4 + 6 + 1 = 25 ✓.

---

## 2. Per-state audit

Legend: 🟢 LIVE — emission shipped via the closed-taxonomy bridge | 🟡 detection state exists in DB | ⚠️ has detection code | ❌ no detection yet | 🔒 phase-gated

| # | Failure state | Category | Status | Existing emitter / detection | Wiring (shipped or planned) |
|---|---|---|---|---|---|
| 1 | `promotion_failed` | governance | 🟢 **LIVE @ #1027 (T-I.5.B.4)** | `PromotionLifecycle.submit` validation-reject + `.reject` operator-reject | `services/promotion/lifecycle.ts` — two emit sites distinguished by `rejectionStage` |
| 2 | `note_conflict` | runtime | 🟡 | Conflict-resolution UI surfaces conflicts; not emitted as event | Adapter in `services/vault-notes/` (deferred — needs detection-first) |
| 3 | `entity_resolution_conflict` | governance | 🟢 **LIVE @ #1026 (T-I.5.B.3)** | `graph-quality-agent-run` per-scan when scanKind === "duplicate_entity" + findingsCount > 0 | `services/graph-quality/agent-run.ts` |
| 4 | `neo4j_unavailable` | infrastructure | 🟢 **LIVE @ #1014 (T-I.5.A.1)** | Health-alert scanner | `services/graph/health-alert.ts` |
| 5 | `neo4j_degraded` | infrastructure | 🟢 **LIVE @ #1014 (T-I.5.A.1)** | Same scanner (latency-high collapsed into degraded) | `services/graph/health-alert.ts` |
| 6 | `neo4j_query_timeout` | infrastructure | 🟡 | Cypher timeout configured at executor; no event on per-query timeout | Adapter in `services/graph/repository/*` (deferred — needs timeout enforcement, not SLO warning) |
| 7 | `neo4j_projection_stale` | infrastructure | 🟡 | Freshness lag detected in projection-sync cron; no event | Adapter in `services/graph-projection/sync-cron.ts` (deferred) |
| 8 | `neo4j_projection_drift_detected` | infrastructure | 🟢 **LIVE @ #1015 (T-I.5.A.2)** | Drift cron emits when driftCount > 0 | `services/graph/projection/drift-cron.ts` |
| 9 | `projection_sync_failed` | infrastructure | 🟢 **LIVE @ #1025 (T-I.5.B.2)** | Sync worker `status === "failed"` (includes partial-success) | `services/graph/projection/sync-worker.ts` |
| 10 | `graph_query_timeout` | retrieval | 🟡 | GraphRAG router timeout configured; no per-query event | Adapter in `services/rac/retrieval-executor.ts` (deferred) |
| 11 | `backlink_refresh_failed` | runtime | ❌ | No backlink refresh module exists yet | Phase-gated on backlink runtime addition |
| 12 | `runtime_reference_hidden_by_permission` | governance | 🟢 **LIVE @ #1030 (T-I.5.B.5)** | Permission-denied subset of safety-filter events emits dedicated kind (sibling to #1016's aggregated emit) | `services/graph/retrieval/retrieval-router.ts` |
| 13 | `cag_reference_invalidated` | governance | ❌ | CAG invalidation runtime does not exist; only a docblock comment | Phase-gated on CAG invalidation runtime |
| 14 | `graph_skill_reference_invalidated` | governance | ❌ | Skill-pack invalidation runtime does not exist | Phase-gated on skill-pack invalidation runtime |
| 15 | `tool_schema_changed` | governance | 🟢 **LIVE @ #1017 (T-I.5.A.4)** | MCP auto-sync diff (pure-function `detectToolSchemaChanges`) | `services/mcp/auto-sync.ts` |
| 16 | `search_index_stale` | retrieval | ❌ | No search-index module exists yet | Phase-gated |
| 17 | `query_cache_stale` | retrieval | ❌ | No graph-query-cache module exists yet | Phase-gated |
| 18 | `text2cypher_rejected` | retrieval | 🟢 **LIVE @ #1018 (T-I.5.A.5)** | Cypher validator rejection inside retrieval router | `services/graph/retrieval/retrieval-router.ts` |
| 19 | `cypher_query_template_failed` | retrieval | 🟢 **LIVE @ #1019 (T-I.5.A.6)** | `executeTemplateAudited` catch block (no PII — `parameterKeys` only) | `services/graph/retrieval/retrieval-router.ts` |
| 20 | `retrieval_safety_filter_blocked_content` | retrieval | 🟢 **LIVE @ #1016 (T-I.5.A.3)** | Safety filter post-step; one event per retrieval call with reasonCounts aggregation | `services/graph/retrieval/retrieval-router.ts` |
| 21 | `graph_agent_answer_incomplete` | agent | 🟢 **LIVE @ #1023 (T-I.5.B.1)** | Engine agentic loop budget exhaustion (max_iterations / wall_clock_budget only) | `services/graph-agent/engine.ts` |
| 22 | `golden_question_failed` | agent | 🟢 **LIVE @ #1213 (T-I.38)** | `runLiveEvaluation` fires `recordFailureStateEvent` per failed question; emitter override via `LiveEvaluationOptions.recordFailureStateEvent` for test injection | `services/graph-skill/golden-questions/live-evaluator.ts` |
| 23 | `graph_correction_rejected` | governance | ❌ | No reject path exists in `services/graph-quality/` — only approve + dismiss | Phase-gated on graph-quality reject runtime |
| 24 | `semantic_enrichment_rejected` | governance | 🔒 | Semantic enrichment agent does not exist yet | Gated on T-D.3 (semantic enrichment agent runtime) |
| 25 | `background_job_failed` | runtime | ⚠️ | `background-jobs.ts:868,954` writes free-form `errorClass: "BackgroundJobFailed"` — locked by 20+ test/dashboard assertions | **Sibling-emit attempt found a stronger blocker** — 3 pre-existing tests pin EXACTLY 1 row written / 1 spy call per failed job. A second `recordFailureStateEvent` call breaks those tests. Closing this kind requires either (a) updating 3 pre-existing tests to expect 2 calls/rows, or (b) re-tagging the existing emission's `errorClass` (breaks 20+ literal-pin tests). Defer to a dedicated count-update slice (T-I.13.b future) AFTER operator dashboard query migration completes. See lesson 22 in `project_v1_plus_session_2026_05_15.md`. |

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

## 7. Operator dashboard query examples

Once the 11 batch-A + batch-B emitters are emitting into ASDB, operators can run the following queries to surface the closed-taxonomy view of failure events. Every emission carries `errorClass = 'failure_state:<kind>'` and a JSONB `metadata` column with canonical fields (`failureStateKind`, `failureStateCategory`, `failureStateSeverity`, `failureStateRecoverable`).

### 7.1 — All failure-state emissions in the last hour

```sql
SELECT id, source_kind, error_class, error_message, created_at
FROM ags_workspace_error_events
WHERE error_class LIKE 'failure_state:%'
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

### 7.2 — Count by closed kind (last 24h)

```sql
SELECT
  metadata->>'failureStateKind' AS kind,
  metadata->>'failureStateCategory' AS category,
  COUNT(*) AS n
FROM ags_workspace_error_events
WHERE error_class LIKE 'failure_state:%'
  AND created_at > now() - interval '24 hours'
GROUP BY 1, 2
ORDER BY n DESC;
```

### 7.3 — Operator-action-required events (recoverable = false)

```sql
SELECT id, source_kind, metadata->>'failureStateKind' AS kind, error_message, created_at
FROM ags_workspace_error_events
WHERE error_class LIKE 'failure_state:%'
  AND metadata->>'failureStateRecoverable' = 'false'
ORDER BY created_at DESC
LIMIT 100;
```

### 7.4 — Critical-severity emissions by category

```sql
SELECT
  metadata->>'failureStateCategory' AS category,
  metadata->>'failureStateKind' AS kind,
  COUNT(*) AS n
FROM ags_workspace_error_events
WHERE error_class LIKE 'failure_state:%'
  AND metadata->>'failureStateSeverity' = 'critical'
  AND created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

### 7.5 — Drift detection runs that produced findings (kind-specific)

```sql
SELECT id, source_id AS scope, error_message, metadata->>'driftCount' AS drifts, created_at
FROM ags_workspace_error_events
WHERE error_class = 'failure_state:neo4j_projection_drift_detected'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;
```

### 7.6 — Promotions rejected at validation (vs operator-rejected)

```sql
SELECT
  metadata->>'rejectionStage' AS stage,
  COUNT(*) AS n
FROM ags_workspace_error_events
WHERE error_class = 'failure_state:promotion_failed'
  AND created_at > now() - interval '30 days'
GROUP BY 1;
```

### 7.7 — Permission-denied references that fired the dedicated kind (#1030)

```sql
SELECT
  source_id AS run_id,
  metadata->>'permissionDeniedCount' AS hidden_count,
  metadata->>'workspaceId' AS workspace_id,
  created_at
FROM ags_workspace_error_events
WHERE error_class = 'failure_state:runtime_reference_hidden_by_permission'
ORDER BY created_at DESC
LIMIT 50;
```

### 7.8 — MCP tool-schema changes by server

```sql
SELECT
  source_id AS server_id,
  metadata->>'changeCount' AS changes,
  metadata->>'kindCounts' AS by_kind,
  created_at
FROM ags_workspace_error_events
WHERE error_class = 'failure_state:tool_schema_changed'
ORDER BY created_at DESC;
```

### 7.9 — Graph-agent budget-exhaustion rate vs total runs

```sql
WITH incomplete_runs AS (
  SELECT COUNT(*) AS n
  FROM ags_workspace_error_events
  WHERE error_class = 'failure_state:graph_agent_answer_incomplete'
    AND created_at > now() - interval '24 hours'
), total_runs AS (
  SELECT COUNT(*) AS n
  FROM ags_runtime_runs
  WHERE created_at > now() - interval '24 hours'
)
SELECT
  i.n AS incomplete,
  t.n AS total,
  CASE WHEN t.n > 0 THEN ROUND(100.0 * i.n / t.n, 2) ELSE NULL END AS pct
FROM incomplete_runs i, total_runs t;
```

### 7.10 — Per-workspace failure-state spread

```sql
SELECT
  metadata->>'workspaceId' AS workspace_id,
  metadata->>'failureStateKind' AS kind,
  COUNT(*) AS n
FROM ags_workspace_error_events
WHERE error_class LIKE 'failure_state:%'
  AND metadata ? 'workspaceId'
  AND created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY workspace_id, n DESC;
```

Note: queries assume the JSONB `metadata` column. Drizzle's column name in the schema is `metadata`; the SQL above is written against the underlying Postgres column.

---

## 8. References

- Closed taxonomy: `server/agent-studio/services/failure-states/contracts.ts` (#1002)
- Bridge: `server/agent-studio/services/failure-states/observability-bridge.ts` (#1013)
- Existing recorder: `server/agent-studio/services/workspace-observability/error-events.ts`
- Storage table: `drizzle/tables/agent-studio-graph-quality.ts` — `agsWorkspaceErrorEvents`
- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` §Phase 22
- Remaining plan: `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md` §T-I
