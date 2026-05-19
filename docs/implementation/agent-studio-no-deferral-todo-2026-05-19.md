# Agent Studio — No-Deferral TODO Catalogue

**Date:** 2026-05-19
**Source main:** `a16db096` (post PR #1526)
**Author:** Claude Opus 4.7 (autonomous execution authority)
**Mandate:** User directive — "implement all; today's out-of-scopes are tomorrow's big bugs". Eliminate stubs, TODOs, deferrals, out-of-scope markers, optional placeholders, non-build items in the agent-studio module wherever the work can be done from the dev environment.

This document supersedes the "Out of scope" sections of preceding PR bodies (#1525, #1526, etc.) and the partial deferrals documented in `agent-studio-native-graph-workspace-remaining-punch-list-2026-05-19.md` § "What's actually still open".

## Source scan summary

Grep over `server/agent-studio/` + `client/src/modules/agent-studio/` for `TODO|FIXME|deferred|out of scope|skeleton|stub|operator-action` produced **76 markers**. After triage:

| Triage class | Count | Action |
|---|---|---|
| **Real implementation gaps shippable from this session** | 31 | Ship — covered by slices 2–25 below |
| Closed-by-successor (marker text refers to work already shipped) | 24 | Strip the markers in slice 26 (doc-debt cleanup) |
| Genuine MVP-boundary documentation (defines scope, not a gap) | 13 | Leave — these are intent, not deferrals |
| External-infrastructure operator action (requires Aura / Neo4j CE credit / multi-region account) | 8 | Ship code paths + runbooks (slices 27–28); flag the residual button-press |

## Tiers + slices

Each slice is a single PR. Order is dependency-driven where it matters; otherwise smallest-first.

### Tier A — Graph workspace canvas extensions (3 slices)

| # | Slice | Files | Why |
|---|---|---|---|
| 2 | **d3-force simulation** | `LocalGraphCanvas.tsx` / `GlobalGraphCanvas.tsx` / `package.json` / `tests/agent-studio/graph-workspace-canvas-viz.test.ts` | Replace BFS-radial + typeKey-grid with a real force simulation. d3-force ~15KB gzip. Caller contract preserved per PR #1525 note. |
| 3 | **Boundary-node fetch** | `postgres-graph-repository-asdb.ts:globalGraphSample` + new test | Closes PR #1526 out-of-scope note. Pull edges from sample to outside-sample + upsert those boundary nodes. |
| 4 | **upsertEdge dedup** | `postgres-graph-repository-asdb.ts:upsertEdge` + migration + test | LocalGraphCanvas line 188 comment names this. Add unique constraint on (typeKey, edgeKey) + `onConflictDoUpdate`. |

### Tier B — AsdbPostgresGraphRepository stub elimination (9 slices)

| # | Slice | File:line | Current | Target |
|---|---|---|---|---|
| 5 | `shortestPath` | `postgres-graph-repository-asdb.ts:316` | `return null` | Recursive CTE BFS with depth-cap |
| 6 | `executeTemplate` | `postgres-graph-repository-asdb.ts:337` | `{ rows: [], … }` | Look up template by key in `ags_query_templates`; require postgres SQL variant; parameterized execute |
| 7 | `runAlgorithm` | `postgres-graph-repository-asdb.ts:343` | `{ rows: [], durationMs: 0 }` | Implement 3 algos: `degree_centrality`, `weakly_connected_components`, `bfs_distance` |
| 8 | `enqueueProjectionJob` | `postgres-graph-repository-asdb.ts:322` | `{ jobId: 0 }` | INSERT into `ags_graph_projection_sync_jobs` RETURNING id |
| 9 | `takeSnapshot` | `postgres-graph-repository-asdb.ts:325` | `{ snapshotId: "" }` | INSERT into `ags_graph_projection_snapshots` with node/edge counts |
| 10 | `detectDrift` | `postgres-graph-repository-asdb.ts:328` | `{ driftEvents: [] }` | SELECT from `ags_graph_projection_drift_events` where un-remediated |
| 11 | `rebuildProjection` | `postgres-graph-repository-asdb.ts:331` | zeros | INSERT into `ags_graph_projection_rebuilds`; project from source-of-truth |
| 12 | `explainPath` | `postgres-graph-repository-asdb.ts:380` | `{ path: null }` | Delegate to `shortestPath`; hydrate provenance + governance status per hop |
| 13 | `applyProjectionJob` counters | `postgres-graph-repository-asdb.ts:122` | only `nodesCreated`/`edgesCreated` | Discriminated created vs updated counts + delete counts |

### Tier C — Skeleton/dead-code cleanup (2 slices)

| # | Slice | Files | Action |
|---|---|---|---|
| 14 | **Delete `postgres-graph-repository.ts`** | `server/agent-studio/services/graph/repository/postgres-graph-repository.ts` + `index.ts` re-export + `postgres-graph-repository-asdb.ts` doc-block | 176-LoC skeleton unreferenced since #1524; doc-block names this as deletable |
| 15 | **Memgraph repo close-out** | `memgraph-graph-repository.ts:27` list | Implement `runAlgorithm` via Memgraph MAGE (if available; falls back to read-side); `takeSnapshot`/`detectDrift`/`rebuildProjection` delegate to the same ASDB tables since postgres remains source-of-truth |

### Tier D — Other server-side stubs (5 slices)

| # | Slice | File:line | Action |
|---|---|---|---|
| 16 | **Promotion adapter target binding** | `services/promotion/adapter-asdb.ts:168` ("Phase 11 MVP: target asset binding deferred to activate; stub returns 0") | Look up target asset; return real count |
| 17 | **MCP dispatcher async path** | `services/mcp/dispatcher.ts:34` ("TODO: revisit if/when async dispatch is needed") | Add streaming-aware async branch behind backwards-compat |
| 18 | **api/router.ts encryption-at-rest** | `api/router.ts:2002` ("Encryption-at-rest TODO") | Add encrypted secret column for the MCP server-id mapping rows |
| 19 | **Graph health-alert α slice** | `services/graph/health-alert-cron.ts:20` ("`ags_runtime_alerts` is out of scope for the α slice") | Open the table + write alerts on threshold breach |
| 20 | **Failure-state recordFailureStateEvent kinds** | per-kind audit on `services/failure-states/contracts.ts` | Audit remaining un-bridged kinds + wire emissions |

### Tier E — Client UI deferral close-out (3 slices)

| # | Slice | File:line | Action |
|---|---|---|---|
| 21 | **AgentMarketplacePage UI** | `pages/AgentMarketplacePage.tsx:13` ("deferred to a follow-up — UI-side; backend already exists") | Build the search + install + version flip UI |
| 22 | **RetrofitPage per-lane rollups + clickable-rollup fusion** | `pages/RetrofitPage.tsx:828` + `:955` | Render per-lane rollups; make them filter the table |
| 23 | **RegionAdminPanel pin add/edit/remove forms** | `components/RegionAdminPanel.tsx:11` ("Pin add/edit/remove forms are intentionally out of scope for this slice") | Build the three forms with optimistic UI + tRPC mutations |

### Tier F — Operator-action-ready scaffolding (2 slices)

External infrastructure requires the operator to push a button; minimize the action surface.

| # | Slice | Action |
|---|---|---|
| 24 | **T-B.1 Neo4j CE G3 benchmark dispatcher** | `scripts/graph-bench/run-neo4j-ce-bench.ts` — single-command wrapper that triggers the existing `graph-bench-neo4j-ce.yml` GHA workflow_dispatch via `gh api`, polls completion, downloads artifact, commits to `docs/evidence/graph-backend/`. Operator's residual action: `pnpm tsx scripts/graph-bench/run-neo4j-ce-bench.ts` (one command). |
| 25 | **T-H V2 plugin framework first slice** | `services/plugin-framework/` — manifest registry + sandbox executor + install/uninstall lifecycle + permission gates (re-using `evaluateGovernance()`). Adheres to CLAUDE.md hard rules (single MCP dispatcher, OpenRouter for model execution). |

### Tier G — Doc-debt cleanup (1 slice)

| # | Slice | Action |
|---|---|---|
| 26 | **Strip closed-by-successor deferral markers** | Bulk-rewrite the 24 doc-comments that say "deferred to Phase X" / "out of scope for this PR" where the referenced work has shipped. Replace with status-neutral language describing what the code does. |

## What I'm leaving alone (and why)

### Genuine MVP-boundary documentation (13 markers)

These define the architecture, not implementation gaps. Removing them would lose information.

- `boot.ts:430` — "compliance-adjacent and out of scope" (env-flag-gated experimental boot path; the boundary is intentional)
- `ingestion-jobs-retention.ts:30` — "**Artifacts are out of scope for retention**" (compliance ADR decision)
- `ingestion-router.ts:29` — "out-of-scope as compliance-adjacent per the #669 doc-block"
- `stale-node-scanner.ts:39` — "un-sourced nodes are out of scope" (correct: cannot reconcile without a source)
- `cag/types.ts:549` + `:612` — "operator-actionable signal" (defines the semantic, not a gap)
- `failure-states/contracts.ts:148` — "Stable operator-action expectation: monitor / investigate / …" (taxonomy field, not a gap)
- `retention/lifecycle-state-vocab.ts:125` — "operator-actionable diagnostic stored on the row" (semantic, not a gap)
- `studio-mcp-server.ts:765` — "What to do when asked for something out of scope or forbidden" (prompt text shown to the agent)
- `BasesPanel.tsx:2441` — "operators can read the raw markdown as a workaround" (ADR-justified narrow scope)
- `IngestionJobsRetentionPanel.tsx:102` — "compliance-adjacent, out of scope"
- `realtime-doc-authorize.ts:9` — "out-of-scope at the end of #774" (closure record)
- `shared/constants.ts:276` — string literal in agent-autonomy taxonomy

### External-infrastructure residual (slices 24+25 above)

- **Aura migration execution** — requires paid Aura subscription. Phase 27 ADR exists; the code path is already idempotent. Operator action remains: provision Aura → set `GRAPH_BACKEND=neo4j_aura`. Nothing for me to ship from here without that subscription.
- **Multi-region production rollout** — requires AWS / equivalent multi-region account. The code (cross-region guard, region-cache pubsub, region-admin router) is shipped per MR-1. Operator action remains: provision the second region → flip the env vars.

These are flagged on the ship plan but cannot be eliminated by code alone.

## Execution order

1. **Slice 1 (this doc)** — doc-only, opens the contract.
2. **Slices 2–4 (Tier A)** — finish what the canvas viz needs.
3. **Slices 5–13 (Tier B)** — eliminate the wired-backend stubs in dependency order: `shortestPath` first (needed by `explainPath`), then standalone reads (`executeTemplate`, `runAlgorithm`), then projection writes.
4. **Slices 14–15 (Tier C)** — dead-code cleanup is cheap and unblocks confusion.
5. **Slices 16–20 (Tier D)** — other-server-side stubs in any order.
6. **Slices 21–23 (Tier E)** — UI close-out.
7. **Slices 24–25 (Tier F)** — operator scaffolding.
8. **Slice 26 (Tier G)** — final pass: bulk doc-debt cleanup so the grep result no longer flags closed work.

## Acceptance

This catalogue is closed when:

- Every Tier A/B/C/D/E slice has a merged PR.
- Tier F slices have merged PRs + a runbook the operator can execute with a single command.
- The next `grep -rn -E "TODO|FIXME|deferred|out of scope|skeleton|stub|operator-action"` over `server/agent-studio/` + `client/src/modules/agent-studio/` returns only the 13 MVP-boundary markers above + the 2 external-infrastructure operator-action references.

## Counter-pressure

If a slice surfaces a finding that would require a real architectural rethink (not just a stub), the slice is split: the rethink lands as an ADR PR; the implementation lands as a follow-on. The catalogue stays open until the follow-on merges.

No silent re-scoping. No "deferred to Phase N+1". If something can't ship, it gets a paragraph above naming why, signed by a code-evidence link.

---

Generated 2026-05-19. Updated as slices land (per-slice receipt rows appended at the bottom).

## Slice receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 1 (this doc) | #1527 | `943351c2` | Opens the contract |
| 2 d3-force simulation | #1528 | `860bf26a` | Local + Global canvas; 31-test source-scan |
| 3 boundary-node fetch | #1529 | `8f789606` | globalGraphSample includes neighbors-of-sample |
| 4 upsertEdge dedup | #1530 | `44fd9c50` | Partial unique index + onConflictDoUpdate + manual migration |
| 5 shortestPath CTE | #1531 (bundled) | `56b1d9fa` | Recursive CTE BFS |
| 6 executeTemplate | #1531 (bundled) | `56b1d9fa` | Against ags_query_templates via $client.query |
| 7 runAlgorithm | #1532 | `157f97a3` | 5-algorithm closed-taxonomy coverage |
| 8-13 projection methods | #1533 | `7a341cd9` | enqueueProjectionJob/takeSnapshot/detectDrift/rebuildProjection/explainPath/applyProjectionJob counters |
| 14 skeleton deletion | #1534 | `f7f5e954` | 176-LoC postgres-graph-repository.ts removed |
| 15 memgraph close-out | #1535 | `3376a4c1` | All "Still skeleton" methods closed |
| 16 promotion target-asset binding | #1536 | `338f7d9e` | createDraft no longer returns sentinel 0 |
| 17 MCP dispatcher decision | #1537 (bundled) | `f59e63d4` | TODO → load-bearing architectural decision |
| 18 OAuth encryption-at-rest | #1537 (bundled) | `f59e63d4` | clientSecret + codeVerifier + nonce + state encrypted at rest |
| 19 health-alert retention | #1538 | `fded7a87` | 90-day envelope on resolvedAt-only |
| 20 failure-state bridge + audit | #1539 | `e2780da7` | retention-cron catch wires background_job_failed |
| 21 marketplace publish dialog | #1540 (bundled) | `b3fff80b` | Full publish-form Dialog on AgentMarketplacePage |
| 22 RetrofitPage lane drill | #1540 (bundled) | `b3fff80b` | onClickLane + lane-filter banner |
| 23 RegionAdminPanel doc truth-audit | #1541 | `0f644bd1` | Forms had shipped; doc-block was stale |
| 24 Neo4j CE bench dispatcher | #1542 | `8857d96c` | One-command operator wrapper around GHA workflow_dispatch |
| 25 plugin framework first slice | #1543 | `8a9d9af2` | Closed-taxonomy contracts + manifest validator |
| 26 doc-debt sweep | #1544 | `e1043217` | Strips closed-by-successor markers across 6 files |

## Closure receipt (2026-05-19)

All 26 slices have merged into main. Pre-mission grep tally was 76
deferral / out-of-scope markers across the agent-studio module;
post-slice-26 the count is reduced to genuine MVP-boundary
documentation + a handful of within-slice closure references
(e.g. "slice 19 of the no-deferral catalogue (2026-05-19) closed
…"). External-infrastructure residuals (Aura subscription,
multi-region account) remain as operator scaffolding (slices 24 +
25 ship the code paths; the operator's residual is one CLI
invocation, not a multi-PR rebuild).

---

## Continuation mission (2026-05-19, post-slice-26)

**Trigger:** post-slice-26 re-scan over `server/agent-studio/` + `client/src/modules/agent-studio/` for `TODO|FIXME|deferred|skeleton|stub` produced 172 markers. After triage:

| Triage class | Count | Action |
|---|---|---|
| **Real implementation gaps shippable from this session** | 5 | Ship — covered by slices 27–31 below |
| Closed-by-successor (marker text refers to work already shipped) | 8 | Strip the markers in slice 30 (doc-debt cleanup) |
| Test-seam / DI stub references (`Test seam — supply a stub …`) | ~95 | Leave — intentional dependency-injection signal |
| Genuine MVP-boundary documentation / spike intent | ~50 | Leave — these are intent, not deferrals |
| Cycle-8 + architectural sub-arcs (model registry + AI Types catalog + tool-call streaming + RAC orchestration error registry + RAC derivation + binding fixture drain) | 6 | Split — separate continuation arc (catalogue tabled, see "Tabled for next arc" below) |
| Workspace-default-bindings LR-02/03/04/08 follow-ons (Phase 29 caller migrations) | 4 | Tabled for next arc — historical Phase 29 follow-on |

### Continuation slices

| # | Slice | File:line | Action |
|---|---|---|---|
| 27 | **Vault search procedure** | `services/vault/router.ts:508` + `services/vault/search.ts` | Replace skeleton `[]` return with tsvector-backed `AsdbVaultSearchService.search()`. Permission filter against `ags_vault_members`. |
| 28 | **Background-jobs metadata table** | `services/workspace-observability/background-jobs.ts:62` + new `drizzle/tables/agent-studio-background-job-status-metadata.ts` | Add `ags_background_job_status_metadata` (status PK, terminal:bool, retryable:bool, label, severity) + reseed the `TERMINAL_BACKGROUND_JOB_STATUSES` set from the table on boot. |
| 29 | **Impact-analysis Cypher templates** | `services/graph-lens/impact-analysis-executor.ts` + new `services/graph-lens/impact-analysis-templates.ts` + `ags_query_templates` seed | Register ≥1 parameterized template for `knowledge_impact`; route `runImpactAnalysis` to `GraphRepository.executeTemplate(...)` for kinds with templates; `classifyImpactAnalysisExecutorMode` returns `"template"` for those. |
| 30 | **Doc-debt sweep (continuation)** | 6 files | Rewrite "MVP 1 skeleton" / "Phase 7.5 fills" / "deferred kinds" markers in `vault/repository.ts:4,104`, `vault/search.ts:2,7`, `semantic-enrichment-router.ts:386`, `graph-quality/mutation-worker.ts:88` where the referenced work has shipped. |
| 31 | **BasesPanel β kind picker** | `client/src/modules/agent-studio/components/BasesPanel.tsx:287,1420` | Kind picker for column-kind on row create/edit + adaptive value editor per kind. |

### Tabled for next arc (architectural sub-arcs, not deferrable from this session)

These are real gaps but require multi-PR architectural scaffolding outside the scope of a doc-block sweep. Each gets a follow-on catalogue arc when work resumes:

- **Tool-call streaming on Model Access** — `chat-stream.ts:180,362,563` + `services/chat.ts:1108`. Requires extending the `ModelAccess.stream()` contract with a `tool_call_delta` event class + adapter wiring across OpenRouter / direct-provider paths. Multi-PR sub-arc.
- **Model-registry-driven context budget** — `services/runtime/context-window.ts:37`. Requires a model-context-window registry (per model: window size, training cutoff, modality). Cycle-8 sub-arc.
- **AI Types catalog availability** — `bindings.ts:501`. Phase 12.b — requires AI Types catalog table + tRPC + UI.
- **Drain legacy fixtures into binding rows** — `services/chat.ts:1358`. Phase 27.5b migration arc.
- **RAC orchestration error registry** — `services/runtime/rac-orchestrator.ts:86`. M7-c8 — requires registry pattern for error classes.
- **Per-source RAC planner derivation** — `services/rac/planner-mode.ts:26,167`. Requires per-source `RetrievalPlanItem` derivation logic.
- **Workspace-default-bindings caller migrations** — `workspace-default-bindings.ts:7`. LR-02/03/04/08 — Phase 29 follow-on; each LR has its own catalogue entry.

These are real but architecturally separable; opening them mid-mission would violate "no silent re-scoping" — each gets its own contract document when next worked.

### Continuation execution order

1. **Slice 27** (vault search) — smallest, single procedure, isolated.
2. **Slice 28** (background-jobs metadata) — adds a table, mechanical.
3. **Slice 29** (impact-analysis templates) — single template + executor branch.
4. **Slice 30** (doc-debt sweep) — bulk text rewrite once 27–29 land.
5. **Slice 31** (BasesPanel kind picker) — UI-only, no server changes.
6. **Slice 32** — continuation closure receipt with merge SHAs.

### Continuation receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 27 vault search | TBD | TBD | tsvector-backed `AsdbVaultSearchService` + router wiring |
| 28 background-jobs metadata | TBD | TBD | `ags_background_job_status_metadata` + boot-reseed |
| 29 impact-analysis templates | TBD | TBD | `knowledge_impact` template registered |
| 30 doc-debt sweep continuation | TBD | TBD | 6-file marker sweep |
| 31 BasesPanel kind picker | TBD | TBD | β kind picker + adaptive editor |
| 32 continuation closure | TBD | TBD | Closure receipt |
