/**
 * Universal Ingestion — public contracts (Retrofit P3).
 *
 * Locked by `docs/architecture/agent-studio-universal-data-ingestion.md`
 * and `docs/architecture/agent-studio-normalized-knowledge-unit.md`.
 *
 * The four-layer contract: SourceConnector → Parser → Normalizer → Extractor.
 * Every layer is a registry of pure functions; no layer executes tools
 * (D-UI-6); every NormalizedKnowledgeUnit MUST carry provenance + permission
 * context + freshness state (D-UI-2).
 */

// ── Layer types ────────────────────────────────────────────────────────────

/** SourceConnector output — raw bytes + source metadata. */
export interface RawArtifact {
  /** Bytes the connector fetched. */
  bytes: Buffer;
  /** Reported content-type (best-effort; parser may sniff). */
  contentType: string;
  /** Original URI / path / connector reference. */
  sourceUri: string | null;
  /** SHA-256 of bytes — also persisted on the artifact row. */
  contentHash: string;
  /** Connector-supplied metadata (timestamps, ETags, original filename, etc.). */
  metadata?: Record<string, unknown>;
}

/** Parser output — structured intermediate before normalization. */
export interface ParsedDocument {
  /** Parser key (matches the registry). */
  parserKey: string;
  /** Top-level text projection of the entire document. */
  fullText: string;
  /** Structured parts the normalizer can consume to produce units. */
  parts: ParsedPart[];
  /** Optional document-level metadata. */
  metadata?: Record<string, unknown>;
}

/** A single addressable part of a parsed document. */
export interface ParsedPart {
  /** Stable identifier within the document (line range, heading anchor, etc.). */
  partId: string;
  /** Text content of this part. */
  text: string;
  /** Hint for the normalizer — maps to NormalizedKnowledgeUnit.unitType. */
  unitTypeHint: NormalizedKnowledgeUnitType;
  /** Optional structured form alongside text. */
  json?: Record<string, unknown>;
  /** Source location for citations (page, line range, selector). */
  location?: {
    pageNumber?: number | null;
    lineRange?: { start: number; end: number } | null;
    selector?: string | null;
  };
}

/**
 * Locked unitType enum (D-NKU-2). Promoted to a tuple-derived
 * constant at T-G.66 so the aggregator + lockstep tests + future
 * UI metadata can iterate the values without redeclaring them.
 */
export const NORMALIZED_KNOWLEDGE_UNIT_TYPES = [
  "text",
  "markdown_section",
  "html_block",
  "json_object",
  "pdf_page",
  "code_function",
  "code_class",
  "table_row",
  "tool_knowledge",
  "extracted_artifact",
] as const;
export type NormalizedKnowledgeUnitType =
  (typeof NORMALIZED_KNOWLEDGE_UNIT_TYPES)[number];

/** Normalizer output — what the KnowledgeUnitService persists. */
export interface NormalizedKnowledgeUnitInput {
  /** Workspace scope (D-UI-2 permission boundary). */
  workspaceId: number;
  /** FK to ags_rac_sources. */
  sourceId: number;
  /** Optional parent unit id for hierarchical sources. */
  parentUnitId?: number | null;
  unitType: NormalizedKnowledgeUnitType;
  /** D-NKU-3 canonical text (mandatory). */
  contentText: string;
  /** Optional structured shape. */
  contentJson?: Record<string, unknown> | null;
  sourceLocation?: {
    uri?: string | null;
    pageNumber?: number | null;
    lineRange?: { start: number; end: number } | null;
    selector?: string | null;
  };
  /** D-UI-2: permission scope. */
  permissionContext: {
    inheritFromSource: boolean;
    explicitAclRef?: string | null;
  };
  /** D-UI-2: freshness state. */
  freshnessState?: "fresh" | "stale" | "expired";
  /**
   * U5-b.1/2: SPDX-or-site-label license tag for the unit. Populated
   * by the parser via document-level extraction (HTML/JSON/code) and
   * propagated by the normalizer. Operators can override per-unit
   * via the U5-b.4 mutation (`agentStudio.kb.setLicense`).
   * NULL = unknown.
   */
  license?: string | null;
}

// ── Registry types ─────────────────────────────────────────────────────────

export interface SourceConnector {
  key: string;
  /** Human description. */
  description: string;
  /** Fetch the raw artifact for the supplied input. */
  fetch(input: SourceConnectorInput): Promise<RawArtifact>;
}

export interface SourceConnectorInput {
  workspaceId: number;
  /** Connector-specific payload (path, URL, MCP source ref, etc.). */
  config: Record<string, unknown>;
}

export interface Parser {
  key: string;
  /** Content-type prefixes this parser handles (e.g. ["text/plain"]). */
  acceptsContentTypes: ReadonlyArray<string>;
  parse(artifact: RawArtifact): Promise<ParsedDocument>;
}

export interface Normalizer {
  key: string;
  /** ParsedDocument → NormalizedKnowledgeUnitInput[]. Pure. */
  normalize(input: NormalizerInput): NormalizedKnowledgeUnitInput[];
}

export interface NormalizerInput {
  workspaceId: number;
  sourceId: number;
  document: ParsedDocument;
  permissionContext: NormalizedKnowledgeUnitInput["permissionContext"];
}

