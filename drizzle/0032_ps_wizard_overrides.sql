-- PS Wizard Overrides — User overrides of matrix recommendations
-- Migration 0032

CREATE TABLE IF NOT EXISTS "ps_wizard_overrides" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "wizard_run_id" integer,
  "recommended_scope_code" varchar(120) NOT NULL,
  "overridden_scope_code" varchar(120) NOT NULL,
  "reason" text NOT NULL,
  "recommended_confidence" numeric(5, 2),
  "matrix_version" varchar(50),
  "answers_json" json,
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_wizard_overrides_ws_idx" ON "ps_wizard_overrides" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_wizard_overrides_run_idx" ON "ps_wizard_overrides" ("wizard_run_id");
CREATE INDEX IF NOT EXISTS "ps_wizard_overrides_recommended_idx" ON "ps_wizard_overrides" ("recommended_scope_code");
CREATE INDEX IF NOT EXISTS "ps_wizard_overrides_overridden_idx" ON "ps_wizard_overrides" ("overridden_scope_code");
