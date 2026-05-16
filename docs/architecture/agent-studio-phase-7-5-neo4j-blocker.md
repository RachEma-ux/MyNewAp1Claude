# Agent Studio — Phase 7.5 Neo4j Adapter Blocker (T-F.3 + T-G.2)

**Status:** Verified blocker, scoped unblock path documented (T-F.106 / Phase 7.5 ADR, 2026-05-16)
**Owner:** Agent Studio V1+ track-F / Phase 7.5
**Scope:** T-F.3 Impact Analysis Lens, T-G.2 Code Intelligence Graph

## Why this doc exists

The V1+ execution plan repeatedly names "Phase 7.5 production
Neo4j adapter" as the blocker for two distinct territories
(T-F.3, T-G.2). Operators reading the standing-pattern menu have
no single place that says **precisely** what's stubbed, where the
stub lives, what an unblock action looks like, and what's already
done versus what still depends on the unblock. This doc is that
single place.

It is a **blocker verification**, not an implementation. No code
changes ship here. The unblock itself is sequenced in §4.

## 1. What's verified stubbed today

### 1.1 `Neo4jCommunityGraphRepository` (`server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts`)

Every method that would issue Cypher returns a skeleton:

- **`executeTemplate()` (line 99)** — returns
  `{ rows: [], truncated: false, durationMs: 0, templateVersion: "skeleton" }`.
  This is the single chokepoint for all parameterized Cypher
  execution. T-F.3 needs this for every impact-analysis template.
- **`localGraph()` (line 59–69)** — returns empty nodes/edges with
  reason `"neo4j-ce skeleton — Phase 7.5 implements"`. Cypher
  template is in comments but never executed.
- **`health()` (line 137–144)** — returns `status: "degraded"`,
  error `"neo4j-ce driver not yet wired (Phase 7.5)"`.
- **24 additional stub methods** (lines 71–145) cover
  `globalGraphSample`, `neighborhood`, `shortestPath`,
  `upsertNode`/`Edge`, `applyProjectionJob`, `enqueueProjectionJob`,
  `takeSnapshot`, `detectDrift`, `rebuildProjection`,
  `runAlgorithm`, `filterByPermissions`, `isVisibleToUser`,
  `explainPath`, `explainNode`. All return empty collections /
  null with skeleton-marker fields.

### 1.2 `Neo4jKgiaAdapter` (`server/modules/kgia/infrastructure/neo4j-adapter.ts`)

The KGIA adapter that the Community Graph Repository wraps — same
state, boundary-only:

- **`executeNeo4jQuery()` (line 54–78)** — returns `records: []`
  with timing summaries. The real `session.run(queryText, params)`
  code path is in comments (lines 63–65) but disabled.
- **`readNeo4jSchema()` (line 31–50)** — returns placeholder schema
  when `source.schemaSnapshot` is missing; real path would call
  `CALL db.schema.visualization()` or `CALL apoc.meta.schema()`.
- **`testNeo4jConnection()` (line 82–97)** — returns success with
  version `"adapter-boundary"`.

### 1.3 What's NOT stubbed (already in place — does NOT need unblock)

These are commonly assumed to be part of the blocker but are
already complete and operating in their respective layers:

- **Impact analysis contracts** —
  `server/agent-studio/services/graph-lens/impact-analysis-contracts.ts`.
  Closed-taxonomy `IMPACT_ANALYSIS_KINDS` (7 kinds:
  knowledge_impact / runtime_impact / code_impact / security_impact
  / governance_impact / tool_impact / workflow_impact). Working
  `summarizeImpactAnalysisResult()` aggregator. Per-kind metadata
  for operator UI. No stubs.
- **Code intelligence contracts** —
  `server/agent-studio/services/code-graph/spike/` and
  `server/agent-studio/services/graph-lens/code-intelligence-contracts.ts`.
  Closed taxonomies (12 node types, 10 edge types), per-edge
  cardinality + endpoint constraints, validated batch insert
  helpers, summarize aggregator. All pure / working.
- **Lens runner contract + registry** — defines `LensRunnerFn`
  signature, `registerLensRunner` / `runLens` / `getLensRunner`
  + stub-runner registration for the 8 V1 lens kinds. The
  registry shipped; concrete runners not yet (impact-analysis
  runner is part of the T-F.3 unblock).
- **GraphRepository boundary discipline** —
  source-scan tests assert `neo4j-driver` is only imported under
  `server/agent-studio/services/graph/repository/**` and
  `server/modules/kgia/**`. Both halves of the unblock must
  preserve this boundary.

