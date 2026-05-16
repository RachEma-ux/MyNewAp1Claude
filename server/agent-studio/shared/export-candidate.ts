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
import type { ToolRiskClass } from "../services/cag/types";

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

/**
 * RAC P10 — Export-time RAC readiness verdict (D-TOOL-4 + D-SBX-2).
 *
 *   - `"ready"`     — agent uses only `read_only` tools, OR uses
 *                     `code_execution` and the sandbox is healthy.
 *   - `"degraded"`  — agent uses one or more side-effecting risk
 *                     classes (write / external_side_effect / destructive /
 *                     governance_sensitive / credential_sensitive). Export
 *                     proceeds; the wizard surfaces the warning.
 *   - `"blocked"`   — hard-block: agent includes a `quarantined` tool,
 *                     OR uses `code_execution` while the sandbox
 *                     prerequisite (D-SBX-2) is unmet.
 *
 * Per D-TOOL-5 the underlying `riskClass` lookup MUST come from the
 * MCP tool registry; this DTO only carries the resolved verdict and
 * the small `toolRisk` summary the UI renders.
 */
/**
 * Closed-taxonomy RAC readiness status. Promoted to a tuple at T-A.13
 * so the metadata table + lockstep tests can be authored.
 */
export const RAC_READINESS_STATUSES = [
  "ready",
  "degraded",
  "blocked",
] as const;
export type RacReadinessStatus = (typeof RAC_READINESS_STATUSES)[number];

// ============================================================================
// Per-readiness-status operator-facing metadata (T-A.13)
// ============================================================================

export interface RacReadinessStatusMetadata {
  /** Display label rendered in the export-readiness banner. */
  readonly label: string;
  /** Short operator-facing description of what this readiness status
   *  means for downstream export / dispatch. */
  readonly description: string;
  /** Whether export may proceed at this status (true for `ready` +
   *  `degraded`; false for `blocked` which hard-stops the export). */
  readonly allowsExport: boolean;
  /** Whether the operator should investigate at this status (true
   *  for `degraded` + `blocked`; false for `ready` which is the
   *  no-action baseline). */
  readonly requiresInvestigation: boolean;
}

export const RAC_READINESS_STATUS_METADATA: Readonly<
  Record<RacReadinessStatus, RacReadinessStatusMetadata>
> = {
  ready: {
    label: "Ready",
    description:
      "RAC readiness checks all passed — sources fresh, planner healthy, sandbox precondition met. Export proceeds normally.",
    allowsExport: true,
    requiresInvestigation: false,
  },
  degraded: {
    label: "Degraded",
    description:
      "RAC readiness checks passed with caveats — soft warnings (source staleness, optional dependency unhealthy). Export proceeds; operator should glance.",
    allowsExport: true,
    requiresInvestigation: true,
  },
  blocked: {
    label: "Blocked",
    description:
      "RAC readiness checks hard-failed — required source missing, sandbox prerequisite unmet for a code_execution tool, planner error. Export refuses.",
    allowsExport: false,
    requiresInvestigation: true,
  },
};

export function getRacReadinessStatusMetadata(
  status: RacReadinessStatus,
): RacReadinessStatusMetadata {
  return RAC_READINESS_STATUS_METADATA[status];
}

/**
 * Snapshot of the tool-sandbox health at the moment readiness was
 * computed. `null` when no sandbox impl is registered (treated as a
 * hard-block precondition for `code_execution`).
 */
export interface AgentStudioSandboxHealthSnapshot {
  ok: boolean;
  /** Concrete impl name, e.g. `"node-vm"`. */
  impl: string;
}

export interface AgentStudioRacReadinessSnapshot {
  status: RacReadinessStatus;
  /**
   * Stable codes — used by audit + the wizard badge tooltip. Examples:
   * `"sandbox_required"`, `"quarantined_tool"`,
   * `"write_requires_approval"`, etc. Order matches the matrix walk so
   * audit diffs are deterministic.
   */
  reasons: string[];
  /** Compact summary so the UI doesn't need the full risk-class list. */
  toolRisk: {
    hasReadOnly: boolean;
    hasRisky: boolean;
    hasCodeExecution: boolean;
    hasQuarantined: boolean;
    /** Distinct ToolRiskClass values observed on this agent. */
    classes: ToolRiskClass[];
  };
  /** null when the sandbox registry is unbound (hard-block precondition). */
  sandboxHealth: AgentStudioSandboxHealthSnapshot | null;
  computedAt: string;
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

