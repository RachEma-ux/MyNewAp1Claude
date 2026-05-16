/**
 * CAG (Capability Pack) types — RAC Phase 1A.
 *
 * Public types only. No DB instance, no I/O. Other services and tests
 * import from this file (or from `./index.ts` barrel) without pulling
 * the store/events runtime.
 */

/**
 * Closed-taxonomy CAG pack lifecycle status. Promoted from a union to
 * a tuple-derived constant at T-G.40 so it.each-style lockstep tests
 * can enumerate every value and the metadata table below can drive
 * operator UX.
 */
export const CAG_PACK_STATUSES = [
  "fresh",
  "stale",
  "archived",
  "invalid",
] as const;
export type CagPackStatus = (typeof CAG_PACK_STATUSES)[number];

// ============================================================================
// Per-pack-status operator-facing metadata (T-G.40)
// ============================================================================

export interface CagPackStatusMetadata {
  /** Display label rendered in the CAG-pack admin panel. */
  readonly label: string;
  /** Short operator-facing description of what this status implies
   *  for runtime use of the pack. */
  readonly description: string;
  /** Whether the pack can be compiled into a runtime CAG block at
   *  this status (true for `fresh` only). */
  readonly compilable: boolean;
  /** Whether the pack is in a terminal lifecycle state (true for
   *  `archived` + `invalid` — operator-driven retirement vs failure;
   *  false for `fresh` + `stale` which are still live in some form). */
  readonly terminal: boolean;
}

export const CAG_PACK_STATUS_METADATA: Readonly<
  Record<CagPackStatus, CagPackStatusMetadata>
> = {
  fresh: {
    label: "Fresh",
    description:
      "Pack is current — passes freshness invariants and can be compiled into a runtime CAG block.",
    compilable: true,
    terminal: false,
  },
  stale: {
    label: "Stale",
    description:
      "Pack has aged past its freshness window — still usable for diagnostics but cannot compile into a runtime block until refreshed.",
    compilable: false,
    terminal: false,
  },
  archived: {
    label: "Archived",
    description:
      "Pack was retired by an operator decision — preserved for audit / lineage but no longer reachable from active routes.",
    compilable: false,
    terminal: true,
  },
  invalid: {
    label: "Invalid",
    description:
      "Pack failed validation — schema / governance / consistency check exposed a fault. Operator must remediate or archive.",
    compilable: false,
    terminal: true,
  },
};

export function getCagPackStatusMetadata(
  status: CagPackStatus,
): CagPackStatusMetadata {
  return CAG_PACK_STATUS_METADATA[status];
}

/**
 * Closed-taxonomy CAG pack event type. Promoted to a tuple at T-G.43
 * so the metadata table + lockstep tests can be authored.
 */
export const CAG_PACK_EVENT_TYPES = [
  "pack_created",
  "pack_marked_stale",
  "pack_archived",
  "pack_used",
  "pack_validation_failed",
  "pack_refresh_skipped",
  "pack_refresh_forced",
] as const;
export type CagPackEventType = (typeof CAG_PACK_EVENT_TYPES)[number];

// ============================================================================
// Per-event-type operator-facing metadata (T-G.43)
// ============================================================================

export interface CagPackEventTypeMetadata {
  /** Display label rendered in the pack event log type column. */
  readonly label: string;
  /** Short operator-facing description of when this event fires and
   *  what it indicates about the pack lifecycle. */
  readonly description: string;
  /** Default severity bucket — drives event-log default color coding.
   *  References `CAG_PACK_EVENT_SEVERITIES`. */
  readonly defaultSeverity: CagPackEventSeverity;
  /** Whether this event marks a pack lifecycle status transition
   *  (true for pack_created / pack_marked_stale / pack_archived;
   *  false for use / validation / refresh-decision events). */
  readonly isLifecycleTransition: boolean;
}

export const CAG_PACK_EVENT_TYPE_METADATA: Readonly<
  Record<CagPackEventType, CagPackEventTypeMetadata>
