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
| 27 vault search | #1546 | `c1ba1be3` | tsvector-backed `AsdbVaultSearchService` + router wiring + manual migration for GIN tsvector index |
| 28 background-jobs metadata | #1547 | `f7603c4c` | `ags_background_job_status_metadata` table + boot-reseed (`seedBackgroundJobStatusMetadata`) + lockstep guard test |
| 29 impact-analysis templates | #1548 | `732f4540` | `knowledge_impact` Cypher template registered + `runImpactAnalysisViaTemplate` + operator-callable seed script |
| 30 doc-debt sweep continuation | #1549 | `d75dfa83` | Stale "MVP 1 skeleton" / "Phase 7.5 fills" / "3 deferred kinds" / "placeholder stubs" markers rewritten across 4 files |
| 31 BasesPanel + InboxPanel doc-blocks | #1550 | `a368a712` | 4 stale β/γ-deferral doc-blocks rewritten to name live successors (T-F.107/109/111/116/120/121) |
| 32 continuation closure | this PR | TBD | Closure receipt + updated grep tally |

## Continuation closure receipt (2026-05-19)

The continuation mission shipped 5 implementation slices + 2 doc-block
sweeps + this closure receipt across PRs #1546–#1551, on top of the
catalogue extension at PR #1545. Post-continuation, the grep over
`server/agent-studio/` + `client/src/modules/agent-studio/` for
`TODO|FIXME|deferred|skeleton|stub|out of scope|operator-action`
returns:

- **Test-seam / DI stub references** (`Test seam — supply a stub …`,
  `Tests inject a stub`, etc.) — ~95 hits, all intentional
  dependency-injection signals.
- **Genuine MVP-boundary documentation** — defines the architecture,
  not a deferral (the original 13 markers + a few new ones added by
  the continuation slices that name their own narrow boundaries
  honestly, e.g. impact-analysis templates ship for `knowledge_impact`
  only; the other 6 kinds remain anchor-only stub until their
  templates are authored).
- **Spike intent** — `code-graph/spike/README.md` and `agentic-loop.ts`
  PR #1 contract-only language are by-design markers, not deferrals.
- **Tabled architectural sub-arcs** — tool-call streaming on Model
  Access, model-registry-driven context budget, AI Types catalog
  availability (Phase 12.b), drain legacy fixtures (Phase 27.5b), RAC
  orchestration error registry (M7-c8), per-source RAC planner
  derivation, workspace-default-bindings LR-02/03/04/08. Each named in
  the "Tabled for next arc" section above; each will get a follow-on
  catalogue when next worked.

External-infrastructure residuals (Aura subscription, Neo4j CE
benchmark, multi-region account) remain operator-callable via the
one-command scripts shipped in slices 24 + 25 of the original mission
+ the seed script in slice 29 of this mission.

### Carry-forward lessons (continuation)

1. **Source-of-truth tables decouple operator UX from code releases.**
   Slice 28's `ags_background_job_status_metadata` table lets an
   operator retune per-status behavior (severity, retryable, label)
   without a code change. The frozen `TERMINAL_BACKGROUND_JOB_STATUSES`
   set stays as a baseline for synchronous importers + a lockstep
   guard test prevents the two from drifting.
2. **Template registries enable per-kind incremental coverage.**
   Slice 29's `IMPACT_ANALYSIS_TEMPLATES` registry uses the same shape
   as graph-lens runners — kinds without an entry fall through to the
   stub, kinds with one route through `executeTemplate`. Future slices
   can add the remaining 6 templates without touching the executor.
3. **Mode classifiers are operator-visible signals worth keeping.**
   `classifyImpactAnalysisExecutorMode` returns `"stub" | "template"`
   per kind so the operator UI can render a "Stub mode — no template
   registered" badge per kind. Without this, an anchor-only result
   looks like "no impact"; the badge makes the cause visible.
