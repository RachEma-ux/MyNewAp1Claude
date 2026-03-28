CREATE TABLE "ps_ideation_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload_json" json,
	"actor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_feasibility_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"idea_id" integer NOT NULL,
	"test_performed" text NOT NULL,
	"finding_1" text,
	"finding_2" text,
	"feasibility_rating" varchar(20) NOT NULL,
	"confidence" varchar(20),
	"evidence_ref" text,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"source_type" varchar(50) DEFAULT 'brainstorm',
	"theme_id" integer,
	"rank_order" integer DEFAULT 0,
	"is_shortlisted" integer DEFAULT 0 NOT NULL,
	"is_selected" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"idea_id" integer NOT NULL,
	"adoption_high_text" text,
	"adoption_low_text" text,
	"cost_increase_text" text,
	"competitor_reaction_text" text,
	"technology_limit_text" text,
	"insights_text" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_screening_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"idea_id" integer NOT NULL,
	"criterion_key" varchar(100) NOT NULL,
	"score" integer NOT NULL,
	"note" text,
	"scored_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_ideation_screening_uniq" UNIQUE("ideation_id","idea_id","criterion_key")
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"step_key" varchar(50) NOT NULL,
	"step_order" integer NOT NULL,
	"step_status" varchar(30) DEFAULT 'not_started' NOT NULL,
	"payload_json" json,
	"last_saved_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "ps_ideation_steps_uniq" UNIQUE("ideation_id","step_key")
);
--> statement-breakpoint
CREATE TABLE "ps_ideation_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"pattern_notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_ideations" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"source_type" varchar(50) DEFAULT 'manual' NOT NULL,
	"workflow_version" varchar(20) DEFAULT '1.0' NOT NULL,
	"lifecycle_status" varchar(50) DEFAULT 'draft' NOT NULL,
	"current_step_key" varchar(50) DEFAULT 'context' NOT NULL,
	"selected_idea_id" integer,
	"problem_statement_snapshot" text,
	"opportunity_statement_snapshot" text,
	"guiding_question_snapshot" text,
	"selected_concept_summary" text,
	"rationale_summary" text,
	"feasibility_score" varchar(20),
	"risk_level" varchar(20),
	"summary_generated_text" text,
	"summary_override_text" text,
	"readiness_snapshot_json" json,
	"conversion_project_id" integer,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ready_at" timestamp,
	"converted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "graphrag_artifact_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"index_run_id" integer NOT NULL,
	"module_slug" varchar(100) NOT NULL,
	"dataset_key" varchar(100) NOT NULL,
	"artifact_type" varchar(50) NOT NULL,
	"artifact_path" text NOT NULL,
	"record_count" integer DEFAULT 0,
	"size_bytes" integer DEFAULT 0,
	"version" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphrag_index_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"sync_run_id" integer,
	"module_slug" varchar(100) NOT NULL,
	"dataset_key" varchar(100) NOT NULL,
	"run_key" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"workspace_path" text,
	"artifact_path" text,
	"entity_count" integer DEFAULT 0,
	"relationship_count" integer DEFAULT 0,
	"community_count" integer DEFAULT 0,
	"token_usage" integer DEFAULT 0,
	"estimated_cost" varchar(50),
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphrag_query_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"index_run_id" integer,
	"module_slug" varchar(100) NOT NULL,
	"dataset_key" varchar(100) NOT NULL,
	"method" varchar(20) NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"context" json,
	"token_usage" integer DEFAULT 0,
	"latency_ms" integer,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphrag_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_slug" varchar(100) NOT NULL,
	"dataset_key" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"adapter_type" varchar(100) NOT NULL,
	"config" json,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_cursor" text,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graphrag_sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"module_slug" varchar(100) NOT NULL,
	"dataset_key" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"document_count" integer DEFAULT 0,
	"snapshot_path" text,
	"sync_cursor" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_projects" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "graphrag_artifact_registry" ADD CONSTRAINT "graphrag_artifact_registry_index_run_id_graphrag_index_runs_id_fk" FOREIGN KEY ("index_run_id") REFERENCES "public"."graphrag_index_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphrag_index_runs" ADD CONSTRAINT "graphrag_index_runs_source_id_graphrag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."graphrag_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphrag_index_runs" ADD CONSTRAINT "graphrag_index_runs_sync_run_id_graphrag_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."graphrag_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphrag_query_runs" ADD CONSTRAINT "graphrag_query_runs_source_id_graphrag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."graphrag_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphrag_query_runs" ADD CONSTRAINT "graphrag_query_runs_index_run_id_graphrag_index_runs_id_fk" FOREIGN KEY ("index_run_id") REFERENCES "public"."graphrag_index_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graphrag_sync_runs" ADD CONSTRAINT "graphrag_sync_runs_source_id_graphrag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."graphrag_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_ideation_activity_ideation_idx" ON "ps_ideation_activity" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_activity_event_idx" ON "ps_ideation_activity" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ps_ideation_feasibility_ideation_idx" ON "ps_ideation_feasibility_checks" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_feasibility_idea_idx" ON "ps_ideation_feasibility_checks" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_ideas_ideation_idx" ON "ps_ideation_ideas" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_ideas_theme_idx" ON "ps_ideation_ideas" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_scenarios_ideation_idx" ON "ps_ideation_scenarios" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_scenarios_idea_idx" ON "ps_ideation_scenarios" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_screening_ideation_idx" ON "ps_ideation_screening_scores" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_steps_ideation_idx" ON "ps_ideation_steps" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideation_themes_ideation_idx" ON "ps_ideation_themes" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX "ps_ideations_ws_status_idx" ON "ps_ideations" USING btree ("workspace_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "ps_ideations_ws_created_idx" ON "ps_ideations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ps_ideations_conversion_idx" ON "ps_ideations" USING btree ("conversion_project_id");--> statement-breakpoint
CREATE INDEX "idx_graphrag_artifacts_run" ON "graphrag_artifact_registry" USING btree ("index_run_id");--> statement-breakpoint
CREATE INDEX "idx_graphrag_artifacts_module" ON "graphrag_artifact_registry" USING btree ("module_slug");--> statement-breakpoint
CREATE INDEX "idx_graphrag_index_runs_source" ON "graphrag_index_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_graphrag_index_runs_module" ON "graphrag_index_runs" USING btree ("module_slug");--> statement-breakpoint
CREATE INDEX "idx_graphrag_index_runs_key" ON "graphrag_index_runs" USING btree ("run_key");--> statement-breakpoint
CREATE INDEX "idx_graphrag_query_runs_source" ON "graphrag_query_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_graphrag_query_runs_module" ON "graphrag_query_runs" USING btree ("module_slug");--> statement-breakpoint
CREATE INDEX "idx_graphrag_sources_module" ON "graphrag_sources" USING btree ("module_slug");--> statement-breakpoint
CREATE INDEX "idx_graphrag_sources_unique" ON "graphrag_sources" USING btree ("module_slug","dataset_key");--> statement-breakpoint
CREATE INDEX "idx_graphrag_sync_runs_source" ON "graphrag_sync_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_graphrag_sync_runs_module" ON "graphrag_sync_runs" USING btree ("module_slug");