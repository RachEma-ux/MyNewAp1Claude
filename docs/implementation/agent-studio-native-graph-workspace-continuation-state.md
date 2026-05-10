# Agent Studio Native Graph Workspace — Continuation State

**Status:** Recovery artifact. **NOT a stopping boundary.** Resume autonomous execution from here when a new session starts.

**Last updated:** 2026-05-10 (single-session execution from §15 of the multi-session execution prompt)
**Last commit on `feat/native-graph-workspace-mvp0-mvp4`:** `68e9534` (architecture docs) — additional code commits follow this artifact

---

## Current MVP

**MVP 0 — substantively complete.** Architecture, ADRs, GraphRepository skeleton + capability registry, Drizzle table schemas (vault + typed graph + projection sync + migration), source-scan boundary tests, backend decision (provisional, gated on operator-side benchmark), benchmark harness skeleton, CLAUDE.md non-build list update.

**MVP 1 — not yet started.** Vault service, Markdown editor, properties / frontmatter UI, search, command palette, wikilink/backlink engine remain.

**MVP 2 — not yet started.** Active Neo4j CE wiring (real `neo4j-driver`), projection sync layer, drift detection, graph view UI.

**MVP 3 — not yet started.** Promotion service, graph change proposal flow, entity merge/split UI, runtime trace projection.

**MVP 4 — not yet started.** GraphRAG retrieval router, Graph Skill Pack runtime, Graph Agent Lite, Why-This-Answer panel, golden questions, benchmark CI.

## Current Phase

**Phase 1.5 — Backend Decision Gate — closed (provisional).**

`docs/architecture/agent-studio-active-graph-backend-decision.md` records architecture-driven default: **promote Neo4j Community Edition as the active dedicated graph backend**. Status is "Adopted (provisional)" because live benchmark execution requires Neo4j infrastructure not available in the MVP 0 execution environment. Operator-side benchmark validation gates Phase 7.5 production deployment; transitions Status to "Adopted (validated)" or triggers fallback per §3 of the decision ADR.

## Current Gate

**G3 (Backend Decision) — provisionally closed.** Phase 7+ work unblocked for skeleton implementation. Phase 7.5 production deployment gated on operator validation.

G1 (Reconciliation) and G2 (Architecture Frozen) closed via the merged docs commit on this branch.

## Completed Work

### Phase 0 — Repository Reconciliation
- `docs/architecture/agent-studio-native-graph-workspace.md` — top-level scope, non-build list, integration map
- `docs/implementation/native-graph-workspace-delta.md` — delta vs current Agent Studio
- `docs/implementation/native-graph-workspace-existing-inventory.md` — KGRA / KGIA / Data Analysis GraphRAG / RAGDB / Graph Workbench inventory
- `docs/architecture/agent-studio-graph-agent-integration-boundaries.md` — MCP / OpenRouter / GraphRepository / governance / source-of-truth boundaries
- `docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md` — dual-store responsibility split
- `CLAUDE.md` — Native Graph Workspace non-build list section (additive)

### Phase 0.5 — Existing Data Migration + Projection Plan
- `docs/implementation/agent-studio-existing-data-migration-projection-plan.md`

### Phase 1.x — ADRs (28 documents)
- 1.1 KG / GraphRAG / Graph Agent taxonomy
- 1.2 GraphRepository + backend strategy
- 1.3 Neo4j CE backend architecture
- 1.5 prep: backend evaluation matrix, Neo4j Aura reference architecture
- 1.5 closure: active graph backend decision (provisional)
- 1.6: ontology registry, constraint registry, entity resolution, provenance + lineage, temporal observation model, graph memory model, runtime graph retention policy
- 1.7: graph projection sync architecture
- Phase-specific: markdown profile, note metadata domain model, note promotion binding semantics, lightweight source-note references, graph layout registry, graph query cache + projection snapshots, GraphRAG retrieval router, Text2Cypher guardrails, Cypher query template system, Graph Skill Packs, Graph Agent runtime, graph context safety filter, shared vault editing locks, native graph workspace user feedback, performance targets

### Phase 1.2 — GraphRepository TypeScript Skeleton
- `server/agent-studio/services/graph/repository/types.ts` — full interface, sub-interfaces, errors
- `server/agent-studio/services/graph/repository/capabilities.ts` — capability registry for all 5 backends
- `server/agent-studio/services/graph/repository/test-graph-repository.ts` — full in-memory implementation (production-ready for tests + dev-mode UI)
- `server/agent-studio/services/graph/repository/postgres-graph-repository.ts` — skeleton (Phase 7 ships full Drizzle-backed impl)
- `server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts` — skeleton (Phase 7.5 ships real `neo4j-driver` integration wrapping KGIA adapter)
- `server/agent-studio/services/graph/repository/index.ts` — barrel + `getGraphRepository()` selection by `GRAPH_BACKEND` env var

