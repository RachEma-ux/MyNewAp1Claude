/**
 * Data Acquisition — Tables (owned by Data Analysis)
 *
 * The Data Acquisition subdomain is the universal, governed,
 * source-agnostic and data-type-agnostic acquisition layer inside
 * Data Analysis. It owns these tables exclusively. Document
 * Intelligence is one specialized pipeline that writes into the same
 * generic tables (`*_items`, `*_classifications`, `*_routes`,
 * `*_processing_runs`, `*_canonical_records`) plus the
 * `data_acquisition_documents` specialization table.
 *
 * Phase-1 staged: physical tables live in the shared platform DB.
 * Logical ownership is `dataAnalysis`. The single seam for the future
 * physical move to `dataanalysisdb` is `getDataAnalysisDb()` in
 * `server/data-analysis/connection.ts`.
 *
 * No other module may write into these tables. KGRA Agent / Documents
 * / RAG / Digital HQ may only consume through the Data Analysis
 * gateway/event lanes. Boundary tests enforce this.
 */

import {
  boolean,
  integer,
  index,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Core acquisition tables (universal — every source type writes here)
// ============================================================================

/**
 * data_acquisition_sources — one row per registered source.
 *
 * `sourceType` distinguishes which connector / pipeline owns it
 * (document, sensor, stream, api, database, object_storage, saas,
 * web, git, manual_form, webhook, media).
 */
export const dataAcquisitionSources = pgTable(
  "data_acquisition_sources",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    sourceUri: text("source_uri").notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    configJson: json("config_json").$type<Record<string, unknown>>(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    wsIdx: index("idx_da_sources_ws").on(table.workspaceId),
    typeIdx: index("idx_da_sources_type").on(table.sourceType),
    statusIdx: index("idx_da_sources_status").on(table.status),
  }),
);

export type DataAcquisitionSource = typeof dataAcquisitionSources.$inferSelect;
export type InsertDataAcquisitionSource =
  typeof dataAcquisitionSources.$inferInsert;

/**
 * data_acquisition_runs — one row per "go fetch from this source" invocation.
 *
 * `runType` mirrors connector capabilities (`discover`, `acquire`,
 * `sync`, `cdc`, `crawl`, `webhook_capture`, etc.).
 */
export const dataAcquisitionRuns = pgTable(
  "data_acquisition_runs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => dataAcquisitionSources.id),
    runType: varchar("run_type", { length: 40 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    itemCount: integer("item_count").default(0).notNull(),
    processedCount: integer("processed_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    createdBy: integer("created_by"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
  },
  (table) => ({
    wsIdx: index("idx_da_runs_ws").on(table.workspaceId),
    sourceIdx: index("idx_da_runs_source").on(table.sourceId),
    statusIdx: index("idx_da_runs_status").on(table.status),
  }),
);

export type DataAcquisitionRun = typeof dataAcquisitionRuns.$inferSelect;
export type InsertDataAcquisitionRun =
  typeof dataAcquisitionRuns.$inferInsert;

/**
 * data_acquisition_items — one row per discovered/acquired unit.
 */
export const dataAcquisitionItems = pgTable(
  "data_acquisition_items",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => dataAcquisitionSources.id),
    runId: integer("run_id").references(() => dataAcquisitionRuns.id),
    itemType: varchar("item_type", { length: 40 }).notNull(),
    sourceUri: text("source_uri").notNull(),
    rawLocation: text("raw_location"),
    mimeType: varchar("mime_type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    checksum: varchar("checksum", { length: 128 }),
    status: varchar("status", { length: 32 }).default("discovered").notNull(),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    wsIdx: index("idx_da_items_ws").on(table.workspaceId),
    sourceIdx: index("idx_da_items_source").on(table.sourceId),
    runIdx: index("idx_da_items_run").on(table.runId),
    typeIdx: index("idx_da_items_type").on(table.itemType),
    statusIdx: index("idx_da_items_status").on(table.status),
  }),
);

export type DataAcquisitionItem = typeof dataAcquisitionItems.$inferSelect;
export type InsertDataAcquisitionItem =
  typeof dataAcquisitionItems.$inferInsert;

/**
 * data_acquisition_classifications — one row per classifier verdict for an item.
 */
