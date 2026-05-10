# Agent Studio — Postgres / Neo4j Responsibility Split — ADR

**Owner:** Agent Studio module + Knowledge / GraphRAG + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 0 / Phase 1.1
**Status:** Adopted — locks dual-store responsibility model
**Authority:** Locks the dual-store boundary that no feature may cross without ADR amendment.

---

## 1. Problem statement

The Native Graph Workspace introduces Neo4j CE as a dedicated projected graph backend alongside the existing Postgres / ASDB / RAGDB databases. Without a locked responsibility split, the system risks:
- Treating Neo4j as a source of truth.
- Postgres / Neo4j divergence with no detection mechanism.
- Permission / governance bypass via direct Neo4j queries.
- Confusion about which store owns runtime traces, promotion state, audit records.

## 2. Decision

### 2.1 Postgres responsibilities (source of truth)

Postgres (specifically ASDB for Agent Studio tables) owns:

| Domain | Tables / surfaces |
|---|---|
| Workspace persistence | `ags_vaults`, `ags_vault_*`, `ags_vault_notes`, `ags_vault_note_versions` |
| Vault permissions | `ags_vault_members`, `ags_vault_settings` |
| Note metadata | `ags_vault_note_properties`, `ags_vault_property_definitions` |
| Wikilinks / backlinks | `ags_vault_wikilinks`, `ags_vault_backlinks`, `ags_vault_unlinked_mentions` |
| Typed graph metadata | `ags_graph_nodes`, `ags_graph_edges`, `ags_graph_node_properties` |
| Ontology / constraints | `ags_graph_ontology_*`, `ags_graph_constraints` |
| Entity resolution | `ags_graph_entities`, `ags_graph_entity_aliases`, `ags_graph_entity_resolution_*` |
| Provenance / temporal | `ags_graph_provenance_records`, `ags_graph_temporal_facts` |
| Promotion state | `ags_note_promotions`, `ags_note_promotion_versions`, `ags_note_runtime_bindings` |
| Graph change proposals | `ags_graph_change_proposals`, `ags_graph_change_decisions` |
| GraphRAG retrieval | `ags_retrieval_runs`, `ags_retrieval_queries`, `ags_retrieval_results`, existing `graphrag_*` tables |
| Graph Skill Packs | `ags_graph_skill_packs`, `ags_graph_skill_pack_versions` |
| Graph Agent runtime | `ags_graph_agent_runs`, `ags_graph_agent_steps` |
| Runtime traces | `agsRuntimeRuns` (existing, V3 Phase 11a) |
| Decision traces | `ags_decision_traces`, `ags_decision_trace_steps` |
| Governance / approval | existing `agsApprovalSteps`, `agsPendingPermissionRequests` |
| Audit trail | existing audit tables + new `ags_workspace_audit_events` |
| Background jobs | `ags_workspace_background_jobs` |
| Evaluation | `ags_workspace_eval_*`, `ags_golden_question_*` |
| Benchmark | `ags_workspace_benchmark_*` |

### 2.2 Neo4j CE responsibilities (projected graph backend)

Neo4j CE owns the **projected** representation of Postgres-source-of-truth records, optimized for traversal:

| Concern | Neo4j artifact |
|---|---|
| Note / NoteVersion nodes | `(:Note)`, `(:NoteVersion)` |
| Tag / Attachment nodes | `(:Tag)`, `(:Attachment)` |
| Typed graph entities | `(:Entity)`, `(:Observation)` |
| Runtime asset nodes | `(:CAGBlock)`, `(:GraphSkillPack)`, `(:MCPTool)`, `(:Policy)`, `(:Workflow)` |
| Trace nodes | `(:RuntimeTrace)`, `(:DecisionTrace)`, `(:DecisionTraceStep)` |
| Evaluation nodes | `(:EvaluationCase)` |
| Code / security nodes | `(:Service)`, `(:DbTable)`, `(:CodeFile)`, `(:SecurityFinding)` |
| Wikilink edges | `(:NoteVersion)-[:LINKS_TO]->(:Note)` |
| Mention edges | `(:NoteVersion)-[:MENTIONS]->(:Entity)` |
| Promotion edges | `(:Note)-[:PROMOTED_TO]->(:CAGBlock)` |
| Reference edges | `(:CAGBlock)-[:REFERENCES_NOTE_VERSION]->(:NoteVersion)` |
| Runtime usage edges | `(:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)` |
| Decision trace edges | `(:RuntimeTrace)-[:HAS_DECISION_TRACE]->(:DecisionTrace)-[:HAS_STEP]->(:DecisionTraceStep)` |
| Provenance edges | `(:GraphFact)-[:DERIVED_FROM_SOURCE]->(:NoteVersion)` |

