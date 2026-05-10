# Agent Studio — Graph Agent Runtime — ADR

**Owner:** Agent Studio module + KGRA Agent + Governance
**Phase:** Native Graph Workspace — Phase 1 / Phase 13 / Phase 13.5
**Status:** Adopted
**Authority:** Locks Graph Agent Lite + Advanced runtime contract; sibling to KGRA Agent.

---

## 1. Decision

### 1.1 Module shape (mirrors KGRA Agent)

`server/agent-studio/services/graph-agent/`:
- `manifest.ts` — module manifest (key: `"graphAgent"`)
- `ports.ts` — inbound `graph-agent.run`, outbound `rag.search`, `mcp.dispatch`, `openrouter.execute`, `governance.evaluate`
- `public-api.ts` — exported entry point
- `contracts.ts` — Zod schemas
- `engine.ts` — orchestration core
- `events.ts` — `graph-agent.run.completed`, `graph-agent.proposal.created`, etc.
- `handoffs.ts` — to MCP, OpenRouter, governance
- `state.ts` — state machine (planning → retrieval → reasoning → answer → trace)
- `actions.ts` — high-level actions
- `router.ts` — tRPC procedures (`run`, `health`, `explain`)
- `nodes.ts` — pipeline nodes (smaller than KGRA's 12-node pipeline)

### 1.2 Capabilities (Lite — Phase 13)

- Schema inspection (Neo4j ontology summary)
- Cypher query template execution (read-only)
- Permission-aware graph lookup
- Basic GraphRAG retrieval (delegates to Phase 12 router)
- Cited answer assembly
- Runtime trace + decision trace emission
- Why-This-Answer panel data

### 1.3 Capabilities (Advanced — Phase 13.5)

- Adaptive retrieval strategy planning
- Graph Skill Pack selection
- Guarded Text2Cypher
- Graph algorithm invocation
- Multi-step graph traversal planning
- Impact analysis planning
- Correction proposal creation
- Semantic enrichment proposal creation
- Governed action routing

### 1.4 Tables

```sql
CREATE TABLE ags_graph_agent_runs (
  id SERIAL PRIMARY KEY,
  agent_key VARCHAR(100) NOT NULL DEFAULT 'graph_agent_lite',
  user_id INTEGER,
  workspace_id INTEGER,
  user_query TEXT NOT NULL,
  query_intent VARCHAR(100),
  retrieval_strategy VARCHAR(100),
  selected_skill_pack_id INTEGER,
  runtime_run_id INTEGER,                         -- ref to agsRuntimeRuns (V3)
  status VARCHAR(50) NOT NULL DEFAULT 'planning',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_steps (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  step_index INTEGER NOT NULL,
  step_kind VARCHAR(100) NOT NULL,                -- 'plan', 'retrieve', 'execute_template', 'reason', 'answer', 'trace'
  step_input JSONB,
  step_output JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_tool_choices (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  tool_kind VARCHAR(50) NOT NULL,                 -- 'mcp_tool', 'cypher_template', 'graph_algorithm'
  tool_id TEXT NOT NULL,
  tool_args JSONB,
  rationale TEXT,
  routed_via VARCHAR(100),                        -- 'mcp_dispatcher', 'query_template_registry'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_context_blocks (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  block_kind VARCHAR(50) NOT NULL,
  block_payload JSONB NOT NULL,
  citation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_explanations (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  explanation_kind VARCHAR(100) NOT NULL,         -- 'why_this_answer', 'why_this_path', 'why_this_skill'
  explanation_payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_auth_events (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  event_kind VARCHAR(100) NOT NULL,               -- 'permission_granted', 'permission_denied', 'governance_blocked'
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_agent_user_feedback (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ags_graph_agent_runs(id),
  feedback_kind VARCHAR(50) NOT NULL,             -- 'helpful', 'not_helpful', 'incorrect', 'partial'
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.5 Hard boundaries (lockstep with `agent-studio-graph-agent-integration-boundaries.md`)

- All tools via `dispatchMcpToolCall(input)` (`server/agent-studio/services/mcp/dispatcher.ts`).
- All models via `execute(input)` from `server/openrouter/model-access/execute.ts`.
- All graph access via `GraphRepository`.
- No graph mutation.
- All runs emit traces to `agsRuntimeRuns`.

### 1.6 KGRA coexistence

- KGRA Agent (`server/kgra-agent/`) remains untouched.
- Graph Agent Lite calls KGRA actions for entity/relationship extraction (`actions.ts`: `ingestProject()`, `buildKnowledgeGraph()`, `getGraphStats()`).
- Both agents register module manifests; both expose tRPC; both emit runtime traces.
- User-facing surfaces: KGRA at `/data-analysis/kgra-agent`; Graph Agent Lite at `/agent-studio/graph-agent` (NEW).

## 2. Acceptance

- [x] Module shape locked.
- [x] Lite + Advanced capabilities defined.
- [x] Tables defined.
- [x] Hard boundaries locked.
- [x] KGRA coexistence defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 13 Lite skeleton ships.
- [ ] Phase 13.5 Advanced ships.
- [ ] All 5 boundary source-scan tests pass.