export const dataAcquisitionClassifications = pgTable(
  "data_acquisition_classifications",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    dataType: varchar("data_type", { length: 64 }).notNull(),
    mode: varchar("mode", { length: 64 }).notNull(),
    complexity: varchar("complexity", { length: 32 }),
    language: varchar("language", { length: 16 }),
    requiresOcr: boolean("requires_ocr"),
    hasTables: boolean("has_tables"),
    recommendedProcessor: varchar("recommended_processor", { length: 64 }),
    confidence: integer("confidence").default(0).notNull(),
    classifierVersion: varchar("classifier_version", { length: 32 }).notNull(),
    resultJson: json("result_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_classifications_item").on(table.itemId),
  }),
);

export type DataAcquisitionClassification =
  typeof dataAcquisitionClassifications.$inferSelect;
export type InsertDataAcquisitionClassification =
  typeof dataAcquisitionClassifications.$inferInsert;

/**
 * data_acquisition_routes — one row per routing decision: which pipeline
 * + which processor + which fallback chain.
 */
export const dataAcquisitionRoutes = pgTable(
  "data_acquisition_routes",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    selectedPipeline: varchar("selected_pipeline", { length: 64 }).notNull(),
    selectedProcessor: varchar("selected_processor", { length: 64 }).notNull(),
    fallbackChainJson: json("fallback_chain_json").$type<string[]>(),
    strategy: varchar("strategy", { length: 64 }).notNull(),
    costEstimate: varchar("cost_estimate", { length: 32 }),
    slaClass: varchar("sla_class", { length: 32 }),
    decisionJson: json("decision_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_routes_item").on(table.itemId),
    pipelineIdx: index("idx_da_routes_pipeline").on(table.selectedPipeline),
  }),
);

export type DataAcquisitionRoute = typeof dataAcquisitionRoutes.$inferSelect;
export type InsertDataAcquisitionRoute =
  typeof dataAcquisitionRoutes.$inferInsert;

/**
 * data_acquisition_processing_runs — one row per pipeline execution
 * against an item (parser run, normalizer run, CDC sync, etc.).
 */
export const dataAcquisitionProcessingRuns = pgTable(
  "data_acquisition_processing_runs",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    runId: integer("run_id").references(() => dataAcquisitionRuns.id),
    pipeline: varchar("pipeline", { length: 64 }).notNull(),
    processorName: varchar("processor_name", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    confidence: integer("confidence"),
    outputLocation: text("output_location"),
    errorMessage: text("error_message"),
    resultJson: json("result_json").$type<Record<string, unknown>>(),
  },
  (table) => ({
    itemIdx: index("idx_da_processing_item").on(table.itemId),
    pipelineIdx: index("idx_da_processing_pipeline").on(table.pipeline),
    statusIdx: index("idx_da_processing_status").on(table.status),
  }),
);

export type DataAcquisitionProcessingRun =
  typeof dataAcquisitionProcessingRuns.$inferSelect;
export type InsertDataAcquisitionProcessingRun =
  typeof dataAcquisitionProcessingRuns.$inferInsert;

/**
 * data_acquisition_quality_results — confidence + issue list per item/record.
 */
export const dataAcquisitionQualityResults = pgTable(
  "data_acquisition_quality_results",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    canonicalRecordId: integer("canonical_record_id"),
    confidenceScore: integer("confidence_score").default(0).notNull(),
    requiresReview: boolean("requires_review").default(false).notNull(),
    issuesJson: json("issues_json").$type<unknown[]>(),
    validationVersion: varchar("validation_version", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_quality_item").on(table.itemId),
    recordIdx: index("idx_da_quality_record").on(table.canonicalRecordId),
  }),
);

export type DataAcquisitionQualityResult =
  typeof dataAcquisitionQualityResults.$inferSelect;
export type InsertDataAcquisitionQualityResult =
  typeof dataAcquisitionQualityResults.$inferInsert;

/**
 * data_acquisition_canonical_records — the normalized output of the
 * pipeline. One row per canonical record (document, sensor record,
 * event, api record, db record, web page, git object, form record,
 * media record).
 */
