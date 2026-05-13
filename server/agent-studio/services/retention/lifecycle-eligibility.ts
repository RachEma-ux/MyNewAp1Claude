/**
 * Approval-lifecycle retention eligibility derivation.
 *
 * Pure derivers consume a fully-loaded row + linkage context and return
 * `{retentionEligible, retentionEligibleAt, retentionBlockers}`. Loaders
 * fetch the linkage context out of ASDB and invoke the deriver.
 *
 * Blocker codes:
 *   - NON_TERMINAL_STATE
 *   - NO_TERMINAL_TIMESTAMP             (state is terminal but terminalAt
 *                                         is null — backfill not yet
 *                                         applied, or unreliable pre-
 *                                         migration row)
 *   - MINIMUM_RETENTION_WINDOW_NOT_ELAPSED
 *   - ACTIVE_RELEASE_LINK
 *   - ACTIVE_DEPLOYMENT                  (alias of ACTIVE_RELEASE_LINK
 *                                         while the deployment surface
 *                                         is fused into the release row)
 *   - ACTIVE_PROMOTION_VERSION           (note-promotion only — sibling
 *                                         of ACTIVE_RELEASE_LINK)
 *   - PENDING_APPROVAL_CHAIN             (approval-step only — parent
 *                                         publish-request is non-terminal)
 *   - LEGAL_HOLD
 *   - AUDIT_HOLD
 *   - GOVERNANCE_HOLD
 *   - OPEN_GOVERNANCE_REVIEW
 *   - UNRESOLVED_AUDIT_INVESTIGATION
 *
 * Standing principle (user 2026-05-12 §0): "Do not weaken the retention
 * predicate to fit the current schema." Every blocker code must produce
 * `retentionEligible: false`. The retention sweep never sees the row
 * unless every check above passes.
 */

import {
  isApprovalStepLinkedToActiveRelease,
  isNotePromotionLinkedToActiveVersion,
  isPublishRequestLinkedToActiveRelease,
  type ActiveLinkServiceOptions,
} from "./lifecycle-active-link";
import {
  isApprovalStepTerminal,
  isNotePromotionTerminal,
  isPublishRequestTerminal,
} from "./lifecycle-state-vocab";
import {
  type ActiveHold,
  type HoldQueryOptions,
  listActiveHolds,
} from "./lifecycle-holds-query";

export type RetentionBlockerCode =
  | "NON_TERMINAL_STATE"
  | "NO_TERMINAL_TIMESTAMP"
  | "MINIMUM_RETENTION_WINDOW_NOT_ELAPSED"
  | "ACTIVE_RELEASE_LINK"
  | "ACTIVE_DEPLOYMENT"
  | "ACTIVE_PROMOTION_VERSION"
  | "PENDING_APPROVAL_CHAIN"
  | "LEGAL_HOLD"
  | "AUDIT_HOLD"
  | "GOVERNANCE_HOLD"
  | "OPEN_GOVERNANCE_REVIEW"
  | "UNRESOLVED_AUDIT_INVESTIGATION";

export interface RetentionEligibilityResult {
  readonly retentionEligible: boolean;
  /** The point in time at which the row first became eligible. Null when not yet eligible. */
  readonly retentionEligibleAt: Date | null;
  readonly retentionBlockers: ReadonlyArray<RetentionBlockerCode>;
}

interface BaseDeriverInput {
  readonly state: string;
  readonly terminalAt: Date | null;
  readonly now: Date;
  readonly retentionWindowMs: number;
  readonly activeHolds: ReadonlyArray<ActiveHold>;
}

// ── Hold-classification ─────────────────────────────────────────────────────

function classifyHolds(holds: ReadonlyArray<ActiveHold>): RetentionBlockerCode[] {
  const codes: RetentionBlockerCode[] = [];
  for (const hold of holds) {
    switch (hold.holdType) {
      case "legal_hold":
        codes.push("LEGAL_HOLD");
        break;
      case "audit_hold":
        codes.push("AUDIT_HOLD");
        break;
      case "governance_hold":
        codes.push("GOVERNANCE_HOLD");
        break;
      case "governance_review":
        codes.push("OPEN_GOVERNANCE_REVIEW");
        break;
      case "audit_investigation":
        codes.push("UNRESOLVED_AUDIT_INVESTIGATION");
        break;
      default:
        // Unknown hold types fail-closed under the "do not weaken the
        // predicate" principle — surface as GOVERNANCE_HOLD so the
        // operator sees the row was blocked.
        codes.push("GOVERNANCE_HOLD");
    }
  }
  return codes;
}

