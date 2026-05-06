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

/** Locked unitType enum (D-NKU-2). */
export type NormalizedKnowledgeUnitType =
  | "text"
  | "markdown_section"
  | "html_block"
  | "json_object"
  | "pdf_page"
  | "code_function"
  | "code_class"
  | "table_row"
  | "tool_knowledge"
  | "extracted_artifact";

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
