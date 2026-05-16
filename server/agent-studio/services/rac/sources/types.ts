/**
 * RAC Source Registry — public type contracts (Phase 2).
 *
 * Pure types. No I/O, no runtime imports — safe to consume from the
 * tRPC layer, the future ingestion adapters (P3), and the retrieval
 * planner (P4).
 *
 * Cross-references:
 *   - D-RET-1 (RAC_RETRIEVAL_FOUNDATION_DECISION.md §1) — source-type enum
 *   - D-RET-2 — chunk override fields
 *   - D-RET-5 — policy override fields
 *   - D-EMB-1..5 (RAC_EMBEDDING_BINDING_DECISION.md) — embedding binding
 */

/**
 * Locked source-type enum (D-RET-1). Adding a new value requires a
 * RAC PR; until then `external_connector` is the catch-all (with an
 * explicit adapter registration in P3).
 *
 * Removed at D3 closure (2026-05-06): `memory`, `workspace_context`,
 * `project_context`, `tool_result_context`, `manual_context`. Those
 * types had no producer in the codebase and the runtime-synthesizer
 * shape they implied does not fit the four-layer ingestion pipeline
 * (no raw artifact → no Parser → no chunks). When a real consumer
 * surfaces, the right home is a CAG system-prompt section, not a RAC
 * source. `cag_pack` remains because the CAG resolver renders it
 * directly outside the RAC retrieval path.
 */
export const RAC_SOURCE_TYPES = [
  "cag_pack",
  "document_collection",
  "vector_index",
  "graph_index",
  "external_connector",
  // Retrofit P4 — NormalizedKnowledgeUnit retrieval (D-NKU-1).
  "knowledge_unit",
  // Retrofit P7 — MCP tool knowledge mirror (D-NKU-6).
  "tool_knowledge",
] as const;

export type RacSourceType = (typeof RAC_SOURCE_TYPES)[number];

// ============================================================================
// Per-source-type operator-facing metadata (T-A.8)
// ============================================================================

export const RAC_SOURCE_RETRIEVAL_MECHANISMS = [
  "precompiled",
  "vector",
  "graph",
  "external_api",
  "structured",
] as const;

export type RacSourceRetrievalMechanism =
  (typeof RAC_SOURCE_RETRIEVAL_MECHANISMS)[number];

// ============================================================================
// Per-retrieval-mechanism operator-facing metadata (T-A.12)
// ============================================================================

export interface RacSourceRetrievalMechanismMetadata {
  /** Display label rendered in the planner-trace mechanism filter. */
  readonly label: string;
  /** Short operator-facing description of how this mechanism actually
   *  retrieves evidence at execution time. */
  readonly description: string;
  /** Whether this mechanism needs embedding configuration to function
   *  (true for `vector` only). */
  readonly requiresEmbeddings: boolean;
  /** Whether this mechanism reaches outside the Agent Studio process
   *  for evidence (true for `external_api`; false for the rest which
   *  stay in-platform). */
  readonly callsExternal: boolean;
}

export const RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA: Readonly<
  Record<
    RacSourceRetrievalMechanism,
    RacSourceRetrievalMechanismMetadata
  >
> = {
  precompiled: {
    label: "Precompiled",
    description:
      "Source serves a pre-baked CAG block — no live retrieval; the block is selected by capability key and emitted whole.",
    requiresEmbeddings: false,
    callsExternal: false,
  },
  vector: {
    label: "Vector",
    description:
      "Source uses embedding-vector similarity to find evidence — runs an embedding model and searches the workspace vector index.",
    requiresEmbeddings: true,
    callsExternal: false,
  },
  graph: {
    label: "Graph",
    description:
      "Source traverses the Native Graph Workspace through GraphRepository — read-only Cypher templates with policy filters.",
    requiresEmbeddings: false,
    callsExternal: false,
  },
  external_api: {
    label: "External API",
    description:
      "Source calls out to an external HTTP API for evidence — gated by network egress policy and per-source rate limits.",
    requiresEmbeddings: false,
    callsExternal: true,
  },
  structured: {
    label: "Structured",
    description:
      "Source pulls from a typed structured store (Postgres / ASDB table) — exact match / filter queries, no fuzzy search.",
    requiresEmbeddings: false,
    callsExternal: false,
  },
};

export function getRacSourceRetrievalMechanismMetadata(
  mechanism: RacSourceRetrievalMechanism,
): RacSourceRetrievalMechanismMetadata {
  return RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[mechanism];
}

