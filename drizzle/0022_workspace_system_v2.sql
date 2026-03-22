-- Migration 0022: Workspace System v2 — Canonical lifecycle, crew, shell config, resource profile
--
-- Lifecycle migration: created→draft, configured→ready_for_review, paused→archived
-- New statuses: ready_for_review, under_review, approved, published, rejected
-- New tables: workspace_crew (AI participation)
-- New columns: resourceProfile, shellConfig, actorType on activity log

-- Step 1: Migrate existing statuses to new canonical lifecycle
UPDATE "workspaces" SET "status" = 'draft' WHERE "status" = 'created';--> statement-breakpoint
UPDATE "workspaces" SET "status" = 'ready_for_review' WHERE "status" = 'configured';--> statement-breakpoint
UPDATE "workspaces" SET "status" = 'archived' WHERE "status" = 'paused';--> statement-breakpoint

-- Step 2: Add new columns to workspaces
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "resourceProfile" json;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "shellConfig" json;--> statement-breakpoint

-- Step 3: Add actorType to activity log
ALTER TABLE "workspace_activity_log" ADD COLUMN IF NOT EXISTS "actorType" varchar(20) DEFAULT 'user';--> statement-breakpoint

-- Step 4: Create workspace_crew table for AI participation
CREATE TABLE IF NOT EXISTS "workspace_crew" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "agentId" integer NOT NULL,
  "agentName" varchar(255) NOT NULL,
  "role" varchar(50) DEFAULT 'executor' NOT NULL,
  "capabilities" json,
  "constraints" json,
  "enabled" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Step 5: Change default status for new workspaces from 'active' to 'draft'
ALTER TABLE "workspaces" ALTER COLUMN "status" SET DEFAULT 'draft';
