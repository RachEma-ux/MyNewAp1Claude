ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purposeType" varchar(50) DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purposeRef" text;
