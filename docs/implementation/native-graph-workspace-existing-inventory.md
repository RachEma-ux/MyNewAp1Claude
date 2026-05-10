# Native Graph Workspace — Existing Graph Inventory

**Phase:** MVP 0 Phase 0 (Repository Reconciliation, Addendum)
**Companion to:** `docs/implementation/native-graph-workspace-delta.md` and `docs/architecture/agent-studio-native-graph-workspace.md`
**Status:** Adopted — locks the existing-graph map produced by Phase 0 reconciliation

---

## 1. Purpose

The repository already contains **four** graph-shaped subsystems. The Native Graph Workspace must extend and unify these, not duplicate them. This addendum captures the full inventory produced during MVP 0 Phase 0 reconciliation (2026-05-10) and supersedes any earlier "does not exist" claims in the delta doc.

## 2. Existing graph subsystems

### 2.1 KGRA (Knowledge Graph + Reasoning Agent) — ACTIVE

- **Location:** `server/kgra-agent/`
- **Status:** PR #75 shipped (FINAL); active module
- **Module key:** `"kgraAgent"` (per `manifest.ts`)
- **Runtime mode:** `worker` (required=false), depends on `["rag"]`
- **Database:** shared, schema `"ragdb-via-rag"`
- **Routes:** `/data-analysis/kgra-agent`
- **Public API:** `server/kgra-agent/public-api.ts`
- **Engine:** `server/kgra-agent/engine.ts` — `executeKGRARun()`
- **Pipeline:** 12-node pipeline (`server/kgra-agent/nodes.ts`) — classify, plan, execute, synthesize
- **Modes** (`router.ts` `run` procedure): `direct_query`, `path_reasoning`, `graphrag_local`, `graphrag_global`, `drift`, `basic_rag`, `bundle_evaluation`, `self_learning`, `expertise_building`, `research_mode`
- **Actions** (`actions.ts`): `ingestProject()`, `buildKnowledgeGraph()`, `getGraphStats()`
- **Frontend capsule:** `client/src/modules/kgra-agent/`
- **Health:** registered at boot (manifest lines 45–69)

**Position in Native Graph Workspace:** KGRA is the **existing Graph Agent runtime** for entity / relationship extraction and reasoning over `kgra_entities` / `kgra_relationships` in RAGDB. The new "Graph Agent Lite" (Phase 13) is a **vault-aware sibling**, not a replacement. Graph Agent Lite:
- Mirrors KGRA Agent module shape (manifest / ports / public-api / engine / nodes / state)
- Reads from `ags_vault_*` tables (Markdown notes) instead of `kgra_*` raw extraction
- Reuses KGRA pipeline patterns where applicable (intent classification, retrieval planning)
- Calls KGRA Agent for entity / relationship extraction when extracting graph facts from notes
- Does not duplicate the 12-node KGRA pipeline

### 2.2 KGIA (Knowledge Graph Inference Agent) — ACTIVE (Neo4j adapter is STUB)

- **Location:** `server/modules/kgia/`
- **Status:** Active; Neo4j adapter is a stub awaiting real `neo4j-driver` integration
- **Frontend routes:** `/kgia/*` with 6 pages:
  - `/kgia` — `KGIAWorkbenchPage.tsx` (graph canvas + editor)
  - `/kgia/sources` — `KGIASourcesPage.tsx` (Neo4j source registry / connection mgmt)
  - `/kgia/benchmarks` — `KGIABenchmarksPage.tsx` (query perf analytics)
  - `/kgia/governance` — `KGIAGovernancePage.tsx` (role / permission editor)
  - `/kgia/oversight` — `KGIAOversightPage.tsx` (audit trail)
- **Server modules:**
  - `server/modules/kgia/schema.ts` — Neo4j schema discovery types
  - `server/modules/kgia/infrastructure/neo4j-adapter.ts` — connection config, query executor, schema reader, test endpoint (STUB)
  - `server/modules/kgia/infrastructure/graphstores/neo4j/neo4j-query-executor.ts` — subgraph execution
  - `server/modules/kgia/domain/query-planner.ts` — Cypher planning
  - `server/modules/kgia/domain/types.ts` — `GraphSource` type with Neo4j endpoint + credentials
  - `server/modules/kgia/runtime/nodes/execute-read-query.ts` — read-only Cypher execution node
  - `server/modules/kgia/runtime/orchestrator.ts` — runtime for Neo4j queries
  - `server/modules/kgia/runtime/subgraphs/direct-query.subgraph.ts` — direct Cypher query subgraph
  - `server/modules/kgia/services/entity-resolver.ts` — entity linking + disambiguation

