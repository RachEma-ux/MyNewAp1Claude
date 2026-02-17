ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "origin" varchar(50) NOT NULL DEFAULT 'admin';--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "reviewState" varchar(50) NOT NULL DEFAULT 'approved';--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "approvedBy" integer;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "approvedAt" timestamp;--> statement-breakpoint
UPDATE "catalog_entries" SET "status" = 'active' WHERE "status" = 'published';--> statement-breakpoint
UPDATE "catalog_entries" SET "status" = 'draft' WHERE "status" IN ('validating', 'validated', 'publishing');
