-- Platform Audit tables
CREATE TABLE IF NOT EXISTS "governance_audit_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" varchar(20) NOT NULL,
  "format" varchar(10) NOT NULL,
  "strict" boolean DEFAULT false NOT NULL,
  "design" varchar(20) NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "duration_ms" integer,
  "triggered_by" varchar(255),
  "error_message" text,
  "summary_json" json,
  "violations_json" json,
  "coverage_json" json,
  "json_ref" varchar(128),
  "txt_ref" varchar(128),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "governance_audit_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "principal_id" varchar(255) NOT NULL UNIQUE,
  "default_format" varchar(10) NOT NULL,
  "default_design" varchar(20) NOT NULL,
  "default_strict" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_audit_run_started" ON "governance_audit_runs" ("started_at");
CREATE INDEX IF NOT EXISTS "idx_audit_run_status" ON "governance_audit_runs" ("status");
CREATE INDEX IF NOT EXISTS "idx_audit_run_triggered" ON "governance_audit_runs" ("triggered_by");