  // RAC P10 export-time verdict (D-TOOL-4 + D-SBX-2 hard-block matrix).
  racReadiness: AgentStudioRacReadinessSnapshot;

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
  "racReadiness",
  "binding",
  "capabilities",
  "sourceModule",
  "sourceRefId",
  "activeSourceVersionId",
  "exportStatus",
] as const;
export type AgentStudioExportCandidateKey =
  (typeof AGENT_STUDIO_EXPORT_CANDIDATE_KEYS)[number];

// ============================================================================
// Per-export-candidate-key operator-facing metadata (T-E.5)
// ============================================================================

export type AgentStudioExportCandidateKeyCategory =
  | "identity"
  | "lifecycle"
  | "binding"
  | "provenance";

export interface AgentStudioExportCandidateKeyMetadata {
  /** Display label rendered in the export-candidate review UI. */
  readonly label: string;
  /** Short operator-facing description of what this key carries and
   *  why an export consumer would read it. */
  readonly description: string;
  /** Closed-taxonomy category for grouping the candidate-review panel
   *  in the UI. */
  readonly category: AgentStudioExportCandidateKeyCategory;
  /** Whether the value of this key is itself drawn from a closed
   *  enum elsewhere in the codebase (true for `lifecycleState`,
   *  `readiness`, `governance`, `racReadiness`, `exportStatus`,
   *  `sourceModule`; false for the rest which are scalar IDs / free
   *  strings / object shapes). */
  readonly isClosedTaxonomyValue: boolean;
}

export const AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA: Readonly<
  Record<
    AgentStudioExportCandidateKey,
    AgentStudioExportCandidateKeyMetadata
  >
> = {
  workspaceId: {
    label: "Workspace ID",
    description:
      "Owning workspace UUID for this export candidate — scopes export consumer queries by tenant.",
    category: "identity",
    isClosedTaxonomyValue: false,
  },
  agentId: {
    label: "Agent ID",
    description:
      "Agent UUID this candidate exports. Stable across versions of the same agent.",
    category: "identity",
    isClosedTaxonomyValue: false,
  },
  versionId: {
    label: "Version ID",
    description:
      "Agent-version UUID this candidate exports. Distinguishes one ready release from another.",
    category: "identity",
    isClosedTaxonomyValue: false,
  },
  name: {
    label: "Name",
    description:
      "Display name of the agent at this version — surfaced in the consumer's catalog.",
    category: "identity",
    isClosedTaxonomyValue: false,
  },
  lifecycleState: {
    label: "Lifecycle State",
    description:
      "AGS lifecycle state of this version (one of AGS_LIFECYCLE_STATES). Export only fires for ready states.",
    category: "lifecycle",
    isClosedTaxonomyValue: true,
  },
  readiness: {
    label: "Readiness",
    description:
      "Coarse readiness verdict (one of AGS_GOVERNANCE_VERDICTS) — pass/warning/blocked.",
    category: "lifecycle",
    isClosedTaxonomyValue: true,
  },
  governance: {
    label: "Governance",
    description:
      "Governance verdict (one of AGS_GOVERNANCE_VERDICTS) — the cross-cut decision after policy evaluation.",
    category: "lifecycle",
    isClosedTaxonomyValue: true,
  },
  racReadiness: {
    label: "RAC Readiness",
    description:
      "RAC-specific readiness verdict (one of AGS_GOVERNANCE_VERDICTS) — surfaces source / planner / assembler health.",
    category: "lifecycle",
    isClosedTaxonomyValue: true,
  },
  binding: {
    label: "Binding",
    description:
      "Provider + model binding shape — what model this candidate ships against. Object value; not enumerated.",
    category: "binding",
    isClosedTaxonomyValue: false,
  },
  capabilities: {
    label: "Capabilities",
    description:
      "Capability hash / declared capability surface — what the agent claims to handle. Object value; not enumerated.",
    category: "binding",
    isClosedTaxonomyValue: false,
  },
  sourceModule: {
    label: "Source Module",
    description:
      "Originating internal module (one of AGS_SOURCE_MODULES) — disambiguates which Agent Studio surface produced this candidate.",
    category: "provenance",
    isClosedTaxonomyValue: true,
  },
  sourceRefId: {
    label: "Source Ref ID",
    description:
      "Foreign-key reference into the source module's domain (e.g., draft ID, release ID). Scalar; not enumerated.",
    category: "provenance",
    isClosedTaxonomyValue: false,
  },
  activeSourceVersionId: {
    label: "Active Source Version ID",
    description:
      "Version pointer into the source module's history — pins what was active when the candidate was emitted.",
    category: "provenance",
    isClosedTaxonomyValue: false,
  },
  exportStatus: {
    label: "Export Status",
    description:
      "Closed-taxonomy export status (per export-pipeline state vocabulary) — surfaces queued / pushed / failed.",
    category: "lifecycle",
    isClosedTaxonomyValue: true,
  },
};

