-- Taxonomy Multi-Axis Classification Tables
-- Self-referential tree for taxonomy nodes, inference rules, and entry classifications

CREATE TABLE IF NOT EXISTS "taxonomy_nodes" (
  "id" serial PRIMARY KEY NOT NULL,
  "parentId" integer,
  "entryType" varchar(50) NOT NULL,
  "level" varchar(20) NOT NULL,
  "key" varchar(100) NOT NULL,
  "label" varchar(255) NOT NULL,
  "description" text,
  "sortOrder" integer DEFAULT 0,
  "active" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parentId_taxonomy_nodes_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_taxonomy_node_unique" ON "taxonomy_nodes" USING btree ("entryType","parentId","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_taxonomy_type_level" ON "taxonomy_nodes" USING btree ("entryType","level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_taxonomy_parent" ON "taxonomy_nodes" USING btree ("parentId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "taxonomy_inference_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "sourceNodeId" integer NOT NULL,
  "suggestedNodeId" integer NOT NULL,
  "confidence" varchar(10) DEFAULT 'medium',
  "description" text,
  "active" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxonomy_inference_rules" ADD CONSTRAINT "taxonomy_inference_rules_sourceNodeId_taxonomy_nodes_id_fk" FOREIGN KEY ("sourceNodeId") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "taxonomy_inference_rules" ADD CONSTRAINT "taxonomy_inference_rules_suggestedNodeId_taxonomy_nodes_id_fk" FOREIGN KEY ("suggestedNodeId") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "catalog_entry_classifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "catalogEntryId" integer NOT NULL,
  "taxonomyNodeId" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_entry_classifications" ADD CONSTRAINT "catalog_entry_classifications_catalogEntryId_catalog_entries_id_fk" FOREIGN KEY ("catalogEntryId") REFERENCES "public"."catalog_entries"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_entry_classifications" ADD CONSTRAINT "catalog_entry_classifications_taxonomyNodeId_taxonomy_nodes_id_fk" FOREIGN KEY ("taxonomyNodeId") REFERENCES "public"."taxonomy_nodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_classification_unique" ON "catalog_entry_classifications" USING btree ("catalogEntryId","taxonomyNodeId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_classification_entry" ON "catalog_entry_classifications" USING btree ("catalogEntryId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_classification_node" ON "catalog_entry_classifications" USING btree ("taxonomyNodeId");
