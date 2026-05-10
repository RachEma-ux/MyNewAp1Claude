# Agent Studio — Graph Layout Registry — ADR

**Owner:** Agent Studio module + Frontend
**Phase:** Native Graph Workspace — Phase 1 / Phase 8
**Status:** Adopted

---

## 1. Decision

### 1.1 Tables

```sql
CREATE TABLE ags_graph_layout_configs (
  id SERIAL PRIMARY KEY,
  layout_key VARCHAR(100) UNIQUE NOT NULL,        -- 'force_directed', 'hierarchical', 'circular'
  display_name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,                          -- algorithm-specific params
  default_for_lens VARCHAR(100),                  -- 'global', 'local', 'runtime_trace'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ags_graph_lens_configs (
  id SERIAL PRIMARY KEY,
  lens_key VARCHAR(100) UNIQUE NOT NULL,          -- 'rag', 'rac', 'cag', 'graph_skill', 'mcp', 'governance', 'runtime', 'institutional', 'code', 'security', 'workflow', 'impact', 'graph_quality'
  display_name VARCHAR(255) NOT NULL,
  default_layout_key VARCHAR(100) REFERENCES ags_graph_layout_configs(layout_key),
  default_filters JSONB,
  default_styles JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 1.2 Default lenses (seeded)

`rag`, `rac`, `cag`, `graph_skill`, `mcp`, `governance`, `runtime`, `institutional`, `code`, `security`, `workflow`, `impact`, `graph_quality`.

### 1.3 Default layouts

`force_directed` (default), `hierarchical`, `circular`, `radial`, `concentric`.

## 2. Acceptance

- [x] Tables defined.
- [x] Default lenses + layouts enumerated.
- [ ] Drizzle reconciler creates tables.
- [ ] Phase 8 graph view consumes registry.