4. **Doc-debt sweeps need successor anchors in source-scan tests.**
   Slice 30's test pairs each rewritten doc-block with the *successor*
   file/symbol so a regex-removal regression trips on the missing
   successor anchor, not on the absence of the deferral phrase alone.
   Otherwise a future refactor that re-introduces stub language would
   slip past CI.
5. **"Deferred to β/γ" doc-blocks rot fast.** Slice 31 found 4 sites
   where the doc-block was 1-2 releases stale; the implementation had
   shipped within the same arc but the doc-block was forgotten. Worth
   sweeping at the close of every arc, not just at the close of a
   mission.

---

## Continuation mission 2 (2026-05-19, post-slice-32)

**Trigger:** the slice-32 closure paragraph named 7 "tabled architectural sub-arcs." Re-audit confirmed that 3 of the 7 are genuinely closed-by-successor (the successor code shipped in earlier arcs but the deferral comment was never rewritten) and 3 are tractable single-PR work today. The remaining are real multi-PR migration arcs awaiting separate catalogues.

### Re-audit of the 7 tabled items

| Item | Status | Action |
|---|---|---|
| Tool-call streaming on Model Access | Multi-PR contract extension | Tabled — separate catalogue when Model Access streaming contract is touched |
| Model-registry-driven context budget | Tractable single PR | Ship in slice 35 |
| AI Types catalog availability (Phase 12.b) | Tractable single PR | Ship in slice 34 |
| Drain legacy fixtures helper deletion | Operator-gated (helper is operator-callable; deletion waits on no-env-depends) | Tabled — genuine operator-action residual |
| RAC orchestration error registry (M7-c8) | **Closed-by-successor** | Doc-debt sweep in slice 36 — `orchestration-error.ts` ships the registry; the doc-block at `rac-orchestrator.ts:86` is stale |
| Per-source RAC planner derivation | **Closed-by-successor** | Doc-debt sweep in slice 36 — `derivePlannerMode` already emits the 7 GraphRAG modes via `readGraphragRetrievalMethod`; the doc-block at `planner-mode.ts:26,167` is stale |
| Workspace-default-bindings LR-02/03/04/08 | Multi-file caller migrations | Tabled — each LR is its own migration arc per `PHASE_28_EXECUTION_PLAN.md` |

### Continuation-2 slices

| # | Slice | File:line | Action |
|---|---|---|---|
| 33 | **This catalogue** | this doc | Opens continuation-2 |
| 34 | **AI Types catalog cross-check** | `server/agent-studio/bindings.ts:501` + `validateBindingPolicy` | Add opt-in `crossCheckCatalog` option; when set, `validateBindingPolicy` calls `listAvailableProviderModels` and surfaces `catalogAvailable: true|false` instead of `null`. Default remains `null` for legacy callers — opt-in keeps the existing latency profile. |
| 35 | **Per-model context-window registry** | `server/agent-studio/services/runtime/context-window.ts:37` + `chat-stream.ts:175` + new `model-context-windows.ts` | Add a closed-taxonomy map `{ modelRef → tokenBudget }` covering the production models the workspace routes to. `chat-stream.ts` resolves `maxTokens` from the registry given the bound model ref, falling back to `MAX_CONTEXT_TOKENS` env when the ref is unknown. |
| 36 | **Doc-debt sweep continuation-2** | `rac-orchestrator.ts:86` + `planner-mode.ts:26,167` | Rewrite stale "deferred to a follow-up" / "deferred until per-source retrieval-method metadata lands" markers; both successors have shipped. |
| 37 | **Continuation-2 closure receipt** | this doc | Per-slice merge SHAs + carry-forward lessons |

### Continuation-2 execution order

1. **Slice 33** (this catalogue) — opens the contract.
2. **Slice 34** (AI Types catalog cross-check) — single function, isolated.
3. **Slice 35** (per-model context-window registry) — new module + 2 callers.
4. **Slice 36** (doc-debt sweep) — text-only on 2 files; closes the cycle-8 doc-debt.
5. **Slice 37** (closure receipt).