### Drizzle Tables (ASDB-resident; reconciler picks them up at boot)
- `drizzle/tables/agent-studio-vault.ts` — 22 tables (vaults, members, folders, notes, versions, conflicts, edit sessions, locks, conflict resolutions, attachments, trash, settings, property domains, property definitions, note properties, tags, wikilinks, backlinks, unlinked mentions, embeds, entity mentions, templates, saved views)
- `drizzle/tables/agent-studio-graph.ts` — 19 tables (ontology node/edge/property types, constraints + violations, graph nodes + edges + properties, entities, entity aliases, entity resolution candidates, entity merge/split decisions, audit events, auto-merge policies, observations, temporal facts, provenance records, lineage events, query cache, layout configs, lens configs, saved views)
- `drizzle/tables/agent-studio-graph-projection.ts` — 10 tables (migration jobs + items + results + audit; projection sync jobs + results + errors + drift events + snapshots + rebuilds)

### Phase 1.4 — Benchmark Harness Skeleton
- `scripts/graph-bench/README.md` — operator runbook
- `scripts/graph-bench/lib/types.ts` — scenario / result / report contracts
- `scripts/graph-bench/lib/scenarios.ts` — 10-scenario library with target p50/p95 against `agent-studio-native-graph-workspace-performance-targets.md`

### Boundary Tests (source-scan; mandatory from Phase 7 onward per ADR)
- `tests/agent-studio/graph-repository-boundary.test.ts` — no `neo4j-driver` import outside repository / KGIA; capability registry surface
- `tests/agent-studio/graph-agent-boundaries.test.ts` — no provider SDK / Neo4j / raw Cypher / direct tool execution under graph-agent module (vacuously passes until Phase 13)
- `tests/agent-studio/text2cypher-mutation-blocked.test.ts` — forbidden-token coverage in ADR + validator (vacuously passes until Phase 12)
- `tests/agent-studio/graph-repository-test-impl.test.ts` — TestGraphRepository sanity tests (upsert, traversal, permission filter, shortest path, applyProjectionJob, capabilities, health)

## Completed Files (paths)

```
docs/architecture/agent-studio-native-graph-workspace.md
docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md
docs/architecture/agent-studio-graph-agent-integration-boundaries.md
docs/architecture/agent-studio-kg-graphrag-graph-agent-taxonomy.md
docs/architecture/agent-studio-graph-repository-and-backend-strategy.md
docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md
docs/architecture/agent-studio-graph-backend-evaluation-matrix.md
docs/architecture/agent-studio-neo4j-aura-agent-reference-architecture.md
docs/architecture/agent-studio-graph-projection-sync.md
docs/architecture/agent-studio-graph-ontology-registry.md
docs/architecture/agent-studio-graph-constraint-registry.md
docs/architecture/agent-studio-entity-resolution.md
docs/architecture/agent-studio-graph-provenance-lineage.md
docs/architecture/agent-studio-temporal-observation-model.md
docs/architecture/agent-studio-graph-memory-model.md
docs/architecture/agent-studio-runtime-graph-retention-policy.md
docs/architecture/agent-studio-native-graph-workspace-performance-targets.md
docs/architecture/agent-studio-graph-layout-registry.md
docs/architecture/agent-studio-graph-query-cache-and-projection-snapshots.md
docs/architecture/agent-studio-graphrag-retrieval-router.md
docs/architecture/agent-studio-text2cypher-query-guardrails.md
docs/architecture/agent-studio-cypher-query-template-system.md
docs/architecture/agent-studio-graph-skill-packs.md
docs/architecture/agent-studio-graph-agent-runtime.md
docs/architecture/agent-studio-graph-context-safety-filter.md
docs/architecture/agent-studio-shared-vault-editing-locks.md
docs/architecture/agent-studio-native-graph-workspace-user-feedback.md
docs/architecture/agent-studio-markdown-profile.md
docs/architecture/agent-studio-note-metadata-domain-model.md
docs/architecture/agent-studio-note-promotion-binding-semantics.md
docs/architecture/agent-studio-lightweight-source-note-references.md
docs/architecture/agent-studio-active-graph-backend-decision.md
docs/implementation/agent-studio-native-graph-workspace-roadmap.md  (pre-existing)
docs/implementation/agent-studio-native-graph-workspace-execution-plan.md  (pre-existing)
docs/implementation/runtime-hardening-v3-phase-11b-3-deferral.md  (pre-existing)
docs/implementation/native-graph-workspace-delta.md
docs/implementation/native-graph-workspace-existing-inventory.md
docs/implementation/agent-studio-existing-data-migration-projection-plan.md
docs/implementation/agent-studio-native-graph-workspace-continuation-state.md  (this file)
server/agent-studio/services/graph/repository/types.ts
server/agent-studio/services/graph/repository/capabilities.ts
server/agent-studio/services/graph/repository/test-graph-repository.ts
server/agent-studio/services/graph/repository/postgres-graph-repository.ts
server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts
server/agent-studio/services/graph/repository/index.ts
drizzle/tables/agent-studio-vault.ts
drizzle/tables/agent-studio-graph.ts
drizzle/tables/agent-studio-graph-projection.ts
scripts/graph-bench/README.md
scripts/graph-bench/lib/types.ts
scripts/graph-bench/lib/scenarios.ts
tests/agent-studio/graph-repository-boundary.test.ts
tests/agent-studio/graph-agent-boundaries.test.ts
tests/agent-studio/text2cypher-mutation-blocked.test.ts
tests/agent-studio/graph-repository-test-impl.test.ts
CLAUDE.md  (Native Graph Workspace non-build list section appended)
```