export const dataAcquisitionCanonicalRecords = pgTable(
  "data_acquisition_canonical_records",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => dataAcquisitionSources.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    recordType: varchar("record_type", { length: 64 }).notNull(),
    canonicalVersion: varchar("canonical_version", { length: 32 }).notNull(),
    canonicalJson: json("canonical_json").$type<Record<string, unknown>>(),
    graphJson: json("graph_json").$type<Record<string, unknown>>(),
    confidenceScore: integer("confidence_score"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    wsIdx: index("idx_da_canonical_ws").on(table.workspaceId),
    sourceIdx: index("idx_da_canonical_source").on(table.sourceId),
    itemIdx: index("idx_da_canonical_item").on(table.itemId),
    typeIdx: index("idx_da_canonical_type").on(table.recordType),
  }),
);

export type DataAcquisitionCanonicalRecord =
  typeof dataAcquisitionCanonicalRecords.$inferSelect;
export type InsertDataAcquisitionCanonicalRecord =
  typeof dataAcquisitionCanonicalRecords.$inferInsert;

/**
 * data_acquisition_output_runs — one row per output pipeline emission
 * (rag/graphrag/analytics/warehouse/alerts/reports/markdown/html/pdf).
 */
export const dataAcquisitionOutputRuns = pgTable(
  "data_acquisition_output_runs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    itemId: integer("item_id"),
    canonicalRecordId: integer("canonical_record_id"),
    outputType: varchar("output_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    targetRef: text("target_ref"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    wsIdx: index("idx_da_output_ws").on(table.workspaceId),
    typeIdx: index("idx_da_output_type").on(table.outputType),
    statusIdx: index("idx_da_output_status").on(table.status),
  }),
);

export type DataAcquisitionOutputRun =
  typeof dataAcquisitionOutputRuns.$inferSelect;
export type InsertDataAcquisitionOutputRun =
  typeof dataAcquisitionOutputRuns.$inferInsert;

/**
 * data_acquisition_audit_events — narrow audit trail used by
 * Digital HQ + governance review. Distinct from the platform-wide
 * audit log because it correlates source ↔ run ↔ item.
 */
export const dataAcquisitionAuditEvents = pgTable(
  "data_acquisition_audit_events",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceId: integer("source_id"),
    itemId: integer("item_id"),
    runId: integer("run_id"),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorId: integer("actor_id"),
    message: text("message"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    wsIdx: index("idx_da_audit_ws").on(table.workspaceId),
    sourceIdx: index("idx_da_audit_source").on(table.sourceId),
    typeIdx: index("idx_da_audit_type").on(table.eventType),
  }),
);

export type DataAcquisitionAuditEvent =
  typeof dataAcquisitionAuditEvents.$inferSelect;
export type InsertDataAcquisitionAuditEvent =
  typeof dataAcquisitionAuditEvents.$inferInsert;

// ============================================================================
// Specialization tables (per-mode payload shapes)
// ============================================================================

/**
 * data_acquisition_documents — Document Intelligence specialization.
 */
export const dataAcquisitionDocuments = pgTable(
  "data_acquisition_documents",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    docType: varchar("doc_type", { length: 64 }),
    pageCount: integer("page_count"),
    parserUsed: varchar("parser_used", { length: 64 }),
    fallbackUsed: boolean("fallback_used").default(false).notNull(),
    canonicalJson: json("canonical_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_documents_item").on(table.itemId),
  }),
);

export type DataAcquisitionDocument =
  typeof dataAcquisitionDocuments.$inferSelect;
export type InsertDataAcquisitionDocument =
  typeof dataAcquisitionDocuments.$inferInsert;

/**
 * data_acquisition_batches — groups multiple acquisition runs that
 * belong to the same logical campaign (e.g. "ingest the 2026-Q1 contract
 * archive" might span many runs against many sources).
 */
export const dataAcquisitionBatches = pgTable(
  "data_acquisition_batches",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    runCount: integer("run_count").default(0).notNull(),
    itemCount: integer("item_count").default(0).notNull(),
    createdBy: integer("created_by"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    wsIdx: index("idx_da_batches_ws").on(table.workspaceId),
    statusIdx: index("idx_da_batches_status").on(table.status),
  }),
);