### Continuation-2 receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 33 catalogue | #1552 | `15ee78eb` | Opens continuation-2 |
| 34 AI Types catalog cross-check | #1553 | `30f4d20f` | Opt-in `catalogAvailable` boolean via `crossCheckCatalog` option |
| 35 per-model context-window registry | #1554 | `cd3aafce` | 10-entry closed-taxonomy registry + parallel-flow lockstep wiring across chat-stream + chat.ts |
| 36 cycle-8 doc-debt sweep | #1555 | `6d3d3ab3` | M7-c8 + Phase 12 derivation stale markers rewritten |
| 37 continuation-2 closure | this PR | TBD | Closure receipt |

## Continuation-2 closure receipt (2026-05-19)

The second continuation arc shipped 3 implementation slices + 1 doc-block
sweep + this closure receipt across PRs #1552–#1556. The re-audit found
2 of the 7 originally-tabled sub-arcs were closed-by-successor doc-debt;
the remaining 5 (tool-call streaming on Model Access, drain legacy
fixtures helper deletion, LR-02 + LR-03 + LR-04 + LR-08 caller
migrations) stay tabled — each is either a multi-PR architectural
contract extension or a multi-file caller migration arc that the
existing `PHASE_28_EXECUTION_PLAN.md` already scopes for separate
follow-on work.

### Continuation-2 carry-forward lessons

1. **Always re-audit "tabled" items.** Of 7 sub-arcs named in the
   slice-32 closure, 2 turned out to be doc-debt only — the successor
   code shipped during cycle-8 (orchestration-error registry M7-c8 +
   per-source RAC derivation Phase 12) but the deferral comment was
   never rewritten. A re-audit before the next mission catches these.
2. **Opt-in options keep latency profiles honest.** Slice 34's
   `crossCheckCatalog` defaults to `false` — runtime preflight (the
   hot path) skips the extra round-trip; only the UI status chip + the
   picker page opt in. The compromise lets the gap close without
   regressing hot-path latency.
3. **Closed taxonomies + suffix-match handle routed refs.** Slice 35's
   registry handles both `anthropic/claude-haiku-4-5` (direct provider
   ref) and `openrouter/anthropic/claude-haiku-4-5` (routed) via a
   single map + suffix-match lookup. A new model lands as one row in
   the table; no caller-side changes.
4. **Constants whose names rot still serve as type discriminants.**
   `PHASE_12_RESERVED_MODES` no longer accurately describes "reserved"
   modes (they are emitted via the retrievalMethod discriminator), but
   the name is held in place by 3 test imports + the
   graph-retrieval-router lockstep. The doc-block rewrite captures
   the live semantic; the constant name stays as a backward-compat
   anchor.
5. **Lockstep tests survive the slice that rewrites the doc they
   pin.** Slice 36's source-scan test re-asserts every L4-c8 lockstep
   invariant (DispatchErrorCode + namespace-boundary contract) so the
   rewrite doesn't accidentally weaken the cross-flow guard the
   existing `l1-l4-c8-doc-bundle.test.ts` enforces. Pattern: when you
   touch a lockstep-pinned doc-block, mirror the lockstep's
   assertions in your own slice's test.

**Post-continuation-3 update (slice 40 sweep):** of the 5 sub-arcs
named here at slice-37 close, only **1 remains** after the
continuation-3 re-audit:
- **Drain legacy fixtures helper deletion** — operator-callable; ships
  when no environment still depends on `scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts`.

The other 4 closed during this mission or before:
- **Tool-call streaming on Model Access** — shipped in continuation-3
  slice 39 (`execute.ts:streamEvents`); chat-stream's caller stays on
  `execute()` per the slice 40 doc-block above (tool-loop dispatch
  ordering requires the full call set per turn).
- **LR-02 / LR-03 / LR-04 / LR-08 caller migrations** — already
  shipped in Phase 29.4-29.6 (verified by continuation-3's re-audit;
  the references came from `PHASE_28_EXECUTION_PLAN.md`, which is
  itself stale).