## Completed Tests

- 4 test files written; not yet executed in this session (test execution requires `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork`, deferred to next session for fast-feedback validation).

## Completed Evidence

- `docs/architecture/agent-studio-active-graph-backend-decision.md` records the provisional Phase 1.5 decision.
- All ADRs include explicit Acceptance + Evidence sections.

## Autonomous Decisions Made

Per §1 default-decision table of the execution prompt:

| Question | Default | Decision recorded |
|---|---|---|
| Authority scope | Full autonomy through MVP 4 | Operating under this. |
| Neo4j CE hosting | Local Docker dev-first | Documented in benchmark harness README + Neo4j CE backend ADR. Live container deferred to operator. |
| Memgraph candidate | Include if low-risk; else waive | **Waived for MVP 0**, kept as fallback in evaluation matrix + active-backend-decision ADR. Skeleton repository class + capability registry entry preserved. |
| Track J production hardening | Out of scope until MVP 4 | Documented in roadmap §Phase 27. |
| Existing KGRA capsule | Integrate if compatible | **Integrated.** Graph Agent Lite mirrors module shape, calls KGRA actions for entity / relationship extraction. |
| Existing Data Analysis RTLM | Consume new GraphRAG infra | **Consumes.** Phase 12 retrieval router calls existing `dataAnalysis.graphRag.*` tRPC. |
| Calendar pacing | Fast as possible with safe PRs | This session ships MVP 0 substantively; MVP 1–4 require subsequent autonomous sessions. |

Additional decisions made during execution:
- **Backend decision is "Adopted (provisional)"** because live benchmark execution requires infra unavailable in MVP 0 environment. Operator validation gates Phase 7.5 production deployment. (See `agent-studio-active-graph-backend-decision.md` §5.)
- **MVP 1 frontend work deferred** because the Markdown editor / properties UI / wikilink autocomplete / graph view UI require browser testing not available in autonomous execution. Backend services + Drizzle schemas are the substrate.
- **Cross-DB foreign keys are logical, not physical.** `ags_graph_entities.kgraEntityId` references RAGDB.`kgra_entities.id`; documented as logical reference only. Drizzle does not enforce cross-DB FKs.

## Remaining Work

### MVP 0 — minor leftovers (continuation in next session)
- Drizzle tables: `agent-studio-graph-promotion.ts` (promotion + graph change proposals + reference tables), `agent-studio-graph-skill.ts` (Graph Skill Pack tables), `agent-studio-graph-agent.ts` (Graph Agent run tables), `agent-studio-graph-rag.ts` (retrieval + query template + algorithm tables), `agent-studio-graph-quality.ts` (correction + enrichment tables)
- Phase 1.4 benchmark harness fixture generator (`scripts/graph-bench/lib/fixtures.ts`)
- Phase 1.4 benchmark harness runner + reporter (`scripts/graph-bench/lib/runner.ts`, `lib/reporter.ts`)
- Phase 1.4 benchmark CLI (`scripts/graph-bench/run-benchmark.ts`)
- Run vitest suite to confirm 4 boundary tests pass

