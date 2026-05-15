/**
 * RAC Ingestion Adapter — public contract (Phase 3).
 *
 * The adapter contract per D-RET-4 (`RAC_RETRIEVAL_FOUNDATION_DECISION.md`).
 * Each registered RAC source binds to one adapter instance via its
 * `(sourceType, ownerModule)` pair. The P4 retrieval executor calls
 * `adapter.search(...)` per source and merges results.
 *
 * Embedding flow:
 *   1. P3 ingestion / P4 retrieval reads the embedding ref tuple
 *      (provider_connection_id, model_ref, dim) from the source row
 *      (or the workspace default when NULL — D-EMB-4).
 *   2. Embedding HTTP calls go through `withEmbeddingCredential` —
 *      the credential lives only in the closure (D-EMB-2).
 *   3. Dim mismatch between query embedding and source embedding is a
 *      hard error (D-EMB-3), never a silent fallback (D-EMB-5).
 *
 * Boundaries:
 *   - This package is on the credential-resolver allowlist
 *     (`scripts/check-provider-credential-resolver-boundary.ts`).
 *   - It MUST NOT import `services/cag/**` (CAG is pre-execution; RAC
 *     is retrieval).
 *   - It MUST NOT touch `process.env` for credentials.
 */

/** Per D-RET-1, locked source-type enum re-exported for adapter dispatch. */
export type {
  RacSourceType,
  RacOwnerModule,
  RacSource,
  RacWorkspaceEmbeddingDefault,
} from "../sources/types";

// ── Search contract ──────────────────────────────────────────────────

export interface RacRetrievalRequest {
  workspaceId: number;
  sourceId: number;
  query: string;
  topK: number;
  filters?: Record<string, unknown>;
  /**
   * Per-call timeout in ms. The executor (P4) enforces this against
   * `AbortController`; adapters MAY also self-time-out to stay polite
   * to upstream services.
   */
  timeoutMs?: number;
  /**
   * Workspace embedding default — passed through so adapters that need
   * to embed the query themselves don't have to re-fetch it. NULL when
   * the source row carries its own embedding ref.
   */
  workspaceEmbeddingDefault?: {
    embeddingProviderConnectionId: number;
    embeddingModelRef: string;
    embeddingModelDim: number;
  } | null;
  /**
   * Phase 12 — when the source row's `metadataJson.retrievalMethod` is
   * one of `"local" | "global" | "traversal" | "text2cypher" |
   * "algorithm"`, the executor threads it through to the adapter so
   * GraphRAG-capable adapters can dispatch to the right backend
   * routine. Unknown / missing → `undefined`, and the adapter falls
   * back to its default search shape. Typed as `string` here (not the
   * `GraphragRetrievalMethod` literal union from `../planner-mode`) to
   * avoid an import cycle between the request shape and the planner.
   */
  retrievalMethod?: string;
  /**
   * Phase 12.5 §6 — the calling agent run id, threaded from the
   * orchestrator (`ResolveContextInput.runtimeRunId`). GraphRAG-capable
   * adapters forward it to `GraphRetrievalRouter` so the §4 runtime-
   * usage recorder has the FK target (`ags_graph_skill_runtime_usages
   * .runtime_run_id`) and can durably log "Skill Pack X served run Y".
   *
   * Optional: when absent (no agent run context, e.g. preview/test
   * harness flows) the recorder silently no-ops.
   */
  runtimeRunId?: number;
}

export interface RacRetrievalChunk {
  /** The chunk text the model will see (already detoxified upstream). */
  content: string;
  /** Cosine/inner-product similarity, normalised to [0, 1]. */
  score: number;
  /** Stable citation token, e.g. `[doc:Alice §Chapter-3]` (D-RET-2). */
  citation: string;
  /** Adapter-stable chunk id; lets the dedupe step short-circuit. */
  sourceChunkId: string;
  metadata?: Record<string, unknown>;
}

export interface RacRetrievalResult {
  chunks: RacRetrievalChunk[];
  /** Wall-clock latency the adapter measured for THIS call. */
  latencyMs: number;
  /**
   * Structured warnings the adapter wants surfaced to the trace. Common:
   *   - `source_unavailable` — backend not yet implemented (graphrag gap)
   *   - `embedding_dim_mismatch` — caller passed a query embedding dim
   *     that doesn't match the source-pinned dim
   *   - `partial_result` — upstream returned fewer chunks than topK
   */
  warnings: string[];
}

// ── Health contract ──────────────────────────────────────────────────

/**
 * Closed-taxonomy retrieval health status. Promoted from a union to a
 * tuple-derived constant at T-A.9 so it.each-style lockstep tests can
 * enumerate every value.
 */
export const RAC_RETRIEVAL_HEALTH_STATUSES = [
  "ok",
  "degraded",
  "unavailable",
  "unknown",
] as const;

export type RacRetrievalHealthStatus =
  (typeof RAC_RETRIEVAL_HEALTH_STATUSES)[number];

// ============================================================================
// Per-health-status operator-facing metadata (T-A.9)
// ============================================================================

