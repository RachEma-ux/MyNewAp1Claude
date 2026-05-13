/**
 * Publish-target contracts — Phase 19-α V1+ first slice.
 *
 * Closed type taxonomy:
 *   - `PublishTargetType` is the 3-value union per the V1+ plan.
 *     Additive extensions ("custom_webhook", etc.) require a new
 *     ADR + this union update + a new pusher branch.
 *   - `PublishExecutionStatus` is the 4-value lifecycle ladder.
 *
 * Hard-rule boundary (Plan v3 D1):
 *   - The pusher receives `ResolvedProviderCredentialContext` from
 *     `withProviderCredential` — never raw env vars, never the PAT
 *     string. Tests verify this via source-scan (no
 *     `process.env.*_API_KEY` reads in the service body).
 */

import type { ResolvedProviderCredentialContext } from "../../../provider-connections/internal/credential-resolver.js";

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
 * via the registry below. The pusher receives either a resolved
 * credential context (Plan v3 D1) OR null (anonymous targets).
 */
export type PublishPusher = (input: {
  readonly target: PublishTargetRecord;
  readonly payload: PublishPayload;
  readonly credential: ResolvedProviderCredentialContext | null;
}) => Promise<PublishExecutionOutcome>;
