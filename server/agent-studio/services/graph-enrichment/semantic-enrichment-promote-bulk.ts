/**
 * Bulk semantic-enrichment promotion — T-D.4 carry-forward.
 *
 * Wraps `runPromoteSemanticEnrichment` over a caller-supplied list of
 * proposal ids and returns the same per-row bucketed shape as the
 * cron orchestrator (`runAutoPromoteTick`). Operators can fire-and-
 * forget a batch instead of iterating the single-promote endpoint
 * from the client.
 *
 * Bucketing mirrors `auto-promote-orchestrator.ts` so the two
 * surfaces look identical to the operator dashboard:
 *   - `promoted` — bridge succeeded, correction proposal created
 *   - `skipped_already_promoted` — enrichment already moved (race)
 *   - `skipped_not_promotable` — proposer rejected (≤ floor / status)
 *   - `skipped_not_found` — id doesn't resolve
 *   - `failed` — generic error; preserves message
 *
 * `AsdbUnavailableForPromotionError` mid-batch short-circuits the
 * loop (same as the cron) — every remaining id would fail with the
 * same root cause, so the failed-count stays meaningful.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `openrouter` / `dispatchMcpToolCall`.
 *   - No new persistence shape — reuses the single-promote runner.
 *   - Graph mutation step stays operator-gated downstream.
 */

import {
  runPromoteSemanticEnrichment,
  AsdbUnavailableForPromotionError,
  type RunPromoteSemanticEnrichmentOptions,
} from "./semantic-enrichment-promote-runner.js";
import {
  EnrichmentProposalAlreadyPromotedError,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
} from "./semantic-enrichment-promotion-bridge.js";

/**
 * Absolute cap on a single bulk-promote call — protects against
 * operator misuse (10k-row batches that would tie up the connection
 * for minutes). Matches the cron's per-tick absolute cap.
 */
export const ABSOLUTE_BULK_PROMOTE_LIMIT = 500;

export type BulkPromoteRowOutcome =
  | "promoted"
  | "skipped_already_promoted"
  | "skipped_not_promotable"
  | "skipped_not_found"
  | "failed";

export interface BulkPromoteRowResult {
  readonly proposalId: number;
  readonly outcome: BulkPromoteRowOutcome;
  readonly correctionProposalId?: number;
  readonly errorMessage?: string;
}

export interface BulkPromoteResult {
  readonly inspected: number;
  readonly promoted: number;
  readonly skippedAlreadyPromoted: number;
  readonly skippedNotPromotable: number;
  readonly skippedNotFound: number;
  readonly failed: number;
  readonly rows: ReadonlyArray<BulkPromoteRowResult>;
  readonly invokedAt: string;
}

export interface BulkPromoteInput {
  readonly proposalIds: ReadonlyArray<number>;
  readonly decidedByUserId?: number | null;
  readonly decisionRationale?: string;
  readonly proposedByAgentId?: number | null;
}

export class BulkPromoteLimitExceededError extends Error {
  constructor(received: number, max: number) {
    super(
      `bulk promote requested ${received} ids but the per-call cap is ${max}`,
    );
    this.name = "BulkPromoteLimitExceededError";
  }
}

export class BulkPromoteEmptyInputError extends Error {
  constructor() {
    super("bulk promote requires at least one proposalId");
    this.name = "BulkPromoteEmptyInputError";
  }
}

/**
 * Runs single-promote over `proposalIds` and aggregates per-row
 * outcomes. Validates input shape (length + cap) before the loop.
 */
export async function runPromoteBulk(
  input: BulkPromoteInput,
  options: RunPromoteSemanticEnrichmentOptions = {},
): Promise<BulkPromoteResult> {
  if (input.proposalIds.length === 0) {
    throw new BulkPromoteEmptyInputError();
  }
  if (input.proposalIds.length > ABSOLUTE_BULK_PROMOTE_LIMIT) {
    throw new BulkPromoteLimitExceededError(
      input.proposalIds.length,
      ABSOLUTE_BULK_PROMOTE_LIMIT,
    );
  }

  const invokedAt = new Date().toISOString();
  const rows: BulkPromoteRowResult[] = [];
  let promoted = 0;
  let skippedAlreadyPromoted = 0;
  let skippedNotPromotable = 0;
  let skippedNotFound = 0;
  let failed = 0;

  for (const proposalId of input.proposalIds) {
    try {
      const r = await runPromoteSemanticEnrichment(
        {
          proposalId,
          decidedByUserId:
            input.decidedByUserId !== undefined
              ? input.decidedByUserId
              : null,
          ...(input.decisionRationale !== undefined
            ? { decisionRationale: input.decisionRationale }
            : {}),
          ...(input.proposedByAgentId !== undefined
            ? { proposedByAgentId: input.proposedByAgentId }
            : {}),
        },
        options,
      );
      rows.push({
        proposalId,
        outcome: "promoted",
        correctionProposalId: r.correctionProposalId,
      });
      promoted++;
    } catch (e) {
      if (e instanceof EnrichmentProposalAlreadyPromotedError) {
        rows.push({ proposalId, outcome: "skipped_already_promoted" });
        skippedAlreadyPromoted++;
        continue;
      }
      if (e instanceof EnrichmentProposalNotPromotableError) {
        rows.push({
          proposalId,
          outcome: "skipped_not_promotable",
          errorMessage: e.message,
        });
        skippedNotPromotable++;
        continue;
      }
      if (e instanceof EnrichmentProposalNotFoundError) {
        rows.push({ proposalId, outcome: "skipped_not_found" });
        skippedNotFound++;
        continue;
      }
      if (e instanceof AsdbUnavailableForPromotionError) {
        rows.push({
          proposalId,
          outcome: "failed",
          errorMessage: e.message,
        });
        failed++;
        break;
      }
      rows.push({
        proposalId,
        outcome: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }

  return {
    inspected: input.proposalIds.length,
    promoted,
    skippedAlreadyPromoted,
    skippedNotPromotable,
    skippedNotFound,
    failed,
    rows,
    invokedAt,
  };
}