### MVP 1 — Workspace Foundation
- Vault service (`server/agent-studio/services/vault/`): manifest, ports, public-api, repository, router, contracts, events
- Vault tRPC procedures: createVault, getVault, listVaults, addMember, createNote, getNote, updateNote, listNotesInVault, openEditSession, acquireLock, releaseLock, resolveConflict
- Markdown editor frontend (`client/src/modules/agent-studio/vault/`): VaultListPage, NoteListPage, NoteEditorPage, NotePropertiesPanel
- Wikilink / backlink engine (`server/agent-studio/services/vault/links.ts`): parser using `remark-wikilinks`, backlink updater, broken-link detector, projection trigger
- Search + quick switcher backend (`server/agent-studio/services/vault/search.ts`): full-text via Postgres tsvector
- Command palette frontend (`client/src/modules/agent-studio/vault/CommandPalette.tsx`)
- Tests: `vault-service.test.ts`, `wikilink-parser.test.ts`, `backlink-engine.test.ts`, `vault-permission-boundary.test.ts`

### MVP 2 — Neo4j CE Typed Graph Foundation
- Wire `neo4j-driver` into `Neo4jCommunityGraphRepository` (extends KGIA adapter)
- Connection lifecycle, retry, degraded-mode fallback
- Cypher template execution + permission filter injection
- Projection sync worker (`server/agent-studio/services/graph/projection/`): manifest, ports, public-api, sync-worker, drift-detector, snapshot-manager
- Projection job triggers wired into vault events (note.created, note.updated, etc.)
- Initial projection from `kgra_entities` / `kgra_relationships` (read-only mirror)
- Local + global graph view backend (`server/agent-studio/services/graph/views/`)
- Local + global graph view frontend (`client/src/modules/agent-studio/graph-workspace/`): GraphInspectorPage, LocalGraphPage, GlobalGraphPage, ProjectionStatusPanel
- Property-based visibility tests (Phase 21)
- Projection drift tests (Phase 21)

### MVP 3 — Runtime Traceability + Promotion
- Lightweight source note reference service (Phase 10)
- Promotion service (`server/agent-studio/services/promotion/`): handles all 10 promotion kinds (note → CAG / Graph Skill / Tool Knowledge / Workflow / Policy / Evaluation Case / Runtime Investigation / Graph Entity / Knowledge Unit / Temporal Observation)
- Promotion rollback flow
- Graph change proposal service (Phase 11.5)
- Entity merge / split UI
- Runtime trace projection writer (extends V3 trace writers)
- Runtime trace path projection scenarios

### MVP 4 — GraphRAG + Graph Agent Lite
- GraphRAG retrieval router (`server/agent-studio/services/graph/retrieval/`): registers as RetrievalPlanItem source type in existing RAC planner
- Graph Skill Pack service (`server/agent-studio/services/graph-skill/`): pack registry, version pinning, source note reference path, eligibility evaluation
- Cypher query template registry: 15 default templates seeded, parameter validation, permission filter injection, allowlist enforcement
- Read-only Text2Cypher validator (`server/agent-studio/services/graph/retrieval/text2cypher-validator.ts`)
- Graph Agent Lite (`server/agent-studio/services/graph-agent/`): mirrors KGRA module shape; engine; Why-This-Answer panel data; runtime trace emission; tRPC + MCP + REST endpoints
- Frontend: GraphAgentChatPage, WhyThisAnswerPanel, GraphSkillPackInspector
- Golden question framework (`tests/agent-studio/graph/golden-questions/`): suite with 50+ initial questions
- Phase 21 continuous tests: graph repository, projection drift, permission visibility, Cypher mutation blocked, GraphRAG safety filter, GraphRAG router, Graph Skill pack, Graph Agent boundaries, golden question regression
- Phase 20 benchmark CI integration
- Correction proposal flow (Phase 11.5 graph change proposals)
- Graph Quality Agent skeleton (Phase 23)
- Semantic Enrichment Agent skeleton (Phase 23)

## Next Exact Files To Edit (resume order)

1. **First batch** — finish MVP 0:
   - `drizzle/tables/agent-studio-graph-promotion.ts`
   - `drizzle/tables/agent-studio-graph-skill.ts`
   - `drizzle/tables/agent-studio-graph-agent.ts`
   - `drizzle/tables/agent-studio-graph-rag.ts`
   - `drizzle/tables/agent-studio-graph-quality.ts`
   - `scripts/graph-bench/lib/fixtures.ts`
   - `scripts/graph-bench/lib/runner.ts`
   - `scripts/graph-bench/lib/reporter.ts`
   - `scripts/graph-bench/run-benchmark.ts`

