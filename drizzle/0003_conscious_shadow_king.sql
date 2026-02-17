CREATE TABLE "catalog_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" varchar(100) NOT NULL,
	"catalogEntryId" integer,
	"publishBundleId" integer,
	"actor" integer,
	"actorType" varchar(50) DEFAULT 'user',
	"payload" json NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_catalog_audit_type" ON "catalog_audit_events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "idx_catalog_audit_entry" ON "catalog_audit_events" USING btree ("catalogEntryId");--> statement-breakpoint
CREATE INDEX "idx_catalog_audit_timestamp" ON "catalog_audit_events" USING btree ("timestamp");