**Position in Native Graph Workspace:** KGIA is the **existing Neo4j integration**. The new `Neo4jCommunityGraphRepository` (Phase 7.5) **extends KGIA's adapter** — it does not greenfield a Neo4j driver wrapper. Specifically:
- `Neo4jCommunityGraphRepository` consumes / wraps `server/modules/kgia/infrastructure/neo4j-adapter.ts`
- The KGIA query-planner becomes the foundation for the Phase 12.5 Cypher template registry
- KGIA `entity-resolver` is consumed by the Phase 1.6 entity resolution layer (no parallel resolver)
- KGIA UI pages become the foundation for Phase 8/9 graph view surfaces (Local / Global / Saved Views)

### 2.3 Data Analysis GraphRAG subdomain — ACTIVE

- **Location:** `server/data-analysis/graphrag/`
- **Status:** Active; Python worker on `:8484` (env `GRAPHRAG_WORKER_URL`); missing worker = degraded mode
- **Module key:** `"dataAnalysis"` (`server/data-analysis/manifest.ts`)
- **Public API:** `server/data-analysis/public-api.ts` exports manifest, events, handoffs, ports, GraphRAG worker status, Data Acquisition worker status
- **Subfiles:**
  - `server/data-analysis/graphrag/jobs.ts` — job orchestrator
  - `server/data-analysis/graphrag/router.ts` — tRPC for indexing, querying
  - `server/data-analysis/graphrag/service.ts` — source registry, sync orchestration
  - `server/data-analysis/graphrag/source-registry.ts` — source CRUD
  - `server/data-analysis/graphrag/worker-client.ts` — Python worker API boundary
- **Worker contract:** `graphRagWorkerContract` (webhook + HTTP endpoints for job status, results)
- **Routes:** `/api/trpc/dataAnalysis.graphRag.*`
- **Tables owned (ASDB):** `graphrag_sources`, `graphrag_sync_runs`, `graphrag_index_runs`, `graphrag_query_runs`, `graphrag_artifact_registry` (per `drizzle/tables/graphrag.ts`)

**Position in Native Graph Workspace:** Data Analysis GraphRAG is the **existing GraphRAG control plane**. The new GraphRAG Retrieval Router (Phase 12) **registers with this control plane** as a workspace-scoped source — it does not greenfield indexing or query workflows. Specifically:
- New `ags_vault_*` tables become a new `graphragSources` row (one per workspace vault)
- New typed graph projections feed `graphragIndexRuns` for downstream community / summary indexing
- The Phase 12 retrieval router calls existing `dataAnalysis.graphRag.*` tRPC for query execution
- GraphRAG worker contract preserved; new project does not modify the Python worker

### 2.4 RAGDB Knowledge Graph — ACTIVE

- **Schema:** `drizzle/tables/ragdb.ts`
- **Database:** RAGDB (separate Postgres database, per CLAUDE.md)
- **Tables:**
  - `kgra_entities` — id, name, shortName, entityType, mentions, directory, sourceDocId, buildId, createdAt; indexed by name/type/build
  - `kgra_relationships` — id, sourceEntityId, targetEntityId, relationshipType, weight, buildId, createdAt; indexed by source/target/type/build
  - `kgra_build_runs` — id, buildId (unique), entityCount, relationshipCount, chunkCount, typeCounts (JSON), status, builtAt, createdAt
  - `kgra_manual_nodes` — id, uniqueId (unique), name, shortName, family, kind, description, properties (JSON), validFrom, validUntil
- **Owner:** RAGDB owned by the `rag` module (legacy, CLAUDE.md §Embedding Storage Decision)

**Position in Native Graph Workspace:** RAGDB / `kgra_*` tables are the **existing entity / relationship store**. The new typed graph layer (Phase 7) introduces:
- `ags_graph_nodes` / `ags_graph_edges` on **ASDB** (not RAGDB) — for typed, ontology-backed, governance-aware graph metadata
- Mappings between `kgra_entities` and `ags_graph_nodes` (preserves existing entity references)
- Projection from both `ags_graph_*` and `kgra_*` into Neo4j CE via the projection sync layer
- No mutation of `kgra_*` tables; treated as read-only source for projections

### 2.5 Graph Workbench — DORMANT (design locked, code not yet implemented)