> = {
  pack_created: {
    label: "Pack Created",
    description:
      "A new pack was created — first lifecycle event for a pack ID. Pack starts in `fresh` status.",
    defaultSeverity: "info",
    isLifecycleTransition: true,
  },
  pack_marked_stale: {
    label: "Pack Marked Stale",
    description:
      "Freshness scanner or operator decision moved the pack from `fresh` → `stale`. Compile path stops accepting the pack.",
    defaultSeverity: "warn",
    isLifecycleTransition: true,
  },
  pack_archived: {
    label: "Pack Archived",
    description:
      "Operator decision moved the pack to `archived` (terminal). Pack is preserved for audit but is no longer reachable from active routes.",
    defaultSeverity: "info",
    isLifecycleTransition: true,
  },
  pack_used: {
    label: "Pack Used",
    description:
      "Runtime path compiled the pack into a CAG block for a request. High-volume event; informational only.",
    defaultSeverity: "info",
    isLifecycleTransition: false,
  },
  pack_validation_failed: {
    label: "Pack Validation Failed",
    description:
      "Schema / governance / consistency check rejected the pack. Operator must remediate or archive.",
    defaultSeverity: "error",
    isLifecycleTransition: false,
  },
  pack_refresh_skipped: {
    label: "Pack Refresh Skipped",
    description:
      "Refresh scheduler decided the pack was still fresh and skipped the rebuild. Routine; informational.",
    defaultSeverity: "info",
    isLifecycleTransition: false,
  },
  pack_refresh_forced: {
    label: "Pack Refresh Forced",
    description:
      "Operator or runtime forced a rebuild outside the freshness window. Warn-level because it signals abnormal urgency.",
    defaultSeverity: "warn",
    isLifecycleTransition: false,
  },
};

export function getCagPackEventTypeMetadata(
  type: CagPackEventType,
): CagPackEventTypeMetadata {
  return CAG_PACK_EVENT_TYPE_METADATA[type];
}

/**
 * Closed-taxonomy CAG pack event severity. Promoted to a tuple at
 * T-G.41 so the metadata table + lockstep tests can be authored.
 */
export const CAG_PACK_EVENT_SEVERITIES = ["info", "warn", "error"] as const;
export type CagPackEventSeverity = (typeof CAG_PACK_EVENT_SEVERITIES)[number];

// ============================================================================
// Per-event-severity operator-facing metadata (T-G.41)
// ============================================================================

export interface CagPackEventSeverityMetadata {
  /** Display label rendered in the CAG-pack event log filter. */
  readonly label: string;
  /** Short operator-facing description of when this severity fires
   *  and what triage urgency it implies. */
  readonly description: string;
  /** Stable rank 0-2 for severity comparison (0=info → 2=error). */
  readonly rank: 0 | 1 | 2;
  /** Whether this severity is an error condition the operator must
   *  triage (true for `error` only; info + warn are advisory). */
  readonly requiresTriage: boolean;
}

export const CAG_PACK_EVENT_SEVERITY_METADATA: Readonly<
  Record<CagPackEventSeverity, CagPackEventSeverityMetadata>
> = {
  info: {
    label: "Info",
    description:
      "Routine event — pack created, used, refresh skipped because still fresh. Operator review optional.",
    rank: 0,
    requiresTriage: false,
  },
  warn: {
    label: "Warn",
    description:
      "Anomalous event — pack marked stale, refresh forced, lifecycle transition that warrants a glance.",
    rank: 1,
    requiresTriage: false,
  },
  error: {
    label: "Error",
    description:
      "Failure event — pack validation failed, compile error, schema drift. Operator must triage.",
    rank: 2,
    requiresTriage: true,
  },
};

export function getCagPackEventSeverityMetadata(
  severity: CagPackEventSeverity,
): CagPackEventSeverityMetadata {
  return CAG_PACK_EVENT_SEVERITY_METADATA[severity];
}

