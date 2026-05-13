/**
 * ags_approval_steps — approval-lifecycle retention sweep service.
 *
 * Steps cannot be retention-eligible independently of their parent
 * publish-request's lifecycle. `loadApprovalStepEligibility` enforces
 * this by requiring the parent row's state + terminalAt and computing
 * the step's effective terminal moment as
 *   MAX(step.terminalAt, parent.terminalAt).
 *
 * Sequence:
 *   1. Candidate query: terminal-state + terminalAt < cutoff
 *      (optional publishRequestId scoping).
 *   2. Batch-fetch parent publish-requests for all candidates.
 *   3. Per-step eligibility evaluation via loadApprovalStepEligibility.
 *   4. DELETE…RETURNING for the rows that pass.
 *
 * Steps with a missing parent are conservatively preserved
 * (PENDING_APPROVAL_CHAIN, since we can't prove the lifecycle is over).
 *
 * Fail-soft contract on ASDB-null: zero-counts.
 */

import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

import { getAsDb } from "../db/connection.js";
import {
  agsApprovalSteps,
  agsPublishRequests,
} from "../../../drizzle/tables/agent-studio.js";
import {
  loadApprovalStepEligibility,
  type RetentionBlockerCode,
} from "./retention/lifecycle-eligibility.js";
import { APPROVAL_STEP_TERMINAL_STATES } from "./retention/lifecycle-state-vocab.js";

export interface PruneApprovalStepsRetentionInput {
  readonly olderThan: Date;
  /** Optional scoping to a specific publish-request or set. Empty short-circuits. */
  readonly publishRequestId?: number | readonly number[];
}

export interface PruneApprovalStepsRetentionResult {
  readonly deletedCount: number;
  readonly preservedCount: number;
  readonly blockerCounts: Readonly<Partial<Record<RetentionBlockerCode, number>>>;
}

export interface PruneApprovalStepsRetentionOptions {
  readonly getDb?: typeof getAsDb;
  readonly now?: Date;
}

const TERMINAL_STATES_ARRAY = Array.from(APPROVAL_STEP_TERMINAL_STATES);

export async function pruneApprovalStepsRetention(
  input: PruneApprovalStepsRetentionInput,
  options: PruneApprovalStepsRetentionOptions = {},
): Promise<PruneApprovalStepsRetentionResult> {
  const ZERO: PruneApprovalStepsRetentionResult = {
    deletedCount: 0,
    preservedCount: 0,
    blockerCounts: {},
  };

  if (Array.isArray(input.publishRequestId) && input.publishRequestId.length === 0) {
    return ZERO;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO;

  const now = options.now ?? new Date();
  const retentionWindowMs = now.getTime() - input.olderThan.getTime();

  const candidateFilters = [
    inArray(agsApprovalSteps.state, TERMINAL_STATES_ARRAY),
    isNotNull(agsApprovalSteps.terminalAt),
    lt(agsApprovalSteps.terminalAt, input.olderThan),
  ];

  const prId = input.publishRequestId;
  if (prId !== undefined) {
    if (Array.isArray(prId)) {
      candidateFilters.push(
        inArray(agsApprovalSteps.publishRequestId, prId as number[]),
      );
    } else {
      candidateFilters.push(eq(agsApprovalSteps.publishRequestId, prId as number));
    }
  }

  const candidates = await db
    .select({
      id: agsApprovalSteps.id,
      state: agsApprovalSteps.state,
      terminalAt: agsApprovalSteps.terminalAt,
      publishRequestId: agsApprovalSteps.publishRequestId,
    })
    .from(agsApprovalSteps)
    .where(and(...candidateFilters));

  if (candidates.length === 0) return ZERO;

  // ── Batch-fetch parent publish-requests ───────────────────────────────────
  const parentIds = Array.from(new Set(candidates.map((c) => c.publishRequestId)));
  const parents = await db
    .select({
      id: agsPublishRequests.id,
      state: agsPublishRequests.state,
      terminalAt: agsPublishRequests.terminalAt,
    })
    .from(agsPublishRequests)
    .where(inArray(agsPublishRequests.id, parentIds));

  const parentById = new Map<number, { state: string; terminalAt: Date | null }>();
  for (const p of parents) {
    parentById.set(p.id, { state: p.state, terminalAt: p.terminalAt });
  }

  const deletable: number[] = [];
  const blockerCounts: Partial<Record<RetentionBlockerCode, number>> = {};
  let preservedCount = 0;

  for (const row of candidates) {
    // Missing parent → conservatively preserve. PENDING_APPROVAL_CHAIN
    // would surface from the deriver too once parent.state is checked,
    // but skipping a load with a synthetic "pending" parent makes the
    // intent explicit.
    const parent = parentById.get(row.publishRequestId);
    const parentState = parent ? parent.state : "pending";
    const parentTerminalAt = parent ? parent.terminalAt : null;

    const verdict = await loadApprovalStepEligibility(
      {
        id: row.id,
        state: row.state,
        terminalAt: row.terminalAt,
        publishRequestId: row.publishRequestId,
      },
      { state: parentState, terminalAt: parentTerminalAt },
      { getDb, retentionWindowMs, now },
    );
    if (verdict.retentionEligible) {
      deletable.push(row.id);
    } else {
      preservedCount += 1;
      for (const code of verdict.retentionBlockers) {
        blockerCounts[code] = (blockerCounts[code] ?? 0) + 1;
      }
    }
  }

  if (deletable.length === 0) {
    return { deletedCount: 0, preservedCount, blockerCounts };
  }

  const deleted = await db
    .delete(agsApprovalSteps)
    .where(inArray(agsApprovalSteps.id, deletable))
    .returning({ id: agsApprovalSteps.id });

  return {
    deletedCount: deleted.length,
    preservedCount,
    blockerCounts,
  };
}
