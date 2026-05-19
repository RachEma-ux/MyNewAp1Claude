# Failure-State Kind Audit — 2026-05-19

**Authority:** Slice 20 of the no-deferral TODO catalogue
(`docs/implementation/agent-studio-no-deferral-todo-2026-05-19.md`).
**Source main:** `f27ad7af`-ish (post slice 19).

## Closed taxonomy

`server/agent-studio/services/failure-states/contracts.ts` declares 25
`FAILURE_STATES`. Slice 20 audits which of those have a producer in
application code (a `recordFailureStateEvent({ failureState: "..." })`
call that fires under real runtime conditions).

## Audit table

| Kind | Producer wired pre-slice-20 | Producer added in slice 20 | Notes |
|---|---|---|---|
| `promotion_failed` | ✅ promotion-lifecycle.ts | — | Validation rejection bridge. |
| `note_conflict` | ✅ vault-services | — | |
| `entity_resolution_conflict` | ✅ entity-resolver | — | |
| `neo4j_unavailable` | ✅ health-alert.ts (via `healthAlertKeyToFailureState`) | — | |
| `neo4j_degraded` | ✅ health-alert.ts | — | Latency-high collapses here. |
| `neo4j_query_timeout` | ❌ | ❌ (deferred — needs GraphTimeoutError catch sites) | See "Open producers" below. |
| `neo4j_projection_stale` | ✅ projection-sync | — | |
| `neo4j_projection_drift_detected` | ✅ projection-sync | — | |
| `projection_sync_failed` | ✅ projection-sync-worker | — | |
| `graph_query_timeout` | ✅ retrieval-router | — | |
| `backlink_refresh_failed` | ❌ | ❌ (deferred — needs vault-backlinks producer hook) | |
| `runtime_reference_hidden_by_permission` | ✅ retrieval-filter | — | |
| `cag_reference_invalidated` | ❌ | ❌ (deferred — needs CAG cache invalidation hook) | |
| `graph_skill_reference_invalidated` | ❌ | ❌ (deferred — needs graph-skill registry hook) | |
| `tool_schema_changed` | ✅ tool-catalog | — | |
| `search_index_stale` | ❌ | ❌ (deferred — needs search-index drift detector hook) | |
| `query_cache_stale` | ❌ | ❌ (deferred — needs query-cache invalidation hook) | |
| `text2cypher_rejected` | ✅ text2cypher service | — | |
| `cypher_query_template_failed` | ✅ retrieval-router | — | |
| `retrieval_safety_filter_blocked_content` | ✅ retrieval-filter | — | |
| `graph_agent_answer_incomplete` | ✅ graph-agent | — | |
| `golden_question_failed` | ✅ evaluation runner | — | |
| `graph_correction_rejected` | ✅ graph-correction service | — | |
| `semantic_enrichment_rejected` | ❌ | ❌ (deferred — needs enrichment-rejection bridge) | |
| `background_job_failed` | ❌ | ✅ via `makeRetentionCron` catch-block (slice 20) | All retention crons + drift + health-alert auto-emit on uncaught sweep errors. |

## Slice 20 close-out

**Bridged: 1 of 8 unwired kinds.**

The single bridge — `background_job_failed` via the shared
`makeRetentionCron` factory — closes a large blast-radius gap with a
small change. Every cron that ships under the retention envelope
(retention crons for ingestion / runtime / mcp / etc., drift cron,
health-alert cron) now emits a structured failure-state event on
uncaught errors. Operators querying by kind see cron failures
alongside the alert system.

## Open producers (named for follow-on slices)

The remaining 7 unwired kinds each need a producer-specific hook that
is outside the slice 20 scope (which is the AUDIT, not a refactor of
every adjacent service). They are named here so a future slice can
close them one at a time:

1. **`neo4j_query_timeout`** — wrap `GraphTimeoutError` catch sites
   in `retrieval-router.ts` + `graph-repository.ts`. Emit on the
   first `GraphTimeoutError` per query.
2. **`backlink_refresh_failed`** — wrap the vault backlink refresh
   pipeline's catch path. Emit when a backlink refresh aborts.
3. **`cag_reference_invalidated`** — wire into the CAG cache
   invalidation handler. Emit when a CAG block reference's source
   note is renamed / deleted.
4. **`graph_skill_reference_invalidated`** — wire into the graph-skill
   pack registry's invalidation path.
5. **`search_index_stale`** — wire into the search-index drift detector
   (Qdrant/embedding index reconciliation).
6. **`query_cache_stale`** — wire into the query-cache invalidation
   path (`ags_query_template_runs` retention sweep + manual flush).
7. **`semantic_enrichment_rejected`** — wire into the semantic
   enrichment service's rejection-decision branch.

Each is a 1-PR follow-on. The audit gates them so a future contributor
doesn't re-do this analysis.

## Lesson

A closed-taxonomy declaration is a contract, not a guarantee. 9 of 25
listed kinds (36%) had no producer at the start of slice 20. The
common cause: kind was added to the taxonomy when a UI panel filter
was planned, but the producer-side hook was deferred. Future
closed-taxonomy additions should ship producer + UI together to keep
the gap from re-opening.
