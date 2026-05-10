# Agent Studio — Graph Ontology Registry — ADR

**Owner:** Agent Studio module + Knowledge
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted
**Authority:** Locks the typed ontology that prevents undisciplined node/edge creation.

---

## 1. Decision

The ontology registry is the source of truth for legal node types, edge types, and required/optional properties. All graph writes (Postgres + Neo4j projection) validate against the registry.

### 1.1 Tables (ASDB)

```sql
CREATE TABLE ags_graph_ontology_node_types (
  id SERIAL PRIMARY KEY,
  type_key VARCHAR(100) UNIQUE NOT NULL,         -- 'Note', 'Entity', 'CAGBlock'
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),                          -- 'workspace', 'runtime', 'institutional', 'code', 'security'
  is_versioned BOOLEAN NOT NULL DEFAULT FALSE,
  governance_required BOOLEAN NOT NULL DEFAULT FALSE,
  retention_class VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_ontology_edge_types (
  id SERIAL PRIMARY KEY,
  type_key VARCHAR(100) UNIQUE NOT NULL,         -- 'LINKS_TO', 'PROMOTED_TO'
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  source_node_type_keys TEXT[] NOT NULL,         -- allowed source node types
  target_node_type_keys TEXT[] NOT NULL,         -- allowed target node types
  cardinality VARCHAR(50),                        -- 'one_to_many', 'many_to_many'
  is_directed BOOLEAN NOT NULL DEFAULT TRUE,
  governance_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_ontology_property_definitions (
  id SERIAL PRIMARY KEY,
  type_key VARCHAR(100) NOT NULL,                -- node or edge type
  type_kind VARCHAR(50) NOT NULL,                -- 'node' | 'edge'
  property_key VARCHAR(100) NOT NULL,
  property_type VARCHAR(50) NOT NULL,            -- 'string', 'number', 'boolean', 'date', 'json'
  required BOOLEAN NOT NULL DEFAULT FALSE,
  default_value TEXT,
  validation_regex TEXT,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (type_key, type_kind, property_key)
);
```

### 1.2 Seed (initial registry)

Phase 1.6 lands a seed with all node types from `agent-studio-neo4j-community-edition-graph-backend.md` §2.3 and edge types from §2.4. The seed is idempotent: re-running adds new rows without duplicating existing ones.

### 1.3 Validation

Every graph write goes through:
1. Lookup type in registry.
2. Validate required properties present.
3. Validate property types (regex for strings, range for numbers).
4. Validate edge endpoints conform to `source_node_type_keys` / `target_node_type_keys`.
5. Reject with structured error if any check fails.

Validation lives in `server/agent-studio/services/graph/repository/ontology-validator.ts`.

## 2. Acceptance

- [x] Tables defined.
- [x] Seed expectation defined.
- [x] Validation flow defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Seed runs at boot.
- [ ] Tests verify rejection of unknown types.
