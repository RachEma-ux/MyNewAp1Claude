/**
 * CAG (Capability Pack) types — RAC Phase 1A.
 *
 * Public types only. No DB instance, no I/O. Other services and tests
 * import from this file (or from `./index.ts` barrel) without pulling
 * the store/events runtime.
 */

export type CagPackStatus = "fresh" | "stale" | "archived" | "invalid";

export type CagPackEventType =
  | "pack_created"
  | "pack_marked_stale"
  | "pack_archived"
  | "pack_used"
  | "pack_validation_failed"
  | "pack_refresh_skipped"
  | "pack_refresh_forced";

export type CagPackEventSeverity = "info" | "warn" | "error";

export type CagPackActorType = "system" | "user" | "scheduler" | "runtime";

/**
 * Tool risk taxonomy per D-TOOL-1 (RAC_TOOL_CLASSIFICATION.md).
 * Fixed enumeration; no `unknown` after P0.6. New tools enter as `quarantined`.
 *
 * READ from the MCP manifest (D-TOOL-2). Never derived inside CAG.
 */
export type ToolRiskClass =
  | "read_only"
  | "write"
  | "external_side_effect"
  | "destructive"
  | "credential_sensitive"
  | "code_execution"
  | "governance_sensitive"
  | "quarantined";

/**
 * Capability pack content — the JSON written to
 * `ags_cag_capability_packs.content_json`. Built by the P1B builder,
 * consumed by the P1B renderer to produce a `SystemPromptSection`.
 *
 * Per D-TOOL-3, MUST NOT carry raw input schema JSON or example
 * invocations. Per D-PRM-4 Collision A, the renderer strips the mission
 * line — `mission` is included here for traceability but never rendered.
 */
export interface CapabilityPackContent {
  identity: {
    agentId: number;
    agentDraftId: number;
    name: string;
    role: string | null;
    scope: string | null;
  };
  /** Stored for traceability; renderer drops it (D-PRM-4 Collision A). */
  mission: string | null;
  skills: Array<{
    id: number;
    name: string;
    summary: string;
  }>;
  /** Tools available to this agent. `quarantined` and `credential_sensitive` excluded by builder. */
  tools: Array<{
    name: string;
    serverId: number;
    serverName: string;
    summary: string;
    riskClass: ToolRiskClass;
    approvalRequired: boolean;
    sandboxRequired: boolean;
  }>;
  /** What the pack is *about*; mirrors `sourceManifestJson.entries`. */
  sources: Array<{ sourceType: string; refId: string }>;
}

/**
 * The single output shape every section producer (CAG renderer, RAC
 * assembler) returns to the composer (D-PRM-1).
 */
export interface SystemPromptSection {
  /** Stable section id — `"capability-pack"` for CAG, `"retrieval-evidence"` for the P5 RAC assembler. The composer (P1C) overrides this id when emitting; the union is widened so both producers can return a type-honest section without casting. */
  id: "capability-pack" | "retrieval-evidence";
  text: string;
  tokenEstimate: number;
  /** SHA-256 of `text`; input to the prompt cache key (D-PRM-5). */
  contentHash: string;
  /** Non-fatal notes (truncations, dropped tools, hash drift). */
  warnings: string[];
}

/**
 * Source manifest entry — what the pack is *about*. Each entry carries
 * a stable hash so reuse / staleness can be decided without re-fetching
 * the source. See `hashing.ts` for the canonical hash function.
 */
export interface CagSourceManifestEntry {
  /** 'agent_draft' | 'mcp_snapshot' | 'skills' | 'subagents' | ... */
  sourceType: string;
  /** External ref (draftId, serverId, packKey, ...) — opaque to the store. */
  refId: string;
  /** SHA-256 of the canonical JSON serialization of the source. */
  hash: string;
  /** Optional version label / display string. */
  version?: string;
}

/**
 * Public projection of an `ags_cag_capability_packs` row. Excludes
 * internal columns that may carry incidental large payloads in
 * future migrations.
 */
export interface CagCapabilityPack {
  id: number;
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  catalogEntryId: number | null;
  packType: string;
  packVersion: number;
  status: CagPackStatus;
  contentJson: Record<string, unknown>;
  compressedPrompt: string | null;
  tokenEstimate: number | null;
  sourceManifestJson: { entries: CagSourceManifestEntry[] };
  /** Map of sourceType:refId -> hash, for fast staleness checks. */
  sourceHashesJson: Record<string, string>;
  injectionPolicyJson: Record<string, unknown> | null;
  riskSummaryJson: Record<string, unknown> | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

export interface CreatePackInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  catalogEntryId?: number | null;
  packType?: string;
  contentJson: Record<string, unknown>;
  compressedPrompt?: string | null;
  tokenEstimate?: number | null;
  sourceManifest: CagSourceManifestEntry[];
  injectionPolicy?: Record<string, unknown> | null;
  riskSummary?: Record<string, unknown> | null;
  createdBy: number;
  expiresAt?: Date | null;
}

export interface CreatePackResult {
  pack: CagCapabilityPack;
  /** True iff a pack with identical source hashes already existed and was returned instead of inserted. */
  reused: boolean;
}

export interface CagPackEvent {
  id: number;
  workspaceId: number;
  agentDraftId: number;
  packId: number | null;
  eventType: CagPackEventType | string;
  eventSeverity: CagPackEventSeverity;
  reason: string | null;
  oldHash: string | null;
  newHash: string | null;
  runtimeRunId: number | null;
  actorType: CagPackActorType | string | null;
  sourceType: string | null;
  packVersion: number | null;
  createdBy: number | null;
  createdAt: Date;
  metadataJson: Record<string, unknown> | null;
}

export interface AppendEventInput {
  workspaceId: number;
  agentDraftId: number;
  packId?: number | null;
  eventType: CagPackEventType | string;
  eventSeverity?: CagPackEventSeverity;
  reason?: string | null;
  oldHash?: string | null;
  newHash?: string | null;
  runtimeRunId?: number | null;
  actorType?: CagPackActorType | string | null;
  sourceType?: string | null;
  packVersion?: number | null;
  createdBy?: number | null;
  metadata?: Record<string, unknown> | null;
}
