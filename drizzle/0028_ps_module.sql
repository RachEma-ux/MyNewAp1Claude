-- PS Module — Phase 1 tables

CREATE TABLE IF NOT EXISTS "ps_systems" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "system_type" varchar(100) NOT NULL,
  "lifecycle_type" varchar(100),
  "governance_profile" varchar(100),
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_systems_ws_idx" ON "ps_systems" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_systems_status_idx" ON "ps_systems" ("status");
CREATE INDEX IF NOT EXISTS "ps_systems_type_idx" ON "ps_systems" ("system_type");
CREATE UNIQUE INDEX IF NOT EXISTS "ps_systems_name_uniq" ON "ps_systems" ("workspace_id", "name");

CREATE TABLE IF NOT EXISTS "ps_wizard_runs" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "scenario_text" text NOT NULL,
  "input_payload" json,
  "result_payload" json,
  "confidence" numeric(5, 2),
  "selected_system_type" varchar(100),
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_wizard_runs_ws_idx" ON "ps_wizard_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_wizard_runs_type_idx" ON "ps_wizard_runs" ("selected_system_type");

CREATE TABLE IF NOT EXISTS "ps_catalog_system_types" (
  "id" serial PRIMARY KEY,
  "system_type" varchar(100) NOT NULL,
  "label" varchar(200) NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ps_catalog_type_uniq" ON "ps_catalog_system_types" ("system_type");

-- Seed default catalog entries
INSERT INTO "ps_catalog_system_types" ("system_type", "label", "description") VALUES
  ('waterfall', 'Waterfall', 'Sequential phase-gate project system'),
  ('agile_scrum', 'Agile Scrum', 'Iterative Scrum-based project system'),
  ('agile_kanban', 'Agile Kanban', 'Continuous-flow Kanban project system'),
  ('hybrid', 'Hybrid', 'Combined waterfall planning with agile execution'),
  ('lean', 'Lean', 'Lean project system focused on waste elimination'),
  ('pmbok_predictive', 'PMBOK Predictive', 'PMI PMBOK predictive lifecycle project system'),
  ('safe', 'SAFe', 'Scaled Agile Framework for enterprise')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "ps_audit_log" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer,
  "actor_id" integer,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(50),
  "entity_id" integer,
  "previous_value" json,
  "new_value" json,
  "category" varchar(50) DEFAULT 'mutation',
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_audit_ws_idx" ON "ps_audit_log" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_audit_action_idx" ON "ps_audit_log" ("action");