export function getAgentStudioExportCandidateKeyMetadata(
  key: AgentStudioExportCandidateKey,
): AgentStudioExportCandidateKeyMetadata {
  return AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[key];
}

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
export type ForbiddenExportCandidateKey =
  (typeof FORBIDDEN_EXPORT_CANDIDATE_KEYS)[number];

// ============================================================================
// Per-forbidden-key operator-facing metadata (T-E.6)
// ============================================================================

export type ForbiddenExportCandidateKeyLeakClass =
  | "agent_studio_internal"
  | "release_internal"
  | "draft_internal"
  | "env_handoff";

export interface ForbiddenExportCandidateKeyMetadata {
  /** Display label rendered in the contract-violation report. */
  readonly label: string;
  /** Short operator-facing description of what kind of secret /
   *  privileged content this key would leak if it ever appeared on
   *  the export candidate shape. */
  readonly description: string;
  /** Closed-taxonomy classification of the leak surface. */
  readonly leakClass: ForbiddenExportCandidateKeyLeakClass;
  /** Whether the field name suggests the value would directly carry
   *  credential material (true for apiKey / secret / secrets /
   *  credentials / bearerToken / providerConfig). False for
   *  indirection keys (apiKeyEnvVar / envVar / env / process) and
   *  privileged-content keys (releaseNotes / approvalStateJson /
   *  systemInstructions / roleInstructions). */
  readonly isCredentialDirect: boolean;
}

export const FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA: Readonly<
  Record<
    ForbiddenExportCandidateKey,
    ForbiddenExportCandidateKeyMetadata
  >
> = {
  providerConfig: {
    label: "providerConfig",
    description:
      "Agent Studio provider configuration object — frequently contains nested apiKey / bearerToken fields. Must never cross the export boundary.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  apiKey: {
    label: "apiKey",
    description:
      "Bare API key string — the canonical credential leak. Must never appear on the export candidate.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  apiKeyEnvVar: {
    label: "apiKeyEnvVar",
    description:
      "Indirection pointer to the env var name that holds the API key — leaks deployment shape and can identify the secret slot.",
    leakClass: "env_handoff",
    isCredentialDirect: false,
  },
  secret: {
    label: "secret",
    description:
      "Generic single-secret slot — could carry any credential value. Must never appear on the export candidate.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  secrets: {
    label: "secrets",
    description:
      "Generic multi-secret slot — could carry any credential value(s). Must never appear on the export candidate.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  credentials: {
    label: "credentials",
    description:
      "Generic credentials slot — typically a tuple or object holding username/password or token. Must never appear on the export candidate.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  bearerToken: {
    label: "bearerToken",
    description:
      "Bare bearer-token string — the canonical OAuth-style credential leak. Must never appear on the export candidate.",
    leakClass: "agent_studio_internal",
    isCredentialDirect: true,
  },
  releaseNotes: {
    label: "releaseNotes",
    description:
      "Release-internal prose — may reference unreleased products, internal SLOs, or confidential incident details. Not for consumer export.",
    leakClass: "release_internal",
    isCredentialDirect: false,
  },
  approvalStateJson: {
    label: "approvalStateJson",
    description:
      "Release-internal approval state — exposes the approver chain and rejection reasons. Not for consumer export.",
    leakClass: "release_internal",
    isCredentialDirect: false,
  },
  systemInstructions: {
    label: "systemInstructions",
    description:
      "Draft-internal system prompt prose — operator IP / proprietary instructions. Not for consumer export.",
    leakClass: "draft_internal",
    isCredentialDirect: false,
  },
  roleInstructions: {
    label: "roleInstructions",
    description:
      "Draft-internal role-block prose — operator IP / proprietary role wiring. Not for consumer export.",
    leakClass: "draft_internal",
    isCredentialDirect: false,
  },
  envVar: {
    label: "envVar",
    description:
      "Env-var name reference — leaks deployment shape and can identify privileged slot names.",
    leakClass: "env_handoff",
    isCredentialDirect: false,
  },
  env: {
    label: "env",
    description:
      "Generic env-bag — could carry arbitrary environment values, including credentials. Must never appear on the export candidate.",
    leakClass: "env_handoff",
    isCredentialDirect: false,
  },
  process: {
    label: "process",
    description:
      "Node `process` surface — leaks the entire host process including process.env. Must never appear on the export candidate.",
    leakClass: "env_handoff",
    isCredentialDirect: false,
  },
};

export function getForbiddenExportCandidateKeyMetadata(
  key: ForbiddenExportCandidateKey,
): ForbiddenExportCandidateKeyMetadata {
  return FORBIDDEN_EXPORT_CANDIDATE_KEY_METADATA[key];
}
