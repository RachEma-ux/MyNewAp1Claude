/**
 * Publish-target contracts — Phase 19-α V1+ first slice.
 *
 * Closed type taxonomy:
 *   - `PublishTargetType` is the 3-value union per the V1+ plan.
 *     Additive extensions ("custom_webhook", etc.) require a new
 *     ADR + this union update + a new pusher branch.
 *   - `PublishExecutionStatus` is the 4-value lifecycle ladder.
 *
 * Hard-rule boundary (Plan v3 D2):
 *   - The publish-targets module does NOT import the internal
 *     credential resolver (D2 restricts that import to
 *     `server/openrouter/model-access/**`).
 *   - Credential acquisition is the pusher's responsibility via
 *     dependency injection. A pusher that needs AI-provider
 *     credentials registers a `credentialProvider` that routes
 *     through Model Access; a pusher for a webhook / signed-URL
 *     target uses its own scoped credential surface.
 *   - The publish-targets executor ONLY passes the bound
 *     `providerConnectionId` reference and the optional
 *     credential-provider result to the pusher; it never resolves
 *     a credential itself.
 *
 * Source-scan tested: no `process.env.*_API_KEY` reads in any
 * publish-targets file; no `credential-resolver` import.
 */

export const PUBLISH_TARGET_TYPES = [
  "staging_env",
  "remote_vault",
  "external_kb",
] as const;

export type PublishTargetType = (typeof PUBLISH_TARGET_TYPES)[number];

export function isPublishTargetType(s: unknown): s is PublishTargetType {
  return (
    typeof s === "string" &&
    (PUBLISH_TARGET_TYPES as readonly string[]).includes(s)
  );
}

export const PUBLISH_EXECUTION_STATUSES = [
  "pending",
  "in_flight",
  "succeeded",
  "failed",
] as const;

export type PublishExecutionStatus =
  (typeof PUBLISH_EXECUTION_STATUSES)[number];

export interface PublishTargetRecord {
  readonly id: number;
  readonly targetKey: string;
  readonly targetType: PublishTargetType;
  readonly endpoint: string;
  /** Reference to the bound `provider_connections` row. The pusher
   *  uses this ID to look up its own credential surface — the
   *  publish-targets module itself never resolves the credential. */
  readonly providerConnectionId: number | null;
  readonly config: Record<string, unknown> | null;
  readonly enabled: boolean;
}

export interface PublishPayload {
  /** The source `agsNotePromotions.id` — rollback anchor. */
  readonly sourcePromotionId: number;
  /** The frozen source-note version id, if available. */
  readonly sourceVersionId?: string;
  /** Application-layer payload to push. The shape is target-specific
   *  and the pusher is responsible for serializing it. */
  readonly body: unknown;
}

export interface PublishExecutionOutcome {
  readonly status: PublishExecutionStatus;
  readonly upstreamArtifactId?: string;
  readonly payloadDigest?: string;
  readonly errorMessage?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Pusher contract — each `PublishTargetType` registers one pusher
 * via the registry. The pusher receives the target record + payload
 * and is responsible for acquiring its own credentials (typically
 * from a closure captured at registration time, or via Model Access
 * for AI-bound targets).
 */
export type PublishPusher = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
}) => Promise<PublishExecutionOutcome>;

// ============================================================================
// V1+ Phase 19-γ — governance gate (publish-request workflow)
// ============================================================================

/**
 * Closed governance decision taxonomy. The executor branches on
 * this value:
 *   - `"approved"`  → run the pusher (in_flight → succeeded/failed).
 *   - `"pending"`   → stage a `pending` ledger row; do not run the
 *                     pusher. Caller re-invokes after governance
 *                     sign-off.
 *   - `"rejected"`  → stage a `failed` ledger row with errorMessage
 *                     `"governance_rejected"`. Pusher never runs.
 */
export const GOVERNANCE_DECISIONS = [
  "approved",
  "pending",
  "rejected",
] as const;

export type GovernanceDecision = (typeof GOVERNANCE_DECISIONS)[number];

export function isGovernanceDecision(s: unknown): s is GovernanceDecision {
  return (
    typeof s === "string" &&
    (GOVERNANCE_DECISIONS as readonly string[]).includes(s)
  );
}

/**
 * Optional governance gate. When omitted, the executor proceeds as
 * if the gate returned `"approved"` (backward compatible with the
 * Phase 19-α + β executor).
 *
 * Real governance integration (wiring through `agsApprovalSteps` +
 * `evaluateGovernance`) is operator-supplied via this hook; the
 * executor itself stays governance-agnostic.
 */
export type GovernanceGateFn = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
}) => Promise<GovernanceDecision>;