export interface RacSourceTypeMetadata {
  /** Display label rendered in the source picker / source-registry UI. */
  readonly label: string;
  /** Short operator-facing description of the source type. */
  readonly description: string;
  /** Closed-taxonomy retrieval mechanism — drives the planner's
   *  budget logic and which executor branch handles the source. */
  readonly retrievalMechanism: RacSourceRetrievalMechanism;
  /** Whether the source requires per-workspace embedding configuration
   *  (D-EMB-1: only vector / knowledge_unit need embedding bindings). */
  readonly requiresEmbeddings: boolean;
}

export const RAC_SOURCE_TYPE_METADATA: Readonly<
  Record<RacSourceType, RacSourceTypeMetadata>
> = {
  cag_pack: {
    label: "CAG Pack",
    description:
      "Compiled, versioned CAG context block. Resolved by the CAG resolver, not the RAC retrieval pipeline.",
    retrievalMechanism: "precompiled",
    requiresEmbeddings: false,
  },
  document_collection: {
    label: "Document Collection",
    description:
      "Governed set of documents ingested into the KB. Retrieved via text search + chunk lookup.",
    retrievalMechanism: "structured",
    requiresEmbeddings: false,
  },
  vector_index: {
    label: "Vector Index",
    description:
      "Embedding-based similarity index over governed chunks. Used for semantic retrieval.",
    retrievalMechanism: "vector",
    requiresEmbeddings: true,
  },
  graph_index: {
    label: "Graph Index",
    description:
      "GraphRAG index over the native graph workspace — supports local/global/traversal/text2cypher/algorithm methods.",
    retrievalMechanism: "graph",
    requiresEmbeddings: false,
  },
  external_connector: {
    label: "External Connector",
    description:
      "Third-party retrieval API mounted through the connector framework — outputs are governed but the index lives outside.",
    retrievalMechanism: "external_api",
    requiresEmbeddings: false,
  },
  knowledge_unit: {
    label: "Knowledge Unit",
    description:
      "NormalizedKnowledgeUnit retrieval (Retrofit P4 / D-NKU-1). Embedding-backed retrieval over the KB knowledge-unit layer.",
    retrievalMechanism: "vector",
    requiresEmbeddings: true,
  },
  tool_knowledge: {
    label: "Tool Knowledge",
    description:
      "MCP tool-knowledge mirror (Retrofit P7 / D-NKU-6) — what tools have been used in this workspace and to what effect.",
    retrievalMechanism: "structured",
    requiresEmbeddings: false,
  },
};

export function getRacSourceTypeMetadata(
  sourceType: RacSourceType,
): RacSourceTypeMetadata {
  return RAC_SOURCE_TYPE_METADATA[sourceType];
}

/**
 * Owner module that registered the source. Promoted from a union to a
 * tuple-derived constant at T-A.10 so it.each-style lockstep tests can
 * enumerate every value.
 */
export const RAC_OWNER_MODULES = [
  "agentStudio",
  "dataAnalysis",
  "projectsSystem",
  "external",
] as const;

export type RacOwnerModule = (typeof RAC_OWNER_MODULES)[number];

// ============================================================================
// Per-owner-module operator-facing metadata (T-A.10)
// ============================================================================

export interface RacOwnerModuleMetadata {
  /** Display label rendered in the source registry UI. */
  readonly label: string;
  /** Short operator-facing description of who owns sources from this
   *  module. */
  readonly description: string;
  /** Whether sources owned by this module are first-party Agent Studio
   *  domain (true) or live outside Agent Studio's mutation scope (false). */
  readonly firstParty: boolean;
}

export const RAC_OWNER_MODULE_METADATA: Readonly<
  Record<RacOwnerModule, RacOwnerModuleMetadata>
> = {
  agentStudio: {
    label: "Agent Studio",
    description:
      "First-party Agent Studio sources — CAG packs, knowledge units, tool knowledge mirrors. Owned by the workspace's Agent Studio module.",
    firstParty: true,
  },
  dataAnalysis: {
    label: "Data Analysis",
    description:
      "Sources registered by the Data Analysis subsystem — typically GraphRAG indexes mounted via `dataAnalysis.graphRag.*` tRPC.",
    firstParty: false,
  },
  projectsSystem: {
    label: "Projects System",
    description:
      "Sources registered by the Projects System — project-scoped document collections and per-project knowledge bases.",
    firstParty: false,
  },
  external: {
    label: "External",
    description:
      "Third-party retrieval sources mounted through the connector framework. Outputs flow through governance but the underlying index lives outside Agent Studio.",
    firstParty: false,
  },
};

export function getRacOwnerModuleMetadata(
  ownerModule: RacOwnerModule,
): RacOwnerModuleMetadata {
  return RAC_OWNER_MODULE_METADATA[ownerModule];
}

// ── Profile ────────────────────────────────────────────────────────