export interface RacRetrievalHealthStatusMetadata {
  /** Display label rendered in the operator UI's source health badges. */
  readonly label: string;
  /** Short operator-facing description of what this status means. */
  readonly description: string;
  /** Whether requests routed to this source should still attempt
   *  retrieval (true) or skip and fall back (false). Drives the
   *  planner's source-selection logic. */
  readonly attemptRetrieval: boolean;
  /** Whether this status warrants an operator notification (i.e.
   *  represents a degradation from normal operation). */
  readonly notifyOperator: boolean;
}

export const RAC_RETRIEVAL_HEALTH_STATUS_METADATA: Readonly<
  Record<RacRetrievalHealthStatus, RacRetrievalHealthStatusMetadata>
> = {
  ok: {
    label: "OK",
    description:
      "Source is healthy and serving requests normally — no operator action needed.",
    attemptRetrieval: true,
    notifyOperator: false,
  },
  degraded: {
    label: "Degraded",
    description:
      "Source is partially functional — latency or error-rate above threshold but still serving requests.",
    attemptRetrieval: true,
    notifyOperator: true,
  },
  unavailable: {
    label: "Unavailable",
    description:
      "Source backend cannot be reached or is returning errors — planner skips it and falls back.",
    attemptRetrieval: false,
    notifyOperator: true,
  },
  unknown: {
    label: "Unknown",
    description:
      "Health probe not yet wired or last probe failed inconclusively — planner attempts the source anyway and learns from the response.",
    attemptRetrieval: true,
    notifyOperator: false,
  },
};

export function getRacRetrievalHealthStatusMetadata(
  status: RacRetrievalHealthStatus,
): RacRetrievalHealthStatusMetadata {
  return RAC_RETRIEVAL_HEALTH_STATUS_METADATA[status];
}

export interface RacRetrievalHealth {
  status: RacRetrievalHealthStatus;
  reason?: string;
  /**
   * Optional metric snapshot for the trace dashboard (P11). Adapters
   * not yet wired to a real backend should return `unknown` and an
   * empty object.
   */
  metrics?: Record<string, number | string>;
}

// ── Adapter interface ────────────────────────────────────────────────

export interface RacIngestionAdapter {
  /** D-RET-4 locked surface — read-only retrieval. */
  search(input: RacRetrievalRequest): Promise<RacRetrievalResult>;
  health(): Promise<RacRetrievalHealth>;
  /**
   * Optional: prove that the source row's `(connectionId, modelRef, dim)`
   * tuple is consistent with the adapter's index state. Not all
   * adapters need this; in-process adapters return `{ ok: true }`
   * trivially.
   */
  validateIndex?(input: {
    workspaceId: number;
    sourceId: number;
  }): Promise<RacIndexValidationResult>;
  /**
   * Optional: a preview of what the indexer would produce for the
   * source's currently-registered content. Empty array is fine; the
   * caller treats absence the same as no preview available.
   */
  preview?(input: {
    workspaceId: number;
    sourceId: number;
    sampleSize?: number;
  }): Promise<RacIngestionPreview>;
}

export interface RacIndexValidationResult {
  ok: boolean;
  /** Adapter-specific code. `embedding_dim_mismatch`, `index_missing`, etc. */
  reason?: string;
  details?: Record<string, unknown>;
}

export interface RacIngestionPreview {
  sampleChunks: Array<{
    content: string;
    citation: string;
    metadata?: Record<string, unknown>;
  }>;
  warnings: string[];
}

// ── Errors ──────────────────────────────────────────────────────────

/**
 * Thrown when an adapter is asked to operate but its concrete backend
 * isn't wired (e.g. GraphRAG before Data Analysis exposes a public
 * retrieve action). The executor (P4) converts this into a structured
 * `source_unavailable` warning, never a hard error in `safe_degraded`.
 */
export class RacBackendUnavailableError extends Error {
  readonly code = "source_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "RacBackendUnavailableError";
  }
}

/**
 * Thrown when the source row's embedding dim disagrees with what the
 * adapter knows about its index — D-EMB-3 hard error. Silent vendor
 * fallback is forbidden (D-EMB-5).
 */
export class EmbeddingDimMismatchError extends Error {
  readonly code = "embedding_dim_mismatch";
  constructor(
    public readonly sourceId: number,
    public readonly expectedDim: number,
    public readonly actualDim: number,
  ) {
    super(
      `Embedding dim mismatch on source ${sourceId}: index pinned dim=${expectedDim}, query dim=${actualDim}. ` +
        `Re-embed via the source registry before retrieval.`,
    );
    this.name = "EmbeddingDimMismatchError";
  }
}

/**
 * Thrown when ingestion is invoked but no embedding provider can be
 * resolved — no row-level ref AND no workspace default (D-EMB-5).
 */
export class EmbeddingProviderUnavailableError extends Error {
  readonly code = "embedding_provider_unavailable";
  constructor(workspaceId: number, sourceId: number) {
    super(
      `Source ${sourceId} in workspace ${workspaceId} has no embedding ref AND the workspace has no default. ` +
        `D-EMB-5: silent vendor fallback is forbidden.`,
    );
    this.name = "EmbeddingProviderUnavailableError";
  }
}
