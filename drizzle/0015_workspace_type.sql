-- Add workspace type column for template routing
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "type" varchar(50) DEFAULT 'generic';
