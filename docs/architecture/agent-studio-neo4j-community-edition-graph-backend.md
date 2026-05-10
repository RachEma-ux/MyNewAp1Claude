# Agent Studio — Neo4j Community Edition Graph Backend — ADR

**Owner:** Agent Studio module + KGIA + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.3
**Status:** Adopted (subject to Phase 1.5 benchmark gate)
**Authority:** Defines Neo4j CE as the default dedicated graph backend for MVP graph workloads.

---

## 1. Problem statement

The Native Graph Workspace requires a dedicated graph backend for traversal, GraphRAG path expansion, and runtime trace projection. Postgres recursive CTEs hit performance ceilings on depth-3+ permission-aware traversals at the target dataset size (10k notes / 100k links / 50k graph nodes / 250k graph edges). KGIA already has a stub Neo4j adapter awaiting real driver integration.

## 2. Decision

### 2.1 Neo4j CE as MVP dedicated graph backend

Neo4j Community Edition is the default candidate. Promotion gated by Phase 1.4 benchmark spike.

### 2.2 Deployment model

**Local development:** Docker Compose (`docker-compose.staging.yml` extension or new `docker-compose.graph.yml`).

```yaml
# docker-compose.graph.yml (NEW)
services:
  neo4j:
    image: neo4j:5-community
    ports:
      - "7687:7687"   # Bolt
      - "7474:7474"   # HTTP
    environment:
      NEO4J_AUTH: "neo4j/devpassword"
      NEO4J_dbms_security_procedures_unrestricted: "apoc.*"
    volumes:
      - ./neo4j-data:/data
```

**Staging / production:** Single-instance Neo4j CE deployment (limits documented below). Production hardening via Neo4j Enterprise / Aura covered in Phase 27.

### 2.3 Schema (labels)

```
:Workspace
:Vault
:Note          { id, vault_id, source_id, source_version_id, projection_snapshot_id }
:NoteVersion   { id, note_id, version, source_id, source_version_id }
:Tag           { id, label }
:Attachment    { id, note_id, mime_type, source_id }
:Entity        { id, label, entity_type, source_id, kgra_entity_id?, governance_status }
:Observation   { id, entity_id, observation_type, valid_from, valid_to, confidence }
:Agent         { id, agent_key }
:KnowledgeUnit { id, source_id, source_version_id }
:CAGBlock      { id, block_id, version, source_id }
:GraphSkillPack{ id, skill_id, version, source_id }
:MCPTool       { id, tool_id, server_id, source_id }
:MCPServer     { id, server_id }
:Policy        { id, policy_id, version }
:Workflow      { id, workflow_id, version }
:RuntimeTrace  { id, trace_id, agent_id, started_at, status }
:DecisionTrace { id, trace_id, runtime_trace_id }
:DecisionTraceStep { id, decision_trace_id, step_index, source_id }
:EvaluationCase{ id, case_id, suite_id }
:Service       { id, service_id }
:DbTable       { id, table_name }
:CodeFile      { id, path }
:SecurityFinding { id, finding_id }
:KGRABuild     { id, build_id, entity_count, relationship_count }
:ManualNode    { id, unique_id, family, kind, valid_from, valid_until }
```

All nodes carry `source_id` (Postgres FK), `source_version_id` (where versioned), `projection_snapshot_id`, `created_at`, `updated_at`, `valid_from`, `valid_to`, `governance_status`.

### 2.4 Schema (relationships)

```
[:VERSION_OF]                   (NoteVersion)-[:VERSION_OF]->(Note)
[:BELONGS_TO_WORKSPACE]         (Vault)-[:BELONGS_TO_WORKSPACE]->(Workspace)
[:BELONGS_TO_VAULT]             (Note)-[:BELONGS_TO_VAULT]->(Vault)
[:LINKS_TO]                     (NoteVersion)-[:LINKS_TO]->(Note)
[:HAS_TAG]                      (NoteVersion)-[:HAS_TAG]->(Tag)
[:EMBEDS]                       (NoteVersion)-[:EMBEDS]->(Attachment)
[:MENTIONS]                     (NoteVersion)-[:MENTIONS]->(Entity)
[:HAS_ALIAS]                    (Entity)-[:HAS_ALIAS]->(Entity)  // alias chain
[:OBSERVED_AS]                  (Entity)-[:OBSERVED_AS]->(Observation)
[:RELATED]                      (Entity)-[:RELATED { type, weight, source_id }]->(Entity)  // KGRA-derived
[:PROMOTED_TO]                  (Note)-[:PROMOTED_TO]->(CAGBlock|GraphSkillPack|...)
[:REFERENCES_NOTE_VERSION]      (CAGBlock|GraphSkillPack|...)-[:REFERENCES_NOTE_VERSION]->(NoteVersion)
[:USED_CAG_BLOCK]               (RuntimeTrace)-[:USED_CAG_BLOCK]->(CAGBlock)
[:USED_GRAPH_SKILL]             (RuntimeTrace)-[:USED_GRAPH_SKILL]->(GraphSkillPack)
[:USED_MCP_TOOL]                (RuntimeTrace)-[:USED_MCP_TOOL]->(MCPTool)
[:HAS_DECISION_TRACE]           (RuntimeTrace)-[:HAS_DECISION_TRACE]->(DecisionTrace)
[:HAS_STEP]                     (DecisionTrace)-[:HAS_STEP]->(DecisionTraceStep)
[:DERIVED_FROM_SOURCE]          (Entity|Observation)-[:DERIVED_FROM_SOURCE]->(NoteVersion)
[:GOVERNS]                      (Policy)-[:GOVERNS]->(Workflow|MCPTool|CAGBlock)
[:DEPENDS_ON]                   (Service)-[:DEPENDS_ON]->(Service|DbTable)
[:USES]                         (CodeFile)-[:USES]->(CodeFile)
[:CALLS]                        (Function)-[:CALLS]->(Function)
[:AFFECTS]                      (SecurityFinding)-[:AFFECTS]->(Service|Component)
```

