CREATE TABLE "ps_dimension_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"dimension_id" integer NOT NULL,
	"value_key" varchar(100) NOT NULL,
	"value_label" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_dimension_values_key_uniq" UNIQUE("dimension_id","value_key")
);
--> statement-breakpoint
CREATE TABLE "ps_dimensions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"dimension_key" varchar(100) NOT NULL,
	"dimension_label" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_dimensions_key_uniq" UNIQUE("version_id","dimension_key")
);
--> statement-breakpoint
CREATE TABLE "ps_eval_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"answers_json" json NOT NULL,
	"expected_scope_code" varchar(120) NOT NULL,
	"tags" json DEFAULT '[]'::json,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_eval_cases_name_uniq" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ps_eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"passed_cases" integer DEFAULT 0 NOT NULL,
	"failed_cases" integer DEFAULT 0 NOT NULL,
	"pass_rate" numeric(5, 2),
	"results_json" json,
	"status" varchar(30) DEFAULT 'completed' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"ps_project_id" integer NOT NULL,
	"pm_project_id" integer,
	"outcome" varchar(100) NOT NULL,
	"drift_flag" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_question_presentations" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"presentation_type" varchar(50) NOT NULL,
	"dimension_id" integer,
	"config_json" json,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_matrix_qp_question_uniq" UNIQUE("question_id")
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_simulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"compare_version_id" integer,
	"answers_json" json NOT NULL,
	"result_json" json,
	"compare_result_json" json,
	"diff_summary" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"scenario" text NOT NULL,
	"context_json" json DEFAULT '{}'::json,
	"selected_scope_code" varchar(120) NOT NULL,
	"top_scopes_json" json DEFAULT '[]'::json,
	"confidence" varchar(30),
	"explainability_json" json,
	"matrix_version_id" integer,
	"template_bundle_json" json,
	"wizard_run_id" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"validation_note" text,
	"validated_by" integer,
	"validated_at" timestamp,
	"pm_project_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_projects_name_uniq" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ps_scope_template_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_code" varchar(120) NOT NULL,
	"system_type" varchar(100) NOT NULL,
	"lifecycle_type" varchar(100),
	"governance_profile" varchar(100),
	"methods_json" json,
	"frameworks_json" json,
	"workflow_json" json,
	"demand_template_json" json,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_scope_template_scope_uniq" UNIQUE("scope_code")
);
--> statement-breakpoint
CREATE TABLE "ps_wizard_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
ALTER TABLE "ps_matrix_versions" DROP CONSTRAINT "ps_matrix_versions_uniq";--> statement-breakpoint
ALTER TABLE "ps_systems" DROP CONSTRAINT "ps_systems_name_uniq";--> statement-breakpoint
DROP INDEX "ps_audit_ws_idx";--> statement-breakpoint
DROP INDEX "ps_matrix_imports_ws_idx";--> statement-breakpoint
DROP INDEX "ps_matrix_versions_ws_idx";--> statement-breakpoint
DROP INDEX "ps_resource_assignments_ws_idx";--> statement-breakpoint
DROP INDEX "ps_resource_requests_ws_idx";--> statement-breakpoint
DROP INDEX "ps_systems_ws_idx";--> statement-breakpoint
DROP INDEX "ps_wizard_runs_ws_idx";--> statement-breakpoint
CREATE INDEX "ps_dimension_values_dim_idx" ON "ps_dimension_values" USING btree ("dimension_id");--> statement-breakpoint
CREATE INDEX "ps_dimension_values_sort_idx" ON "ps_dimension_values" USING btree ("dimension_id","sort_order");--> statement-breakpoint
CREATE INDEX "ps_dimensions_version_idx" ON "ps_dimensions" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_dimensions_sort_idx" ON "ps_dimensions" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE INDEX "ps_eval_runs_version_idx" ON "ps_eval_runs" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_feedback_ps_project_idx" ON "ps_feedback" USING btree ("ps_project_id");--> statement-breakpoint
CREATE INDEX "ps_feedback_pm_project_idx" ON "ps_feedback" USING btree ("pm_project_id");--> statement-breakpoint
CREATE INDEX "ps_feedback_outcome_idx" ON "ps_feedback" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "ps_matrix_qp_question_idx" ON "ps_matrix_question_presentations" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_simulations_version_idx" ON "ps_matrix_simulations" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_projects_status_idx" ON "ps_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_projects_scope_idx" ON "ps_projects" USING btree ("selected_scope_code");--> statement-breakpoint
CREATE INDEX "ps_wizard_overrides_run_idx" ON "ps_wizard_overrides" USING btree ("wizard_run_id");--> statement-breakpoint
CREATE INDEX "ps_wizard_overrides_recommended_idx" ON "ps_wizard_overrides" USING btree ("recommended_scope_code");--> statement-breakpoint
CREATE INDEX "ps_wizard_overrides_overridden_idx" ON "ps_wizard_overrides" USING btree ("overridden_scope_code");--> statement-breakpoint
ALTER TABLE "ps_audit_log" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_matrix_imports" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_matrix_versions" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_resource_assignments" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_resource_requests" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_systems" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_wizard_runs" DROP COLUMN "workspace_id";--> statement-breakpoint
ALTER TABLE "ps_matrix_versions" ADD CONSTRAINT "ps_matrix_versions_uniq" UNIQUE("version");--> statement-breakpoint
ALTER TABLE "ps_systems" ADD CONSTRAINT "ps_systems_name_uniq" UNIQUE("name");