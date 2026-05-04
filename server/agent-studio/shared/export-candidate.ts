/**
 * Plan v3 Phase 29 — Agent Studio Export Catalog candidate contract.
 *
 * `AgentStudioExportCandidate` is the cross-module type read by Phase 25's
 * `aiTypes.catalog.register` (when registering an Agent Studio agent into the
 * catalog) and exposed via Phase 30's `agentStudio.exportCatalog.*` gateway
 * actions.
 *
 * The contract is **closed**: no fields beyond those declared here may be
 * carried across the export boundary. In particular:
 *   - No raw API keys, no provider credentials, no internal env-var names.
 *   - No `ags_agent_drafts.providerConfig` raw blob (that's Agent-Studio-internal).
 *   - No `ags_agent_releases.releaseNotes` body (treat as Agent-Studio-internal
 *     until/unless explicitly opted into the catalog audit).
 *
 * Field naming follows Phase 27/28's conventions exactly so the candidate
 * can be assembled directly from `computeExportGovernanceVerdict` +
 * `computeAgentReadinessSnapshot` without remapping.
 */

import type { ExportGovernanceStatus } from "../services/governance-adapter";

/**
 * Status of the export pipeline for one candidate. Distinct from the
 * agent's lifecycle state — an agent can be `published` but not yet
 * `exported`, or `exported` but `unresolved` if the catalog row got
 * Phase-24-flagged as `legacy_imported_unresolved`.
 */
export type AgentStudioExportStatus =
  | "not_started"
  | "ready"
  | "exported"
  | "blocked"
  | "unresolved";

/**
 * Status of the agent's provider binding — read-side snapshot only;
 * this is NOT the binding row itself, it's the export-side projection
 * of "is this binding usable right now?".
 */
export type AgentStudioBindingStatus =
  | "binding_v1" // provider/model binding via Phase 11+
  | "legacy_no_credential" // Phase 10 classification
  | "legacy_unresolved" // Phase 10 classification
  | "missing"; // no binding row at all

export interface AgentStudioGovernanceVerdictSnapshot {
  status: ExportGovernanceStatus;
  computedBy: string;
  computedAt: string;
  /** Receipt id when computed under a receipt-bearing flow; else null. */
  receiptId: string | null;
  /** Stable-ordered list of blocker rule ids (no message bodies — that's UI concern). */
  blockerRules: string[];
}

export interface AgentStudioReadinessSnapshot {
  readinessScore: number; // 0–100
  readinessComputedBy: string;
  readinessComputedAt: string;
  publishReady: boolean;
}

export interface AgentStudioExportCandidate {
  // Identity
  workspaceId: number;
  agentId: number;
  /** ags_agents.publishedVersionId — the active version pointer. */
  versionId: number;
  /** Public-facing display name (ags_agents.name). */
  name: string;
  /** Lifecycle state from Agent Studio (one of AGS_LIFECYCLE_STATES). */
  lifecycleState: string;

  // Verdicts (Phase 27 + Phase 28 outputs)
  readiness: AgentStudioReadinessSnapshot;
  governance: AgentStudioGovernanceVerdictSnapshot;

  // Binding + provider/model refs (Phase 11+ / Phase 8)
  binding: {
    status: AgentStudioBindingStatus;
    providerConnectionId: number | null;
    /** Catalog-side provider entry id; null when unresolved. */
    providerCatalogEntryId: number | null;
    /** Catalog-side model entry id; null when unresolved. */
    modelCatalogEntryId: number | null;
  };

  // Capabilities — strings only (no policies, no tool-internal config).
  capabilities: string[];

  // Source linkage — directly populates catalog_entries.{sourceType, sourceId, activeSourceVersionId}.
  sourceModule: "agentStudio";
  sourceRefId: number; // = agentId
  /** ags_agent_releases.id of the published release; null until publish flips. */
  activeSourceVersionId: number | null;

  // Export pipeline status (Phase 30 will read/write).
  exportStatus: AgentStudioExportStatus;
}

// ───────────────────────────────────────────────────────────────────
// Helpers used by tests + the Phase 30 listCandidates implementation
// to keep the contract honest.
// ───────────────────────────────────────────────────────────────────

/**
 * The exhaustive set of allowed top-level keys. Used by the test
 * suite to assert that `AgentStudioExportCandidate` cannot grow
 * unannounced fields (e.g., a future PR accidentally leaking
 * `providerConfig`).
 */
export const AGENT_STUDIO_EXPORT_CANDIDATE_KEYS = [
  "workspaceId",
  "agentId",
  "versionId",
  "name",
  "lifecycleState",
  "readiness",
  "governance",
  "binding",
  "capabilities",
  "sourceModule",
  "sourceRefId",
  "activeSourceVersionId",
  "exportStatus",
] as const;

/**
 * Keys that have historically been (or could plausibly become) the source of
 * a secret leak across the export boundary. The Phase 29 contract test asserts
 * none of these names appear anywhere on the candidate shape.
 */
export const FORBIDDEN_EXPORT_CANDIDATE_KEYS = [
  // Agent Studio internals
  "providerConfig",
  "apiKey",
  "apiKeyEnvVar",
  "secret",
  "secrets",
  "credentials",
  "bearerToken",
  // Release-internal
  "releaseNotes",
  "approvalStateJson",
  // Draft-internal
  "systemInstructions",
  "roleInstructions",
  // Anything that smells like an env handoff
  "envVar",
  "env",
  "process",
] as const;