export interface Extractor {
  key: string;
  /** Operates on a normalized unit; returns optional structured extractions. */
  extract(input: ExtractorInput): Promise<ExtractionOutput[]>;
}

export interface ExtractorInput {
  workspaceId: number;
  unitId: number;
  unitType: NormalizedKnowledgeUnitType;
  contentText: string;
  contentJson?: Record<string, unknown> | null;
}

export interface ExtractionOutput {
  extractionType: string;
  payloadJson: Record<string, unknown>;
  payloadHash?: string;
}

// ── Job types ──────────────────────────────────────────────────────────────

export interface IngestionJobRequest {
  workspaceId: number;
  sourceConnectorKey: string;
  /** Connector-specific payload. */
  connectorInput: Record<string, unknown>;
  /** FK to ags_rac_sources — the unit's logical home. */
  sourceId: number;
  /** D-UI-2 permission context for the produced units. */
  permissionContext: NormalizedKnowledgeUnitInput["permissionContext"];
  /** Optional parser override (force a specific key); defaults to dispatcher selection. */
  parserKey?: string;
  /** Optional normalizer override. */
  normalizerKey?: string;
  /** Optional extractor keys to run after normalization. */
  extractorKeys?: ReadonlyArray<string>;
  /** User who requested the ingestion. */
  requestedBy: number;
}

/**
 * Closed-taxonomy ingestion-job status — covers the full row lifecycle
 * stored in `agsIngestionJobs.status`. The IngestionJobResult union
 * below is a SUBSET (terminal-only). Promoted to a tuple-derived
 * constant at T-G.65 so metadata + lockstep + aggregator can iterate.
 */
export const INGESTION_JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "unsupported_type",
] as const;
export type IngestionJobStatus =
  (typeof INGESTION_JOB_STATUSES)[number];

// ============================================================================
// Per-status operator-facing metadata (T-G.65)
// ============================================================================

export interface IngestionJobStatusMetadata {
  /** Display label rendered in the ingestion-jobs ledger UI. */
  readonly label: string;
  /** Short operator-facing description of what the status indicates. */
  readonly description: string;
  /** Whether the status is terminal (true for succeeded / failed /
   *  unsupported_type; false for pending / running). */
  readonly terminal: boolean;
  /** Whether the status represents a successful ingestion (true for
   *  `succeeded` only; false for the other 4). */
  readonly successful: boolean;
}

export const INGESTION_JOB_STATUS_METADATA: Readonly<
  Record<IngestionJobStatus, IngestionJobStatusMetadata>
> = {
  pending: {
    label: "Pending",
    description:
      "Ingestion job is enqueued but the worker has not started parsing — earliest in-flight state.",
    terminal: false,
    successful: false,
  },
  running: {
    label: "Running",
    description:
      "Worker is actively parsing the source artifact and normalizing extracted units — counters increment during this phase.",
    terminal: false,
    successful: false,
  },
  succeeded: {
    label: "Succeeded",
    description:
      "Job completed cleanly — artifacts/units/chunks/extractions counters are final and the source is queryable.",
    terminal: true,
    successful: true,
  },
  failed: {
    label: "Failed",
    description:
      "Job errored during parsing / normalization / extraction — failure_reason captures the diagnostic. Operator may retry.",
    terminal: true,
    successful: false,
  },
  unsupported_type: {
    label: "Unsupported Type",
    description:
      "Source content-type does not match any registered parser — distinct from `failed` because no parser was actually invoked. Surface to operator to register a new parser.",
    terminal: true,
    successful: false,
  },
};

export function getIngestionJobStatusMetadata(
  status: IngestionJobStatus,
): IngestionJobStatusMetadata {
  return INGESTION_JOB_STATUS_METADATA[status];
}

export interface IngestionJobResult {
  jobId: number;
  status: "succeeded" | "failed" | "unsupported_type";
  artifactsCreated: number;
  unitsCreated: number;
  chunksCreated: number;
  extractionsCreated: number;
  failureReason: string | null;
}

// ── Validation types (D-UI-4) ──────────────────────────────────────────────

export interface DataValidationFinding {
  rule: string;
  severity: "info" | "warn" | "block";
  message: string;
  detail?: Record<string, unknown>;
}

export interface DataValidationResult {
  status: "ok" | "warn" | "blocked";
  findings: DataValidationFinding[];
  validatorVersion: string;
}

// ── Errors ─────────────────────────────────────────────────────────────────

/** Thrown when a unit input is missing a mandatory D-UI-2 context field. */
export class KnowledgeUnitContractError extends Error {
  readonly code: "missing_provenance" | "missing_permission" | "missing_freshness" | "missing_content_text";
  constructor(code: KnowledgeUnitContractError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "KnowledgeUnitContractError";
  }
}

/** Thrown when no parser claims the artifact's content-type. */
export class UnsupportedContentTypeError extends Error {
  readonly contentType: string;
  constructor(contentType: string) {
    super(`No parser registered for content-type ${contentType}`);
    this.contentType = contentType;
    this.name = "UnsupportedContentTypeError";
  }
}
