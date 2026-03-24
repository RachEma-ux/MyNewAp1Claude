-- Migration: Promote purposeStatement from wizardMeta JSON to dedicated column
-- Enables direct querying and audit of workspace purpose statements

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS "purposeStatement" text;