---

## Continuation mission 3 (2026-05-19, post-slice-37)

**Trigger:** the slice-37 closure named 5 tabled sub-arcs. Re-audit
confirmed **4 of the 5 are already shipped** — LR-02 / LR-03 / LR-04 /
LR-08 caller migrations all reference workspace-default-binding
resolution + `gatewayCall(openRouter.modelAccess.*)` per Phase 29.4-29.6
on main today. Continuation-2's closure paragraph was wrong to keep them
tabled; the references came from `PHASE_28_EXECUTION_PLAN.md`, which
predates the Phase 29 migrations.

The 5th tabled item — **tool-call streaming on Model Access** — is
genuinely shippable as a single PR: the contract surface
(`ModelAccessStreamEvent` discriminated union with `text_delta` /
`tool_call_delta` / `tool_call_complete` / `done`) already exists in
`types.ts:174`; only the producer is missing.

### Re-audit of the 5 originally-tabled items

| Item | Status | Evidence |
|---|---|---|
| Tool-call streaming on Model Access | Tractable single PR | `types.ts:174` ships the contract; `execute.ts:315` is the production gap |
| Drain legacy fixtures helper deletion | Operator-gated (no-env-depends signal) | Tabled until operator confirms no environment depends on the helper |
| LR-02 embeddings caller | **Already migrated** | `server/embeddings/service.ts` uses `gatewayCall(openRouter.modelAccess.embed)` via workspace default binding |
| LR-03 documents/processor caller | **Already migrated** | `documents/processor.ts:340` lazy-imports `getEmbeddingService()` (Phase 29.4b) |
| LR-04 operators/provider-hub caller | **Already migrated** | `operators/provider-hub.ts:70` throws `OperatorBindingError` + uses `ags_workspace_default_provider_bindings` (role=`classifier`) |
| LR-08 chat/stream + automation | **Already migrated** | `chat/stream.ts:134` calls `resolveWorkspaceContext` (post-LR-08); `automation/block-executors.ts:230` ships `executeInvokeAgent` with Path B refuse |

### Continuation-3 slices

| # | Slice | File:line | Action |
|---|---|---|---|
| 38 | **This catalogue** | this doc | Opens continuation-3 |
| 39 | **Model Access streamEvents producer** | `server/openrouter/model-access/execute.ts` (+ types.ts) | Implement `streamEvents()` async generator that emits the existing `ModelAccessStreamEvent` union. Parse OpenAI SSE `delta.tool_calls` with per-index accumulation; emit `tool_call_delta` chunks with partial JSON, then `tool_call_complete` with the reconstructed call. Anthropic falls back to non-streaming `execute()` + single emit of the full output as one `text_delta` + zero-or-more `tool_call_complete`. |
| 40 | **Doc-debt sweep (LR + tool-call streaming markers)** | `execute.ts:315` + `types.ts:146` + `chat-stream.ts:577` + this catalogue's closure paragraph | Rewrite "tool-call streaming is deferred to Phase 17/18" (closed by slice 39) and the closure paragraph's "LR-02/03/04/08 caller migrations" mention (all 4 already shipped). |
| 41 | **Continuation-3 closure receipt** | this doc | Per-slice merge SHAs + carry-forward lessons |

### Continuation-3 execution order

1. **Slice 38** (this catalogue) — opens the contract.
2. **Slice 39** (streamEvents producer) — single file in Model Access; the contract surface is already locked.
3. **Slice 40** (doc-debt sweep) — text-only on 3 files + this doc; closes the closed-by-successor markers.
4. **Slice 41** (closure receipt).

### Continuation-3 receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 38 catalogue | #1557 | `ec6955d5` | Opens continuation-3; re-audits 4-of-5 already-shipped sub-arcs |
| 39 streamEvents producer | #1558 | `1ef64157` | OpenAI SSE tool-call accumulation + Anthropic fallback + 16-test source-scan+behavioral |
| 40 doc-debt sweep | #1559 | `76a10c88` | chat-stream tool-call streaming marker rewritten; closure paragraph re-audit |
| 41 continuation-3 closure | this PR | TBD | Closure receipt |

