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
}

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
// SSE Events
// ============================================================================

export interface ImportSSEEvent {
  type: "status" | "progress" | "complete" | "error";
  sessionId: string;
  status?: ImportSessionStatus;
  message?: string;
  summary?: PreviewSummary;
}