export type DataAcquisitionBatch = typeof dataAcquisitionBatches.$inferSelect;
export type InsertDataAcquisitionBatch =
  typeof dataAcquisitionBatches.$inferInsert;

/**
 * data_acquisition_sensor_readings — Sensor / IoT specialization.
 * One row per normalized reading. `metricKey` is the sensor channel
 * (e.g. `temperature`, `pressure`); `value` is numeric; `unit` is the
 * unit-of-measure; `recordedAt` is the sensor-side timestamp.
 */
export const dataAcquisitionSensorReadings = pgTable(
  "data_acquisition_sensor_readings",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    deviceId: varchar("device_id", { length: 128 }),
    metricKey: varchar("metric_key", { length: 64 }).notNull(),
    value: text("value").notNull(),
    unit: varchar("unit", { length: 32 }),
    qualityFlag: varchar("quality_flag", { length: 32 }),
    recordedAt: timestamp("recorded_at"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_sensor_item").on(table.itemId),
    deviceIdx: index("idx_da_sensor_device").on(table.deviceId),
    metricIdx: index("idx_da_sensor_metric").on(table.metricKey),
    recordedIdx: index("idx_da_sensor_recorded").on(table.recordedAt),
  }),
);

export type DataAcquisitionSensorReading =
  typeof dataAcquisitionSensorReadings.$inferSelect;
export type InsertDataAcquisitionSensorReading =
  typeof dataAcquisitionSensorReadings.$inferInsert;

/**
 * data_acquisition_stream_events — Stream / Kafka / Pulsar / Redis Streams
 * specialization. One row per decoded event.
 */
export const dataAcquisitionStreamEvents = pgTable(
  "data_acquisition_stream_events",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    streamKey: varchar("stream_key", { length: 128 }).notNull(),
    partition: integer("partition"),
    offset: text("offset_key"),
    eventType: varchar("event_type", { length: 64 }),
    eventTime: timestamp("event_time"),
    payloadJson: json("payload_json").$type<Record<string, unknown>>(),
    headersJson: json("headers_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_stream_item").on(table.itemId),
    streamIdx: index("idx_da_stream_stream").on(table.streamKey),
    eventTypeIdx: index("idx_da_stream_event_type").on(table.eventType),
  }),
);

export type DataAcquisitionStreamEvent =
  typeof dataAcquisitionStreamEvents.$inferSelect;
export type InsertDataAcquisitionStreamEvent =
  typeof dataAcquisitionStreamEvents.$inferInsert;

/**
 * data_acquisition_api_records — API Sync specialization.
 */
export const dataAcquisitionApiRecords = pgTable(
  "data_acquisition_api_records",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    endpoint: text("endpoint").notNull(),
    method: varchar("method", { length: 10 }).default("GET").notNull(),
    statusCode: integer("status_code"),
    requestJson: json("request_json").$type<Record<string, unknown>>(),
    responseJson: json("response_json").$type<Record<string, unknown>>(),
    durationMs: integer("duration_ms"),
    fetchedAt: timestamp("fetched_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_api_item").on(table.itemId),
    endpointIdx: index("idx_da_api_endpoint").on(table.endpoint),
    statusIdx: index("idx_da_api_status").on(table.statusCode),
  }),
);

export type DataAcquisitionApiRecord =
  typeof dataAcquisitionApiRecords.$inferSelect;
export type InsertDataAcquisitionApiRecord =
  typeof dataAcquisitionApiRecords.$inferInsert;

/**
 * data_acquisition_db_records — External database / CDC specialization.
 */
export const dataAcquisitionDbRecords = pgTable(
  "data_acquisition_db_records",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    schemaName: varchar("schema_name", { length: 128 }),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    primaryKey: text("primary_key"),
    operation: varchar("operation", { length: 16 }),
    rowJson: json("row_json").$type<Record<string, unknown>>(),
    cdcLsn: text("cdc_lsn"),
    capturedAt: timestamp("captured_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_db_item").on(table.itemId),
    tableIdx: index("idx_da_db_table").on(table.tableName),
    operationIdx: index("idx_da_db_operation").on(table.operation),
  }),
);

export type DataAcquisitionDbRecord =
  typeof dataAcquisitionDbRecords.$inferSelect;