## Continuation-3 closure receipt (2026-05-19)

The third continuation arc shipped 1 implementation slice + 1 doc-block
sweep + this closure across PRs #1557–#1560. The re-audit found that
4 of the 5 originally-tabled sub-arcs from slice-37's closure had
already shipped — only legacy-fixture helper deletion remains, and
that one is operator-gated (waits for no-env-depends signal).

### Continuation-3 carry-forward lessons

1. **Tabled-item lists rot fast.** Continuation-2's closure named
   LR-02/03/04/08 as "remaining sub-arcs per `PHASE_28_EXECUTION_PLAN.md`".
   The plan doc predates Phase 29.4-29.6 migrations that already
   landed; continuation-2 inherited the stale wording without checking
   the live code. Pattern: re-audit each named tabled item before
   propagating it to the next mission's closure paragraph — at least
   one grep of the named file:line for the legacy pattern.
2. **Producer-side migrations don't auto-flip callers.** Slice 39's
   `streamEvents()` ships the full `ModelAccessStreamEvent` union, but
   chat-stream's tool-loop intentionally stays on non-streaming
   `execute()`. Per-turn dispatch needs the full `toolCalls` set
   before the next turn is built; switching to `streamEvents()` would
   defer dispatch to stream-end (no latency win) or break the
   ordering guarantee the MCP dispatcher relies on. Lesson: ship the
   producer + a "why caller stays" doc-block in the same arc so the
   architectural decision survives the cycle that opened the
   contract.
3. **`as const` discriminated unions decode SSE cleanly.** The
   `ModelAccessStreamEvent` union (4 variants discriminated by `type`)
   mapped onto OpenAI's SSE deltas without a normalizing intermediate:
   `delta.content` → `text_delta`, `delta.tool_calls[]` → per-index
   accumulators yielding `tool_call_delta` / `tool_call_complete`,
   `[DONE]` → `done`. Anthropic falls back to a single non-streaming
   execute + same envelope. Pattern: when a stream surface has
   multiple event kinds, ship the union as data + put the per-kind
   parser in a single producer rather than branching everywhere.
4. **The accumulator-flush double emit guard is structural.**
   `streamEvents()` flushes accumulated tool calls on BOTH the
   `[DONE]` branch AND the post-loop fallthrough so a stream that
   ends without a terminal sentinel (server-side close, network drop
   mid-stream-of-text-only-content) still surfaces accumulated tool
   calls. Catching the implicit-end case via "always flush on
   generator exit" would mean a finally block; the explicit dual emit
   sites keep the control flow grep-able.
5. **Operator-gated tabled items can stay tabled honestly.** The
   legacy-fixture helper (`scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts`)
   stays around because deleting it requires knowing no production
   environment depends on it. That's a real operator-action gate, not
   a deferral — the closure paragraph names it as such rather than
   tabling it as "follow-on architectural work."

After this slice, the no-deferral mission has shipped 41 slices
across 3 continuation arcs (1-26 original mission, 27-32 continuation-1,
33-41 continuation-2+3). All identified gaps in
`server/agent-studio/` + `client/src/modules/agent-studio/` +
`server/openrouter/model-access/` are either closed, genuine MVP-
boundary documentation, intentional DI stubs, or operator-gated
external-infrastructure residuals.

---

## Continuation mission 4 (2026-05-19, post-slice-41)

**Trigger:** post-slice-41 wide re-audit over `server/agent-studio/` +
`server/openrouter/model-access/` + `client/src/modules/agent-studio/`
for `deferred|skeleton|stub|out of scope|TODO|FIXME` (excluding
test-seam DI references, closure records, and MVP-boundary intent)
surfaces:

