# Agent Studio — KG / GraphRAG / Graph Agent Taxonomy — ADR

**Owner:** Agent Studio module + KGRA Agent + KGIA + Data Analysis + Knowledge
**Phase:** Native Graph Workspace MVP 0 — Phase 1.1
**Status:** Adopted — locks vocabulary across the Native Graph Workspace and existing graph subsystems
**Authority:** Locks the terminology that distinguishes Knowledge Graph, GraphRAG, Agentic GraphRAG, Graph Agent, MCP, Graph Skill Pack, KGRA, and KGIA.

---

## 1. Problem statement

The repository now hosts five graph-shaped concepts: **Knowledge Graph**, **GraphRAG**, **Graph Agent**, **KGRA Agent**, and **KGIA**. Without a locked taxonomy, the project risks:
- Confusing GraphRAG (retrieval) with Graph Agent (runtime) with KGRA (existing reasoning agent).
- Treating MCP as the Graph Agent layer.
- Treating Graph Skill Packs as CAG blocks.
- Treating Neo4j CE as the Knowledge Graph (it is the *projected* graph backend).

## 2. Decision (vocabulary)

### 2.1 Knowledge Graph

**Definition:** Structured, durable memory and context layer. Source of truth lives in Postgres (`ags_graph_*`, `kgra_entities`, etc.). Neo4j CE is the projected representation.

**Owns:** entities, relationships, ontology, constraints, provenance, lineage, temporal observations, decisions, people, systems, ownership, policies, workflows, code, security, evaluation memory.

**Does not:** retrieve answers, plan agents, execute tools.

### 2.2 GraphRAG (retrieval layer)

**Definition:** Retrieval layer over graph-grounded knowledge plus vector / full-text context. Aggregates graph traversal results, vector search results, and full-text search results into governed, permission-filtered, citation-bearing context blocks.

**Components (Phase 12):**
- Full-text search (existing `agsKnowledgeUnits` / RAC retrieval)
- Vector search (existing `LocalPgvectorAdapter` via RAC)
- Neo4j graph traversal (NEW via Phase 7.5 `Neo4jCommunityGraphRepository`)
- Cypher query templates (NEW via Phase 12.5)
- Guarded Text2Cypher (NEW, read-only)
- Hybrid ranking
- Citation assembly
- Context safety filter

**Implementation:** `server/agent-studio/services/graph/retrieval/` registers as a new `RetrievalPlanItem` source type in the existing RAC planner; calls existing `dataAnalysis.graphRag.*` for graph-shaped indexing/query workflows.

### 2.3 Agentic GraphRAG

**Definition:** Graph Agent dynamically chooses retrieval strategy, graph skill, query template, graph algorithm, and explanation path.

**Phase:** 13.5 (after Graph Agent Lite is stable).

**Distinct from:** GraphRAG retrieval layer (which is the toolset). Agentic GraphRAG is the planner that uses the toolset.

### 2.4 Graph Agent (and Graph Agent Lite)

**Definition:** Operational graph-aware agent that queries, traverses, explains, and routes governed actions. Mirrors KGRA Agent module shape.

**Phases:** 13 (Lite), 13.5 (Advanced / Agentic GraphRAG).

**Module path:** `server/agent-studio/services/graph-agent/`.

**Boundaries** (locked in `agent-studio-graph-agent-integration-boundaries.md`):
- Tools via MCP dispatcher only.
- Models via OpenRouter Model Access only.
- Graph state via GraphRepository only.
- No graph mutation; only governed proposals.

**Distinct from KGRA Agent:** Graph Agent Lite is a **vault-aware sibling** of KGRA. KGRA owns RAGDB-backed entity / relationship reasoning over the 12-node pipeline. Graph Agent Lite owns vault-scoped Q&A grounded in `ags_vault_*` notes + projected graph in Neo4j CE. Both can coexist; both follow the same module manifest pattern.

### 2.5 MCP (controlled tool/resource interface)

**Definition:** The single tool/resource execution boundary. Existing `dispatchMcpToolCall(input)` in `server/agent-studio/services/mcp/dispatcher.ts`.

**MCP is NOT:** the Graph Agent. The Graph Agent calls MCP; MCP does not plan or reason.

### 2.6 Graph Skill Pack

**Definition:** Procedural graph capability guidance for agents — version-controlled, permission-gated, source-note-referenced bundles of:
- Cypher query templates
- Retrieval recipes
- Traversal constraints
- MCP tool guidance
- Risk level / approval requirements

**Phase:** 12.5.

**Distinct from CAG:** CAG provides runtime context (the prompt content). Graph Skill Packs provide runtime *capabilities* (which graph tools / templates / paths to use). A Graph Agent run may use both.

**Distinct from KGIA query-planner:** KGIA has a query planner (`server/modules/kgia/domain/query-planner.ts`); Graph Skill Packs are higher-level — they bundle templates + permissions + guidance. Graph Skill Packs **consume** KGIA query-planner primitives.

### 2.7 KGRA (Knowledge Graph + Reasoning Agent — EXISTING)

