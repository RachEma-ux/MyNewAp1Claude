# Agent Studio — Runtime Graph Retention Policy — ADR

**Owner:** Agent Studio module + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6 / Phase 14
**Status:** Adopted

---

## 1. Decision

### 1.1 Retention tiers for runtime trace graph

| Tier | Postgres retention | Neo4j projection retention | Trigger to evict |
|---|---|---|---|
| Hot (active investigation) | 30 days | 30 days | Auto after 30d unless flagged |
| Warm (referenced) | 90 days | 30 days | Auto after 90d unless promoted |
| Cold (audit) | 365 days | Not projected | Auto after 365d |
| Archive | Forever | Not projected | Manual operator action |

### 1.2 Eviction rules

- A runtime trace **cannot** be evicted from Postgres while:
  - Still referenced by an open governance approval.
  - Still referenced by an open audit investigation.
  - Pinned by a user (promotion to investigation note).

- A runtime trace **cannot** be projected to Neo4j when:
  - Source record's `governance_status` is `hidden` or `archived`.
  - Containing CAG / Graph Skill is deprecated.

### 1.3 Sensitive payload redaction

After 30 days, Postgres-stored trace payloads have:
- Tool call args redacted (replaced with `<redacted_v1>`).
- Model response bodies redacted (kept: token counts, latency, model id).
- Error messages preserved (operationally useful).

Redaction is irreversible. Audit metadata preserved.

### 1.4 Tables

```sql
CREATE TABLE ags_runtime_trace_retention_states (
  id SERIAL PRIMARY KEY,
  runtime_trace_id INTEGER NOT NULL,             -- FK to agsRuntimeRuns
  current_tier VARCHAR(50) NOT NULL DEFAULT 'hot',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_by_user_id INTEGER,
  pinned_reason TEXT,
  redacted BOOLEAN NOT NULL DEFAULT FALSE,
  redacted_at TIMESTAMP,
  evicted_from_neo4j BOOLEAN NOT NULL DEFAULT FALSE,
  evicted_from_neo4j_at TIMESTAMP,
  evicted_from_postgres BOOLEAN NOT NULL DEFAULT FALSE,
  evicted_from_postgres_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.5 Sweeper job

Cron-style sweeper (Phase 14):
- Daily: tier transitions (hot → warm → cold → archive).
- Daily: redaction.
- Weekly: Neo4j projection eviction.
- Monthly: Postgres deletion (cold → archive transition).

Sweeper writes to `ags_workspace_audit_events`.

## 2. Acceptance

- [x] Tiers defined.
- [x] Eviction rules defined.
- [x] Redaction defined.
- [x] Tables defined.
- [x] Sweeper job defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Sweeper job ships in Phase 14.
