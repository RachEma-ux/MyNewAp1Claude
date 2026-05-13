/**
 * ags_note_promotions — approval-lifecycle retention sweep service.
 *
 * Third of the three approval-lifecycle prune services. Shares the shape
 * of prunePublishRequestsRetention but with note-promotion-specific
 * differences:
 *
 *   - The state column is `status`, not `state`.
 *   - The active-link signal is `agsNotePromotionVersions.active = true`
 *     for any version of this promotion, not an agsAgentReleases link.
 *   - `rolled_back` is treated as terminal — review-hold preservation is
 *     the holds table's job, not the state machine's.
 *
 * Sequence:
 *   1. Candidate query: status IN (terminal_statuses) AND terminal_at IS
 *      NOT NULL AND terminal_at < olderThan. Optionally scoped by
 *      promotionKind.
 *   2. Per-row eligibility via loadNotePromotionEligibility (active
 *      version + holds + retention window check).
 *   3. DELETE…RETURNING for the rows that pass.
 *
 * Note: agsNotePromotionVersions, agsNotePromotionDecisions, and
 * agsNotePromotionAuditEvents reference agsNotePromotions.id via FK.
 * Deleting a promotion without cascading would violate the FK. This
 * service deletes children first then the parent — same children-first
 * cascade pattern established by prior retention mini-arcs (e.g.
 * graph-quality-scans).
 *
 * Fail-soft contract on ASDB-null: zero-counts.
 */

import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

import { getAsDb } from "../db/connection.js";
import {
  agsNotePromotions,
  agsNotePromotionVersions,
  agsNotePromotionDecisions,
  agsNotePromotionAuditEvents,
} from "../../../drizzle/tables/agent-studio-graph-promotion.js";
import {
  loadNotePromotionEligibility,
  type RetentionBlockerCode,
} from "./retention/lifecycle-eligibility.js";
import { NOTE_PROMOTION_TERMINAL_STATES } from "./retention/lifecycle-state-vocab.js";

export interface PruneNotePromotionsRetentionInput {
  readonly olderThan: Date;
  /** Optional scoping to a specific promotion kind. */
  readonly promotionKind?: string | readonly string[];
}

export interface PruneNotePromotionsRetentionResult {
  readonly deletedCount: number;
  readonly preservedCount: number;
  readonly blockerCounts: Readonly<Partial<Record<RetentionBlockerCode, number>>>;
  /** Cascade-deletion counts for the three child tables. */
  readonly cascadeDeletedCounts: {
    readonly versions: number;
    readonly decisions: number;
    readonly auditEvents: number;
  };
}

export interface PruneNotePromotionsRetentionOptions {
  readonly getDb?: typeof getAsDb;
  readonly now?: Date;
}

const TERMINAL_STATES_ARRAY = Array.from(NOTE_PROMOTION_TERMINAL_STATES);

export async function pruneNotePromotionsRetention(
  input: PruneNotePromotionsRetentionInput,
  options: PruneNotePromotionsRetentionOptions = {},
): Promise<PruneNotePromotionsRetentionResult> {
  const ZERO: PruneNotePromotionsRetentionResult = {
    deletedCount: 0,
    preservedCount: 0,
    blockerCounts: {},
    cascadeDeletedCounts: { versions: 0, decisions: 0, auditEvents: 0 },
  };

  if (Array.isArray(input.promotionKind) && input.promotionKind.length === 0) {
    return ZERO;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO;

  const now = options.now ?? new Date();
  const retentionWindowMs = now.getTime() - input.olderThan.getTime();

  const candidateFilters = [
    inArray(agsNotePromotions.status, TERMINAL_STATES_ARRAY),
    isNotNull(agsNotePromotions.terminalAt),
    lt(agsNotePromotions.terminalAt, input.olderThan),
  ];

  const kindInput = input.promotionKind;
  if (kindInput !== undefined) {
    if (Array.isArray(kindInput)) {
      candidateFilters.push(
        inArray(agsNotePromotions.promotionKind, kindInput as string[]),
      );
    } else {
      candidateFilters.push(eq(agsNotePromotions.promotionKind, kindInput as string));
    }
  }

  const candidates = await db
    .select({
      id: agsNotePromotions.id,
      status: agsNotePromotions.status,
      terminalAt: agsNotePromotions.terminalAt,
    })
    .from(agsNotePromotions)
    .where(and(...candidateFilters));

  if (candidates.length === 0) return ZERO;

  const deletable: number[] = [];
  const blockerCounts: Partial<Record<RetentionBlockerCode, number>> = {};
  let preservedCount = 0;

  for (const row of candidates) {
    const verdict = await loadNotePromotionEligibility(
      { id: row.id, status: row.status, terminalAt: row.terminalAt },
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
    return {
      deletedCount: 0,
      preservedCount,
      blockerCounts,
      cascadeDeletedCounts: { versions: 0, decisions: 0, auditEvents: 0 },
    };
  }

  // ── Children-first cascade ─────────────────────────────────────────────────
  const [versions, decisions, auditEvents] = await Promise.all([
    db
      .delete(agsNotePromotionVersions)
      .where(inArray(agsNotePromotionVersions.promotionId, deletable))
      .returning({ id: agsNotePromotionVersions.id }),
    db
      .delete(agsNotePromotionDecisions)
      .where(inArray(agsNotePromotionDecisions.promotionId, deletable))
      .returning({ id: agsNotePromotionDecisions.id }),
    db
      .delete(agsNotePromotionAuditEvents)
      .where(inArray(agsNotePromotionAuditEvents.promotionId, deletable))
      .returning({ id: agsNotePromotionAuditEvents.id }),
  ]);

  const deleted = await db
    .delete(agsNotePromotions)
    .where(inArray(agsNotePromotions.id, deletable))
    .returning({ id: agsNotePromotions.id });

  return {
    deletedCount: deleted.length,
    preservedCount,
    blockerCounts,
    cascadeDeletedCounts: {
      versions: versions.length,
      decisions: decisions.length,
      auditEvents: auditEvents.length,
    },
  };
}