export type InsertDataAcquisitionDbRecord =
  typeof dataAcquisitionDbRecords.$inferInsert;

/**
 * data_acquisition_media_assets — Media (image / audio / video) specialization.
 */
export const dataAcquisitionMediaAssets = pgTable(
  "data_acquisition_media_assets",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    mediaType: varchar("media_type", { length: 32 }).notNull(),
    durationSec: integer("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    codec: varchar("codec", { length: 64 }),
    rawLocation: text("raw_location"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_media_item").on(table.itemId),
    typeIdx: index("idx_da_media_type").on(table.mediaType),
  }),
);

export type DataAcquisitionMediaAsset =
  typeof dataAcquisitionMediaAssets.$inferSelect;
export type InsertDataAcquisitionMediaAsset =
  typeof dataAcquisitionMediaAssets.$inferInsert;

/**
 * data_acquisition_web_pages — Web crawl specialization.
 */
export const dataAcquisitionWebPages = pgTable(
  "data_acquisition_web_pages",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    url: text("url").notNull(),
    httpStatus: integer("http_status"),
    titleText: text("title_text"),
    bodyText: text("body_text"),
    headersJson: json("headers_json").$type<Record<string, unknown>>(),
    fetchedAt: timestamp("fetched_at"),
    contentLength: integer("content_length"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_web_item").on(table.itemId),
    statusIdx: index("idx_da_web_status").on(table.httpStatus),
  }),
);

export type DataAcquisitionWebPage =
  typeof dataAcquisitionWebPages.$inferSelect;
export type InsertDataAcquisitionWebPage =
  typeof dataAcquisitionWebPages.$inferInsert;

/**
 * data_acquisition_git_objects — Git / repository specialization.
 */
export const dataAcquisitionGitObjects = pgTable(
  "data_acquisition_git_objects",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    repo: text("repo").notNull(),
    objectType: varchar("object_type", { length: 32 }).notNull(),
    objectSha: varchar("object_sha", { length: 64 }),
    pathText: text("path_text"),
    refName: varchar("ref_name", { length: 128 }),
    language: varchar("language", { length: 64 }),
    contentText: text("content_text"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_git_item").on(table.itemId),
    typeIdx: index("idx_da_git_type").on(table.objectType),
    repoIdx: index("idx_da_git_repo").on(table.repo),
  }),
);

export type DataAcquisitionGitObject =
  typeof dataAcquisitionGitObjects.$inferSelect;
export type InsertDataAcquisitionGitObject =
  typeof dataAcquisitionGitObjects.$inferInsert;

/**
 * data_acquisition_form_submissions — Manual form / capture specialization.
 */
export const dataAcquisitionFormSubmissions = pgTable(
  "data_acquisition_form_submissions",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    formKey: varchar("form_key", { length: 128 }),
    submittedBy: integer("submitted_by"),
    fieldsJson: json("fields_json").$type<Record<string, unknown>>(),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_form_item").on(table.itemId),
    formIdx: index("idx_da_form_key").on(table.formKey),
  }),
);

export type DataAcquisitionFormSubmission =
  typeof dataAcquisitionFormSubmissions.$inferSelect;
export type InsertDataAcquisitionFormSubmission =
  typeof dataAcquisitionFormSubmissions.$inferInsert;

/**
 * data_acquisition_webhook_events — Webhook / event specialization.
 */
export const dataAcquisitionWebhookEvents = pgTable(
  "data_acquisition_webhook_events",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => dataAcquisitionItems.id),
    provider: varchar("provider", { length: 64 }),
    eventType: varchar("event_type", { length: 64 }),
    deliveryId: varchar("delivery_id", { length: 128 }),
    signatureValid: boolean("signature_valid"),
    payloadJson: json("payload_json").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index("idx_da_webhook_item").on(table.itemId),
    providerIdx: index("idx_da_webhook_provider").on(table.provider),
    eventTypeIdx: index("idx_da_webhook_event_type").on(table.eventType),
  }),
);

export type DataAcquisitionWebhookEvent =
  typeof dataAcquisitionWebhookEvents.$inferSelect;
export type InsertDataAcquisitionWebhookEvent =
  typeof dataAcquisitionWebhookEvents.$inferInsert;
