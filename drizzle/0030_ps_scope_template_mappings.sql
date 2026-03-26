-- PS Scope Template Mappings — scope code → operational system template
-- Migration 0030

CREATE TABLE IF NOT EXISTS ps_scope_template_mappings (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  scope_code VARCHAR(120) NOT NULL,
  system_type VARCHAR(100) NOT NULL,
  lifecycle_type VARCHAR(100),
  governance_profile VARCHAR(100),
  demand_template_json JSON,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ps_scope_template_ws_idx ON ps_scope_template_mappings (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS ps_scope_template_scope_uniq ON ps_scope_template_mappings (workspace_id, scope_code);
