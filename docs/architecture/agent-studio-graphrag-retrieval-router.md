# Agent Studio — GraphRAG Retrieval Router — ADR

**Owner:** Agent Studio module + RAC + Knowledge / GraphRAG
**Phase:** Native Graph Workspace — Phase 1 / Phase 12
**Status:** Adopted

---

## 1. Decision

### 1.1 Registers with existing RAC planner

GraphRAG retrieval router does NOT replace the existing RAC planner. It registers a new `RetrievalPlanItem` source type for graph traversal, alongside existing adapters (`GraphRagAdapter`, `LocalPgvectorAdapter`, `KnowledgeUnitAdapter`).

### 1.2 Retrieval flow

```
User / Agent Query
    ↓
RAC planRetrieval(input) — existing planner extended
    ↓
Plan includes graph traversal source (if eligible)
    ↓
RAC retrieval-executor fans out across plan items
    ↓
Graph traversal source calls GraphRepository templates
    ↓
Returns node IDs + paths
    ↓
Application loads source records from Postgres
    ↓
Permission filter (existing RAC retrieval-filter + new graph permission filter)
    ↓
Context safety filter
    ↓
Citation assembly
    ↓
Return context blocks + cited paths
    ↓
Write retrieval trace
```

### 1.3 Retrieval modes (extends existing RAC planner-mode catalog)

```
Existing modes (CLAUDE.md):
  no_retrieval, cag_only, knowledge_retrieval, multimodal_hybrid_retrieval,
  tool_knowledge_retrieval, hybrid_cag_rag, hybrid_cag_tool_knowledge,
  hybrid_cag_rag_tool_knowledge

New modes added by Phase 12:
  graphrag_local
  graphrag_global
  graphrag_traversal
  graphrag_text2cypher
  graphrag_algorithm
  hybrid_cag_graphrag
  hybrid_rac_graphrag
```

### 1.4 Tables

```sql
CREATE TABLE ags_retrieval_runs (
  id SERIAL PRIMARY KEY,
  retrieval_mode VARCHAR(100) NOT NULL,
  initiating_runtime_run_id INTEGER,              -- FK to agsRuntimeRuns
  initiating_user_id INTEGER,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'running'
);

CREATE TABLE ags_retrieval_queries (
  id SERIAL PRIMARY KEY,
  retrieval_run_id INTEGER NOT NULL REFERENCES ags_retrieval_runs(id),
  query_text TEXT NOT NULL,
  query_intent VARCHAR(100),
  retrieval_strategies TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_retrieval_results (
  id SERIAL PRIMARY KEY,
  retrieval_run_id INTEGER NOT NULL REFERENCES ags_retrieval_runs(id),
  source_kind VARCHAR(50) NOT NULL,               -- 'note', 'kgra_entity', 'cag_block', 'graph_path'
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  rank_score NUMERIC(5,4),
  permission_status VARCHAR(50) NOT NULL DEFAULT 'visible',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_retrieval_context_blocks (
  id SERIAL PRIMARY KEY,
  retrieval_run_id INTEGER NOT NULL REFERENCES ags_retrieval_runs(id),
  block_kind VARCHAR(50) NOT NULL,                -- 'text', 'path', 'graph_subgraph'
  block_payload JSONB NOT NULL,
  citation_count INTEGER NOT NULL DEFAULT 0,
  safety_filtered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_retrieval_citations (
  id SERIAL PRIMARY KEY,
  context_block_id INTEGER NOT NULL REFERENCES ags_retrieval_context_blocks(id),
  source_kind VARCHAR(50) NOT NULL,
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  source_locator TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_retrieval_safety_events (
  id SERIAL PRIMARY KEY,
  retrieval_run_id INTEGER NOT NULL REFERENCES ags_retrieval_runs(id),
  event_kind VARCHAR(100) NOT NULL,               -- 'permission_filtered', 'safety_blocked', 'partial_truncation'
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.5 Boundary contracts

- Retrieval router does NOT execute tools.
- Retrieval router does NOT bypass RAC retrieval-filter.
- Retrieval router does NOT mutate graph state.
- Retrieval router calls into existing `dataAnalysis.graphRag.*` for index/query workflows where applicable.

## 2. Acceptance

- [x] Registration with existing RAC planner locked.
- [x] Retrieval flow defined.
- [x] New retrieval modes enumerated.
- [x] Tables defined.
- [x] Boundary contracts locked.
- [ ] Phase 12 retrieval router ships.
- [ ] Source-scan test enforces no tool execution from router.
