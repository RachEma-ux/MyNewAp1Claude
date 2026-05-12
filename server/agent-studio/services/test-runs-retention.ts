/**
 * Test Runs — retention sweep service.
 *
 * Phase 22 follow-up #653. The `ags_test_runs` table accumulates one
 * row per test-suite execution; `ags_test_run_results` adds many
 * per-case result rows. No retention before this PR — both tables
 * grow unbounded with every test-suite run.
 *
 * Pattern mirrors `simulation-runs-retention.ts` (#649) on a 2-table
 * cascade. Same fail-soft / empty-array short-circuit / union-filter
 * contract.
 *
 * Differences from simulation-runs:
 *  - Filter shape includes `suiteId` (test runs are scoped to a
 *    suite, not a scenario)
 *  - Status union is similar but distinct: queued / running /
 *    passed / failed / cancelled (test engine may use slightly
 *    different defaults, but the prune service accepts whatever
 *    the caller passes)
 *  - Default terminal statuses: passed / failed / cancelled.
 *    queued + running preserved as in-progress.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsTestRuns,
  agsTestRunResults,
} from "../../../drizzle/tables/agent-studio.js";

export type TestRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly TestRunStatus[] = [
  "passed",
  "failed",
  "cancelled",
];

const ZERO_RESULT: PruneOldTestRunsResult = {
  deletedRunsCount: 0,
  deletedResultsCount: 0,
};

export interface PruneOldTestRunsInput {
  /** Cutoff — runs with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["passed", "failed", "cancelled"]`. Operators preserving `failed`
   * forensics pass `["passed"]`.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly TestRunStatus[];
  /**
   * Restrict to a single agent (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly agentId?: number | readonly number[];
  /**
   * Restrict to a single suite (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly suiteId?: number | readonly number[];
}

export interface PruneOldTestRunsResult {
  readonly deletedRunsCount: number;
  readonly deletedResultsCount: number;
}

export interface PruneOldTestRunsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldTestRuns(
  input: PruneOldTestRunsInput,
  options: PruneOldTestRunsOptions = {},
): Promise<PruneOldTestRunsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.suiteId) && input.suiteId.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsTestRuns.createdAt, input.olderThan),
    inArray(agsTestRuns.status, statuses as TestRunStatus[]),
  ];
  const agentIdInput = input.agentId;
  if (agentIdInput !== undefined) {
    if (Array.isArray(agentIdInput)) {
      filters.push(inArray(agsTestRuns.agentId, agentIdInput));
    } else {
      filters.push(eq(agsTestRuns.agentId, agentIdInput as number));
    }
  }
  const suiteIdInput = input.suiteId;
  if (suiteIdInput !== undefined) {
    if (Array.isArray(suiteIdInput)) {
      filters.push(inArray(agsTestRuns.suiteId, suiteIdInput));
    } else {
      filters.push(eq(agsTestRuns.suiteId, suiteIdInput as number));
    }
  }

  const candidates = await db
    .select({ id: agsTestRuns.id })
    .from(agsTestRuns)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const runIds = candidates.map((r) => Number(r.id));

  // Cascade-delete per-case results first, then parent runs.
  const deletedResults = await db
    .delete(agsTestRunResults)
    .where(inArray(agsTestRunResults.runId, runIds))
    .returning({ id: agsTestRunResults.id });

  const deletedRuns = await db
    .delete(agsTestRuns)
    .where(inArray(agsTestRuns.id, runIds))
    .returning({ id: agsTestRuns.id });

  return {
    deletedRunsCount: deletedRuns.length,
    deletedResultsCount: deletedResults.length,
  };
}
