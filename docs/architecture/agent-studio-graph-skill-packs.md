# Agent Studio — Graph Skill Packs — ADR

**Owner:** Agent Studio module + KGIA + Governance
**Phase:** Native Graph Workspace — Phase 1 / Phase 12.5
**Status:** Adopted

---

## 1. Decision

### 1.1 Graph Skill Pack model

A Graph Skill Pack is a versioned, source-note-referenced bundle of:
- Allowed Cypher query templates
- Retrieval recipes
- Traversal constraints
- MCP tool guidance
- Risk level + approval requirements
- Evaluation cases

Distinct from CAG: CAG provides prompt content; Graph Skill Packs provide procedural graph capability guidance.

### 1.2 Tables

```sql
CREATE TABLE ags_graph_skill_packs (
  id SERIAL PRIMARY KEY,
  skill_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  domain VARCHAR(100),                            -- 'institutional', 'code', 'security', 'workflow', 'governance'
  supported_node_type_keys TEXT[],
  supported_edge_type_keys TEXT[],
  risk_level VARCHAR(50) NOT NULL DEFAULT 'low',
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_skill_pack_versions (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL REFERENCES ags_graph_skill_packs(id),
  version VARCHAR(50) NOT NULL,
  manifest JSONB NOT NULL,
  changelog TEXT,
  source_note_version_id INTEGER,                 -- Phase 10 reference
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, version)
);

CREATE TABLE ags_graph_skill_query_templates (
  id SERIAL PRIMARY KEY,
  pack_version_id INTEGER NOT NULL REFERENCES ags_graph_skill_pack_versions(id),
  template_id INTEGER NOT NULL REFERENCES ags_query_templates(id),
  ordering INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_skill_evaluation_cases (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL REFERENCES ags_graph_skill_packs(id),
  case_key VARCHAR(100) NOT NULL,
  question TEXT NOT NULL,
  expected_answer JSONB,
  expected_paths JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, case_key)
);

CREATE TABLE ags_graph_skill_source_references (
  id SERIAL PRIMARY KEY,
  pack_version_id INTEGER NOT NULL REFERENCES ags_graph_skill_pack_versions(id),
  source_note_id INTEGER NOT NULL,
  source_note_version_id INTEGER NOT NULL,
  reference_type VARCHAR(50),
  prompt_inclusion_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_skill_runtime_usages (
  id SERIAL PRIMARY KEY,
  pack_version_id INTEGER NOT NULL REFERENCES ags_graph_skill_pack_versions(id),
  runtime_run_id INTEGER NOT NULL,
  query_template_run_ids INTEGER[],
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Eligibility

Graph Agent Lite picks a Graph Skill Pack based on:
- Ontology overlap (request domain ↔ `supported_node_type_keys`).
- Permissions (user role ↔ pack's allowed_roles).
- Active status.
- Approval state (if `approval_required=true`, requires approval).

### 1.4 Reference (Phase 10) — referenced ≠ promoted

`ags_graph_skill_source_references.prompt_inclusion_allowed=false` is the default. The referenced note version supplies provenance; only governed pack content enters the runtime prompt.

## 2. Acceptance

- [x] Tables defined.
- [x] Eligibility flow defined.
- [x] Reference semantic locked.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 12.5 skill pack ships.
