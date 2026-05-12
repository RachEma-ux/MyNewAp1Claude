/**
 * Runtime Runs — retention sweep service.
 *
 * Phase 22 follow-up #621. The `ags_runtime_runs` table accumulates
 * one row per agent run — and `ags_runtime_run_steps` accumulates
 * many rows per run (every step a run emits). Neither table has had
 * a retention path; rows grow unbounded.
 *
 * Pattern mirrors `services/workspace-observability/retention-sweep.ts`
 * (#521) — same fail-soft contract, same empty-array short-circuit,
 * same union-type filter shape. The differences are table-specific:
 *  - Filters on `createdAt` (NOT `updatedAt`) — runtime_runs has no
 *    updatedAt column, and `createdAt` is the unambiguous enqueue
 *    timestamp shared across all rows
 *  - Default terminal-statuses set is broader than background_jobs
 *    (`completed`, `failed`, `cancelled` — runtime runs can ALSO
 *    finish in `awaiting_approval` permanently if abandoned, but
 *    operators want those preserved for audit)
 *  - Cascade-deletes 5 sibling tables that key on `runId`:
 *      agsRuntimeRunSteps     (per-step trace)
 *      agsRuntimeToolCalls    (tool dispatch trace)
 *      agsRuntimeMemoryEvents (memory writes per run)
 *      agsRuntimePolicyEvents (governance decisions per run)
 *      agsRuntimeHookExecutions (hook invocations per run)
 *    Deletion order: children first, then parent (no FK constraint,
 *    but orphans are visually confusing in the operator UI when a
 *    sub-table query returns rows for a non-existent run).
 *
 *  - **#637 fix:** original #621 only cascaded to agsRuntimeRunSteps.
 *    Tool calls / memory events / policy events / hook executions
 *    were silently orphaned on every sweep. Operators querying the
 *    sub-tables would see rows pointing at deleted runIds.
 *  - Adds `environment` filter — runtime runs are partitioned across
 *    `draft` / `staging` / `production` and operators usually want
 *    distinct retention windows per environment (longer for prod)
 *
 * ADR alignment: the runtime engine writes to these tables via
 * `repository.appendRuntimeRun` + `appendRuntimeRunStep`; the
 * retention service is a pure DELETE-on-cutoff path with no engine
 * coupling, so it lives outside `services/runtime/` (which is
 * runtime-engine code) under its own module.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsRuntimeRuns,
  agsRuntimeRunSteps,
  agsRuntimeToolCalls,
  agsRuntimeMemoryEvents,
  agsRuntimePolicyEvents,
  agsRuntimeHookExecutions,
} from "../../../drizzle/tables/agent-studio.js";

export type RuntimeRunStatus =
  | "queued"
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly RuntimeRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

/** Zero-counts result used by every short-circuit + fail-soft branch. */
const ZERO_RESULT: PruneOldRuntimeRunsResult = {
  deletedRunsCount: 0,
  deletedStepsCount: 0,
  deletedToolCallsCount: 0,
  deletedMemoryEventsCount: 0,
  deletedPolicyEventsCount: 0,
  deletedHookExecutionsCount: 0,
};

export interface PruneOldRuntimeRunsInput {
  /** Cutoff — runs with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default
   * `["completed", "failed", "cancelled"]`. Pass a narrower set to
   * preserve a status across the sweep (e.g. `["completed"]` to keep
   * failed-run forensic context indefinitely).
   *
   * `awaiting_approval` is intentionally NOT in the default — those
   * rows represent paused governance state that an operator should
   * resolve, not silent retention bait.
   */
  readonly statuses?: readonly RuntimeRunStatus[];
  /**
   * Restrict to runs of a single agent (`eq`) or a set (`inArray`).
   * Mirrors the union-filter shape from background_jobs.jobKind.
   *
   * Empty array short-circuits to `{ deletedRunsCount: 0,
   * deletedStepsCount: 0 }` BEFORE the ASDB probe so a no-op
   * operator click doesn't fail when ASDB is down.
   */
  readonly agentId?: number | readonly number[];
  /**
   * Restrict to runs in a single environment (`eq`) or a set
   * (`inArray`). Operators typically want different retention windows
   * per environment — pass `["draft"]` for an aggressive sweep on
   * dev runs, `["production"]` to scope a longer-window prod sweep
   * separately.
   *
   * Empty array short-circuits in the same shape as `agentId`.
   */
  readonly environment?: string | readonly string[];
}