/**
 * Closed-taxonomy CAG pack actor type — who emitted a pack lifecycle
 * event. Promoted at T-G.42 for the metadata table below.
 */
export const CAG_PACK_ACTOR_TYPES = [
  "system",
  "user",
  "scheduler",
  "runtime",
] as const;
export type CagPackActorType = (typeof CAG_PACK_ACTOR_TYPES)[number];

// ============================================================================
// Per-actor-type operator-facing metadata (T-G.42)
// ============================================================================

export interface CagPackActorTypeMetadata {
  /** Display label rendered in the pack event log actor column. */
  readonly label: string;
  /** Short operator-facing description of who or what fires events
   *  under this actor type. */
  readonly description: string;
  /** Whether emissions under this actor type carry an associated
   *  user ID (true for `user` only). */
  readonly requiresUserId: boolean;
  /** Whether this actor is automated (true for system / scheduler /
   *  runtime; false for `user`). */
  readonly isAutomated: boolean;
}

export const CAG_PACK_ACTOR_TYPE_METADATA: Readonly<
  Record<CagPackActorType, CagPackActorTypeMetadata>
> = {
  system: {
    label: "System",
    description:
      "Platform-level internal actor — boot-time emissions, migrations, fresh-install seeding. No operator behind the action.",
    requiresUserId: false,
    isAutomated: true,
  },
  user: {
    label: "User",
    description:
      "Operator-driven action — manual mark-stale, manual archive, manual refresh-force. Carries an attributable user ID.",
    requiresUserId: true,
    isAutomated: false,
  },
  scheduler: {
    label: "Scheduler",
    description:
      "Cron-driven action — periodic freshness scans, scheduled archival, retention sweeps. No operator behind the action.",
    requiresUserId: false,
    isAutomated: true,
  },
  runtime: {
    label: "Runtime",
    description:
      "Runtime-loop action — agent flow that touched the pack during execution (use / validate / refresh-skip). Triggered by live traffic.",
    requiresUserId: false,
    isAutomated: true,
  },
};

export function getCagPackActorTypeMetadata(
  actor: CagPackActorType,
): CagPackActorTypeMetadata {
  return CAG_PACK_ACTOR_TYPE_METADATA[actor];
}

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
  // Retrofit P5 — Cache-Augmented + governance metadata (D-CAG-RECON-2).
  /** SHA-256 of contentJson — keys cache reuse (D-CAG-RECON-3). */
  contentHash: string | null;
  /** SHA-256 of the rendered prompt section text (D-CAG-RECON-4). */
  compiledHash: string | null;
  /** Token estimate the renderer projected (separate from runtime actual). */
  tokenBudgetEstimate: number | null;
  /** Token estimate the runtime observed post-render. */
  tokenBudgetActual: number | null;
  /** 'ok' | 'warn' | 'error' — compile result from build/validate/render. */
  compileResult: CagCompileResult | null;
  /** Warnings collected during compile (empty array when clean). */
  compileWarnings: string[];
  /** 'cleared' | 'warn' | 'blocked' (D-CAG-RECON-5). */
  governanceVerdict: CagGovernanceVerdict | null;
  /** Rule ids when blocked or warn. */
  governanceBlockers: string[];
  /** Monotonic counter incremented on every chat-stream that loads the pack. */
  useCount: number;
}

/** Retrofit P5 compile-result enum. */
export type CagCompileResult = "ok" | "warn" | "error";

/** Retrofit P5 governance-verdict enum (D-CAG-RECON-5). */
export type CagGovernanceVerdict = "cleared" | "warn" | "blocked";

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
  // Retrofit P5 — optional compile + governance metadata. The store
  // computes contentHash if omitted; callers that already have it
  // (composer dry-run) can pass it through to avoid re-hashing.
  contentHash?: string | null;
  compiledHash?: string | null;
  tokenBudgetEstimate?: number | null;
  compileResult?: CagCompileResult | null;
  compileWarnings?: string[];
  governanceVerdict?: CagGovernanceVerdict | null;
  governanceBlockers?: string[];
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