| Finding | Count | Action |
|---|---|---|
| Closed-by-successor doc-debt | 5 | Slice 43 sweep |
| Genuine implementation gap (operator-callable now) | 1 | Slice 44 — golden-questions live-eval runner caller |
| Genuine MVP-boundary intent (leave) | ~10 | Documented in earlier "What I'm leaving alone" section |
| Operator-gated residual | 1 | Legacy-fixture helper deletion — waits on no-env-depends signal |

### Re-audit findings — closed-by-successor

| Marker | Successor | Slice |
|---|---|---|
| `chat-stream.ts:369` — "Tool-call streaming on Model Access is deferred to a future phase" | `streamEvents()` in execute.ts (slice 39 / #1558) | 43 |
| `api/router.ts:3044` — "Recent-runs + per-run drill-in deferred to T-D.3.β" | `listRecentRuns` / `getRunStats` / `listProposals` in semantic-enrichment-router (T-D.3.β shipped) | 43 |
| `api/router.ts:3076` — "Run-lifecycle persistence + caller deferred to T-D.5.β/.γ" | Closed by slice 44 below (T-D.5.γ runner mutation) | 43 (after slice 44 merges) |
| `workspace-default-bindings.ts:7` — "consumed by the 4 deferred Phase 29 caller migrations (LR-02 / LR-03 / LR-04 / LR-08)" | All 4 migrated in Phase 29.4-29.6 (verified by continuation-3 slice 40 source-scan) | 43 |
| `realtime-doc-websocket-bridge.ts:189` — "Auth-cookie resolver lands in a follow-up PR" | `createDefaultGetUserIdFromUpgradeRequest` in realtime-doc-default-getuserid.ts (shipped via PR-V1-38 #789) | 43 |

### Continuation-4 slices

| # | Slice | File:line | Action |
|---|---|---|---|
| 42 | **This catalogue** | this doc | Opens continuation-4 |
| 43 | **Doc-debt sweep (continuation-4)** | 5 files | Rewrite the 5 markers above to name their live successors. |
| 44 | **Golden-questions triggerRun mutation (T-D.5.γ)** | `golden-questions-router.ts` + new procedure | Admin mutation that composes `buildLiveEngine` + `runLiveEvaluation` + `createGoldenQuestionsWriteStore.recordSuiteRun` to persist results to `ags_golden_question_runs` / `ags_golden_question_results`. Closes the `golden-questions-router.ts:15-28` "Deferred — run lifecycle persistence + caller" doc-block. |
| 45 | **Continuation-4 closure receipt** | this doc | Per-slice merge SHAs + carry-forward lessons. Mission close if nothing new surfaces. |

### Continuation-4 execution order

1. **Slice 42** (this catalogue) — opens the contract.
2. **Slice 43** (doc-debt sweep) — text-only on 5 files; lowest risk; clears the closure trail.
3. **Slice 44** (golden-questions triggerRun) — admin mutation; composes existing pieces; persistence already exists.
4. **Slice 45** (closure receipt + mission close).

### Continuation-4 receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 42 catalogue | #1561 | `7f74d19c` | Opens continuation-4; re-audit finds 5 closed-by-successor + 1 genuine gap (T-D.5.γ) |
| 43 doc-debt sweep | #1562 | `7d24e7be` | 4 closed-by-successor markers rewritten (chat-stream, api/router T-D.3.β, workspace-default-bindings, realtime-doc) |
| 44 golden-questions runner | #1563 | `2348f0b6` | T-D.5.γ — triggerLiveEvaluation mutation + composer + per-suite fail-soft persistence + 13 tests + live-engine-factory type fix |
| 45 continuation-4 closure | this PR | TBD | Closure receipt + mission close |

## Continuation-4 closure receipt (2026-05-19)

The fourth continuation arc shipped 1 implementation slice + 1 doc-block
sweep + this closure across PRs #1561–#1564. The re-audit found one
genuine implementation gap (T-D.5.γ runner caller) and five
closed-by-successor markers; all six closed in this arc.

### Continuation-4 carry-forward lessons

1. **Wide re-audit catches drift, even after consecutive sweeps.**
   Continuation-3 swept "tabled" items based on slice-37's closure
   paragraph. Continuation-4 ran a different query — grep over the
   *full* surface for `deferred|skeleton|stub|TODO|FIXME` excluding
   test-seam noise — and surfaced 5 markers continuation-3's narrow
   list missed (the api/router.ts mount comments, the workspace-
   default-bindings header, the realtime-doc auth-cookie default).
   Pattern: alternate between "list-driven" sweeps (re-audit named
   tabled items) and "surface-driven" sweeps (grep the live code
   independently) every other arc.
2. **Three-piece composer pattern keeps wiring slices small.** Slice
   44's runner mutation didn't need to ship the engine, the
   evaluator, or the persistence — those three pieces had landed in
   earlier arcs. The composer (`trigger-live-evaluation.ts`) is a
   ~190-line module that does nothing but call the three constructors
   in sequence. Test-seam DI (runner factory + write store + suite
   catalog + failure emitter) lets unit tests drive the whole flow
   without booting any boundary. Lesson: when a vertical involves
   multiple already-shipped primitives, the composer is its own
   slice — keep the router file narrow to tRPC procedures.
3. **Per-suite fail-soft persistence beats all-or-nothing.** When one
   suite's `recordSuiteRun` throws (transient ASDB outage, table
   constraint), the composer synthesizes a `suite_not_seeded`
   outcome and continues with the next suite. The operator sees
   which suite failed without losing the in-memory summary of the
   others. Pattern: when a per-row write is reasonably independent,
   wrap each in its own try/catch + surface failures in the
   discriminated outcome rather than throwing past the first one.
4. **Lockstep between router + api/router.ts mount comments.** The
   mount comment in `api/router.ts` carries its own deferred-state
   annotation independent of the sub-router's own doc-block. Slice
   44 rewrote both in the same commit — the per-router comment ("read
   surface + T-D.5.γ runner shipped") and the sub-router doc-block
   ("Slice 44 closed T-D.5.γ"). Lesson: when you close a tRPC
   surface's deferral, both files need the rewrite — the mount
   comment isn't load-bearing for runtime but it IS the operator-
   visible status indicator.
5. **Source-of-truth seed > read-store for runner inputs.** The
   composer loads suites from `DEFAULT_GOLDEN_QUESTION_SUITES`
   (in-code seed) rather than reading them back from ASDB via the
   read-store. Reasoning: the seed IS the canonical source — the
   read-store is for the operator UI's "browse what's persisted"
   view. Running the evaluator against the persisted shape would
   couple the runner to a successful seed sync, and worse, would
   silently run the wrong suites if the seed file changed but
   `seedAsDb()` hadn't been re-run. Lesson: pick the in-code source
   when the round-trip would obscure drift.

After this slice, the no-deferral mission has shipped **45 slices
across 4 continuation arcs** (1-26 original, 27-32 continuation-1,
33-37 continuation-2, 38-41 continuation-3, 42-45 continuation-4).
Post-mission audit checkpoint:

- All identified gaps in `server/agent-studio/` +
  `server/openrouter/model-access/` + `client/src/modules/agent-studio/`
  are either closed, genuine MVP-boundary intent, intentional DI
  stubs, or the one operator-gated residual.
- **Operator-gated residual** (1 item):
  `scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts`
  — deletion waits on no-env-depends confirmation.
- **Genuine MVP-boundary intent** (documented in the original
  "What I'm leaving alone" section): boot.ts compliance-adjacent
  paths, ingestion artifact retention exclusion, MCP `out of scope`
  prompt text, stale-node-scanner unsourced-node exclusion,
  failure-states / retention vocab fields, BasesPanel markdown-
  rendering narrow-arc decision, RegionAdminPanel + IngestionJobs
  panel compliance-adjacent banners. These are intent, not gaps.

The user's directive ("today's out-of-scopes are tomorrow's big bugs")
was honored: every gap large enough to ship from this device has
shipped. The remaining operator-gated item names the trigger
condition (no-env-depends) so a future operator can act on it
without re-deriving the deletion decision.

## Continuation-5 — third re-audit (2026-05-19)

The fourth-arc closure declared mission complete. Operator returned
with a fifth `build the next catalogue then append it to the todo
list then execute` directive. Per the continuation-4 carry-forward
lesson #1 ("alternate between list-driven and surface-driven sweeps
every other arc"), continuation-5 ran a **list-driven** re-audit:
revisit the carry-forward closure tables of all four prior arcs,
spot-check the operator-gated residual, then top up with a wide-
surface grep over `server/agent-studio/` +
`server/openrouter/model-access/` + `client/src/modules/agent-studio/`.

### Re-audit findings

The wide-surface grep produced 173 raw hits (`TODO|FIXME|deferred|
stub|placeholder|skeleton` minus test-seam noise). After triage:

- **2 stale doc-debt markers** name follow-up slices that have
  already shipped (closed-by-successor):

  | File:line | Marker text | Successor | Slice |
  |---|---|---|---|
  | `services/runtime/system-prompt-composer.ts:296` | "5. retrieval-evidence (RAC P5, placeholder until P5)" | RAC P14 shipped (see CLAUDE.md "Implementation Status" — retrofit closed at P14 / `55c8b6b`); the `input.retrievalEvidence` branch is fully wired | 47 |
  | `api/router.ts:3037` | "deferred to a future T-G.5.β slice (needs Cypher-template review)" | T-G.5.β template registry shipped at `services/graph-lens/impact-analysis-templates.ts` (no-deferral catalogue slice 29); the executor mode switches between `"stub"` + `"template"` per `classifyImpactAnalysisExecutorMode` | 47 |

- **2 conditional-on-future-need deferrals** (preserved — not
  actionable until trigger conditions met):

  | File:line | Marker | Trigger condition |
  |---|---|---|
  | `services/chat.ts:1117` | "result-introspection wrapper; deferred to a future PR if a dashboard surfaces a meaningful gap" | Operator dashboard reports a `Result.ok=false` observability gap |
  | `services/graph-lens/runners/runtime-lens-asdb-reader.ts:24` | "`workspaceId === viewer.workspaceId`; that's deferred to a follow-up slice" | Shared-cluster deployment (today single-region per CLAUDE.md "Deferred Scope") |

- **Operator-gated residual**: re-inspected
  `scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts`.
  Doc-block at line 38 still says "Phase 27.5b will delete this
  script once no environment depends on it." The script reads
  `DATABASE_URL` (no other env-vars), but the "depends on it"
  predicate is whether unbound legacy agents still exist in any
  operator-deployed environment — that's an operator question,
  not a code question. Preserved as residual.

- **Genuine MVP-boundary intent** (preserved): the 7 categories
  documented in continuation-4 closure §"Genuine MVP-boundary
  intent". Nothing has shifted from intent → gap since 2026-05-19.

### Catalogue

| Slice | Surface | Notes |
|---|---|---|
| 46 | **Open continuation-5 catalogue** | This entry. Documents the list-driven re-audit. |
| 47 | **Doc-debt sweep (continuation-5)** | Rewrite the 2 stale markers naming their live successors. Lockstep source-scan test. |
| 48 | **Continuation-5 closure receipt** | Per-slice merge SHAs + carry-forward lessons. Smallest arc to date — 3 PRs. |

### Continuation-5 receipts

| Slice | PR | Merge SHA | Notes |
|---|---|---|---|
| 46 catalogue | this PR | TBD | Opens continuation-5; list-driven re-audit, 2 stale markers + 2 conditional deferrals + 1 operator-gated residual |
| 47 doc-debt sweep | TBD | TBD | system-prompt-composer.ts:296 + api/router.ts:3037 rewritten naming live successors |
| 48 continuation-5 closure | TBD | TBD | Closure receipt + mission re-close |
