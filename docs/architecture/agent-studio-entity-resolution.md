# Agent Studio — Entity Resolution — ADR

**Owner:** Agent Studio module + KGIA + Governance
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted
**Authority:** Locks entity resolution semantics. Auto-merge gated by policy.

---

## 1. Decision

### 1.1 Reuse KGIA entity resolver

`server/modules/kgia/services/entity-resolver.ts` provides existing entity linking + disambiguation primitives. Native Graph Workspace **consumes** these; does not duplicate.

### 1.2 Tables (ASDB)

```sql
CREATE TABLE ags_graph_entities (
  id SERIAL PRIMARY KEY,
  canonical_label VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  workspace_id INTEGER REFERENCES ags_workspaces(id),
  governance_status VARCHAR(50) NOT NULL DEFAULT 'active',
  source_id TEXT,
  source_version_id TEXT,
  kgra_entity_id INTEGER,                        -- ref to RAGDB.kgra_entities.id (if derived from KGRA)
  confidence NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_entity_aliases (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  alias_label VARCHAR(255) NOT NULL,
  alias_source VARCHAR(100),                     -- 'manual', 'auto_normalize', 'kgra'
  confidence NUMERIC(3,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, alias_label)
);

CREATE TABLE ags_graph_entity_resolution_candidates (
  id SERIAL PRIMARY KEY,
  observed_label VARCHAR(255) NOT NULL,
  candidate_entity_id INTEGER REFERENCES ags_graph_entities(id),
  match_score NUMERIC(3,2) NOT NULL,
  match_method VARCHAR(100),                     -- 'normalized_label', 'alias', 'embedding', 'kgia_resolver'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'auto_merged', 'human_approved', 'rejected'
  source_note_version_id INTEGER,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_entity_merge_decisions (
  id SERIAL PRIMARY KEY,
  primary_entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  merged_entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  decision_type VARCHAR(50) NOT NULL,            -- 'auto_merge', 'human_approve', 'human_reject'
  decided_by INTEGER REFERENCES users(id),
  rationale TEXT,
  rollback_token TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_entity_split_decisions (
  id SERIAL PRIMARY KEY,
  source_entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  resulting_entity_ids INTEGER[] NOT NULL,
  decided_by INTEGER REFERENCES users(id),
  rationale TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_entity_resolution_audit_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  candidate_id INTEGER,
  decision_id INTEGER,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_entity_auto_merge_policies (
  id SERIAL PRIMARY KEY,
  policy_key VARCHAR(100) UNIQUE NOT NULL,
  workspace_id INTEGER REFERENCES ags_workspaces(id),
  entity_type VARCHAR(100),
  min_match_score NUMERIC(3,2) NOT NULL DEFAULT 0.95,
  required_match_methods TEXT[],                 -- 'normalized_label', 'alias' (both required if listed)
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Auto-merge eligibility

Auto-merge allowed only when ALL hold:
- Same workspace.
- Same entity type.
- Match score ≥ policy min (default 0.95).
- Match methods include all `required_match_methods` from policy.
- No conflicting provenance (different source notes do not contradict).
- No conflicting temporal facts.
- Rollback available (decision token recorded).
- Policy is active.
- Projection update is safe (drift check passes).

Failing any condition routes the candidate to human review queue.

### 1.4 Workflow

```
KGIA / Markdown vault detects entity mention
    ↓
Entity resolver produces candidate match score
    ↓
ags_graph_entity_resolution_candidates row created
    ↓
Eligibility check
    ↓                              ↓
auto_merged                      pending (human review)
    ↓                              ↓
ags_graph_entity_merge_decisions  Phase 11.5 graph change proposal
    ↓
Postgres entity table updated
    ↓
Neo4j projection sync updates `(:Entity)-[:HAS_ALIAS]->(:Entity)`
```

## 2. Acceptance

- [x] Tables defined.
- [x] Auto-merge eligibility defined.
- [x] Workflow defined.
- [ ] Drizzle reconciler creates tables.
- [ ] KGIA entity resolver consumed (no duplicate).
- [ ] Phase 11.5 graph change proposal flow handles human-review path.
