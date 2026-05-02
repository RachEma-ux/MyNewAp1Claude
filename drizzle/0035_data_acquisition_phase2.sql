-- Data Acquisition Phase-2 — specialization tables (owned by Data Analysis).
-- Adds the per-mode payload tables alongside the existing
-- data_acquisition_documents specialization. Logical owner remains
-- `dataAnalysis`; physical tables stay in the shared platform DB until
-- the dataanalysisdb move flips behind getDataAnalysisDb().

CREATE TABLE IF NOT EXISTS "data_acquisition_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "run_count" integer DEFAULT 0 NOT NULL,
  "item_count" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_batches_ws" ON "data_acquisition_batches" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_da_batches_status" ON "data_acquisition_batches" ("status");

CREATE TABLE IF NOT EXISTS "data_acquisition_sensor_readings" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "device_id" varchar(128),
  "metric_key" varchar(64) NOT NULL,
  "value" text NOT NULL,
  "unit" varchar(32),
  "quality_flag" varchar(32),
  "recorded_at" timestamp,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_sensor_item" ON "data_acquisition_sensor_readings" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_sensor_device" ON "data_acquisition_sensor_readings" ("device_id");
CREATE INDEX IF NOT EXISTS "idx_da_sensor_metric" ON "data_acquisition_sensor_readings" ("metric_key");
CREATE INDEX IF NOT EXISTS "idx_da_sensor_recorded" ON "data_acquisition_sensor_readings" ("recorded_at");

CREATE TABLE IF NOT EXISTS "data_acquisition_stream_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "stream_key" varchar(128) NOT NULL,
  "partition" integer,
  "offset_key" text,
  "event_type" varchar(64),
  "event_time" timestamp,
  "payload_json" json,
  "headers_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_stream_item" ON "data_acquisition_stream_events" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_stream_stream" ON "data_acquisition_stream_events" ("stream_key");
CREATE INDEX IF NOT EXISTS "idx_da_stream_event_type" ON "data_acquisition_stream_events" ("event_type");

CREATE TABLE IF NOT EXISTS "data_acquisition_api_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "endpoint" text NOT NULL,
  "method" varchar(10) DEFAULT 'GET' NOT NULL,
  "status_code" integer,
  "request_json" json,
  "response_json" json,
  "duration_ms" integer,
  "fetched_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_api_item" ON "data_acquisition_api_records" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_api_endpoint" ON "data_acquisition_api_records" ("endpoint");
CREATE INDEX IF NOT EXISTS "idx_da_api_status" ON "data_acquisition_api_records" ("status_code");

CREATE TABLE IF NOT EXISTS "data_acquisition_db_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "schema_name" varchar(128),
  "table_name" varchar(128) NOT NULL,
  "primary_key" text,
  "operation" varchar(16),
  "row_json" json,
  "cdc_lsn" text,
  "captured_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_db_item" ON "data_acquisition_db_records" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_db_table" ON "data_acquisition_db_records" ("table_name");
CREATE INDEX IF NOT EXISTS "idx_da_db_operation" ON "data_acquisition_db_records" ("operation");

CREATE TABLE IF NOT EXISTS "data_acquisition_media_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "media_type" varchar(32) NOT NULL,
  "duration_sec" integer,
  "width" integer,
  "height" integer,
  "codec" varchar(64),
  "raw_location" text,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_media_item" ON "data_acquisition_media_assets" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_media_type" ON "data_acquisition_media_assets" ("media_type");

CREATE TABLE IF NOT EXISTS "data_acquisition_web_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "url" text NOT NULL,
  "http_status" integer,
  "title_text" text,
  "body_text" text,
  "headers_json" json,
  "fetched_at" timestamp,
  "content_length" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_web_item" ON "data_acquisition_web_pages" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_web_status" ON "data_acquisition_web_pages" ("http_status");

CREATE TABLE IF NOT EXISTS "data_acquisition_git_objects" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "repo" text NOT NULL,
  "object_type" varchar(32) NOT NULL,
  "object_sha" varchar(64),
  "path_text" text,
  "ref_name" varchar(128),
  "language" varchar(64),
  "content_text" text,
  "metadata_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_git_item" ON "data_acquisition_git_objects" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_git_type" ON "data_acquisition_git_objects" ("object_type");
CREATE INDEX IF NOT EXISTS "idx_da_git_repo" ON "data_acquisition_git_objects" ("repo");

CREATE TABLE IF NOT EXISTS "data_acquisition_form_submissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "form_key" varchar(128),
  "submitted_by" integer,
  "fields_json" json,
  "submitted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_form_item" ON "data_acquisition_form_submissions" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_form_key" ON "data_acquisition_form_submissions" ("form_key");

CREATE TABLE IF NOT EXISTS "data_acquisition_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_id" integer NOT NULL REFERENCES "data_acquisition_items"("id"),
  "provider" varchar(64),
  "event_type" varchar(64),
  "delivery_id" varchar(128),
  "signature_valid" boolean,
  "payload_json" json,
  "received_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_da_webhook_item" ON "data_acquisition_webhook_events" ("item_id");
CREATE INDEX IF NOT EXISTS "idx_da_webhook_provider" ON "data_acquisition_webhook_events" ("provider");
CREATE INDEX IF NOT EXISTS "idx_da_webhook_event_type" ON "data_acquisition_webhook_events" ("event_type");
