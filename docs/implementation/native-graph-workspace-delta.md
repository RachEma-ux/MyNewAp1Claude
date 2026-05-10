# Native Graph Workspace — Delta Plan

**Phase:** MVP 0 Phase 0 (Repository Reconciliation)
**Companion to:** `docs/architecture/agent-studio-native-graph-workspace.md`
**Status:** Adopted

---

## 1. Purpose

Map the **delta** between current Agent Studio state and the Native Graph Workspace target state. Every new surface listed here either extends an existing module or fills a documented gap. No greenfield duplication.

## 2. Current state inventory (Observed)

### 2.1 GraphRAG control plane — partial

`drizzle/tables/graphrag.ts` declares:
- `graphragSources` — module/dataset adapters
- `graphragSyncRuns` — snapshot exports
- `graphragIndexRuns` — indexing jobs
- `graphragQueryRuns` — query runs
- `graphragArtifactRegistry` — produced artifacts

**Gap:** No workspace-scoped notes/vault concept. No typed graph nodes/edges. No Neo4j CE backend integration. No Graph Agent runtime.

### 2.2 KGRA Agent module — exists

`server/kgra-agent/` has the standard module shape (manifest, ports, public-api, engine, nodes, router, adapter, contracts, events, handoffs, state, actions, routing). This is the existing graph-shaped agent runtime.

**Gap:** No clear contract for "Graph Agent Lite as Markdown vault assistant." Not wired into a Markdown vault UI. No CAG/Graph Skill source note reference path.

### 2.3 Data Analysis GraphRAG subdomain — exists

`server/data-analysis/graphrag/` owns analytics-flavored GraphRAG. Per memory note (`feedback_data_analysis_ownership.md`): GraphRAG is a subdomain of Data Analysis, not its own RTLM.

**Gap:** No typed knowledge graph layer that Data Analysis can read. No projection sync from a Postgres workspace store.

### 2.4 MCP dispatcher — exists

`server/agent-studio/services/mcp/dispatcher.ts` is the single tool execution chokepoint. Source-scan tested boundary.

**Gap:** None. Native Graph Workspace **respects** this boundary.

### 2.5 OpenRouter Model Access — exists

`server/openrouter/model-access/` is the canonical model execution path.

**Gap:** None. Native Graph Workspace **respects** this boundary.

### 2.6 CAG capability packs — exists

`server/agent-studio/services/cag/` declares the existing CAG runtime + 8-class riskClass taxonomy.

**Gap:** No CAG block → source note version reference. No Markdown-authored CAG block promotion path.

### 2.7 RAC retrieval — exists

`server/agent-studio/services/rac/` has planner, executor, filter, sources, trace.

**Gap:** No GraphRAG-shaped retrieval source registered. No graph traversal-based retrieval.

### 2.8 Governance / approval — exists

`agsApprovalSteps`, `agsPendingPermissionRequests`, `evaluateGovernance()`.

**Gap:** No promotion workflow leveraging this scaffolding. No graph change proposal flow.

### 2.9 Runtime trace store — exists (V3 closed)

`agsRuntimeRuns` with Phase 11a observability columns (`sseFirstTokenMs`, `sseDurationMs`, `errorReason`, `clientDisconnected`, `idempotencyConflicts`). Writers in chat-stream, chat.ts, simulation.

**Gap:** No projection into Neo4j CE for graph-shaped trace inspection.

### 2.10 Markdown vault — does not exist

No `ags_vault_*` tables. No Markdown editor surface. No wikilink/backlink engine.

### 2.11 Neo4j CE / dedicated graph DB — does not exist

No Neo4j connection. No GraphRepository abstraction. No Cypher template registry.

## 3. Delta surface (the work)

### 3.1 New (greenfield within scope)