- **Design docs:**
  - `docs/GRAPH-WORKBENCH-ARCHITECTURE.md` — 20-component target map (shell, left panel, graph renderer, right inspector, camera, animation, status bar)
  - `docs/GRAPH-WORKBENCH-AUDIT.md`
  - `docs/GRAPH-WORKBENCH-IMPLEMENTATION-PLAN.md`
- **Server code:** none
- **Client code:** none (KGIA `/kgia/*` pages are the closest existing analog)

**Position in Native Graph Workspace:** Graph Workbench is the **dormant UI design**. The new Phase 8 / 9 graph views land under the Graph Workbench architecture template, mounted under a new `/agent-studio/graph-workspace/` route. KGIA UI pages remain at `/kgia/*` and are not replaced.

## 3. Boundary contracts (existing — must respect)

### 3.1 MCP dispatcher

- **Entry:** `dispatchMcpToolCall(input)` in `server/agent-studio/services/mcp/dispatcher.ts:556`
- **Contract:** input validation → server lookup → tool existence → per-agent allowedTools authorization → governance pre-invoke → `conn.callTool()` (or sandbox.execute() for `code_execution`) → governance post-invoke → audit row
- **Tested by:** `tests/agent-studio/dispatcher-layering-coverage.test.ts`, `dispatcher-audit-coverage.test.ts`
- **Hard rule:** Graph Agent Lite must use this entry; no parallel tool execution.

### 3.2 OpenRouter Model Access

- **Entry:** `execute(input)` in `server/openrouter/model-access/execute.ts`
- **Streaming:** `stream(input)`
- **Embeddings:** `embed(input)`
- **Validation:** `validateBinding(input)`
- **Credential boundary:** `withProviderCredential()` from `server/provider-connections/internal/credential-resolver.ts` — only place outside `secrets/` that decrypts credentials at runtime
- **Adapter shapes:** OpenAI-compatible (`/v1/chat/completions`), Anthropic (`/v1/messages`)
- **Hard rule:** Graph Agent Lite must use these entries; no direct provider SDK imports.

### 3.3 RAC retrieval

- **Planner:** `server/agent-studio/services/rac/retrieval-planner.ts` — `planRetrieval(input): Promise<RetrievalPlan>`
- **Executor:** `server/agent-studio/services/rac/retrieval-executor.ts` — fans out across plan items
- **Filter:** `server/agent-studio/services/rac/retrieval-filter.ts`
- **Existing adapters:** `GraphRagAdapter`, `LocalPgvectorAdapter`, `KnowledgeUnitAdapter` (via `server/agent-studio/services/rac/ingestion/dispatcher.ts`)
- **Gap:** RAC planner does NOT yet accept graph-shaped retrieval. The Phase 12 GraphRAG Retrieval Router fills this gap by registering a new `RetrievalPlanItem` source type for graph traversal.

### 3.4 CAG capability packs

- **Location:** `server/agent-studio/services/cag/`
- **Risk taxonomy:** 8-class `riskClass` (D-TOOL-1, locked); read via `readRiskClass()` only (D-TOOL-5)
- **Hard rule:** CAG runtime contract is locked. Native Graph Workspace adds **CAG block → source note version reference** (Phase 10) as additive metadata only.

### 3.5 Module manifest pattern

- **Pattern:** `server/*/manifest.ts` exports a `ModuleManifest` with `key`, `runtime`, `database`, `router`, `routerKey`, `permissions`, `governanceActions`, `routes`, `navigation`, `health`, `publicApi`, `events`, `ports`, `communication`, `boot`
- **Invariant** (per CLAUDE.md `feedback_check_script_pitfall.md`): **No setInterval at manifest level.** Manifests declare intent; services start timers.
- **Hard rule:** New modules (vault, projection, graph-skill, graph-agent) follow this pattern.

## 4. Native Graph Workspace placement

The new project lands at:

