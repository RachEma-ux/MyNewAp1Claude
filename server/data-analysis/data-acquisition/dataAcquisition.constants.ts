/**
 * Data Acquisition — constants
 */

export const DATA_ACQUISITION_VERSION = "1.0.0";
export const DATA_ACQUISITION_PIPELINE_VERSION = "1.0.0";
export const DATA_ACQUISITION_CLASSIFIER_VERSION = "1.0.0";
export const DATA_ACQUISITION_VALIDATION_VERSION = "1.0.0";

export const DATA_ACQUISITION_WORKER_DEFAULT_URL = "http://localhost:8485";
export const DATA_ACQUISITION_WORKER_ENV = "DATA_ACQUISITION_WORKER_URL";
export const DATA_ACQUISITION_WORKER_TIMEOUT_MS = 5000;

/** Source types — match `data_acquisition_sources.source_type`. */
export const SOURCE_TYPES = [
  "document",
  "sensor",
  "stream",
  "api",
  "database",
  "object_storage",
  "saas",
  "web",
  "git",
  "manual_form",
  "webhook",
  "media",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Item types — match `data_acquisition_items.item_type`. */
export const ITEM_TYPES = [
  "document",
  "sensor_reading",
  "stream_event",
  "api_record",
  "db_record",
  "web_page",
  "git_object",
  "form_submission",
  "webhook_event",
  "media_asset",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Pipeline keys — used by routing decisions and processing runs. */
export const PIPELINES = [
  "document",
  "sensor",
  "stream",
  "api",
  "database",
  "object_storage",
  "saas",
  "web",
  "git",
  "manual",
  "webhook",
  "media",
] as const;
export type Pipeline = (typeof PIPELINES)[number];

/** Output types — match `data_acquisition_output_runs.output_type`. */
export const OUTPUT_TYPES = [
  "rag",
  "graphrag",
  "analytics",
  "warehouse",
  "alerts",
  "reports",
  "markdown",
  "html",
  "pdf",
] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

/** Canonical record types — match `data_acquisition_canonical_records.record_type`. */
export const CANONICAL_RECORD_TYPES = [
  "document",
  "sensor",
  "stream_event",
  "api_record",
  "db_record",
  "web_page",
  "git_object",
  "form_submission",
  "webhook_event",
  "media",
] as const;
export type CanonicalRecordType = (typeof CANONICAL_RECORD_TYPES)[number];

/** Connector availability states. */
export const CONNECTOR_STATUS = [
  "available",
  "unconfigured",
  "degraded",
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUS)[number];

/** Run statuses. */
export const RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "degraded",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Item statuses. */
export const ITEM_STATUSES = [
  "discovered",
  "classified",
  "routed",
  "processed",
  "failed",
  "needs_review",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Document parsers known to the router (worker decides which is used). */
export const KNOWN_DOCUMENT_PARSERS = [
  "markitdown",
  "docling",
  "llamaparse",
  "unstructured",
  "tesseract",
  "paddleocr",
  "fallback_chain",
] as const;
export type DocumentParser = (typeof KNOWN_DOCUMENT_PARSERS)[number];

/** Owned table list — used by manifest + boundary tests. */
export const DATA_ACQUISITION_OWNED_TABLES = [
  "data_acquisition_sources",
  "data_acquisition_runs",
  "data_acquisition_items",
  "data_acquisition_classifications",
  "data_acquisition_routes",
  "data_acquisition_processing_runs",
  "data_acquisition_quality_results",
  "data_acquisition_canonical_records",
  "data_acquisition_output_runs",
  "data_acquisition_audit_events",
  "data_acquisition_documents",
] as const;