export interface PruneOldRuntimeRunsResult {
  /** Rows deleted from `ags_runtime_runs`. */
  readonly deletedRunsCount: number;
  /**
   * Rows deleted from `ags_runtime_run_steps` (cascade). Always
   * `>= 0`; will be 0 if the matched runs had no steps.
   */
  readonly deletedStepsCount: number;
  /**
   * #637 cascade-delete sub-counts. All sibling-table rows whose
   * `runId` matched one of the deleted runs. Always `>= 0`.
   */
  readonly deletedToolCallsCount: number;
  readonly deletedMemoryEventsCount: number;
  readonly deletedPolicyEventsCount: number;
  readonly deletedHookExecutionsCount: number;
}

export interface PruneOldRuntimeRunsOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Bulk-delete runtime runs older than the given cutoff + matching the
 * status/agent/environment filters. Cascade-deletes step rows.
 *
 * Fail-soft contract: when ASDB is unavailable, returns
 * `{ deletedRunsCount: 0, deletedStepsCount: 0 }` rather than throwing.
 * This matches the contract on pruneOldBackgroundJobs (#522) so a cron
 * sweep doesn't crash on transient DB outage.
 */
export async function pruneOldRuntimeRuns(
  input: PruneOldRuntimeRunsInput,
  options: PruneOldRuntimeRunsOptions = {},
): Promise<PruneOldRuntimeRunsResult> {
  // Empty-array short-circuits BEFORE the ASDB probe (canonical
  // pattern across workspace-observability + retention-sweep).
  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.environment) && input.environment.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsRuntimeRuns.createdAt, input.olderThan),
    inArray(agsRuntimeRuns.status, statuses as RuntimeRunStatus[]),
  ];
  const agentIdInput = input.agentId;
  if (agentIdInput !== undefined) {
    if (Array.isArray(agentIdInput)) {
      filters.push(inArray(agsRuntimeRuns.agentId, agentIdInput));
    } else {
      filters.push(eq(agsRuntimeRuns.agentId, agentIdInput as number));
    }
  }
  const envInput = input.environment;
  if (envInput !== undefined) {
    if (Array.isArray(envInput)) {
      filters.push(inArray(agsRuntimeRuns.environment, envInput));
    } else {
      filters.push(eq(agsRuntimeRuns.environment, envInput as string));
    }
  }

  // SELECT eligible runIds first so we can cascade-delete steps for
  // those exact rows. Using a separate select (rather than a DELETE
  // USING / subquery) keeps the cascade portable across Drizzle
  // dialects and gives us an exact deletedStepsCount to report.
  const candidates = await db
    .select({ id: agsRuntimeRuns.id })
    .from(agsRuntimeRuns)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const runIds = candidates.map((r) => Number(r.id));

  // Cascade-delete children first so we don't leave orphans.
  // Five sibling tables key on runId (#637 fixed the original
  // #621 oversight that only cascaded to steps). Issue them in
  // parallel via Promise.all since they're independent of each other.
  const [
    deletedSteps,
    deletedToolCalls,
    deletedMemoryEvents,
    deletedPolicyEvents,
    deletedHookExecutions,
  ] = await Promise.all([
    db
      .delete(agsRuntimeRunSteps)
      .where(inArray(agsRuntimeRunSteps.runId, runIds))
      .returning({ id: agsRuntimeRunSteps.id }),
    db
      .delete(agsRuntimeToolCalls)
      .where(inArray(agsRuntimeToolCalls.runId, runIds))
      .returning({ id: agsRuntimeToolCalls.id }),
    db
      .delete(agsRuntimeMemoryEvents)
      .where(inArray(agsRuntimeMemoryEvents.runId, runIds))
      .returning({ id: agsRuntimeMemoryEvents.id }),
    db
      .delete(agsRuntimePolicyEvents)
      .where(inArray(agsRuntimePolicyEvents.runId, runIds))
      .returning({ id: agsRuntimePolicyEvents.id }),
    db
      .delete(agsRuntimeHookExecutions)
      .where(inArray(agsRuntimeHookExecutions.runId, runIds))
      .returning({ id: agsRuntimeHookExecutions.id }),
  ]);

  const deletedRuns = await db
    .delete(agsRuntimeRuns)
    .where(inArray(agsRuntimeRuns.id, runIds))
    .returning({ id: agsRuntimeRuns.id });

  return {
    deletedRunsCount: deletedRuns.length,
    deletedStepsCount: deletedSteps.length,
    deletedToolCallsCount: deletedToolCalls.length,
    deletedMemoryEventsCount: deletedMemoryEvents.length,
    deletedPolicyEventsCount: deletedPolicyEvents.length,
    deletedHookExecutionsCount: deletedHookExecutions.length,
  };
}
