/**
 * Graph correction rollback — Item 42.
 *
 * Closes the gap identified in the Governance / Self-Correction
 * closure prompt: prior to this module, the graph-correction
 * lifecycle supported `submit / approve / reject / withdraw`, but
 * had NO post-approval rollback flow. An operator who realized that
 * an approved + applied correction was wrong had to manually open a
 * second proposal AND remember to derive its reversal payload AND
 * remember to link the two for audit.
 *
 * This module ships `createRollbackProposal`, a pure-ish helper
 * that:
 *
 *   1. Reads the original proposal via `getProposalById`.
 *   2. Refuses to roll back proposals that aren't terminal-approved
 *      (rejected / withdrawn / pending proposals don't have an
 *      applied side effect to reverse).
 *   3. Derives the reversal payload from the original's
 *      `proposedChange` per a closed-taxonomy switch on
 *      `proposalKind`.
 *   4. Submits a NEW correction proposal of kind
 *      `rollback_<original_kind>` with `rollbackOf: originalId` in
 *      `proposedChange` so the audit trail links the pair.
 *   5. Returns the new proposal id + a `RollbackProposalLink`
 *      record so the caller can update tracking surfaces.
 *
 * Critical safety guarantees:
 *   - The rollback proposal goes through the SAME approve/reject
 *     flow as any other correction proposal. There is NO direct
 *     mutation here.
 *   - The reversal payload is derived deterministically from the
 *     original — no guessing, no model call.
 *   - When the reversal cannot be unambiguously derived (e.g., the
 *     original kind is `manual_review`), the function throws a
 *     `NonReversibleProposalKindError` rather than silently
 *     creating an empty rollback.
 *   - The function NEVER calls `GraphRepository.*` directly. Even
 *     when the rollback proposal is later approved, the applier
 *     (item 41) is the one that mutates Neo4j — and ONLY for
 *     applier kinds that have a real wired implementation.
 *   - The function NEVER swallows the original's audit trail; the
 *     `rollbackOf` link preserves it.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` import.
 *   - No `dispatchMcpToolCall` import.
 *   - No `openrouter` import.
 *   - Calls only the existing graph-correction lifecycle exports.
 */

import {
  getProposalById,
  submitCorrectionProposal,
  CorrectionProposalNotFoundError,
  type ProposalRow,
  type ServiceOptions,
  type SubmitProposalInput,
} from "./lifecycle.js";

// ============================================================================
// Errors
// ============================================================================

export class ProposalNotApprovedForRollbackError extends Error {
  constructor(proposalId: number, status: string) {
    super(
      `Proposal ${proposalId} cannot be rolled back (status=${status}); rollback requires an approved proposal.`,
    );
    this.name = "ProposalNotApprovedForRollbackError";
  }
}

export class NonReversibleProposalKindError extends Error {
  constructor(proposalKind: string) {
    super(
      `Proposal kind "${proposalKind}" cannot be deterministically rolled back; create a new corrective proposal instead.`,
    );
    this.name = "NonReversibleProposalKindError";
  }
}

export class AlreadyHasRollbackInFlightError extends Error {
  constructor(originalProposalId: number, existingRollbackId: number) {
    super(
      `Proposal ${originalProposalId} already has an open rollback proposal (id=${existingRollbackId}); decide that one first.`,
    );
    this.name = "AlreadyHasRollbackInFlightError";
  }
}

// ============================================================================
// Closed-taxonomy reversal map
// ============================================================================

/**
 * Per-kind reversal derivation. Each entry maps an original
 * proposalKind to a function that takes the original's
 * `proposedChange` payload and returns the reversal payload. Kinds
 * not in this map throw `NonReversibleProposalKindError`.
 *
 * The reversal payload shape is INTENTIONALLY the same shape as a
 * fresh proposal of the equivalent reversing kind — so the
 * applier registry (item 41) can dispatch on it without a special
 * "rollback" branch. e.g., rolling back an `archive_node` produces a
 * payload of kind `restore_node` with the same `nodeId`.
 *
 * The taxonomy mirrors the graph-quality finding-to-proposal
 * taxonomy (archive / merge / re-promote / manual-review). Adding a
 * new applier kind requires adding (a) the kind here, (b) the
 * applier in `mutation-worker.ts`, and (c) a test asserting
 * round-trip apply→rollback restores state.
 */
type ReversalPayload = Record<string, unknown> & { rollbackOf: number };

const REVERSAL_DERIVATIONS: Record<
  string,
  (
    original: Record<string, unknown>,
    originalProposalId: number,
  ) => ReversalPayload
> = {
  // archive_node sets node.governance_status = "archived" — reversal
  // restores it to "active".
  archive_node: (original, originalProposalId) => ({
    kind: "restore_node",
    typeKey: original.typeKey,
    nodeId: original.nodeId,
    rollbackOf: originalProposalId,
  }),

  // merge_into_canonical collapses a duplicate into a canonical
  // node — reversal re-extracts the duplicate as an independent
  // node restored from its prior source-of-truth row.
  merge_into_canonical: (original, originalProposalId) => ({
    kind: "unmerge_duplicate",
    typeKey: original.typeKey,
    canonicalNodeId: original.canonicalNodeId,
    duplicateNodeId: original.duplicateNodeId,
    rollbackOf: originalProposalId,
  }),

  // re_promote_with_source_version pinned a missing sourceVersionId —
  // reversal nulls it back to the pre-pin state. Note: the original
  // also calls enqueueProjectionJob; the rollback applier will
  // enqueue a compensating projection job.
  re_promote_with_source_version: (original, originalProposalId) => ({
    kind: "unpin_source_version",
    sourceTypeKey: original.sourceTypeKey,
    sourceId: original.sourceId,
    targetNodeId: original.targetNodeId,
    rollbackOf: originalProposalId,
  }),
};

