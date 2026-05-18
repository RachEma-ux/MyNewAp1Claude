/**
 * Auto-promote orchestrator — T-D.4 cron driver.
 *
 * Scans `ags_semantic_enrichment_proposals` for pending rows whose
 * `confidence` is at or above the auto-promote threshold (default
 * 0.95), and bridges each into a graph-correction proposal via
 * `runPromoteSemanticEnrichment`. The cron consumes the orchestrator;
 * this module owns the per-tick selection + iteration + result
 * aggregation.
 *
 * Why auto-promote (not auto-promote-and-apply):
 *   - Operators still gate the **apply** step. Auto-promote moves a
 *     proposal onto the graph-correction surface where it joins the
 *     same triage queue as agent-issued + operator-issued corrections,
 *     but the graph mutation only happens once a human reviews it.
 *   - Threshold default of 0.95 is intentionally conservative — the
 *     proposer's own threshold gate already filters <0.8, so every
 *     row in `status=pending` is at least 0.8. Auto-promote only
 *     fires on the high-confidence tail.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Graph mutation NEVER happens here — promotion writes
 *     proposal-row + audit-row only; apply lives downstream.
 *   - No `neo4j-driver` / `openrouter` / `dispatchMcpToolCall`.
 *   - Workspace scoping: the underlying enrichment proposal rows are
 *     workspace-scoped via the agent's run, so a global scan honors
 *     tenancy at the row level.
 *   - Fail-soft per row: a single promotion failure does NOT halt the
 *     tick; the orchestrator records `skipped` + continues.
 */

import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsSemanticEnrichmentProposals } from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import {
  runPromoteSemanticEnrichment,
  AsdbUnavailableForPromotionError,
} from "./semantic-enrichment-promote-runner.js";
import {
  EnrichmentProposalAlreadyPromotedError,
  EnrichmentProposalNotFoundError,
  EnrichmentProposalNotPromotableError,
} from "./semantic-enrichment-promotion-bridge.js";

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

/**
 * Default minimum confidence required for auto-promotion.
 * The proposer's gate already rejects <0.8; this picks the
 * high-confidence tail of what remains so operator triage isn't
 * displaced for borderline cases.
 */
export const DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE = 0.95;

/**
 * Absolute floor for the auto-promote threshold. Below this, the
 * cron throws — operators must NEVER configure a value below the
 * proposer's own minimum-confidence gate (0.8) because that would
 * silently promote `rejected_below_threshold` audit sentinels.
 */
export const ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR = 0.8;

/**
 * Default per-tick proposal-fetch cap. Keeps a single tick bounded
 * even if a huge backlog accumulates; operators can raise it via
 * the cron env-config if they need to catch up faster.
 */
export const DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT = 25;

/**
 * Absolute cap on the per-tick fetch — prevents the cron from
 * blowing up the model-access budget or the row-write rate if a
 * misconfiguration sets the limit very high.
 */
export const ABSOLUTE_AUTO_PROMOTE_PER_TICK_LIMIT = 500;

export interface AutoPromoteCandidate {
  readonly proposalId: number;
  readonly confidence: number;
}

export interface AutoPromoteSelectorOptions {
  readonly minConfidence?: number;
  readonly limit?: number;
  /**
   * Test seam — when supplied, the selector skips the live ASDB read
   * and uses this db. Production omits this.
   */
  readonly db?: AsDb;
}

function clampConfidence(c: number | undefined): number {
  if (typeof c !== "number" || !Number.isFinite(c)) {
    return DEFAULT_AUTO_PROMOTE_MIN_CONFIDENCE;
  }
  if (c < ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR) {
    return ABSOLUTE_AUTO_PROMOTE_MIN_CONFIDENCE_FLOOR;
  }
  if (c > 1) return 1;
  return c;
}

function clampLimit(l: number | undefined): number {
  if (typeof l !== "number" || !Number.isFinite(l) || l <= 0) {
    return DEFAULT_AUTO_PROMOTE_PER_TICK_LIMIT;
  }
  return Math.min(Math.trunc(l), ABSOLUTE_AUTO_PROMOTE_PER_TICK_LIMIT);
}

/**
 * Reads pending semantic-enrichment proposals whose confidence is at
 * or above `minConfidence`, ordered by `createdAt ASC` so the oldest
 * eligible proposals get promoted first (FIFO triage).
 *
 * Returns an empty array when ASDB is unavailable — the cron logs the
 * tick as a no-op rather than throwing into the scheduler.
 */