## 2. T-F.3 Impact Analysis Lens — blocker note

### Blocker (precise)

1. **Cypher execution**:
   `Neo4jCommunityGraphRepository.executeTemplate()` is a stub
   (§1.1, line 99). Every one of the 7 impact analyses (knowledge
   / runtime / code / security / governance / tool / workflow)
   must route through this method with a parameterized template
   key (e.g. `impact_knowledge`) and starting-node parameters.
2. **Concrete lens runner**: no `LensRunnerFn` exists for the
   impact analysis kind. The 8 existing runners are stub-runners
   that return empty snapshots; the impact-analysis runner is a
   distinct kind from the 8 existing lens kinds and needs a fresh
   registration.

### Unblock sequence (V1.5 target)

1. **Phase 7.5a** — wire `neo4j-driver` in
   `Neo4jKgiaAdapter`: import driver, instantiate at constructor
   time with `neo4j.driver(endpoint, neo4j.auth.basic(...))`,
   replace `executeNeo4jQuery` stub with real `session.run()`
   path. `health()` returns `status: "ok"` once a real driver
   connects. ~40 lines + connection-pool teardown on shutdown.
2. **Phase 7.5b** — implement
   `Neo4jCommunityGraphRepository.executeTemplate()`: parse the
   template key from input, resolve it from `ags_query_templates`,
   interpolate parameters, delegate to the (now-real) KGIA
   adapter, return the record rows with timing + truncation
   metadata. ~30 lines.
3. **Phase 7.5c** — author the 7 impact-analysis Cypher templates
   in `ags_query_templates` registry (one per impact kind). Each
   takes a starting node, max depth, and impact-type-specific
   parameters. Per-template review for cycles, depth caps,
   permission post-filter compatibility.
4. **T-F.3a runner** — write the impact-analysis `LensRunnerFn`
   closure that branches on the requested impact kind, calls
   `graphRepository.executeTemplate({ templateKey: 'impact_' + kind, ... })`,
   applies the existing `filterByPermissions()` post-filter,
   returns a `LensSnapshot` shaped per the contract. Register at
   boot time behind an envflag mirroring T-F.59's runtime-lens
   pattern.
5. **T-F.3b UI** — operator surface at `/agent-studio/graph-lens-browser`
   already lists every registered lens kind; the impact-analysis
   kind appears automatically once the runner is registered. A
   dedicated `/agent-studio/impact-analysis` page (or new lens-
   browser sub-route) adds the starting-node picker + impact-kind
   selector — out of scope for the Phase 7.5 unblock; can ship
   immediately after T-F.3a or as a follow-up slice.

### Estimate

- Phase 7.5a/b/c: 3 PRs, ~120 LOC total + 7 Cypher templates.
- T-F.3a/b: 2 PRs (runner + UI), ~250 LOC total.
- Full T-F.3 territory: ~5 PRs once Phase 7.5 lands.

## 3. T-G.2 Code Intelligence Graph — blocker note

### Blocker (precise)

T-G.2 has **two** gates:

1. **Parser spike outcome (T-E.1–T-E.4)** — the AST extraction
   strategy is undecided. `server/agent-studio/services/code-graph/spike/`
   has only README + boundary test (no tree-sitter imports outside
   spike; no neo4j-driver imports anywhere in spike). T-E ships
   3–4 spike PRs to evaluate tree-sitter vs. per-language
   strategy + byte-stability test. If the spike outcome is
   viable, T-G.2 proceeds; if not, the Code Intelligence sub-arc
   defers per the remaining-plan's T-G acceptance criteria.
2. **Projection sync writes** — even after the parser emits
   validated symbols/edges (per the existing
   `code-intelligence-contracts.ts` validators), they must be
   written to the graph projection. This routes through the same
   `Neo4jCommunityGraphRepository.applyProjectionJob` stub (§1.1).
   Same unblock as T-F.3's Phase 7.5a/b — once the driver and
   `executeTemplate` are real, the projection-sync methods become
   reachable.

### Unblock sequence (V1.5+ target)

1. **T-E.1–T-E.4 spike** — execute the AST-extraction spike
   (3–4 PRs). Decide tree-sitter vs. per-language strategy +
   byte-stability test outcome.
2. **Phase 7.5a/b** — unblock `executeTemplate` and
   `applyProjectionJob` per §2's Phase 7.5a/b.
