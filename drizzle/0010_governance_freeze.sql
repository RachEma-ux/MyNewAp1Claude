-- Migration 0010: Governance freeze columns + governance tables
-- Phase 1 (Production Lockdown) — freeze columns on catalog_entries
-- Phase 1 (Production Lockdown) — governance_scorecards + governance_audit_logs tables

-- Add freeze columns to catalog_entries
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "frozen" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "freeze_reason" text;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "frozen_by" varchar(255);--> statement-breakpoint

-- Create governance_scorecards table (immutable scorecard persistence)
CREATE TABLE IF NOT EXISTS "governance_scorecards" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer,
	"subject_name" varchar(255),
	"subject_type" varchar(50),
	"stage" varchar(50) NOT NULL,
	"commit_ref" varchar(64),
	"score" integer NOT NULL,
	"max_weight" integer NOT NULL,
	"achieved_weight" integer NOT NULL,
	"gate_verdict" varchar(10) NOT NULL,
	"gate_reason" text,
	"risk_critical" integer NOT NULL DEFAULT 0,
	"risk_high" integer NOT NULL DEFAULT 0,
	"risk_medium" integer NOT NULL DEFAULT 0,
	"risk_low" integer NOT NULL DEFAULT 0,
	"controls_total" integer NOT NULL,
	"controls_passed" integer NOT NULL,
	"controls_failed" integer NOT NULL,
	"controls_skipped" integer NOT NULL,
	"control_results" json,
	"loaded_packs" json,
	"missing_packs" json,
	"evidence_bundle_id" varchar(100),
	"evidence_hash" varchar(64),
	"evidence_artifact_path" varchar(500),
	"triggered_by" varchar(255),
	"actor_role" varchar(50),
	"blocked" boolean NOT NULL DEFAULT false,
	"http_status" integer DEFAULT 200,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create governance_audit_logs table (append-only audit trail)
CREATE TABLE IF NOT EXISTS "governance_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"agentId" integer,
	"workspaceId" varchar(255),
	"actorId" varchar(255),
	"decision" varchar(20),
	"reason" text,
	"details" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes for governance_scorecards
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_subject" ON "governance_scorecards" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_stage" ON "governance_scorecards" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_verdict" ON "governance_scorecards" USING btree ("gate_verdict");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_created" ON "governance_scorecards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_subject_stage" ON "governance_scorecards" USING btree ("subject_id", "stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_scorecard_evidence" ON "governance_scorecards" USING btree ("evidence_bundle_id");--> statement-breakpoint

-- Indexes for governance_audit_logs
CREATE INDEX IF NOT EXISTS "idx_gov_audit_code" ON "governance_audit_logs" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_audit_agent" ON "governance_audit_logs" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gov_audit_created" ON "governance_audit_logs" USING btree ("createdAt");
