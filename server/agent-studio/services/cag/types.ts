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
