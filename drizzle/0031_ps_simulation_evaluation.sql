-- PS Simulation + Evaluation Tables
-- Migration 0031

-- 18. Eval Cases — Benchmark test cases for matrix evaluation
CREATE TABLE IF NOT EXISTS "ps_eval_cases" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "answers_json" json NOT NULL,
  "expected_scope_code" varchar(120) NOT NULL,
  "tags" json DEFAULT '[]',
  "is_active" integer NOT NULL DEFAULT 1,
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_eval_cases_ws_idx" ON "ps_eval_cases" ("workspace_id");
ALTER TABLE "ps_eval_cases" ADD CONSTRAINT "ps_eval_cases_name_uniq" UNIQUE ("workspace_id", "name");

-- 19. Eval Runs — Evaluation suite execution records
CREATE TABLE IF NOT EXISTS "ps_eval_runs" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "version_id" integer NOT NULL,
  "total_cases" integer NOT NULL DEFAULT 0,
  "passed_cases" integer NOT NULL DEFAULT 0,
  "failed_cases" integer NOT NULL DEFAULT 0,
  "pass_rate" numeric(5, 2),
  "results_json" json,
  "status" varchar(30) NOT NULL DEFAULT 'completed',
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_eval_runs_ws_idx" ON "ps_eval_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_eval_runs_version_idx" ON "ps_eval_runs" ("version_id");

-- 20. Matrix Simulations — Simulation run records
CREATE TABLE IF NOT EXISTS "ps_matrix_simulations" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "version_id" integer NOT NULL,
  "compare_version_id" integer,
  "answers_json" json NOT NULL,
  "result_json" json,
  "compare_result_json" json,
  "diff_summary" text,
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_matrix_simulations_ws_idx" ON "ps_matrix_simulations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_matrix_simulations_version_idx" ON "ps_matrix_simulations" ("version_id");