Neo4j CE node and relationship properties carry **only**:
- `source_id` (FK to Postgres)
- `source_version_id` (FK to Postgres versioned record)
- `projection_snapshot_id` (FK to projection sync record)
- `created_at`, `updated_at`, `valid_from`, `valid_to`
- `confidence`, `lineage_status`, `extraction_method`, `validation_status`, `governance_status`

Neo4j CE does NOT carry: full text bodies, full property bags, permission lists, governance state, raw Markdown content. Those stay in Postgres.

### 2.3 GraphRepository as the single boundary

All graph access goes through `GraphRepository` (`server/agent-studio/services/graph/repository/`):

```
Application code
    ↓
GraphRepository interface
    ↓
PostgresGraphRepository  (shallow fallback / fixture testing)
Neo4jCommunityGraphRepository  (active backend)
TestGraphRepository  (tests)
MemgraphGraphRepository  (benchmark candidate; out of scope unless adopted)
FalkorDbGraphRepository  (benchmark candidate; out of scope unless adopted)
```

No application code may import `neo4j-driver` or call Cypher outside the repository / query template registry boundary.

### 2.4 Projection sync as the only Postgres → Neo4j path

Postgres → Neo4j is **only** populated by the projection sync layer (`server/agent-studio/services/graph/projection/`):

```
Postgres source-of-truth change
    ↓
Domain event (e.g. note.created, promotion.approved, runtime_trace.created)
    ↓
Projection job in ags_graph_projection_sync_jobs
    ↓
GraphRepository writes projected nodes/edges to Neo4j CE
    ↓
ags_graph_projection_sync_results records outcome
    ↓
ags_graph_projection_drift_events (if drift detected)
```

Neo4j CE → Postgres direction is **forbidden** outside ADR-approved bidirectional flows (none planned in MVP 0–4).

### 2.5 Reads — Postgres-first for content

Reads follow this pattern:
1. Neo4j CE returns node IDs + source references for traversal results.
2. Application code loads the full record from Postgres using the returned source IDs.
3. Permission / governance / safety filter applies on the Postgres records.
4. Response assembled from Postgres content with Neo4j-derived structural context.

This prevents Neo4j becoming a source-of-truth surface and ensures permissions are evaluated on the authoritative records.

### 2.6 Drift detection

`ags_graph_projection_drift_events` tracks divergences. Detection mechanisms:
- Periodic sync-job re-run with diff against current Neo4j state.
- Source-record version mismatch (Neo4j `source_version_id` vs Postgres latest).
- Snapshot rebuild compared against incremental projection.

Drift is treated as a P1 alert; remediation is projection rebuild.

## 3. Consequences

**Positive:**
- Single source of truth eliminates ambiguity.
- Permissions / governance always evaluated on Postgres records.
- Neo4j CE failure does not lose data — projection rebuild from Postgres source.
- Existing `agsRuntimeRuns` schema preserved; Neo4j projection is additive.

**Negative / risks:**
- Drift between stores is a real operational concern — drift detection + rebuild are mandatory.
- Two-write semantics (Postgres write + projection job) introduces latency.
- Projection sync layer becomes a critical chokepoint — must have replay + rebuild semantics.

## 4. Alternatives considered

- **Neo4j as source of truth** — rejected: AGENTS.md mandates extending existing Postgres-anchored systems.
- **Bidirectional sync** — rejected for MVP: complexity outweighs benefit; revisit if Phase 23 self-correction proves common.
- **Single store (Neo4j only)** — rejected: existing app records (CAG, runtime traces, governance, audit) are not graph-shaped and Postgres is already the authoritative store.

## 5. Acceptance

- [x] Postgres responsibility list documented.
- [x] Neo4j CE responsibility list documented.
- [x] GraphRepository boundary locked.
- [x] Projection sync direction locked.
- [x] Drift detection model documented.
- [ ] Source-scan test enforces no `neo4j-driver` import outside repository (Phase 7.5).
- [ ] Projection sync layer ships in Phase 1.7 / 7.5.

## 6. Evidence

- Existing `agsRuntimeRuns` schema (V3 Phase 11a).
- Existing `graphrag_*` tables in `drizzle/tables/graphrag.ts`.
- Companion ADR: `agent-studio-graph-repository-and-backend-strategy.md`.
- Companion ADR: `agent-studio-graph-projection-sync.md`.
