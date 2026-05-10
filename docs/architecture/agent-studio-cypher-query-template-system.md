# Agent Studio — Cypher Query Template System — ADR

**Owner:** Agent Studio module + KGIA
**Phase:** Native Graph Workspace — Phase 1 / Phase 12.5
**Status:** Adopted

---

## 1. Decision

### 1.1 Template registry

```sql
CREATE TABLE ags_query_templates (
  id SERIAL PRIMARY KEY,
  template_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  graph_backend VARCHAR(50) NOT NULL,             -- 'neo4j_ce', 'postgres', 'any'
  query_language VARCHAR(50) NOT NULL,            -- 'cypher', 'sql'
  cypher_body TEXT NOT NULL,
  parameter_schema JSONB NOT NULL,                -- Zod-shaped schema
  permission_filter_required BOOLEAN NOT NULL DEFAULT TRUE,
  max_depth INTEGER NOT NULL DEFAULT 3,
  max_results INTEGER NOT NULL DEFAULT 1000,
  timeout_ms INTEGER NOT NULL DEFAULT 5000,
  read_only BOOLEAN NOT NULL DEFAULT TRUE,
  risk_level VARCHAR(50) NOT NULL DEFAULT 'low',  -- 'low', 'medium', 'high'
  allowed_roles TEXT[],
  source_skill_pack_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_query_template_versions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES ags_query_templates(id),
  version VARCHAR(50) NOT NULL,
  cypher_body TEXT NOT NULL,
  parameter_schema JSONB NOT NULL,
  changelog TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);

CREATE TABLE ags_query_template_runs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES ags_query_templates(id),
  template_version_id INTEGER REFERENCES ags_query_template_versions(id),
  retrieval_run_id INTEGER REFERENCES ags_retrieval_runs(id),
  parameters JSONB NOT NULL,
  user_id INTEGER,
  duration_ms INTEGER,
  result_count INTEGER,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_algorithm_runs (
  id SERIAL PRIMARY KEY,
  algorithm_key VARCHAR(100) NOT NULL,            -- 'shortest_path', 'centrality', 'community_detection'
  parameters JSONB NOT NULL,
  retrieval_run_id INTEGER REFERENCES ags_retrieval_runs(id),
  user_id INTEGER,
  duration_ms INTEGER,
  result_count INTEGER,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.2 Default seeded templates (Phase 12.5)

Seeded with all categories from `agent-studio-neo4j-community-edition-graph-backend.md` §2.6:
`local_graph_depth_1/2/3`, `global_graph_sample`, `note_backlinks`, `entity_neighborhood`, `cag_source_notes`, `graph_skill_source_notes`, `runtime_trace_path`, `decision_trace_path`, `impact_analysis`, `tool_policy_dependencies`, `workflow_tool_dependencies`, `code_dependency_path`, `security_blast_radius`, `kgra_relationship_traversal`.

### 1.3 Parameter validation

Every template execution:
1. Validates input against `parameter_schema` (Zod).
2. Injects user-role permission filter into Cypher (e.g. `WHERE n.governance_status = 'active' AND n.workspace_id IN $allowedWorkspaces`).
3. Enforces `max_depth`, `max_results`, `timeout_ms`.
4. Records run in `ags_query_template_runs`.

### 1.4 Mutation policy

Templates with `read_only=true` (the default) cannot mutate. Admin maintenance templates (e.g. constraint creation, projection rebuild) are flagged `read_only=false` and require:
- `risk_level='high'`
- explicit `allowed_roles` (admin only)
- approval gate before execution

## 2. Acceptance

- [x] Tables defined.
- [x] Default seed defined.
- [x] Parameter validation flow defined.
- [x] Mutation policy defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 12.5 template seed runs at boot.
- [ ] Source-scan test enforces no template bypass.
