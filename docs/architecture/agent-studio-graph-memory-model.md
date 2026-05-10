# Agent Studio — Graph Memory Model — ADR

**Owner:** Agent Studio module + Knowledge
**Phase:** Native Graph Workspace MVP 0 — Phase 1.6
**Status:** Adopted

---

## 1. Decision

### 1.1 Memory taxonomy

| Memory class | Lifetime | Source | Examples |
|---|---|---|---|
| Short-term session memory | Run-scoped | Graph Agent run | Run inputs, intermediate retrievals |
| Long-term institutional memory | Permanent (governed) | Promoted notes, KGRA-derived entities | People, projects, systems, decisions |
| Reasoning memory | Run-scoped | Decision trace steps | Why answer X was chosen |
| Runtime memory | Trace-scoped | Runtime traces (V3 schema) | Tool calls, retrievals, errors |
| Evaluation memory | Permanent | Golden questions, eval cases | Pass/fail, regression baselines |

### 1.2 Tables

```sql
CREATE TABLE ags_memory_observations (
  id SERIAL PRIMARY KEY,
  memory_class VARCHAR(50) NOT NULL,             -- one of taxonomy classes
  scope_key VARCHAR(255) NOT NULL,               -- 'run:42', 'institutional', 'trace:99'
  observation_kind VARCHAR(100) NOT NULL,
  observation_value JSONB NOT NULL,
  retention_class VARCHAR(100),                  -- FK to ags_memory_retention_classes.class_key
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE TABLE ags_memory_retention_classes (
  id SERIAL PRIMARY KEY,
  class_key VARCHAR(100) UNIQUE NOT NULL,
  retention_days INTEGER NOT NULL,                -- NULL = forever
  redaction_after_days INTEGER,                  -- redact sensitive fields after N days
  applies_to_memory_class VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_memory_links (
  id SERIAL PRIMARY KEY,
  source_observation_id INTEGER NOT NULL REFERENCES ags_memory_observations(id),
  target_observation_id INTEGER NOT NULL REFERENCES ags_memory_observations(id),
  link_type VARCHAR(100) NOT NULL,               -- 'derived_from', 'contradicts', 'supports'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 Default retention classes (seeded Phase 1.6)

| class_key | retention_days | applies_to |
|---|---|---|
| `session_short` | 7 | session |
| `runtime_default` | 30 | runtime |
| `runtime_governed` | 365 | runtime |
| `institutional` | NULL (forever) | institutional |
| `evaluation` | NULL (forever) | evaluation |
| `reasoning_default` | 30 | reasoning |

## 2. Acceptance

- [x] Taxonomy defined.
- [x] Tables defined.
- [x] Retention class seed defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Retention sweeper job ships in Phase 14.