```
docs/architecture/agent-studio-native-graph-workspace.md   ← top-level ADR
docs/architecture/agent-studio-*.md                          ← Phase 1 ADRs
docs/implementation/agent-studio-native-graph-workspace-*.md ← roadmap, exec plan, delta, this inventory
docs/operations/agent-studio-vault-runbook.md                ← MVP 1 ops
docs/operations/agent-studio-graph-projection-runbook.md     ← MVP 2 ops
docs/operations/agent-studio-graph-agent-lite-runbook.md     ← MVP 4 ops
docs/evidence/graph-backend/                                  ← Phase 1.4 benchmark evidence
drizzle/tables/agent-studio-vault.ts                          ← MVP 1 schema (NEW)
drizzle/tables/agent-studio-graph.ts                          ← Phase 7 schema (NEW)
drizzle/tables/agent-studio-promotion.ts                      ← Phase 11 schema (NEW)
drizzle/tables/agent-studio-graph-skill.ts                    ← Phase 12.5 schema (NEW)
drizzle/tables/agent-studio-graph-agent.ts                    ← Phase 13 schema (NEW)
server/agent-studio/services/vault/                            ← MVP 1 service (NEW)
server/agent-studio/services/graph/repository/                 ← Phase 1.2 GraphRepository (NEW)
server/agent-studio/services/graph/projection/                 ← Phase 1.7 projection sync (NEW)
server/agent-studio/services/graph/retrieval/                  ← Phase 12 GraphRAG router (NEW)
server/agent-studio/services/graph-skill/                      ← Phase 12.5 (NEW)
server/agent-studio/services/graph-agent/                      ← Phase 13 Graph Agent Lite (NEW; sibling to server/kgra-agent/)
server/agent-studio/services/promotion/                        ← Phase 11 (NEW)
client/src/modules/agent-studio/vault/                          ← MVP 1 UI (NEW)
client/src/modules/agent-studio/graph-workspace/                ← Phase 8/9 graph views (NEW)
scripts/graph-bench/                                            ← Phase 1.4 benchmark harness (NEW)
tests/agent-studio/graph-*.test.ts                              ← Phase 21 boundary + visibility tests (NEW)
```

## 5. What this changes vs the original execution plan

The original execution plan in `agent-studio-native-graph-workspace-execution-plan.md` assumed a greener field. With KGRA / KGIA / Data Analysis GraphRAG / RAGDB already in place, the actual MVP 0 → MVP 4 work shrinks substantially:

| Original assumption | Revised reality |
|---|---|
| Build Neo4j integration from scratch | Extend `server/modules/kgia/infrastructure/neo4j-adapter.ts` (currently stub); harden into `Neo4jCommunityGraphRepository` |
| Build Graph Agent Lite from scratch | Mirror `server/kgra-agent/` module shape; sibling, not replacement; reuse pipeline primitives |
| Build GraphRAG retrieval from scratch | Register as new `RetrievalPlanItem` source type in existing RAC planner; call existing `dataAnalysis.graphRag.*` for execution |
| Build entity / relationship extraction | Consume KGRA `actions.ts` (`ingestProject()`, `buildKnowledgeGraph()`); add typed-graph layer on top |
| Build Cypher template registry from scratch | Extend KGIA `domain/query-planner.ts` and `runtime/subgraphs/direct-query.subgraph.ts` |
| Build entity resolution from scratch | Consume KGIA `services/entity-resolver.ts`; add governance-approved auto-merge layer on top |
| Build graph workbench UI from scratch | Implement the dormant `docs/GRAPH-WORKBENCH-*.md` design; KGIA `/kgia/*` pages stay; new `/agent-studio/graph-workspace/` for vault-scoped surfaces |

**Estimated PR count reduction:** ~35–45% (from 69–87 PRs to 45–55 PRs across MVP 0–4).

## 6. Acceptance

- [x] KGRA capsule mapped (§2.1).
- [x] KGIA module mapped (§2.2).
- [x] Data Analysis GraphRAG mapped (§2.3).
- [x] RAGDB schema mapped (§2.4).
- [x] Graph Workbench design mapped (§2.5).
- [x] MCP dispatcher boundary mapped (§3.1).
- [x] OpenRouter Model Access boundary mapped (§3.2).
- [x] RAC retrieval gap identified (§3.3).
- [x] CAG runtime contract identified (§3.4).
- [x] Module manifest pattern identified (§3.5).
- [x] Native Graph Workspace placement locked (§4).
- [x] Original plan revisions captured (§5).

## 7. Evidence

- Explore agent reconnaissance report (2026-05-10).
- File reads: `server/kgra-agent/manifest.ts`, `server/kgra-agent/router.ts`, `server/kgra-agent/nodes.ts`, `server/modules/kgia/infrastructure/neo4j-adapter.ts`, `server/data-analysis/manifest.ts`, `server/data-analysis/public-api.ts`, `drizzle/tables/ragdb.ts`, `drizzle/tables/graphrag.ts`, `server/agent-studio/services/mcp/dispatcher.ts`, `server/openrouter/model-access/execute.ts`, `client/src/App.tsx` route declarations.
- ADR convention sample: `docs/architecture/agent-studio-approval-gate-extension.md`, `docs/architecture/agent-studio-multi-region.md`.