| Surface | Phase | Lands at |
|---|---|---|
| Markdown vault tables | 2 | `drizzle/tables/agent-studio-vault.ts` (NEW) |
| Vault service + router | 2 | `server/agent-studio/services/vault/` (NEW) |
| Markdown editor surfaces | 3 | `client/src/modules/agent-studio/vault/` (NEW) |
| Properties / frontmatter | 4 | `server/agent-studio/services/vault/properties.ts` |
| Wikilink / backlink engine | 5 | `server/agent-studio/services/vault/links.ts` |
| GraphRepository interface + capability registry | 1.2, 7 | `server/agent-studio/services/graph/repository/` (NEW) |
| TestGraphRepository | 1.2, 7 | same |
| PostgresGraphRepository (shallow fallback) | 1.2, 7 | same |
| Neo4jCommunityGraphRepository | 1.3, 7.5 | same |
| Projection sync layer | 1.7, 7.5 | `server/agent-studio/services/graph/projection/` (NEW) |
| Typed graph metadata tables | 7 | `drizzle/tables/agent-studio-graph.ts` (NEW) |
| Ontology + constraints + ER tables | 1.6 | same |
| Provenance + temporal tables | 1.6 | same |
| Backend benchmark harness | 1.4 | `scripts/graph-bench/` (NEW) |
| Local + global graph views | 8 | `client/src/modules/agent-studio/graph-workspace/` (NEW) |
| Promotion workflow tables | 11 | `drizzle/tables/agent-studio-promotion.ts` (NEW) |
| Promotion service | 11 | `server/agent-studio/services/promotion/` (NEW) |
| Graph change proposal tables | 11.5 | same |
| GraphRAG retrieval router | 12 | `server/agent-studio/services/graph/retrieval/` (NEW); registers with existing RAC source registry |
| Graph Skill Pack tables + service | 12.5 | `drizzle/tables/agent-studio-graph-skill.ts` (NEW); `server/agent-studio/services/graph-skill/` |
| Cypher template registry | 12.5 | same |
| Graph Agent Lite | 13 | `server/agent-studio/services/graph-agent/` (NEW); mirrors KGRA Agent module shape |
| Runtime trace projection | 14 | extends `server/agent-studio/services/runtime/` projection writers |
| Golden question framework | 22, 23 | `tests/agent-studio/graph/` (NEW) |
| Property-based visibility tests | 21 | same |
| Source-scan boundary tests | 4.5 (V3 carry) | `tests/agent-studio/graph-*.test.ts` |

### 3.2 Extended (existing surface, additive only)

| Existing surface | Extension |
|---|---|
| `drizzle/tables/graphrag.ts` | Add workspace-scoped foreign keys; do not redefine existing tables |
| `server/agent-studio/services/cag/` | Add CAG block → source note version reference path |
| `server/agent-studio/services/rac/` (sources) | Register Graph traversal retrieval as additional source |
| `server/agent-studio/services/mcp/dispatcher.ts` | Unchanged. Graph Agent Lite calls into it. |
| `server/openrouter/model-access/` | Unchanged. Graph Agent Lite calls into it. |
| Governance scaffolding | Add promotion + graph change proposal hooks |
| Runtime trace writers (V3) | Add Neo4j CE projection sink |
| `server/kgra-agent/` | No edits in MVP 0–4. Graph Agent Lite is sibling. |
| `server/data-analysis/graphrag/` | No edits in MVP 0–4. Consumes typed projections later. |

### 3.3 Out of scope for MVP 0–4

- `kgra/` Python sidecar
- `server/kgra-agent/` internal changes
- `server/data-analysis/` internal changes
- Full Canvas / full Bases
- Real-time collaboration / CRDT
- Offline sync / local-first mode
- Plugin framework
- Neo4j Enterprise / Aura migration
- Multi-region graph deployment

## 4. Risks (Risk / Mitigation)

| Risk | Mitigation |
|---|---|
| Cascading refactors into existing modules | Strict additive-only rule; new code in dedicated subtrees |
| Module wiring failures (`check:wiring`) | Run all `check:*` scripts in MVP 0 close-out |
| GraphRAG control plane FK conflicts | New tables reference `graphragSources` rather than redefine |
| KGRA Agent / Graph Agent Lite confusion | Naming + ADR (`agent-studio-graph-agent-runtime.md`) explicitly distinguishes |
| Data Analysis GraphRAG ownership conflict | Native Graph Workspace publishes; Data Analysis consumes; ADR locks ownership |

## 5. Acceptance

- [x] Existing GraphRAG control plane mapped.
- [x] Existing KGRA Agent module mapped.
- [x] Existing Data Analysis GraphRAG subdomain mapped.
- [x] MCP dispatcher boundary identified.
- [x] OpenRouter Model Access boundary identified.
- [x] CAG / RAC / governance reuse path identified.
- [x] Vault layer gap identified.
- [x] Neo4j CE backend gap identified.
- [x] Out-of-scope list locked.
- [ ] Phase 0 reconciliation PR merged.

## 6. Evidence

- `drizzle/tables/graphrag.ts` (read 2026-05-10).
- `server/kgra-agent/` directory listing.
- `server/data-analysis/graphrag/` directory listing.
- `server/agent-studio/services/{cag,rac,mcp}/` listings.
- `server/openrouter/model-access/` listing.
- AGENTS.md, CLAUDE.md.
