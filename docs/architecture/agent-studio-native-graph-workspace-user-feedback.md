# Agent Studio — Native Graph Workspace User Feedback — ADR

**Owner:** Agent Studio module + Frontend + Operations
**Phase:** Native Graph Workspace — Phase 1 / Phase 22
**Status:** Adopted

---

## 1. Decision

### 1.1 Failure-state inventory

| State | UI surface | Recovery |
|---|---|---|
| Promotion failed | Toast + audit detail | Retry / open governance review |
| Note conflict | Conflict diff dialog | Save copy / merge / discard |
| Entity merge conflict | Resolution candidate review | Phase 11.5 graph change proposal |
| Neo4j unavailable | Banner | Retry / use degraded mode |
| Neo4j degraded | Banner with explanation | Continue with shallow graph |
| Projection sync failed | Status indicator on affected note | Retry / trigger rebuild |
| Projection drift detected | Status indicator on affected projection | Rebuild |
| Graph query timeout | Partial result + truncation reason | Re-run with narrower scope |
| Backlink refresh failed | Indicator | Auto-retry on next save |
| Runtime reference hidden by permission | Tooltip on hidden item | Request access |
| CAG reference invalidated | Status on CAG block | Re-promote source note |
| Graph Skill reference invalidated | Status on pack | Re-promote source note |
| Tool schema changed | Diff in tool detail | Operator review |
| Search index stale | Indicator | Re-index |
| Query cache stale | Auto-invalidated; no surface needed | — |
| Text2Cypher rejected | Inline error in retrieval result | Refine query |
| Cypher template failed | Inline error | Operator review |
| Retrieval safety filter blocked | Block placeholder with reason | Refine query / request access |
| Graph Agent answer incomplete | Why-This-Answer panel highlights gap | Re-run with broader scope |
| Golden question failed | Eval dashboard + correction proposal option | Phase 23 correction |
| Graph correction rejected | Decision record | Audit only |
| Semantic enrichment rejected | Decision record | Audit only |
| Background job failed | Job status surface | Retry |

### 1.2 Tables

```sql
CREATE TABLE ags_workspace_background_jobs (
  id SERIAL PRIMARY KEY,
  job_kind VARCHAR(100) NOT NULL,
  payload JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_workspace_user_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  notification_kind VARCHAR(100) NOT NULL,
  payload JSONB,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_workspace_error_events (
  id SERIAL PRIMARY KEY,
  source_kind VARCHAR(100) NOT NULL,              -- 'projection_sync', 'graph_query', 'graph_agent'
  source_id TEXT,
  user_id INTEGER,
  error_class VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Graph Agent explanation panel

Phase 22 Why-This-Answer panel shows:
- Retrieval mode used
- Graph Skill Pack used
- Cypher query template used
- Graph backend used (CE / Postgres / degraded)
- Neo4j projection snapshot used
- Graph path
- Citations
- Confidence
- Hidden / truncated context reason
- Correction proposal option

## 2. Acceptance

- [x] Failure-state inventory locked.
- [x] Tables defined.
- [x] Why-This-Answer panel content defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 22 UI surfaces ship.
