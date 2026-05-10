# Existing Data Migration + Projection Plan

**Phase:** Native Graph Workspace MVP 0 — Phase 0.5
**Companion to:** `docs/implementation/native-graph-workspace-existing-inventory.md`
**Status:** Adopted

---

## 1. Purpose

Define how existing Agent Studio data enters the Native Graph Workspace and how source-of-truth records project into Neo4j CE without duplicating storage. This plan respects the inventory in `native-graph-workspace-existing-inventory.md`.

## 2. Existing artifact mapping

| Existing artifact | Source of truth (Postgres) | Projection target (Neo4j CE) | Projection action |
|---|---|---|---|
| KGRA entities | RAGDB.`kgra_entities` | `(:Entity)` with `source_id`, `source_version_id` | Read-only projection; preserve KGRA build_id as snapshot anchor |
| KGRA relationships | RAGDB.`kgra_relationships` | `(:Entity)-[:RELATED]->(:Entity)` typed by `relationshipType` | Read-only projection |
| KGRA build runs | RAGDB.`kgra_build_runs` | `(:KGRABuild)` (optional metadata node) | Snapshot per build_id |
| KGRA manual nodes | RAGDB.`kgra_manual_nodes` | `(:ManualNode)` with `validFrom`, `validUntil` | Read-only projection with temporal validity |
| GraphRAG sources | ASDB.`graphrag_sources` | `(:GraphRagSource)` (optional) | Reference-only; new vault sources register here |
| GraphRAG index runs | ASDB.`graphrag_index_runs` | (Postgres-only; not projected) | Drives Phase 12 retrieval router metadata |
| GraphRAG query runs | ASDB.`graphrag_query_runs` | (Postgres-only; not projected) | Drives Phase 12 retrieval trace |
| Existing CAG packs | ASDB CAG store | `(:CAGBlock)` | Project pack/block/version nodes |
| Existing CAG blocks | ASDB CAG store | `(:CAGBlock)` with `source_note_version_id` (after Phase 10) | Initial: project as runtime context nodes; Phase 10 adds note ref |
| Existing MCP tools | MCP / tool registry | `(:MCPTool)` | Project as tool graph nodes |
| Existing MCP servers | MCP registry | `(:MCPServer)` | Project as server nodes |
| Existing runtime traces | ASDB.`agsRuntimeRuns` (V3) | `(:RuntimeTrace)` with V3 observability columns | Phase 14 projection |
| Existing decision traces | ASDB decision trace tables | `(:DecisionTrace)`, `(:DecisionTraceStep)` | Phase 14 projection |
| Existing RAC sources | ASDB RAC source registry | (Reference-only; not projected directly) | Map to vault sources where overlap exists |
| Existing approval policies | ASDB governance store | `(:Policy)` | Phase 11 projection |
| Existing tool knowledge | ASDB tool knowledge store | `(:ToolKnowledge)` (optional) | Phase 10/11 projection |
| Existing evaluations | ASDB evaluation store | `(:EvaluationCase)` | Phase 23 projection |
| Existing agent definitions | ASDB Agent Studio store | `(:Agent)` | Phase 7 projection |
| Existing OpenRouter model refs | Model / provider registry | `(:Model)`, `(:Provider)` (optional) | Reference-only; not projected initially |
| Existing code architecture | Repo / static analysis | `(:CodeFile)`, `(:Service)`, `(:DbTable)` | Phase 20.5 spike → Phase 25 V1.5 |
| Existing security findings | (TBD) | `(:SecurityFinding)` | Out of scope for MVP |

## 3. Projection rules

1. **Postgres or existing system store remains source of truth.** Neo4j CE only stores projections.
2. **Projection records preserve `source_id` and `source_version_id`.** No data is "lifted" out of Postgres into Neo4j as the only copy.
3. **Projection sync is replayable.** Each projection job has a deterministic input (Postgres source state) and produces a deterministic Neo4j output.
4. **Projection sync is auditable.** Every projection run writes `ags_graph_projection_sync_results` with row counts, errors, and snapshot IDs.
5. **Projection drift is detectable.** `ags_graph_projection_drift_events` tracks divergences between Postgres source and Neo4j projection state.
6. **Permissions propagate.** Neo4j projections never expose nodes/edges that the source-record permission would hide.
7. **Governance state propagates.** Approval / lifecycle / publication state on the source record gates projection visibility.
8. **Existing records are NOT forcibly converted into notes.** `kgra_entities` stays as KGRA entities; the Native Graph Workspace adds a typed graph layer on top, not in place of.

## 4. Data model (new tables, ASDB)

### 4.1 Migration tables