function eligibleAt(terminalAt: Date, retentionWindowMs: number): Date {
  return new Date(terminalAt.getTime() + retentionWindowMs);
}

// ── Publish-request deriver (pure) ──────────────────────────────────────────

export interface PublishRequestEligibilityInput extends BaseDeriverInput {
  readonly hasActiveReleaseLink: boolean;
}

export function derivePublishRequestEligibility(
  input: PublishRequestEligibilityInput,
): RetentionEligibilityResult {
  const blockers: RetentionBlockerCode[] = [];

  if (!isPublishRequestTerminal(input.state)) {
    blockers.push("NON_TERMINAL_STATE");
  }
  if (input.terminalAt === null) {
    blockers.push("NO_TERMINAL_TIMESTAMP");
  }
  if (input.hasActiveReleaseLink) {
    blockers.push("ACTIVE_RELEASE_LINK");
  }
  blockers.push(...classifyHolds(input.activeHolds));

  const retentionEligibleAt =
    input.terminalAt === null ? null : eligibleAt(input.terminalAt, input.retentionWindowMs);
  if (retentionEligibleAt !== null && retentionEligibleAt > input.now) {
    blockers.push("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED");
  }

  return {
    retentionEligible: blockers.length === 0,
    retentionEligibleAt,
    retentionBlockers: blockers,
  };
}

// ── Approval-step deriver (pure) ────────────────────────────────────────────

export interface ApprovalStepEligibilityInput extends BaseDeriverInput {
  readonly parentPublishRequestState: string;
  readonly parentPublishRequestTerminalAt: Date | null;
  readonly parentHasActiveReleaseLink: boolean;
}

export function deriveApprovalStepEligibility(
  input: ApprovalStepEligibilityInput,
): RetentionEligibilityResult {
  const blockers: RetentionBlockerCode[] = [];

  if (!isApprovalStepTerminal(input.state)) {
    blockers.push("NON_TERMINAL_STATE");
  }
  if (input.terminalAt === null) {
    blockers.push("NO_TERMINAL_TIMESTAMP");
  }
  if (!isPublishRequestTerminal(input.parentPublishRequestState)) {
    // Parent's approval chain is still pending — child can't be eligible.
    blockers.push("PENDING_APPROVAL_CHAIN");
  }
  if (input.parentHasActiveReleaseLink) {
    blockers.push("ACTIVE_RELEASE_LINK");
  }
  blockers.push(...classifyHolds(input.activeHolds));

  // Approval-step's effective terminal moment is the LATER of its own
  // terminalAt and its parent's terminalAt — a step can't outlive its
  // parent's lifecycle from a retention standpoint.
  const ownTs = input.terminalAt;
  const parentTs = input.parentPublishRequestTerminalAt;
  const latestTerminalAt =
    ownTs === null
      ? null
      : parentTs === null
        ? ownTs
        : new Date(Math.max(ownTs.getTime(), parentTs.getTime()));

  const retentionEligibleAt =
    latestTerminalAt === null ? null : eligibleAt(latestTerminalAt, input.retentionWindowMs);
  if (retentionEligibleAt !== null && retentionEligibleAt > input.now) {
    blockers.push("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED");
  }

  return {
    retentionEligible: blockers.length === 0,
    retentionEligibleAt,
    retentionBlockers: blockers,
  };
}

// ── Note-promotion deriver (pure) ───────────────────────────────────────────

export interface NotePromotionEligibilityInput extends BaseDeriverInput {
  readonly hasActiveVersion: boolean;
}

