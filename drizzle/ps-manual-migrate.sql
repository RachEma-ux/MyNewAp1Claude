-- PS Module — Manual Migration (all 13 tables)
-- Run with: psql -d mynewap1claude -f drizzle/ps-manual-migrate.sql

BEGIN;

-- 1. ps_systems
CREATE TABLE IF NOT EXISTS ps_systems (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  system_type varchar(100) NOT NULL,
  lifecycle_type varchar(100),
  governance_profile varchar(100),
  status varchar(30) NOT NULL DEFAULT 'draft',
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ps_systems_name_uniq UNIQUE(workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ps_systems_ws_idx ON ps_systems(workspace_id);
CREATE INDEX IF NOT EXISTS ps_systems_status_idx ON ps_systems(status);
CREATE INDEX IF NOT EXISTS ps_systems_type_idx ON ps_systems(system_type);

-- 2. ps_wizard_runs
CREATE TABLE IF NOT EXISTS ps_wizard_runs (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  scenario_text text NOT NULL,
  input_payload json,
  result_payload json,
  confidence numeric(5,2),
  selected_system_type varchar(100),
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ps_wizard_runs_ws_idx ON ps_wizard_runs(workspace_id);
CREATE INDEX IF NOT EXISTS ps_wizard_runs_type_idx ON ps_wizard_runs(selected_system_type);

-- 3. ps_catalog_system_types
CREATE TABLE IF NOT EXISTS ps_catalog_system_types (
  id serial PRIMARY KEY,
  system_type varchar(100) NOT NULL,
  label varchar(200) NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ps_catalog_type_uniq UNIQUE(system_type)
);

-- 4. ps_audit_log
CREATE TABLE IF NOT EXISTS ps_audit_log (
  id serial PRIMARY KEY,
  workspace_id integer,
  actor_id integer,
  action varchar(100) NOT NULL,
  entity_type varchar(50),
  entity_id integer,
  previous_value json,
  new_value json,
  category varchar(50) DEFAULT 'mutation',
  metadata json,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ps_audit_ws_idx ON ps_audit_log(workspace_id);
CREATE INDEX IF NOT EXISTS ps_audit_action_idx ON ps_audit_log(action);

-- 5. ps_resource_requests
CREATE TABLE IF NOT EXISTS ps_resource_requests (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  ps_system_id integer NOT NULL,
  role varchar(200) NOT NULL,
  capability_tags json DEFAULT '[]'::json,
  quantity integer NOT NULL DEFAULT 1,
  seniority_level varchar(50) DEFAULT 'mid',
  start_date timestamp,
  end_date timestamp,
  allocation_percentage integer DEFAULT 100,
  status varchar(30) NOT NULL DEFAULT 'draft',
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ps_resource_requests_ws_idx ON ps_resource_requests(workspace_id);
CREATE INDEX IF NOT EXISTS ps_resource_requests_system_idx ON ps_resource_requests(ps_system_id);
CREATE INDEX IF NOT EXISTS ps_resource_requests_status_idx ON ps_resource_requests(status);

-- 6. ps_resource_assignments
CREATE TABLE IF NOT EXISTS ps_resource_assignments (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  resource_request_id integer NOT NULL,
  ps_system_id integer NOT NULL,
  assignment_role varchar(200) NOT NULL,
  assignee_ref_type varchar(50) NOT NULL,
  assignee_ref_id varchar(200),
  assignee_display_name varchar(300),
  allocation_percentage integer DEFAULT 100,
  start_date timestamp,
  end_date timestamp,
  status varchar(30) NOT NULL DEFAULT 'proposed',
  source varchar(50) NOT NULL DEFAULT 'manual',
  notes text,
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_by integer,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ps_resource_assignments_ws_idx ON ps_resource_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS ps_resource_assignments_request_idx ON ps_resource_assignments(resource_request_id);
CREATE INDEX IF NOT EXISTS ps_resource_assignments_system_idx ON ps_resource_assignments(ps_system_id);
CREATE INDEX IF NOT EXISTS ps_resource_assignments_status_idx ON ps_resource_assignments(status);

-- 7. ps_matrix_versions
CREATE TABLE IF NOT EXISTS ps_matrix_versions (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  version varchar(50) NOT NULL,
  label varchar(255) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'draft',
  source_type varchar(20),
  source_name varchar(255),
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  activated_at timestamp,
  CONSTRAINT ps_matrix_versions_uniq UNIQUE(workspace_id, version)
);
CREATE INDEX IF NOT EXISTS ps_matrix_versions_ws_idx ON ps_matrix_versions(workspace_id);
CREATE INDEX IF NOT EXISTS ps_matrix_versions_status_idx ON ps_matrix_versions(status);

-- 8. ps_scope_registry
CREATE TABLE IF NOT EXISTS ps_scope_registry (
  id serial PRIMARY KEY,
  version_id integer NOT NULL,
  code varchar(120) NOT NULL,
  label varchar(255) NOT NULL,
  description text,
  family varchar(120),
  is_active integer NOT NULL DEFAULT 1,
  source_row_number integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ps_scope_registry_code_uniq UNIQUE(version_id, code)
);
CREATE INDEX IF NOT EXISTS ps_scope_registry_version_idx ON ps_scope_registry(version_id);

-- 9. ps_matrix_questions
CREATE TABLE IF NOT EXISTS ps_matrix_questions (
  id serial PRIMARY KEY,
  version_id integer NOT NULL,
  code varchar(100) NOT NULL,
  label varchar(500) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active integer NOT NULL DEFAULT 1,
  CONSTRAINT ps_matrix_questions_code_uniq UNIQUE(version_id, code)
);
CREATE INDEX IF NOT EXISTS ps_matrix_questions_version_idx ON ps_matrix_questions(version_id);
CREATE INDEX IF NOT EXISTS ps_matrix_questions_sort_idx ON ps_matrix_questions(version_id, sort_order);

-- 10. ps_matrix_cells
CREATE TABLE IF NOT EXISTS ps_matrix_cells (
  id serial PRIMARY KEY,
  version_id integer NOT NULL,
  question_id integer NOT NULL,
  scope_id integer NOT NULL,
  weight integer NOT NULL DEFAULT 0,
  CONSTRAINT ps_matrix_cells_uniq UNIQUE(version_id, question_id, scope_id)
);
CREATE INDEX IF NOT EXISTS ps_matrix_cells_version_idx ON ps_matrix_cells(version_id);
CREATE INDEX IF NOT EXISTS ps_matrix_cells_question_idx ON ps_matrix_cells(question_id);
CREATE INDEX IF NOT EXISTS ps_matrix_cells_scope_idx ON ps_matrix_cells(scope_id);

-- 11. ps_matrix_imports
CREATE TABLE IF NOT EXISTS ps_matrix_imports (
  id serial PRIMARY KEY,
  workspace_id integer NOT NULL,
  version_id integer,
  import_type varchar(20),
  source_type varchar(30) NOT NULL,
  source_name varchar(255),
  sheet_name varchar(255),
  raw_payload_json json,
  import_status varchar(30) NOT NULL DEFAULT 'pending',
  total_rows integer DEFAULT 0,
  imported_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  scopes_count integer DEFAULT 0,
  questions_count integer DEFAULT 0,
  cells_count integer DEFAULT 0,
  warnings_json json,
  errors_json json,
  created_by integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  committed_at timestamp
);
CREATE INDEX IF NOT EXISTS ps_matrix_imports_ws_idx ON ps_matrix_imports(workspace_id);
CREATE INDEX IF NOT EXISTS ps_matrix_imports_version_idx ON ps_matrix_imports(version_id);
CREATE INDEX IF NOT EXISTS ps_matrix_imports_status_idx ON ps_matrix_imports(import_status);

-- 12. ps_scope_matrix_profile
CREATE TABLE IF NOT EXISTS ps_scope_matrix_profile (
  id serial PRIMARY KEY,
  scope_id integer NOT NULL,
  pmi_value varchar(255),
  prince2_value varchar(255),
  iso_value varchar(255),
  ipma_value varchar(255),
  cmmi_value varchar(255),
  aspice_value varchar(255),
  lean_method_value varchar(255),
  agile_framework_value varchar(255),
  traditional_method_value varchar(255),
  agile_frameworks_value varchar(255),
  hybrid_method_value varchar(255),
  case_scenario text,
  selected_standards varchar(255),
  selected_frameworks varchar(255),
  raw_row_json json,
  type_map_json json NOT NULL DEFAULT '{}'::json,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ps_scope_matrix_profile_scope_uniq UNIQUE(scope_id)
);
CREATE INDEX IF NOT EXISTS ps_scope_matrix_profile_scope_idx ON ps_scope_matrix_profile(scope_id);

-- 13. ps_scope_matrix_headers
CREATE TABLE IF NOT EXISTS ps_scope_matrix_headers (
  id serial PRIMARY KEY,
  version_id integer NOT NULL,
  header_key varchar(120) NOT NULL,
  header_label varchar(255) NOT NULL,
  header_type varchar(50),
  is_active integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ps_scope_matrix_headers_key_uniq UNIQUE(version_id, header_key)
);
CREATE INDEX IF NOT EXISTS ps_scope_matrix_headers_version_idx ON ps_scope_matrix_headers(version_id);
CREATE INDEX IF NOT EXISTS ps_scope_matrix_headers_sort_idx ON ps_scope_matrix_headers(version_id, sort_order);

COMMIT;