### 2.5 Constraints + indexes (Phase 7.5)

```cypher
// Uniqueness
CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT note_version_id IF NOT EXISTS FOR (n:NoteVersion) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT runtime_trace_id IF NOT EXISTS FOR (n:RuntimeTrace) REQUIRE n.id IS UNIQUE;

// Lookup indexes
CREATE INDEX note_source_id IF NOT EXISTS FOR (n:Note) ON (n.source_id);
CREATE INDEX entity_label IF NOT EXISTS FOR (n:Entity) ON (n.label);
CREATE INDEX entity_type IF NOT EXISTS FOR (n:Entity) ON (n.entity_type);
CREATE INDEX runtime_trace_started_at IF NOT EXISTS FOR (n:RuntimeTrace) ON (n.started_at);

// Full-text indexes (if supported)
CREATE FULLTEXT INDEX note_label_text IF NOT EXISTS FOR (n:Note) ON EACH [n.label, n.summary];
```

### 2.6 Cypher query template categories (Phase 12.5)

```
local_graph_depth_1
local_graph_depth_2
local_graph_depth_3
global_graph_sample
note_backlinks
entity_neighborhood
cag_source_notes
graph_skill_source_notes
runtime_trace_path
decision_trace_path
impact_analysis
tool_policy_dependencies
workflow_tool_dependencies
code_dependency_path
security_blast_radius
kgra_relationship_traversal
```

Each template:
- Parameter schema (Zod)
- `permission_filter_required: true` (mandatory)
- `max_depth`, `max_results`, `timeout_ms` limits
- `read_only: true` (default; mutations gated by graph change proposals)
- Source skill pack reference

### 2.7 Permission filter strategy

Permission filtering happens at the application layer after Neo4j returns node IDs:
1. Cypher template returns node IDs + paths.
2. Application loads source records from Postgres.
3. Permission filter evaluates against authoritative records.
4. Hidden nodes / edges removed before response assembly.

This avoids Neo4j-side ACL maintenance and ensures permissions evaluate on the source of truth.

### 2.8 CE limitations (documented)

| Capability | Neo4j CE | Implication |
|---|---|---|
| High availability | Single instance | Backup/restore is operator-driven; document in runbook |
| Clustering | Not supported | Vertical scaling only |
| Failover | Not supported | Downtime during restart; degraded mode UI mandatory |
| Online backup | Limited | Scheduled offline dumps |
| Enterprise RBAC / LDAP | Not supported | App-level permission filtering (this ADR §2.7) |
| Multi-database admin | Limited | Single database (`neo4j` default) for MVP |

### 2.9 Degraded mode

When Neo4j CE is unavailable:
- `Neo4jCommunityGraphRepository.health()` returns `degraded`.
- `getGraphRepository()` falls back to `PostgresGraphRepository` for shallow operations only.
- Deep traversals return `{ degraded: true, partial: true, reason: 'neo4j_unavailable' }`.
- UI shows degraded-state banner (Phase 22).
- GraphRAG retrieval router skips graph traversal source; uses other RAC sources.
- Graph Agent Lite returns "graph context unavailable" with cited fallback.

## 3. Production upgrade path

When Neo4j CE limits bite (clustering, online backup, RBAC, enterprise LDAP), follow Phase 27 upgrade path:
- Neo4j Enterprise self-managed
- Neo4j Aura managed
- Memgraph if benchmarked superior
- Hybrid backend if required

Trigger conditions documented in Phase 27 ADR.

## 4. Acceptance

- [x] Labels enumerated.
- [x] Relationships enumerated.
- [x] Constraint / index plan documented.
- [x] Cypher template categories defined.
- [x] Permission filter strategy documented.
- [x] CE limitations enumerated.
- [x] Degraded mode behavior defined.
- [x] Production upgrade path referenced.
- [ ] Phase 1.4 benchmark spike completes.
- [ ] Phase 1.5 backend decision closes.
- [ ] Phase 7.5 active backend implementation lands.

## 5. Evidence

- KGIA stub adapter: `server/modules/kgia/infrastructure/neo4j-adapter.ts`.
- KGIA query planner: `server/modules/kgia/domain/query-planner.ts`.
- Companion: `agent-studio-graph-repository-and-backend-strategy.md`.
- Companion: `agent-studio-graph-projection-sync.md`.
- Companion: `agent-studio-cypher-query-template-system.md`.
- Companion: `agent-studio-graph-context-safety-filter.md`.
