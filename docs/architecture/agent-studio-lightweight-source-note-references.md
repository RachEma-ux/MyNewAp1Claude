# Agent Studio — Lightweight Source-Note References — ADR

**Owner:** Agent Studio module + CAG + Knowledge
**Phase:** Native Graph Workspace — Phase 1 / Phase 10
**Status:** Adopted

---

## 1. Decision

### 1.1 Reference ≠ Promotion

A runtime asset may **reference** a note version for traceability without using that note as runtime context.

| Concept | Reference | Promotion |
|---|---|---|
| Source note version recorded | Yes | Yes |
| Note enters runtime prompt | **No** (default) | Only if `prompt_inclusion_allowed=true` |
| Backlink in graph | Yes | Yes |
| Audit | Yes | Yes |
| Approval required | No | Yes |

### 1.2 Tables

```sql
CREATE TABLE ags_runtime_asset_source_references (
  id SERIAL PRIMARY KEY,
  runtime_asset_kind VARCHAR(50) NOT NULL,        -- 'cag_block', 'graph_skill_pack', 'tool_knowledge', 'policy', 'workflow'
  runtime_asset_id INTEGER NOT NULL,
  source_note_id INTEGER NOT NULL,
  source_note_version_id INTEGER NOT NULL,
  reference_type VARCHAR(50) NOT NULL,            -- 'source', 'rationale', 'documentation', 'policy_basis', 'graph_query_basis', 'human_explanation'
  required_for_runtime BOOLEAN NOT NULL DEFAULT FALSE,
  prompt_inclusion_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  neo4j_relationship_id TEXT,
  projection_snapshot_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by_user_id INTEGER
);

CREATE TABLE ags_cag_block_note_references (
  id SERIAL PRIMARY KEY,
  cag_block_id INTEGER NOT NULL,
  cag_block_version VARCHAR(50) NOT NULL,
  note_id INTEGER NOT NULL,
  note_version_id INTEGER NOT NULL,
  reference_type VARCHAR(50) NOT NULL,
  prompt_inclusion_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_skill_note_references (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL,
  pack_version VARCHAR(50) NOT NULL,
  note_id INTEGER NOT NULL,
  note_version_id INTEGER NOT NULL,
  reference_type VARCHAR(50) NOT NULL,
  prompt_inclusion_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_runtime_note_references (
  id SERIAL PRIMARY KEY,
  runtime_run_id INTEGER NOT NULL,                -- ref to agsRuntimeRuns
  note_id INTEGER NOT NULL,
  note_version_id INTEGER NOT NULL,
  reference_kind VARCHAR(50) NOT NULL,            -- 'cag_source', 'graph_skill_source', 'policy_basis'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Runtime behavior

- CAG Block may enter prompt if active and eligible (existing behavior).
- Graph Skill Pack may guide tool usage if active and eligible.
- Referenced note does NOT enter prompt automatically.
- Runtime trace shows source note version reference.
- Backlink exists from source note to runtime asset.
- Neo4j projection contains the reference edge.
- Permissions enforced on referenced note visibility.

### 1.4 Source-scan test

```typescript
// tests/agent-studio/cag-reference-not-promotion.test.ts
// Asserts CAG block prompt assembly does NOT pull text from referenced notes
// unless prompt_inclusion_allowed=true.
```

## 2. Acceptance

- [x] Reference vs promotion semantics locked.
- [x] Tables defined.
- [x] Runtime behavior defined.
- [x] Source-scan test mandated.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 10 reference service ships.
