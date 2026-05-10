# Agent Studio — Graph Query Cache + Projection Snapshots — ADR

**Owner:** Agent Studio module + Operations
**Phase:** Native Graph Workspace — Phase 1.6 / Phase 7
**Status:** Adopted

---

## 1. Decision

### 1.1 Query cache

```sql
CREATE TABLE ags_graph_query_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) NOT NULL,                -- hash(template_id, params, user_role, projection_snapshot_id)
  template_id INTEGER,
  user_role VARCHAR(100),                         -- permission scope
  result_payload JSONB NOT NULL,
  result_hash VARCHAR(64) NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  invalidated_at TIMESTAMP,
  UNIQUE (cache_key)
);
```

Cache rules:
- Key includes `projection_snapshot_id` — cache automatically invalidated on rebuild.
- Key includes `user_role` — no permission leak across roles.
- TTL default 5 minutes; configurable per template.
- Invalidation on relevant projection sync events.

### 1.2 Projection snapshots

Already declared in `agent-studio-existing-data-migration-projection-plan.md` §4.2 (`ags_graph_projection_snapshots`). Snapshots are taken before destructive operations (rebuild, schema migration) and kept for 30 days minimum.

### 1.3 Cache permission test

Property-based test (Phase 21):
```
For any (template, params) cached for user_role A:
  user_role B (lower permission) calling the same query
  MUST NOT receive cached result for role A.
```

## 2. Acceptance

- [x] Cache table defined.
- [x] Cache key composition locked.
- [x] Permission-leak property test mandated.
- [ ] Drizzle reconciler creates tables.
- [ ] Cache invalidation hook ships in Phase 7.5.