3. **T-G.2 parser emitter** — implement the AST → validated
   code-graph-symbol-batch pipeline. Persist to ASDB via the
   existing `code-intelligence-contracts.ts` `validateCodeGraphEdgeBatch`
   helper.
4. **T-G.2 projection writes** — periodic batch job that drains
   pending code-graph-symbol/edge writes from ASDB into Neo4j via
   `applyProjectionJob`.
5. **T-G.2 lens runner** — `LensRunnerFn` for `code_intelligence`
   kind that queries the projection for symbol/edge subgraphs.
6. **T-G.2 UI** — operator surface (similar shape to T-F.3 §5).

### Estimate

- T-E.1–T-E.4: 3–4 PRs, decision-only.
- T-G.2: 8–10 PRs ONCE T-E approves + Phase 7.5 unblocks.
- Full T-G territory (institutional / code / security /
  recommendation): 18–25 PRs per the remaining-plan.

## 4. Recommended sequencing

Phase 7.5 unblocks BOTH territories with the SAME work (driver
wiring + `executeTemplate` real impl). Sequence:

1. **Phase 7.5a — neo4j-driver wiring** (1 PR, ~40 LOC). Critical
   path for all downstream work.
2. **Phase 7.5b — `executeTemplate` real impl** (1 PR, ~30 LOC).
   Critical path.
3. **Phase 7.5c — impact-analysis Cypher templates** (1 PR, 7
   templates + review).
4. **T-E spike** (parallel with 7.5c) — 3–4 PRs to decide code-
   graph parser strategy.
5. **T-F.3a runner** (1 PR, depends on 7.5c).
6. **T-F.3b UI** (1 PR, depends on T-F.3a).
7. **T-G.2 chain** (8–10 PRs, depends on T-E success + 7.5b).

T-F.3 unblocks faster (no parser spike dependency). T-G.2 is
gated on the spike outcome.

## 5. Boundary preservation

Both unblocks MUST preserve the GraphRepository boundary
(CLAUDE.md hard rule):

- **`neo4j-driver` imports** only in
  `server/agent-studio/services/graph/repository/**` and
  `server/modules/kgia/**`. Source-scan boundary test enforces
  this (`tests/agent-studio/graph-repository-boundary.test.ts`).
- **No `session.run()` calls outside the repository wrapper** —
  `Neo4jCommunityGraphRepository` is the single chokepoint; lens
  runners + parsers call `graphRepository.executeTemplate(...)` or
  `applyProjectionJob(...)`, never the driver directly.
- **Permission post-filter REQUIRED** for every query that
  returns nodes/edges to the operator UI. `filterByPermissions()`
  exists as a stub today; Phase 7.5b implements it alongside
  `executeTemplate`. T-F.3a's runner MUST apply it before
  returning the snapshot.

## 6. What this doc does NOT do

- Does not change any code. Phase 7.5 itself is a future PR
  sequence; this doc enumerates the WORK to scope it.
- Does not commit to a Phase 7.5 timeline. The plan continues to
  defer; this doc gives operators a precise scope estimate so
  the deferral can be honest ("Phase 7.5 is ~3 PRs of driver
  wiring + ~5 PRs of T-F.3" rather than "blocked").
- Does not unlock T-F.3 / T-G.2 to ship partial slices that
  exercise the impact-analysis code path against the stub. That
  would shape-test the lens runner contract without exercising
  real Cypher, which is a valid V1.5 partial-implementation
  pattern but adds maintenance cost without operator value — the
  stubs return empty results, so the UI shows "No matches" for
  every input. Better to wait for the real implementation.

## 7. References

- `server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts`
  — the stubbed repository.
- `server/modules/kgia/infrastructure/neo4j-adapter.ts` — the
  stubbed KGIA adapter (wrapped by §7.1).
- `server/agent-studio/services/graph-lens/impact-analysis-contracts.ts`
  — the (shipped) contracts T-F.3 will consume.
- `server/agent-studio/services/graph-lens/code-intelligence-contracts.ts`
  — the (shipped) contracts T-G.2 will consume.
- `server/agent-studio/services/code-graph/spike/` — the T-E spike
  boundary.
- `tests/agent-studio/graph-repository-boundary.test.ts` — the
  boundary-discipline source-scan test.
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  §"Phase 7.5" — canonical roadmap entry.
- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md`
  §6.1.bis post-T-F.105 menu (b) — first mention pointing here.
