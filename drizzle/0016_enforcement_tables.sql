-- Migration 0016: Enforcement tables — subject_freezes, drift_events, evidence_bundles
-- Phase 3 — Structural Enforcement Persistence

-- Create subject_freezes table (active freeze records)
CREATE TABLE IF NOT EXISTS "subject_freezes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"subject_name" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"score_at_freeze" integer NOT NULL,
	"frozen_by" varchar(255) NOT NULL,
	"frozen_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create drift_events table (append-only drift detection history)
CREATE TABLE IF NOT EXISTS "drift_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"drift_detected" boolean NOT NULL,
	"score_delta" integer NOT NULL,
	"previous_score" integer NOT NULL,
	"current_score" integer NOT NULL,
	"new_violations" json NOT NULL,
	"resolved_violations" json NOT NULL,
	"gate_passed" boolean NOT NULL,
	"escalation_needed" boolean NOT NULL,
	"escalation_reason" text,
	"frozen_subject_ids" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create evidence_bundles table (content-addressed evidence storage)
CREATE TABLE IF NOT EXISTS "evidence_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_id" varchar(100) NOT NULL,
	"version" varchar(10) NOT NULL,
	"stage" varchar(50) NOT NULL,
	"score" integer NOT NULL,
	"gate_passed" boolean NOT NULL,
	"gate_reason" text,
	"triggered_by" varchar(255),
	"commit_ref" varchar(64),
	"integrity_hash" varchar(64) NOT NULL,
	"bundle_data" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes for subject_freezes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_subject_freezes_subject" ON "subject_freezes" USING btree ("subject_id");--> statement-breakpoint

-- Indexes for drift_events
CREATE INDEX IF NOT EXISTS "idx_drift_events_created" ON "drift_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drift_events_drift" ON "drift_events" USING btree ("drift_detected");--> statement-breakpoint

-- Indexes for evidence_bundles
CREATE UNIQUE INDEX IF NOT EXISTS "idx_evidence_bundles_bundle_id" ON "evidence_bundles" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_bundles_stage" ON "evidence_bundles" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_bundles_created" ON "evidence_bundles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_bundles_hash" ON "evidence_bundles" USING btree ("integrity_hash");