```sql
-- Migration job orchestration
CREATE TABLE ags_migration_jobs (
  id SERIAL PRIMARY KEY,
  migration_key VARCHAR(100) NOT NULL,        -- 'kgra_entities_initial', 'cag_blocks_phase_10'
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_migration_job_items (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ags_migration_jobs(id),
  source_type VARCHAR(100) NOT NULL,           -- 'kgra_entity', 'cag_block', 'agent'
  source_id TEXT NOT NULL,                     -- FK to source table
  source_version_id TEXT,                      -- if source is versioned
  target_neo4j_node_id TEXT,                   -- after projection
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_migration_projection_results (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ags_migration_jobs(id),
  source_type VARCHAR(100) NOT NULL,
  source_count INTEGER NOT NULL,
  projected_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  snapshot_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_migration_audit_events (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ags_migration_jobs(id),
  event_type VARCHAR(100) NOT NULL,            -- 'started', 'item_projected', 'item_failed', 'completed'
  source_type VARCHAR(100),
  source_id TEXT,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 4.2 Projection sync tables

```sql
CREATE TABLE ags_graph_projection_sync_jobs (
  id SERIAL PRIMARY KEY,
  projection_key VARCHAR(100) NOT NULL,        -- 'note', 'wikilink', 'kgra_entity', 'runtime_trace'
  trigger_event VARCHAR(100) NOT NULL,         -- 'note.created', 'kgra.build_completed'
  trigger_payload JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_projection_sync_results (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ags_graph_projection_sync_jobs(id),
  nodes_created INTEGER DEFAULT 0,
  nodes_updated INTEGER DEFAULT 0,
  nodes_deleted INTEGER DEFAULT 0,
  edges_created INTEGER DEFAULT 0,
  edges_updated INTEGER DEFAULT 0,
  edges_deleted INTEGER DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  snapshot_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_projection_sync_errors (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES ags_graph_projection_sync_jobs(id),
  error_class VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  error_payload JSONB,
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_projection_drift_events (
  id SERIAL PRIMARY KEY,
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  projection_key VARCHAR(100) NOT NULL,
  source_id TEXT NOT NULL,
  drift_class VARCHAR(100) NOT NULL,           -- 'missing_in_neo4j', 'stale_version', 'extra_in_neo4j'
  source_version_id TEXT,
  neo4j_version_id TEXT,
  remediation VARCHAR(100),                    -- 'rebuild_pending', 'rebuild_completed', 'manual_review'
  remediated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_projection_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_key VARCHAR(100) NOT NULL,
  scope VARCHAR(100) NOT NULL,                 -- 'workspace:<id>', 'global', 'kgra_build:<id>'
  taken_at TIMESTAMP NOT NULL DEFAULT NOW(),
  node_count INTEGER NOT NULL,
  edge_count INTEGER NOT NULL,
  storage_uri TEXT,                            -- where the snapshot is persisted (S3/local)
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_projection_rebuilds (
  id SERIAL PRIMARY KEY,
  trigger VARCHAR(100) NOT NULL,               -- 'drift_detected', 'manual', 'schema_migration'
  scope VARCHAR(100) NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  summary JSONB,                               -- counts, durations
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 5. Migration flow (initial)

### Phase 0.5 — discovery only (this phase)
- Snapshot the existing `kgra_entities` / `kgra_relationships` / `kgra_build_runs` row counts.
- Snapshot existing `graphrag_sources` / `graphrag_index_runs` row counts.
- Snapshot existing CAG / RAC / agent / approval row counts.
- Document expected projection load (10k–250k nodes target per inventory).
- No actual projection runs.

### Phase 1.7 — projection sync architecture
- Implement `ags_graph_projection_*` tables (Drizzle reconciler).
- Implement `GraphProjectionSyncRepository` interface.
- Implement test-mode projection sync (writes to `TestGraphRepository`, no Neo4j).

### Phase 7.5 — initial projection (Neo4j CE active)
- One-shot initial projection: `kgra_entities` → `(:Entity)`, `kgra_relationships` → `[:RELATED]`.
- Subsequent incremental projection on new KGRA build runs.
- Snapshot recorded in `ags_graph_projection_snapshots`.

### Phase 14 — runtime trace projection
- `agsRuntimeRuns` (V3 schema) → `(:RuntimeTrace)` projection.
- Decision trace projection (`ags_decision_traces` → `(:DecisionTrace)`).

### Phase 23 — drift remediation loop
- Periodic drift detection runs against `ags_graph_projection_drift_events`.
- Auto-rebuild for low-risk drift classes; human review queue for high-risk.

## 6. Failure modes + rollback

| Failure | Detection | Rollback |
|---|---|---|
| Neo4j unavailable during projection | `ags_graph_projection_sync_jobs.status='failed'` + `last_error` | Job retries with exponential backoff; degraded UI shown |
| Source-record version skew | `ags_graph_projection_drift_events.drift_class='stale_version'` | Re-run incremental projection for affected source IDs |
| Projection schema migration | Versioned snapshot before migration | Restore from `ags_graph_projection_snapshots.storage_uri` |
| Corrupted projection | Drift event + snapshot diff | Full rebuild via `ags_graph_projection_rebuilds` job |
| Permission propagation failure | Property-based visibility test failure | Block reads to affected projection; alert P1 |

## 7. Permission + governance propagation

- Each projected node carries `governance_status`, `validation_status`, `lineage_status`.
- Each projected edge carries the **lower** governance status of its endpoints.
- Hidden nodes (per source-record permission) are projected with a `hidden=true` flag; reads filter on this.
- Property-based test (Phase 21): for any hidden source record, no Neo4j projection is visible to the corresponding user role.

## 8. Acceptance

- [x] Existing artifact map locked.
- [x] Projection rules locked.
- [x] Migration / projection sync data model declared.
- [x] Initial projection flow defined.
- [x] Failure mode + rollback model defined.
- [x] Permission / governance propagation rules defined.
- [ ] Phase 1.7 projection sync architecture ADR merged.
- [ ] Phase 7.5 initial projection job passes `kgra_entities` baseline.
- [ ] Phase 14 runtime trace projection passes `agsRuntimeRuns` baseline.

## 9. Evidence

- `drizzle/tables/ragdb.ts` — KGRA tables.
- `drizzle/tables/graphrag.ts` — GraphRAG control plane tables.
- `server/data-analysis/graphrag/` — existing GraphRAG service shape.
- V3 closure memory: `agsRuntimeRuns` Phase 11a observability columns.
- Companion: `docs/implementation/native-graph-workspace-existing-inventory.md`.