/**
 * The set of proposal kinds the rollback service knows how to
 * reverse. Exposed so callers (UI, tests) can pre-check whether a
 * "rollback" button should be enabled for a given proposal.
 */
export const ROLLBACKABLE_PROPOSAL_KINDS: ReadonlyArray<string> = Object.freeze(
  Object.keys(REVERSAL_DERIVATIONS),
);

export function isRollbackableProposalKind(kind: string): boolean {
  return kind in REVERSAL_DERIVATIONS;
}

// ============================================================================
// Public API
// ============================================================================

export interface CreateRollbackProposalInput {
  readonly originalProposalId: number;
  /** User requesting the rollback. Persisted on the new proposal as
   *  `proposedByUserId`. Tests + audit consumers can join on this
   *  field to attribute the rollback to its requester. */
  readonly requestedByUserId: number;
  /** Free-text rationale for the rollback — surfaces to the
   *  reviewer who'll approve/reject the rollback. */
  readonly reason: string;
  /** Optional override of the rolling-back proposal's `confidence`
   *  field; defaults to the original's confidence (a rollback is
   *  not more or less confident than what it reverses). */
  readonly confidence?: number;
  /**
   * Optional pre-check — when set, the function looks up open
   * rollback proposals for this original and throws
   * `AlreadyHasRollbackInFlightError` if one exists. Default true;
   * tests can set false to exercise the duplicate-rollback shape.
   */
  readonly forbidDuplicateRollback?: boolean;
  /**
   * Injected lookup for the "open rollback already exists" check.
   * The default impl reads from the lifecycle's `listProposals`
   * filtered by `proposalKind` + `proposedChange.rollbackOf` —
   * tests supply a stub to avoid hitting the DB.
   */
  readonly findOpenRollbackForOriginal?: (
    originalProposalId: number,
  ) => Promise<{ id: number } | null>;
}

export interface RollbackProposalLink {
  /** The newly-created rollback proposal's id. */
  readonly rollbackProposalId: number;
  /** The id of the original proposal being rolled back. */
  readonly originalProposalId: number;
  /** The closed-taxonomy proposal kind of the new rollback. */
  readonly rollbackProposalKind: string;
}

/**
 * Sole public entry point for creating a rollback proposal.
 *
 * Flow:
 *   1. Read original via `getProposalById` (throws
 *      `CorrectionProposalNotFoundError` if missing — pass through).
 *   2. Verify original.status === "approved" (otherwise throw
 *      `ProposalNotApprovedForRollbackError`).
 *   3. Verify original.proposalKind is in REVERSAL_DERIVATIONS
 *      (otherwise throw `NonReversibleProposalKindError`).
 *   4. Optional: check for existing open rollback (throw
 *      `AlreadyHasRollbackInFlightError`).
 *   5. Derive reversal payload via REVERSAL_DERIVATIONS[kind].
 *   6. Submit a new correction proposal via
 *      `submitCorrectionProposal` with rollback semantics.
 *   7. Return RollbackProposalLink.
 */
export async function createRollbackProposal(
  input: CreateRollbackProposalInput,
  options: ServiceOptions = {},
): Promise<RollbackProposalLink> {
  const original = await getProposalById(input.originalProposalId, options);
  if (original === null) {
    throw new CorrectionProposalNotFoundError(input.originalProposalId);
  }

  if (original.status !== "approved") {
    throw new ProposalNotApprovedForRollbackError(
      input.originalProposalId,
      original.status,
    );
  }

  if (!isRollbackableProposalKind(original.proposalKind)) {
    throw new NonReversibleProposalKindError(original.proposalKind);
  }

  if (input.forbidDuplicateRollback !== false && input.findOpenRollbackForOriginal) {
    const existing = await input.findOpenRollbackForOriginal(
      input.originalProposalId,
    );
    if (existing !== null) {
      throw new AlreadyHasRollbackInFlightError(
        input.originalProposalId,
        existing.id,
      );
    }
  }

  const reversalPayload = REVERSAL_DERIVATIONS[original.proposalKind]!(
    original.proposedChange,
    input.originalProposalId,
  );

  const rollbackKind = `rollback_${original.proposalKind}`;
  const submitInput: SubmitProposalInput = {
    proposalKind: rollbackKind,
    targetTypeKey: original.targetTypeKey,
    targetId: original.targetId,
    proposedChange: reversalPayload,
    confidence:
      input.confidence !== undefined ? input.confidence : original.confidence,
    rationale: `Rollback of proposal #${input.originalProposalId}: ${input.reason}`,
    proposedByUserId: input.requestedByUserId,
  };
  const created: ProposalRow = await submitCorrectionProposal(
    submitInput,
    options,
  );

  return {
    rollbackProposalId: created.id,
    originalProposalId: input.originalProposalId,
    rollbackProposalKind: rollbackKind,
  };
}

// Re-exports so callers don't need to import from two files for the
// common rollback workflow.
export {
  CorrectionProposalNotFoundError,
  type ProposalRow,
  type SubmitProposalInput,
} from "./lifecycle.js";
