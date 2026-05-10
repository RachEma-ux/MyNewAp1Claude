# Agent Studio — Graph Projection Sync — ADR

**Owner:** Agent Studio module + Knowledge / GraphRAG + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.7
**Status:** Adopted
**Authority:** Locks the explicit Postgres → Neo4j CE projection sync architecture.

---

## 1. Problem statement

Postgres remains source of truth (`agent-studio-postgres-neo4j-responsibility-split.md`); Neo4j CE owns the projected graph. Without an explicit projection layer, the system risks:
- Silent drift between Postgres records and Neo4j projections.
- Race conditions between application writes and projection updates.
- Permission / governance state lag.
- Loss of replayability when Neo4j is rebuilt.

## 2. Decision

### 2.1 Architecture

```
Postgres write
    ↓
Domain event emitted (e.g. note.created, promotion.approved, runtime_trace.completed)
    ↓
Projection job queued in ags_graph_projection_sync_jobs
    ↓
ProjectionWorker picks up job
    ↓
Resolves source record(s) from Postgres
    ↓
Computes target Neo4j operations (upserts + deletes)
    ↓
Calls GraphRepository.applyProjectionJob()
    ↓
Records result in ags_graph_projection_sync_results
    ↓
On error: ags_graph_projection_sync_errors + retry policy
    ↓
Drift detector periodically compares source state vs projection state
    ↓
Drift events: ags_graph_projection_drift_events
```

### 2.2 Projection types

```
NoteProjection           — note + note_version + properties
LinkProjection           — wikilink + backlink edges
EntityProjection         — entity + alias + observation
KGRAProjection           — kgra_entities + kgra_relationships read-only mirror
TagProjection            — tag nodes + edges
AttachmentProjection     — attachment nodes + edges
CAGProjection            — CAG block nodes + reference edges
GraphSkillProjection     — Graph Skill Pack nodes + reference edges
MCPToolProjection        — MCP tool + server nodes + dependency edges
PolicyProjection         — policy nodes + governance edges
WorkflowProjection       — workflow nodes + tool dependency edges
RuntimeTraceProjection   — runtime trace + decision trace path projection
EvaluationProjection     — evaluation case nodes
```

### 2.3 Trigger events

```
note.created
note.updated
note.version_created
note.deleted
note.restored
wikilink.changed
entity.detected
entity.merged
entity.split
promotion.approved
promotion.rolled_back
runtime_trace.created
decision_trace.created
policy.updated
tool_schema.changed
graph_correction.approved
semantic_enrichment.approved
kgra.build_completed
```

### 2.4 Projection job lifecycle

```
States:
  pending → in_progress → completed
           ↘ failed → (retry) → in_progress
           ↘ failed → (max_retries) → dead_letter
```

`max_retries`: 3 with exponential backoff (1s, 5s, 30s).

### 2.5 Replayability

Each projection job carries:
- `trigger_event` (string)
- `trigger_payload` (JSONB; serialized source state)

Replaying = re-executing `applyProjectionJob()` against the same payload. Idempotent: upserts use `MERGE` semantics keyed on `source_id`.

### 2.6 Snapshot rebuild

`ags_graph_projection_rebuilds` records full rebuilds. Triggers:
- Drift threshold exceeded (>5% drift in any projection type)
- Manual operator action
- Schema migration (new label / relationship type)

Rebuild flow:
1. Snapshot current Neo4j state to `ags_graph_projection_snapshots.storage_uri`.
2. Drop projection-managed nodes/edges in Neo4j (preserves any non-managed external data).
3. Re-run all projection jobs from authoritative Postgres source state.
4. Diff against snapshot; record results.

### 2.7 Drift detection

Drift detector runs on schedule (default: every 6 hours):
- Compare row counts: `count(ags_vault_notes)` vs `count(:Note)` in Neo4j.
- Compare version freshness: random sample of 100 source records — Neo4j `source_version_id` matches latest Postgres version.
- Compare relationship counts.
- Hidden-node leak check: any `governance_status='hidden'` source records visible in Neo4j (hard fail).

Drift events fire with class:
- `missing_in_neo4j` — Postgres has it; Neo4j doesn't.
- `extra_in_neo4j` — Neo4j has it; Postgres doesn't.
- `stale_version` — version mismatch.
- `permission_leak` — hidden source visible (P1 alert).

### 2.8 Permission propagation

Permission filter runs at projection time:
- Each node/edge carries `governance_status` (active / hidden / archived).
- `hidden` nodes have `hidden=true` flag in Neo4j.
- Application reads filter on `hidden=true` and source-record permission.

### 2.9 Boundary contracts

- All projection writes go through `GraphRepository.applyProjectionJob()`.
- No application code may write to Neo4j directly.
- Source-scan test enforces the boundary.

## 3. Failure modes

| Failure | Detection | Mitigation |
|---|---|---|
| Neo4j unavailable | `Neo4jCommunityGraphRepository.health()` returns degraded | Jobs queue, retry on health restoration |
| Projection logic bug | Job error | Dead-letter; manual rebuild |
| Source-record version skew | Drift detector | Re-run incremental projection |
| Permission propagation lag | Drift detector permission-leak check | P1 alert; freeze affected projection |
| Schema migration | Manual trigger | Snapshot + full rebuild |

## 4. Acceptance

- [x] Architecture defined.
- [x] Projection types enumerated.
- [x] Trigger events enumerated.
- [x] Job lifecycle defined.
- [x] Replayability requirement locked.
- [x] Snapshot rebuild flow defined.
- [x] Drift detection defined.
- [x] Permission propagation defined.
- [x] Boundary contracts locked.
- [ ] Projection sync layer ships in Phase 7.5.
- [ ] Drift detector ships in Phase 7.5.
- [ ] Property-based permission propagation test ships in Phase 21.

## 5. Evidence

- Companion: `agent-studio-postgres-neo4j-responsibility-split.md`.
- Companion: `agent-studio-graph-repository-and-backend-strategy.md`.
- Companion: `agent-studio-existing-data-migration-projection-plan.md` (initial migration table model).
- V3 Phase 11 / 11a observability column pattern (similar projection-like model for runtime traces).
