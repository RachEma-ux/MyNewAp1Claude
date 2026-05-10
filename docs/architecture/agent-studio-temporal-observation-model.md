# Agent Studio — Temporal Observation Model — ADR

**Owner:** Agent Studio module + Knowledge
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted

---

## 1. Decision

### 1.1 Observations vs Entities

- An **Entity** is a canonical thing (a person, system, project, decision).
- An **Observation** is a time-bound fact about an entity (e.g. "Alice owns Service-X from 2024-01 to 2025-06").

Observations support contradiction detection, history reconstruction, and temporal queries.

### 1.2 Tables

```sql
CREATE TABLE ags_graph_observations (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  observation_type VARCHAR(100) NOT NULL,        -- 'ownership', 'membership', 'state', 'attribute'
  observation_value JSONB NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP,
  contradicted_by INTEGER REFERENCES ags_graph_observations(id),
  governance_status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_temporal_facts (
  id SERIAL PRIMARY KEY,
  fact_key VARCHAR(255) NOT NULL,
  entity_id INTEGER NOT NULL REFERENCES ags_graph_entities(id),
  fact_value JSONB NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP,
  source_observation_id INTEGER REFERENCES ags_graph_observations(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Neo4j projection

```
(:Entity)-[:OBSERVED_AS]->(:Observation { type, value, valid_from, valid_to, confidence })
```

### 1.4 Contradiction handling

When a new observation is created with overlapping `valid_from..valid_to` and conflicting value:
1. Mark older observation `contradicted_by` = new observation id.
2. Older observation stays for audit; not removed.
3. Active queries return the most recent uncontradicted observation by default.
4. Contradiction surfaces in Phase 23 graph quality scan.

## 2. Acceptance

- [x] Tables defined.
- [x] Projection defined.
- [x] Contradiction handling defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 23 contradiction scan ships.
