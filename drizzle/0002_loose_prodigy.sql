CREATE TABLE "catalog_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"displayName" varchar(255),
	"description" text,
	"entryType" varchar(50) NOT NULL,
	"scope" varchar(50) DEFAULT 'app' NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"providerId" integer,
	"config" json,
	"tags" json,
	"lastValidatedAt" timestamp,
	"validationStatus" varchar(50),
	"validationErrors" json,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_entry_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogEntryId" integer NOT NULL,
	"version" integer NOT NULL,
	"config" json NOT NULL,
	"configHash" varchar(64) NOT NULL,
	"changeNotes" text,
	"changedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogEntryId" integer NOT NULL,
	"versionLabel" varchar(50) NOT NULL,
	"snapshot" json NOT NULL,
	"snapshotHash" varchar(64) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"publishedBy" integer NOT NULL,
	"publishedAt" timestamp DEFAULT now() NOT NULL,
	"policyDecision" varchar(50),
	"policyViolations" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_catalog_entry_name" ON "catalog_entries" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_catalog_entry_type" ON "catalog_entries" USING btree ("entryType");--> statement-breakpoint
CREATE INDEX "idx_catalog_entry_status" ON "catalog_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_catalog_entry_scope" ON "catalog_entries" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_catalog_version_entry" ON "catalog_entry_versions" USING btree ("catalogEntryId");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_catalog_entry_version" ON "catalog_entry_versions" USING btree ("catalogEntryId","version");--> statement-breakpoint
CREATE INDEX "idx_publish_bundle_entry" ON "publish_bundles" USING btree ("catalogEntryId");--> statement-breakpoint
CREATE INDEX "idx_publish_bundle_status" ON "publish_bundles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_publish_version" ON "publish_bundles" USING btree ("catalogEntryId","versionLabel");