export async function listAutoPromotableProposals(
  options: AutoPromoteSelectorOptions = {},
): Promise<ReadonlyArray<AutoPromoteCandidate>> {
  const db = options.db ?? (getAsDb() as AsDb | null);
  if (!db) return [];

  const minConfidence = clampConfidence(options.minConfidence);
  const limit = clampLimit(options.limit);

  const rows = await db
    .select({
      id: agsSemanticEnrichmentProposals.id,
      confidence: agsSemanticEnrichmentProposals.confidence,
    })
    .from(agsSemanticEnrichmentProposals)
    .where(
      and(
        eq(agsSemanticEnrichmentProposals.status, "pending"),
        // confidence is `numeric` in Postgres — Drizzle binds it as a
        // string. Cast both sides to numeric to compare.
        gte(
          sql<number>`${agsSemanticEnrichmentProposals.confidence}::numeric`,
          sql`${minConfidence}::numeric`,
        ),
      ),
    )
    // Oldest pending first (FIFO triage). createdAt is non-null so this
    // ordering is total.
    .orderBy(asc(agsSemanticEnrichmentProposals.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    proposalId: r.id,
    // confidence comes back as a string from numeric — parse for the
    // caller. Already guaranteed >= minConfidence by the SQL gate.
    confidence: Number(r.confidence ?? "0"),
  }));
}

// ============================================================================
// Per-row outcome + tick aggregate
// ============================================================================

export type AutoPromoteRowOutcome =
  | "promoted"
  | "skipped_already_promoted"
  | "skipped_not_promotable"
  | "skipped_not_found"
  | "failed";

export interface AutoPromoteRowResult {
  readonly proposalId: number;
  readonly outcome: AutoPromoteRowOutcome;
  readonly correctionProposalId?: number;
  readonly errorMessage?: string;
}

export interface AutoPromoteTickResult {
  readonly inspected: number;
  readonly promoted: number;
  readonly skippedAlreadyPromoted: number;
  readonly skippedNotPromotable: number;
  readonly skippedNotFound: number;
  readonly failed: number;
  readonly rows: ReadonlyArray<AutoPromoteRowResult>;
  readonly tickedAt: string;
}

export interface RunAutoPromoteOptions extends AutoPromoteSelectorOptions {
  /**
   * Optional agent id stamped onto the new correction proposals.
   * Defaults to `null` (the cron is system-internal; no specific
   * agent owns the promotion).
   */
  readonly proposedByAgentId?: number | null;
  /**
   * Optional decision rationale recorded on the audit row. A short
   * sentinel like `"auto-promoted by cron"` keeps the audit trail
   * readable.
   */
  readonly decisionRationale?: string;
}

/**
 * One cron tick: select candidates, promote each, return aggregated
 * counts + per-row outcomes. Bridge errors are caught per row + bucketed
 * so the tick continues even when individual proposals fail (e.g., a
 * concurrent operator promote-and-approve flipped the row already).
 *
 * Tick result shape mirrors `DrainCronResult` (#1479) for operator-
 * dashboard symmetry: aggregate counters + a timestamp.
 */
export async function runAutoPromoteTick(
  options: RunAutoPromoteOptions = {},
): Promise<AutoPromoteTickResult> {
  const tickedAt = new Date().toISOString();
  const candidates = await listAutoPromotableProposals({
    minConfidence: options.minConfidence,
    limit: options.limit,
    ...(options.db !== undefined ? { db: options.db } : {}),
  });

  const rows: AutoPromoteRowResult[] = [];
  let promoted = 0;
  let skippedAlreadyPromoted = 0;
  let skippedNotPromotable = 0;
  let skippedNotFound = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const r = await runPromoteSemanticEnrichment(
        {
          proposalId: c.proposalId,
          decidedByUserId: null,
          decisionRationale:
            options.decisionRationale ?? "auto-promoted by cron",
          proposedByAgentId:
            options.proposedByAgentId !== undefined
              ? options.proposedByAgentId
              : null,
        },
        options.db !== undefined ? { db: options.db } : {},
      );
      rows.push({
        proposalId: c.proposalId,
        outcome: "promoted",
        correctionProposalId: r.correctionProposalId,
      });
      promoted++;
    } catch (e) {
      if (e instanceof EnrichmentProposalAlreadyPromotedError) {
        rows.push({
          proposalId: c.proposalId,
          outcome: "skipped_already_promoted",
        });
        skippedAlreadyPromoted++;
        continue;
      }
      if (e instanceof EnrichmentProposalNotPromotableError) {
        rows.push({
          proposalId: c.proposalId,
          outcome: "skipped_not_promotable",
          errorMessage: e.message,
        });
        skippedNotPromotable++;
        continue;
      }
      if (e instanceof EnrichmentProposalNotFoundError) {
        rows.push({
          proposalId: c.proposalId,
          outcome: "skipped_not_found",
        });
        skippedNotFound++;
        continue;
      }
      if (e instanceof AsdbUnavailableForPromotionError) {
        // ASDB just went away mid-tick. Mark this row failed, but
        // the next rows will get the same error — short-circuit the
        // loop to keep the failed-count meaningful.
        rows.push({
          proposalId: c.proposalId,
          outcome: "failed",
          errorMessage: e.message,
        });
        failed++;
        break;
      }
      rows.push({
        proposalId: c.proposalId,
        outcome: "failed",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }

  return {
    inspected: candidates.length,
    promoted,
    skippedAlreadyPromoted,
    skippedNotPromotable,
    skippedNotFound,
    failed,
    rows,
    tickedAt,
  };
}
