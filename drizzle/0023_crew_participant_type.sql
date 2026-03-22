-- Add participantType and note columns to workspace_crew table
ALTER TABLE "workspace_crew" ADD COLUMN IF NOT EXISTS "participantType" varchar(50) DEFAULT 'agent' NOT NULL;
ALTER TABLE "workspace_crew" ADD COLUMN IF NOT EXISTS "note" text;
