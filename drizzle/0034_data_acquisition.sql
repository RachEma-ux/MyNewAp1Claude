-- Data Acquisition subdomain (owned by Data Analysis)
-- Phase-1 staged: tables live in the shared platform DB; logical owner is `dataAnalysis`.
-- Single seam for the future physical move: getDataAnalysisDb() in server/data-analysis/connection.ts

CREATE TABLE IF NOT EXISTS "data_acquisition_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "source_type" varchar(40) NOT NULL,
  "source_uri" text NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "config_json" json,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_sources_ws" ON "data_acquisition_sources" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_sources_type" ON "data_acquisition_sources" ("source_type");
CREATE INDEX IF NOT EXISTS "idx_da_sources_status" ON "data_acquisition_sources" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "source_id" integer NOT NULL REFERENCES "data_acquisition_sources"("id"),
  "run_type" varchar(40) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "item_count" integer DEFAULT 0 NOT NULL,
  "processed_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "error_message" text,
  "created_by" integer,
  "metadata_json" json
);
CREATE INDEX IF NOT EXISTS "idx_da_runs_ws" ON "data_acquisition_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_runs_source" ON "data_acquisition_runs" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_da_runs_status" ON "data_acquisition_runs" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "source_id" integer NOT NULL REFERENCES "data_acquisition_sources"("id"),
  "run_id" integer REFERENCES "data_acquisition_runs"("id"),
  "item_type" varchar(40) NOT NULL,
  "source_uri" text NOT NULL,
  "raw_location" text,
  "mime_type" varchar(100),
  "size_bytes" integer,
  "checksum" varchar(128),
  "status" varchar(32) DEFAULT 'discovered' NOT NULL,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_items_ws" ON "data_acquisition_items" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_items_source" ON "data_acquisition_items" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_da_items_run" ON "data_acquisition_items" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_da_items_type" ON "data_acquisition_items" ("item_type");
CREATE INDEX IF NOT EXISTS "idx_da_items_status" ON "data_acquisition_items" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_classifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "data_type" varchar(64) NOT NULL,
  "mode" varchar(64) NOT NULL,
  "complexity" varchar(32),
  "language" varchar(16),
  "requires_ocr" boolean,
  "has_tables" boolean,
  "recommended_processor" varchar(64),
  "confidence" integer DEFAULT 0 NOT NULL,
  "classifier_version" varchar(32) NOT NULL,
  "result_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_classifications_item" ON "data_acquisition_classifications" ("item_id");

CREATE TABLE IF NOT EXISTS "data_acquisition_routes" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "selected_pipeline" varchar(64) NOT NULL,
  "selected_processor" varchar(64) NOT NULL,
  "fallback_chain_json" json,
  "strategy" varchar(64) NOT NULL,
  "cost_estimate" varchar(32),
  "sla_class" varchar(32),
  "decision_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_routes_item" ON "data_acquisition_routes" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_routes_pipeline" ON "data_acquisition_routes" ("selected_pipeline");

CREATE TABLE IF NOT EXISTS "data_acquisition_processing_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "run_id" integer REFERENCES "data_acquisition_runs"("id"),
  "pipeline" varchar(64) NOT NULL,
  "processor_name" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "confidence" integer,
  "output_location" text,
  "error_message" text,
  "result_json" json
);
CREATE INDEX IF NOT EXISTS "idx_da_processing_item" ON "data_acquisition_processing_runs" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_processing_pipeline" ON "data_acquisition_processing_runs" ("pipeline");
CREATE INDEX IF NOT EXISTS "idx_da_processing_status" ON "data_acquisition_processing_runs" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_quality_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "canonical_record_id" integer,
  "confidence_score" integer DEFAULT 0 NOT NULL,
  "requires_review" boolean DEFAULT false NOT NULL,
  "issues_json" json,
  "validation_version" varchar(32) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_quality_item" ON "data_acquisition_quality_results" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_quality_record" ON "data_acquisition_quality_results" ("canonical_record_id");

CREATE TABLE IF NOT EXISTS "data_acquisition_canonical_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "source_id" integer NOT NULL REFERENCES "data_acquisition_sources"("id"),
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "record_type" varchar(64) NOT NULL,
  "canonical_version" varchar(32) NOT NULL,
  "canonical_json" json,
  "graph_json" json,
  "confidence_score" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_canonical_ws" ON "data_acquisition_canonical_records" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_canonical_source" ON "data_acquisition_canonical_records" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_da_canonical_item" ON "data_acquisition_canonical_records" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_canonical_type" ON "data_acquisition_canonical_records" ("record_type");

CREATE TABLE IF NOT EXISTS "data_acquisition_output_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "item_id" integer,
  "canonical_record_id" integer,
  "output_type" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "target_ref" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "idx_da_output_ws" ON "data_acquisition_output_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_output_type" ON "data_acquisition_output_runs" ("output_type");
CREATE INDEX IF NOT EXISTS "idx_da_output_status" ON "data_acquisition_output_runs" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "source_id" integer,
  "item_id" integer,
  "run_id" integer,
  "event_type" varchar(64) NOT NULL,
  "actor_id" integer,
  "message" text,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_audit_ws" ON "data_acquisition_audit_events" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_audit_source" ON "data_acquisition_audit_events" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_da_audit_type" ON "data_acquisition_audit_events" ("event_type");

CREATE TABLE IF NOT EXISTS "data_acquisition_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "doc_type" varchar(64),
  "page_count" integer,
  "parser_used" varchar(64),
  "fallback_used" boolean DEFAULT false NOT NULL,
  "canonical_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_documents_item" ON "data_acquisition_documents" ("item_id");