export interface RacProfile {
  id: number;
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  profileKey: string;
  enabled: boolean;
  /** Per-profile retrieval timeout override (D-RET-6). Null → 3000 ms default. */
  timeoutMs: number | null;
  notes: string | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProfileInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  profileKey?: string;
  enabled?: boolean;
  timeoutMs?: number | null;
  notes?: string | null;
  createdBy: number;
}

export interface UpdateProfileInput {
  profileId: number;
  enabled?: boolean;
  timeoutMs?: number | null;
  notes?: string | null;
}

// ── Source ─────────────────────────────────────────────────────────

export interface RacSource {
  id: number;
  workspaceId: number;
  profileId: number;
  sourceType: RacSourceType;
  ownerModule: RacOwnerModule;
  externalRefId: string | null;
  displayName: string | null;
  enabled: boolean;
  priority: number;
  // D-EMB-1
  embeddingProviderConnectionId: number | null;
  embeddingModelRef: string | null;
  embeddingModelDim: number | null;
  embeddingModelVersion: string | null;
  embeddingModelPinnedAt: Date | null;
  // D-RET-2
  chunkSizeOverride: number | null;
  chunkOverlapOverride: number | null;
  metadataJson: Record<string, unknown> | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSourceInput {
  workspaceId: number;
  profileId: number;
  sourceType: RacSourceType;
  ownerModule: RacOwnerModule;
  externalRefId?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  priority?: number;
  embeddingProviderConnectionId?: number | null;
  embeddingModelRef?: string | null;
  embeddingModelDim?: number | null;
  embeddingModelVersion?: string | null;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  metadataJson?: Record<string, unknown> | null;
  createdBy: number;
}

export interface UpdateSourceInput {
  sourceId: number;
  enabled?: boolean;
  priority?: number;
  displayName?: string | null;
  embeddingProviderConnectionId?: number | null;
  embeddingModelRef?: string | null;
  embeddingModelDim?: number | null;
  embeddingModelVersion?: string | null;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  metadataJson?: Record<string, unknown> | null;
}

// ── Policy ─────────────────────────────────────────────────────────

export interface RacPolicy {
  id: number;
  workspaceId: number;
  profileId: number;
  /** D-RET-5: NULL → "use canonical default" */
  minScore: number | null;
  maxChunks: number | null;
  dedupeBy: string | null;
  freshnessMaxAgeDays: number | null;
  citationRequired: boolean | null;
  sourcePermissionFilter: string | null;
  piiPolicy: "warn" | "block" | "none" | null;
  licensePolicy: "warn" | "block" | "none" | null;
  /**
   * U5-b.3: per-policy `string[]` of blocklisted license values.
   * Consumed by the retrieval filter when `licensePolicy === "block"`.
   * NULL or empty = no blocking even when policy is "block"
   * (operator misconfiguration warning).
   */
  licenseBlocklist: string[] | null;
  timeoutMs: number | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPolicyInput {
  workspaceId: number;
  profileId: number;
  minScore?: number | null;
  maxChunks?: number | null;
  dedupeBy?: string | null;
  freshnessMaxAgeDays?: number | null;
  citationRequired?: boolean | null;
  sourcePermissionFilter?: string | null;
  piiPolicy?: "warn" | "block" | "none" | null;
  licensePolicy?: "warn" | "block" | "none" | null;
  licenseBlocklist?: string[] | null;
  timeoutMs?: number | null;
  createdBy: number;
}

// ── Workspace embedding default ───────────────────────────────────

export interface RacWorkspaceEmbeddingDefault {
  workspaceId: number;
  embeddingProviderConnectionId: number;
  embeddingModelRef: string;
  embeddingModelDim: number;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertWorkspaceEmbeddingDefaultInput {
  workspaceId: number;
  embeddingProviderConnectionId: number;
  embeddingModelRef: string;
  embeddingModelDim: number;
  createdBy: number;
}

// ── Errors ─────────────────────────────────────────────────────────

/**
 * Thrown when `createSource` is called without an embedding ref AND
 * the workspace has no embedding default set (D-EMB-5: no silent
 * vendor fallback). Caller must either:
 *   1. Provide explicit embedding refs on the source row, or
 *   2. Set a workspace default first via
 *      `upsertWorkspaceEmbeddingDefault`.
 */
export class EmbeddingDefaultRequiredError extends Error {
  readonly code = "embedding_default_required";
  constructor(workspaceId: number) {
    super(
      `Workspace ${workspaceId} has no embedding default and the source row supplied no embedding refs. ` +
        `Set a workspace default first or provide (embeddingProviderConnectionId, embeddingModelRef, embeddingModelDim) on the source.`,
    );
    this.name = "EmbeddingDefaultRequiredError";
  }
}
