# Agent Studio — Graph Constraint Registry — ADR

**Owner:** Agent Studio module + Governance
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted
**Authority:** Locks the constraint model that prevents invalid graph state.

---

## 1. Decision

### 1.1 Constraint classes

| Class | Example | Enforcement |
|---|---|---|
| Uniqueness | `Note.id` unique | Postgres unique constraint + Neo4j `CREATE CONSTRAINT` |
| Existence | Required properties on a node type | Ontology validator + Drizzle `notNull` |
| Cardinality | `(:Note)-[:VERSION_OF]->(:Note)` is many-to-one | Application-level check |
| Cycle prevention | `(:Note)-[:LINKS_TO]->(:Note)` may cycle (allowed); promotion edges may not (forbidden) | Application-level check |
| Provenance | Every node/edge has `source_id` | Ontology validator |
| Permission | `(:Hidden)-[:LINKS_TO]->(:Visible)` is invalid edge | Permission propagation check |
| Temporal | `valid_from <= valid_to` | CHECK constraint + validator |

### 1.2 Tables

```sql
CREATE TABLE ags_graph_constraints (
  id SERIAL PRIMARY KEY,
  constraint_key VARCHAR(100) UNIQUE NOT NULL,
  constraint_class VARCHAR(50) NOT NULL,         -- 'uniqueness', 'existence', etc.
  applies_to_type_key VARCHAR(100) NOT NULL,
  applies_to_type_kind VARCHAR(50) NOT NULL,     -- 'node' | 'edge'
  expression TEXT NOT NULL,                      -- machine-evaluable rule
  severity VARCHAR(50) NOT NULL DEFAULT 'error', -- 'error' | 'warning'
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_constraint_violations (
  id SERIAL PRIMARY KEY,
  constraint_id INTEGER NOT NULL REFERENCES ags_graph_constraints(id),
  violated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  source_type_key VARCHAR(100),
  source_id TEXT,
  details JSONB,
  remediation VARCHAR(100),
  remediated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Validation order

```
1. Ontology validator (type known + properties valid)
2. Constraint validator (rules from ags_graph_constraints)
3. Permission validator
4. Temporal validator
5. Provenance validator
```

Failure at any step rejects the write and records a violation.

## 2. Acceptance

- [x] Constraint classes defined.
- [x] Tables defined.
- [x] Validation order locked.
- [ ] Drizzle reconciler creates tables.
- [ ] Constraint violations propagate to feedback layer (Phase 22).