export function deriveNotePromotionEligibility(
  input: NotePromotionEligibilityInput,
): RetentionEligibilityResult {
  const blockers: RetentionBlockerCode[] = [];

  if (!isNotePromotionTerminal(input.state)) {
    blockers.push("NON_TERMINAL_STATE");
  }
  if (input.terminalAt === null) {
    blockers.push("NO_TERMINAL_TIMESTAMP");
  }
  if (input.hasActiveVersion) {
    blockers.push("ACTIVE_PROMOTION_VERSION");
  }
  blockers.push(...classifyHolds(input.activeHolds));

  const retentionEligibleAt =
    input.terminalAt === null ? null : eligibleAt(input.terminalAt, input.retentionWindowMs);
  if (retentionEligibleAt !== null && retentionEligibleAt > input.now) {
    blockers.push("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED");
  }

  return {
    retentionEligible: blockers.length === 0,
    retentionEligibleAt,
    retentionBlockers: blockers,
  };
}

// ── Loaders (db-bound; thin wrappers around the pure derivers) ──────────────

export interface EligibilityLoaderOptions
  extends ActiveLinkServiceOptions,
    HoldQueryOptions {
  readonly retentionWindowMs: number;
  readonly now?: Date;
}

export async function loadPublishRequestEligibility(
  row: { id: number; state: string; terminalAt: Date | null },
  options: EligibilityLoaderOptions,
): Promise<RetentionEligibilityResult> {
  const now = options.now ?? new Date();
  const [hasActiveReleaseLink, activeHolds] = await Promise.all([
    isPublishRequestLinkedToActiveRelease({ publishRequestId: row.id }, options),
    listActiveHolds(
      { entityType: "ags_publish_requests", entityId: row.id },
      { ...options, now },
    ),
  ]);
  return derivePublishRequestEligibility({
    state: row.state,
    terminalAt: row.terminalAt,
    now,
    retentionWindowMs: options.retentionWindowMs,
    activeHolds,
    hasActiveReleaseLink,
  });
}

export async function loadApprovalStepEligibility(
  row: { id: number; state: string; terminalAt: Date | null; publishRequestId: number },
  parent: { state: string; terminalAt: Date | null },
  options: EligibilityLoaderOptions,
): Promise<RetentionEligibilityResult> {
  const now = options.now ?? new Date();
  // Approval-steps inherit holds from their parent publish-request. A legal
  // hold placed on a publish-request must protect its approval-steps too —
  // otherwise the audit trail (which step approved/rejected) could be swept
  // while the parent decision row is still held. Concat own-holds + parent-
  // holds and let the deriver classify them all.
  const [parentHasActiveReleaseLink, ownHolds, parentHolds] = await Promise.all([
    isPublishRequestLinkedToActiveRelease({ publishRequestId: row.publishRequestId }, options),
    listActiveHolds(
      { entityType: "ags_approval_steps", entityId: row.id },
      { ...options, now },
    ),
    listActiveHolds(
      { entityType: "ags_publish_requests", entityId: row.publishRequestId },
      { ...options, now },
    ),
  ]);
  const activeHolds = [...ownHolds, ...parentHolds];
  return deriveApprovalStepEligibility({
    state: row.state,
    terminalAt: row.terminalAt,
    now,
    retentionWindowMs: options.retentionWindowMs,
    activeHolds,
    parentPublishRequestState: parent.state,
    parentPublishRequestTerminalAt: parent.terminalAt,
    parentHasActiveReleaseLink,
  });
}

export async function loadNotePromotionEligibility(
  row: { id: number; status: string; terminalAt: Date | null },
  options: EligibilityLoaderOptions,
): Promise<RetentionEligibilityResult> {
  const now = options.now ?? new Date();
  const [hasActiveVersion, activeHolds] = await Promise.all([
    isNotePromotionLinkedToActiveVersion({ promotionId: row.id }, options),
    listActiveHolds(
      { entityType: "ags_note_promotions", entityId: row.id },
      { ...options, now },
    ),
  ]);
  return deriveNotePromotionEligibility({
    state: row.status,
    terminalAt: row.terminalAt,
    now,
    retentionWindowMs: options.retentionWindowMs,
    activeHolds,
    hasActiveVersion,
  });
}
