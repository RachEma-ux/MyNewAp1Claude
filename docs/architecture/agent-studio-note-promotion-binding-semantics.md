# Agent Studio — Note Promotion Binding Semantics — ADR

**Owner:** Agent Studio module + Governance + CAG
**Phase:** Native Graph Workspace — Phase 1 / Phase 11
**Status:** Adopted

---

## 1. Decision

### 1.1 Promotion lifecycle

```
Note v3 (mutable)
    ↓
Promotion candidate (immutable snapshot of note version)
    ↓
Validation (schema / governance / safety)
    ↓
Governance review (existing approval scaffolding)
    ↓
Approval decision (approved / rejected / changes_requested)
    ↓
Promoted draft (immutable)
    ↓
Active runtime asset version (version-pinned)
    ↓
[On note v4 edit]: new promotion candidate created; old asset version untouched
    ↓
[On rollback]: previous active version reactivated
```

### 1.2 Version pinning rules

A runtime-active asset must bind to **immutable source versions**:
- `note_version_id` (mandatory)
- `source_artifact_version_id` (if attached)
- `graph_entity_version_id` (if entity-linked)
- `tool_schema_version_id` (if tool-bound)
- `policy_version_id` (if policy-governed)
- `workflow_version_id` (if workflow-bound)
- `graph_skill_version_id` (if skill-bound)
- `query_template_version_id` (if template-bound)
- `neo4j_projection_snapshot_id` (if graph-projected)

Editing the source note creates a new candidate; **does not** mutate the active asset.

### 1.3 Tables

```sql
CREATE TABLE ags_note_promotions (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL,
  note_version_id INTEGER NOT NULL,
  promotion_kind VARCHAR(50) NOT NULL,            -- 'knowledge_unit', 'cag_block', 'graph_skill_pack', 'tool_knowledge', 'workflow', 'policy', 'evaluation_case', 'runtime_investigation', 'graph_entity', 'temporal_observation'
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  initiated_by_user_id INTEGER,
  approved_by_user_id INTEGER,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  rolled_back_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_note_promotion_versions (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES ags_note_promotions(id),
  version VARCHAR(50) NOT NULL,
  target_asset_id INTEGER,                        -- e.g. CAG block id, skill pack id
  target_asset_version VARCHAR(50),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, version)
);

CREATE TABLE ags_note_promotion_decisions (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES ags_note_promotions(id),
  decision VARCHAR(50) NOT NULL,
  decided_by_user_id INTEGER NOT NULL,
  rationale TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_note_runtime_bindings (
  id SERIAL PRIMARY KEY,
  promotion_version_id INTEGER NOT NULL REFERENCES ags_note_promotion_versions(id),
  binding_kind VARCHAR(50) NOT NULL,
  binding_target_id TEXT NOT NULL,
  binding_target_version_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_note_promotion_audit_events (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES ags_note_promotions(id),
  event_kind VARCHAR(100) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.4 Hard rules

- Editing a source note does NOT mutate active runtime asset (creates new candidate).
- Approved promotion writes to Postgres source-of-truth, then projection sync updates Neo4j.
- Rollback restores previous active version; auditable.
- A note version may have multiple promotions (e.g. same note → CAG block + Graph Skill Pack).

## 2. Acceptance

- [x] Lifecycle defined.
- [x] Version pinning rules locked.
- [x] Tables defined.
- [x] Hard rules locked.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 11 promotion service ships.