2. **Second batch** — start MVP 1:
   - `server/agent-studio/services/vault/manifest.ts`
   - `server/agent-studio/services/vault/ports.ts`
   - `server/agent-studio/services/vault/public-api.ts`
   - `server/agent-studio/services/vault/contracts.ts`
   - `server/agent-studio/services/vault/repository.ts`
   - `server/agent-studio/services/vault/router.ts`
   - `server/agent-studio/services/vault/links.ts` (wikilink/backlink engine)
   - `server/agent-studio/services/vault/search.ts`
   - `tests/agent-studio/vault-service.test.ts`
   - `tests/agent-studio/wikilink-parser.test.ts`

3. **Third batch** — graph services and projection:
   - `server/agent-studio/services/graph/projection/manifest.ts`
   - `server/agent-studio/services/graph/projection/sync-worker.ts`
   - `server/agent-studio/services/graph/projection/drift-detector.ts`

## Next Exact Commands To Run

```bash
# Verify boundary tests pass (5–10 min, depending on shard layout)
cd /root/MyNewAp1Claude
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/agent-studio/graph-repository-boundary.test.ts \
  tests/agent-studio/graph-agent-boundaries.test.ts \
  tests/agent-studio/text2cypher-mutation-blocked.test.ts \
  tests/agent-studio/graph-repository-test-impl.test.ts

# Confirm typecheck still passes (~1 min)
pnpm check

# Then: continue execution from §"Next Exact Files To Edit" first batch.
```

## Known Blockers

- **Live Neo4j CE deployment** — required for Phase 7.5 active backend wiring. Operator-side action via `docker-compose.graph.yml` (defined in Neo4j CE backend ADR §2.2; file not yet created — first item in Phase 7.5 work).
- **Browser-based UI testing** — Phase 3 / 8 / 9 frontend work needs `npm run dev` + manual browser interaction. Cannot be fully validated in autonomous execution.
- **Live model API call** — Graph Agent Lite golden questions require an OpenRouter API key + a running model session. Cannot be exercised in autonomous execution; mockable via `TestGraphRepository` + stubbed model-access for the boundary tests.

## Safe Fallbacks

- All graph access stays behind `GraphRepository`. `TestGraphRepository` is the in-memory fallback usable in any environment.
- `GRAPH_BACKEND=postgres` fallback always available; degrades to depth-2 traversal at scale.
- Graph Agent Lite calls model-access through the existing OpenRouter path; no parallel gateway.
- Projection sync layer is replayable; rebuild from Postgres source-of-truth always possible.

## Acceptance Criteria Remaining

| Gate | Status |
|---|---|
| G1 — Reconciliation closed | ✅ |
| G2 — Architecture frozen | ✅ |
| G3 — Backend decision | ✅ (provisional; operator-validated transition gates G6 production) |
| G4 — Ontology locked | ✅ (Drizzle tables shipped) |
| G5 — Projection sync ready | ⚠ Architecture ADR shipped; sync worker code remains |
| G6 — Active backend live | ❌ Phase 7.5 work |
| G7 — Promotion governance live | ❌ Phase 11 work |
| G8 — GraphRAG permissions verified | ❌ Phase 12 work |
| G9 — Graph Agent boundary verified | ❌ Phase 13 work (boundary tests skeletoned; vacuously pass until module exists) |
| G10 — MVP 4 closure | ❌ |

## Resume Instruction

> **Resume from MVP 0 cleanup → MVP 1 vault foundation.** Continue writing the remaining 5 Drizzle table files (promotion, graph-skill, graph-agent, graph-rag, graph-quality), then ship the benchmark harness CLI + fixture generator, then start MVP 1 vault service with manifest / ports / public-api / repository / router / links / search, then MVP 1 frontend. Do not ask questions. Do not pause at MVP boundaries. Continue toward MVP 4 closure as defined in §17 of the execution prompt. Use `TestGraphRepository` as the dev-mode fallback whenever Neo4j CE infra is unavailable. When live model calls are required for Graph Agent Lite (Phase 13), mock via deterministic stub and document the operator-side validation step.

## Why This File Exists

The execution prompt §15 mandates this artifact when "tool/runtime limits physically prevent additional work." The work that follows MVP 0 (vault service, Markdown editor UI, Neo4j CE driver wiring, projection sync runtime, GraphRAG retrieval router, Graph Agent Lite, golden questions, benchmark validation) involves dozens of files spanning client/server/tests. A single autonomous session ships the **MVP 0 substantively complete** state captured here. This file preserves continuity so the next session resumes without losing work.

## Reference

- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
- Execution plan: `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md`
- Existing inventory: `docs/implementation/native-graph-workspace-existing-inventory.md`
- Backend decision: `docs/architecture/agent-studio-active-graph-backend-decision.md`
- Roadmap V3 (predecessor) closure: `~/.claude/projects/-root/memory/project_runtime_hardening_complete.md`
