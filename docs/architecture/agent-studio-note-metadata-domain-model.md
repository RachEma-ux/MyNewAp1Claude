# Agent Studio — Note Metadata Domain Model — ADR

**Owner:** Agent Studio module
**Phase:** Native Graph Workspace — Phase 1 / Phase 4
**Status:** Adopted

---

## 1. Decision

### 1.1 Domains

Frontmatter / properties separated by domain prefix to prevent leak between concerns:

| Domain | Examples | Owner |
|---|---|---|
| `content.*` | `content.title`, `content.summary`, `content.tags`, `content.aliases` | User-authored |
| `binding.*` | `binding.cag_block_id`, `binding.skill_pack_id` | Set by promotion service |
| `governance.*` | `governance.status`, `governance.approvers`, `governance.review_due` | Set by governance scaffolding |
| `runtime.*` | `runtime.eligible`, `runtime.version`, `runtime.deployed_at` | Set by runtime |
| `graph.*` | `graph.entity_refs`, `graph.edge_refs`, `graph.node_id` | Set by entity resolver |
| `system.*` | `system.created_at`, `system.updated_at`, `system.author_id` | Set by vault service |
| `projection.*` | `projection.last_projected_at`, `projection.snapshot_id` | Set by projection sync |

### 1.2 Tables

```sql
CREATE TABLE ags_vault_note_properties (
  id SERIAL PRIMARY KEY,
  note_id INTEGER NOT NULL,
  property_key VARCHAR(255) NOT NULL,             -- includes domain prefix
  property_type VARCHAR(50) NOT NULL,
  property_value JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (note_id, property_key)
);

CREATE TABLE ags_vault_property_definitions (
  id SERIAL PRIMARY KEY,
  property_key VARCHAR(255) UNIQUE NOT NULL,
  property_type VARCHAR(50) NOT NULL,
  domain VARCHAR(50) NOT NULL,                    -- 'content', 'binding', etc.
  user_editable BOOLEAN NOT NULL DEFAULT TRUE,
  validation_regex TEXT,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_vault_property_domains (
  id SERIAL PRIMARY KEY,
  domain_key VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  user_editable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.3 User-editable rule

`content.*` is user-editable. `binding.*`, `governance.*`, `runtime.*`, `graph.*`, `system.*`, `projection.*` are written by services; user attempts to edit them via frontmatter UI are rejected with a clear error.

## 2. Acceptance

- [x] Domains locked.
- [x] Tables defined.
- [x] User-editable rule defined.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 4 frontmatter UI enforces domain rules.
