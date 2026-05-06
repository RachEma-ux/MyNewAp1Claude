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

/** Owner module that registered the source. */
export type RacOwnerModule =
  | "agentStudio"
  | "dataAnalysis"
  | "projectsSystem"
  | "external";

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
