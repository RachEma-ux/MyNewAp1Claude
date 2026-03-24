-- Migration: Add wizardMeta JSON column to workspaces table
-- Supports governance-first wizard intake data (anchor, scope, activities, needs, config)

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS "wizardMeta" jsonb;
