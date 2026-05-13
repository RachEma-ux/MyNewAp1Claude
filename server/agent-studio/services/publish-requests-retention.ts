/**
 * ags_publish_requests — approval-lifecycle retention sweep service.
 *
 * Unlike age-only retention services (e.g. cag-pack-events), this one
 * cannot just `WHERE created_at < cutoff` — approval-lifecycle rows
 * carry compliance significance. The sweep computes per-row eligibility
 * via `loadPublishRequestEligibility` which checks:
 *
 *   - state is in the terminal set
 *   - terminalAt is non-null (backfill applied)
 *   - terminalAt is older than the retention window
 *   - no active release link (agsAgentReleases.archivedAt IS NULL)
 *   - no active hold (legal / audit / governance / governance-review /
 *     audit-investigation)
 *
 * Only rows where all checks pass are deleted.
 *
 * Candidate query reduces volume to rows that have at least cleared
 * the age threshold; per-row eligibility re-validates everything.
 *
 * Fail-soft contract on ASDB-null: returns zero-counts.
 *
 * Standing principle (user 2026-05-12 §0): "Do not weaken the retention
 * predicate to fit the current schema." Every blocker code in the
 * derivation service produces a `preserved` count here.
 */

import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { getAsDb } from "../db/connection.js";
import { agsPublishRequests } from "../../../drizzle/tables/agent-studio.js";
import {
  loadPublishRequestEligibility,
  type RetentionBlockerCode,
} from "./retention/lifecycle-eligibility.js";
import { PUBLISH_REQUEST_TERMINAL_STATES } from "./retention/lifecycle-state-vocab.js";

export interface PrunePublishRequestsRetentionInput {
  /**
   * Earliest `terminalAt` to consider. Rows with `terminalAt >= olderThan`
   * are not candidates regardless of any other state.
   */
  readonly olderThan: Date;
  /**
   * Optional workspace/agent scoping. Empty array short-circuits before
   * the ASDB probe.
   */
  readonly agentId?: number | readonly number[];
}

export interface PrunePublishRequestsRetentionResult {
  readonly deletedCount: number;
  /**
   * Rows that cleared the age threshold but were preserved due to one
   * or more retention blockers. Used by operators to understand "why
   * isn't the table shrinking?"
   */
  readonly preservedCount: number;
  /** Aggregate count of each blocker code across all preserved rows. */
  readonly blockerCounts: Readonly<Partial<Record<RetentionBlockerCode, number>>>;
}

export interface PrunePublishRequestsRetentionOptions {
  readonly getDb?: typeof getAsDb;
  readonly now?: Date;
}

const TERMINAL_STATES_ARRAY = Array.from(PUBLISH_REQUEST_TERMINAL_STATES);

export async function prunePublishRequestsRetention(
  input: PrunePublishRequestsRetentionInput,
  options: PrunePublishRequestsRetentionOptions = {},
): Promise<PrunePublishRequestsRetentionResult> {
  const ZERO: PrunePublishRequestsRetentionResult = {
    deletedCount: 0,
    preservedCount: 0,
    blockerCounts: {},
  };

  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return ZERO;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO;

  const now = options.now ?? new Date();
  const retentionWindowMs = now.getTime() - input.olderThan.getTime();

  // ── Candidate query ────────────────────────────────────────────────────────
  // terminalAt is non-null AND in terminal-states AND older than cutoff.
  const candidateFilters = [
    inArray(agsPublishRequests.state, TERMINAL_STATES_ARRAY),
    isNotNull(agsPublishRequests.terminalAt),
    lt(agsPublishRequests.terminalAt, input.olderThan),
  ];

  const agentIdInput = input.agentId;
  if (agentIdInput !== undefined) {
    if (Array.isArray(agentIdInput)) {
      candidateFilters.push(
        inArray(agsPublishRequests.agentId, agentIdInput as number[]),
      );
    } else {
      candidateFilters.push(eq(agsPublishRequests.agentId, agentIdInput as number));
    }
  }

  const candidates = await db
    .select({
      id: agsPublishRequests.id,
      state: agsPublishRequests.state,
      terminalAt: agsPublishRequests.terminalAt,
    })
    .from(agsPublishRequests)
    .where(and(...candidateFilters));

  if (candidates.length === 0) return ZERO;

  // ── Per-row eligibility evaluation ─────────────────────────────────────────
  const deletable: number[] = [];
  const blockerCounts: Partial<Record<RetentionBlockerCode, number>> = {};
  let preservedCount = 0;

  for (const row of candidates) {
    const verdict = await loadPublishRequestEligibility(
      { id: row.id, state: row.state, terminalAt: row.terminalAt },
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

  // ── Delete eligible rows ───────────────────────────────────────────────────
  if (deletable.length === 0) {
    return { deletedCount: 0, preservedCount, blockerCounts };
  }

  const deleted = await db
    .delete(agsPublishRequests)
    .where(inArray(agsPublishRequests.id, deletable))
    .returning({ id: agsPublishRequests.id });

  // sql tag is unused here but the import is intentional — future
  // batch-delete versions of this function may switch to USING.
  void sql;

  return {
    deletedCount: deleted.length,
    preservedCount,
    blockerCounts,
  };
}
