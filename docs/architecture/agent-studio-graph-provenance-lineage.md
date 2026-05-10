# Agent Studio — Graph Provenance and Lineage — ADR

**Owner:** Agent Studio module + Knowledge
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted
**Authority:** Every graph node and edge must record provenance. Without provenance, graph growth becomes untrusted.

---

## 1. Decision

### 1.1 Mandatory provenance fields (every node + edge)

```
source_type            -- e.g. 'note_version', 'kgra_entity', 'cag_block'
source_id              -- FK to source table
source_version_id      -- FK to versioned source record
source_locator         -- optional pointer (e.g. 'note:42:line:120')
created_by_user_id     -- nullable
created_by_process     -- e.g. 'projection_sync', 'graph_correction'
created_by_agent_id    -- nullable
confidence             -- 0..1
lineage_status         -- 'derived', 'asserted', 'inferred', 'imported'
extraction_method      -- e.g. 'wikilink_parser', 'kgra_extraction', 'manual'
validation_status      -- 'unvalidated', 'validated', 'flagged'
governance_status      -- 'active', 'hidden', 'archived', 'deprecated'
created_at, updated_at
valid_from, valid_to   -- temporal validity
neo4j_node_id          -- (for nodes; populated after projection)
neo4j_relationship_id  -- (for edges)
projection_snapshot_id -- snapshot anchor
```

### 1.2 Tables

```sql
CREATE TABLE ags_graph_provenance_records (
  id SERIAL PRIMARY KEY,
  target_type_key VARCHAR(100) NOT NULL,
  target_type_kind VARCHAR(50) NOT NULL,         -- 'node' | 'edge'
  target_id INTEGER NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  source_locator TEXT,
  created_by_user_id INTEGER,
  created_by_process VARCHAR(100),
  created_by_agent_id INTEGER,
  confidence NUMERIC(3,2),
  lineage_status VARCHAR(50) NOT NULL,
  extraction_method VARCHAR(100),
  validation_status VARCHAR(50) NOT NULL DEFAULT 'unvalidated',
  governance_status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP
);

CREATE TABLE ags_graph_lineage_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,              -- 'created', 'updated', 'merged', 'split', 'corrected', 'reprojected'
  target_type_key VARCHAR(100) NOT NULL,
  target_id INTEGER NOT NULL,
  predecessor_target_id INTEGER,                 -- for merges/splits
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Neo4j projection

Each Neo4j node/edge carries the same fields as **node properties** (subset; not full payload — full payload stays in Postgres `ags_graph_provenance_records`):
- `source_id`
- `source_version_id`
- `governance_status`
- `confidence`
- `lineage_status`
- `created_at`, `updated_at`
- `valid_from`, `valid_to`

This enables Cypher-side filtering on provenance without round-tripping to Postgres.

## 2. Acceptance

- [x] Mandatory fields enumerated.
- [x] Tables defined.
- [x] Neo4j projection contract defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Ontology validator rejects nodes without provenance.
- [ ] Property-based test: every projected Neo4j node has source_id.
