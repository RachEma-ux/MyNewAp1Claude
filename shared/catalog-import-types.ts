/**
 * Catalog Import & Discovery System — Shared Types
 *
 * Used by both server (session/dedup/discovery services, tRPC router)
 * and client (CatalogImportWizard).
 */

// ============================================================================
// Import Session
// ============================================================================

export type ImportMethod = "api_discovery" | "file_upload" | "registry_sync" | "openapi_spec";

export type ImportSessionStatus =
  | "pending"
  | "discovering"
  | "previewing"
  | "importing"
  | "completed"
  | "failed"
  | "expired";

export interface ImportSession {
  id: string;
  userId: number;
  method: ImportMethod;
  sourceRef: string;
  status: ImportSessionStatus;
  version: number;
  summary: PreviewSummary | null;
  error: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Preview Rows
// ============================================================================

export type DuplicateStatus = "new" | "exact_match" | "fuzzy_match" | "conflict";

export type RiskLevel = "low" | "medium" | "high";

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "warning" | "error";
  /** Row index (0-based) within the uploaded file */
  rowIndex?: number;
  /** The entry key/name for cross-referencing */
  entryKey?: string;
  /** Machine-readable issue code */
  code?: ValidationIssueCode;
}

export type ValidationIssueCode =
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_TYPE"
  | "INVALID_ENUM"
  | "MAX_LENGTH_EXCEEDED"
  | "INVALID_JSON"
  | "DUPLICATE_KEY_IN_FILE"
  | "EXISTING_CATALOG_CONFLICT"
  | "UNSUPPORTED_FIELD"
  | "ALIAS_USED"
  | "AGENT_IMPORT_BLOCKED";

export interface PreviewEntry {
  tempId: string;
  type: string;         // "provider" | "model" | "llm" etc.
  name: string;
  description: string | null;
  source: string;       // e.g., "openai_api", "ollama_api"
  metadata: Record<string, unknown>;
  duplicateStatus: DuplicateStatus;
  riskLevel: RiskLevel;
  validationIssues: ValidationIssue[];
  selected?: boolean;   // client-side only, not stored in DB
}

export interface PreviewSummary {
  total: number;
  new: number;
  exactMatch: number;
  fuzzyMatch: number;
  conflict: number;
  highRisk: number;
}

// ============================================================================
// Bulk Create Result
// ============================================================================

export interface BulkCreateResultEntry {
  tempId: string;
  name: string;
  outcome: "created" | "skipped" | "error";
  catalogEntryId?: number;
  error?: string;
}

export interface BulkCreateResult {
  created: number;
  skipped: number;
  errors: number;
  entries: BulkCreateResultEntry[];
}

// ============================================================================
// File Import Contract
// ============================================================================

/** Valid catalog entry types for file import */
export const VALID_IMPORT_ENTRY_TYPES = ["provider", "llm", "model", "bot"] as const;
export type ImportEntryType = (typeof VALID_IMPORT_ENTRY_TYPES)[number];

/** Canonical normalized shape that all file formats map into */
export interface NormalizedImportEntry {
  name: string;
  displayName?: string;
  description?: string;
  entryType: string;
  category?: string;
  subCategory?: string;
  capabilities?: string[];
  tags?: string[];
  scope?: string;
  config?: Record<string, unknown>;
}

/** Required fields for a valid import entry */
export const IMPORT_REQUIRED_FIELDS = ["name", "entryType"] as const;

/** Optional fields accepted during import */
export const IMPORT_OPTIONAL_FIELDS = [
  "displayName", "description", "category", "subCategory",
  "capabilities", "tags", "scope", "config",
] as const;

/**
 * Approved field aliases — deterministic mapping from common alternate names.
 * Keys are lowercase. Values are canonical field names.
 */
export const IMPORT_FIELD_ALIASES: Record<string, string> = {
  // name
  entry_name: "name",
  entryname: "name",
  slug: "name",
  key: "name",
  // displayName
  display_name: "displayName",
  label: "displayName",
  title: "displayName",
  // description
  desc: "description",
  // entryType
  entry_type: "entryType",
  type: "entryType",
  kind: "entryType",
  // category
  cat: "category",
  // subCategory
  sub_category: "subCategory",
  subcategory: "subCategory",
  // tags
  labels: "tags",
  // capabilities
  caps: "capabilities",
  // scope
  // (no aliases)
  // config
  metadata: "config",
};

/** All canonical field names accepted by the import system */
export const IMPORT_CANONICAL_FIELDS = new Set([
  "name", "displayName", "description", "entryType",
  "category", "subCategory", "capabilities", "tags",
  "scope", "config",
]);

/** Enhanced file import preview response */
export interface FileImportPreviewResponse {
  fileType: "json" | "yaml" | "csv";
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  warningCount: number;
  entries: PreviewEntry[];
  issues: ValidationIssue[];
  globalIssues: string[];
}

// ============================================================================
// SSE Events
// ============================================================================

export interface ImportSSEEvent {
  type: "status" | "progress" | "complete" | "error";
  sessionId: string;
  status?: ImportSessionStatus;
  message?: string;
  summary?: PreviewSummary;
}
