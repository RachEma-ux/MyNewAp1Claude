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
