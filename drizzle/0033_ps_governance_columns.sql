-- PS Governance — Add validation + PM bridge columns to ps_projects
-- Supports the admin validation queue and PS→PM handoff

ALTER TABLE "ps_projects" ADD COLUMN IF NOT EXISTS "validation_note" text;
ALTER TABLE "ps_projects" ADD COLUMN IF NOT EXISTS "validated_by" integer;
ALTER TABLE "ps_projects" ADD COLUMN IF NOT EXISTS "validated_at" timestamp;
ALTER TABLE "ps_projects" ADD COLUMN IF NOT EXISTS "pm_project_id" integer;
