-- Ensure PS Ideation tables exist (idempotent recovery if 0030 partially failed)
CREATE TABLE IF NOT EXISTS "ps_ideations" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_steps" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_ideas" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"label" varchar(255) NOT NULL,
	"pattern_notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ps_ideation_screening_scores" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_scenarios" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_feasibility_checks" (
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
CREATE TABLE IF NOT EXISTS "ps_ideation_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload_json" json,
	"actor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ps_ideation_translator_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ideation_id" integer NOT NULL,
	"raw_input" text NOT NULL,
	"decision_gate_status" varchar(50) NOT NULL,
	"result_json" json,
	"applied_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideations_ws_status_idx" ON "ps_ideations" USING btree ("workspace_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideations_ws_created_idx" ON "ps_ideations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideations_conversion_idx" ON "ps_ideations" USING btree ("conversion_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_steps_ideation_idx" ON "ps_ideation_steps" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_ideas_ideation_idx" ON "ps_ideation_ideas" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_ideas_theme_idx" ON "ps_ideation_ideas" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_themes_ideation_idx" ON "ps_ideation_themes" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_screening_ideation_idx" ON "ps_ideation_screening_scores" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_scenarios_ideation_idx" ON "ps_ideation_scenarios" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_scenarios_idea_idx" ON "ps_ideation_scenarios" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_feasibility_ideation_idx" ON "ps_ideation_feasibility_checks" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_feasibility_idea_idx" ON "ps_ideation_feasibility_checks" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_activity_ideation_idx" ON "ps_ideation_activity" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_activity_event_idx" ON "ps_ideation_activity" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_translator_runs_ideation_idx" ON "ps_ideation_translator_runs" USING btree ("ideation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_ideation_translator_runs_gate_idx" ON "ps_ideation_translator_runs" USING btree ("decision_gate_status");