**Definition:** Existing 12-node reasoning pipeline at `server/kgra-agent/`. Extracts entities + relationships from RAG sources; reasons over RAGDB `kgra_entities` / `kgra_relationships`.

**Modes:** `direct_query`, `path_reasoning`, `graphrag_local`, `graphrag_global`, `drift`, `basic_rag`, `bundle_evaluation`, `self_learning`, `expertise_building`, `research_mode`.

**Position:** **Existing. Not modified by Native Graph Workspace.** Native Graph Workspace consumes KGRA actions (`ingestProject()`, `buildKnowledgeGraph()`, `getGraphStats()`) for entity / relationship extraction.

### 2.8 KGIA (Knowledge Graph Inference Agent — EXISTING)

**Definition:** Existing Neo4j-anchored query agent at `server/modules/kgia/`. Read-only Cypher execution against external Neo4j sources. Stub adapter awaiting real `neo4j-driver` integration.

**Position:** **Existing. Extended by Native Graph Workspace.** The new `Neo4jCommunityGraphRepository` (Phase 7.5) wraps and hardens KGIA's Neo4j adapter. KGIA frontend pages (`/kgia/*`) coexist with new Native Graph Workspace surfaces (`/agent-studio/graph-workspace/`).

### 2.9 Postgres (source of truth — EXISTING)

**Definition:** Authoritative store for app records, governance, permissions, vault notes, runtime traces, promotion state, audit. ASDB is the dedicated Agent Studio database (per Phase 12.5 of the prior retrofit).

### 2.10 Neo4j Community Edition (projected graph backend — NEW)

**Definition:** Projected graph backend for typed traversal, GraphRAG path expansion, runtime trace path projection, graph views.

**Position:** Default dedicated graph backend for MVP graph workloads, unless the Phase 1.4 backend benchmark proves it unsuitable.

**Limits documented:** single-instance, no enterprise clustering, no enterprise failover, limited enterprise RBAC/LDAP, backup/HA must be external. Production-grade upgrade path lives in Phase 27 (Neo4j Enterprise / Aura).

## 3. Cross-reference matrix

| Question | Answer |
|---|---|
| Where do entities live? | Postgres (`ags_graph_nodes`, `kgra_entities`); projected to Neo4j as `(:Entity)`. |
| Where does retrieval planning live? | Existing RAC planner (`server/agent-studio/services/rac/retrieval-planner.ts`); GraphRAG router registers as a `RetrievalPlanItem`. |
| Where does Cypher execute? | `Neo4jCommunityGraphRepository` (Phase 7.5), wrapping KGIA's adapter. Never elsewhere. |
| Where does Graph Agent Lite reason? | `server/agent-studio/services/graph-agent/engine.ts`. Uses GraphRAG retrieval + Graph Skill Packs + MCP + OpenRouter. |
| Where does KGRA fit? | Unchanged. Graph Agent Lite calls KGRA actions for entity / relationship extraction; KGRA stays the existing reasoning pipeline. |
| Where does the user author content? | Markdown vault (`ags_vault_*`) — NEW. |
| What promotes a note to runtime? | Phase 11 promotion service. Note → CAG / Graph Skill / Tool Knowledge / Policy / Workflow. Version-pinned. |
| What gates tool execution? | MCP dispatcher (existing). Graph Agent uses it. |
| What gates model execution? | OpenRouter Model Access (existing). Graph Agent uses it. |
| What gates graph mutation? | Phase 11.5 graph change proposals + existing approval scaffolding. Direct mutation forbidden. |
| What gates retrieval? | RAC filter + new GraphRAG context safety filter. Permission-aware. |

## 4. Forbidden conflations

- **Do not** call MCP "the Graph Agent."
- **Do not** call Graph Skill Packs "CAG blocks."
- **Do not** call Neo4j CE "the Knowledge Graph" (it's the projected backend).
- **Do not** call KGRA "Graph Agent" (KGRA is the existing reasoning pipeline; Graph Agent Lite is the new sibling).
- **Do not** call KGIA "GraphRAG" (KGIA is the Neo4j query agent; GraphRAG is the retrieval layer over multiple sources).
- **Do not** call Native Graph Workspace "a notes app" (it's a graph-native operational context layer).

## 5. Acceptance

- [x] Knowledge Graph defined.
- [x] GraphRAG defined.
- [x] Agentic GraphRAG defined.
- [x] Graph Agent / Graph Agent Lite defined.
- [x] MCP boundary defined.
- [x] Graph Skill Pack defined.
- [x] KGRA position locked.
- [x] KGIA position locked.
- [x] Postgres / Neo4j roles defined.
- [x] Forbidden conflations enumerated.

## 6. Evidence

- `server/kgra-agent/router.ts` modes (KGRA modes documented).
- `server/modules/kgia/infrastructure/neo4j-adapter.ts` (KGIA stub).
- `server/agent-studio/services/rac/retrieval-planner.ts` (RAC planner shape).
- Existing `server/agent-studio/services/cag/` (CAG taxonomy).
- Companion: `agent-studio-graph-agent-integration-boundaries.md`, `agent-studio-postgres-neo4j-responsibility-split.md`.
