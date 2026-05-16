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
 *  - Cascade-deletes 8 sibling tables that key on `runtimeRunId`:
 *      agsRuntimeRunSteps         (per-step trace)
 *      agsRuntimeToolCalls        (tool dispatch trace)
 *      agsRuntimeMemoryEvents     (memory writes per run)
 *      agsRuntimePolicyEvents     (governance decisions per run)
 *      agsRuntimeHookExecutions   (hook invocations per run)
 *      agsRuntimeGraphEvents      (Phase 14 Native Graph Workspace
 *                                  projection events emitted by the
 *                                  graph-agent per runtime trace)
 *      agsRuntimeNoteReferences   (Phase 14 §6: note references
 *                                  used during a runtime trace)
 *      agsCagBlockRuntimeUsages   (Phase 14 §6/§7: CAG capability
 *                                  pack usage rows emitted per run)
 *    Deletion order: children first, then parent (no FK constraint,
 *    but orphans are visually confusing in the operator UI when a
 *    sub-table query returns rows for a non-existent run).
 *
 *  - **#637 fix:** original #621 only cascaded to agsRuntimeRunSteps.
 *    Tool calls / memory events / policy events / hook executions
 *    were silently orphaned on every sweep. Operators querying the
 *    sub-tables would see rows pointing at deleted runIds.
 *  - **#643 fix:** same shape as #637, this time for
 *    `agsRuntimeGraphEvents` — the Native Graph Workspace (Phase 14)
 *    added this table after the #637 audit, and it was missed by the
 *    initial cascade extension. The graph-agent writes one row per
 *    runtime trace + decision trace event; without this cascade,
 *    every sweep silently orphans graph-event rows.
 *  - **#644 fix:** same shape as #637/#643 — Phase 14 §6/§7 added
 *    two more per-runtime-trace usage tables on the graph-promotion
 *    module side: `agsRuntimeNoteReferences` (notes used during a
 *    runtime trace) and `agsCagBlockRuntimeUsages` (CAG capability
 *    pack usage). Neither was in the graph-agent retention service
 *    (`services/graph-agent/retention.ts`, which targets graph-agent
 *    ledgers with a 90-day horizon — a deliberately longer policy
 *    for the agent-scoped audit tables). These two are per-runtime-
 *    trace forensic rows, so they belong in the runtime-runs cascade
 *    alongside the other per-run side-tables.
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
import { agsRuntimeGraphEvents } from "../../../drizzle/tables/agent-studio-graph-projection.js";
import {
  agsRuntimeNoteReferences,
  agsCagBlockRuntimeUsages,
} from "../../../drizzle/tables/agent-studio-graph-promotion.js";

/**
 * Closed-taxonomy `agsRuntimeRuns.status` ladder. Promoted from a
 * literal union to a tuple-derived constant at T-G.64 so the
 * metadata table + lockstep tests + aggregator can iterate the
 * values without re-declaring them.
 */
export const RUNTIME_RUN_STATUSES = [
  "queued",
  "pending",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RuntimeRunStatus = (typeof RUNTIME_RUN_STATUSES)[number];

// ============================================================================
// Per-status operator-facing metadata (T-G.64)
// ============================================================================

export interface RuntimeRunStatusMetadata {
  /** Display label rendered in the runtime-runs ledger UI. */
  readonly label: string;
  /** Short operator-facing description of what the status means. */
  readonly description: string;
  /** Whether the status is terminal (true for completed / failed /
   *  cancelled — sweep-eligible; false for queued / pending /
   *  running / awaiting_approval — in-flight). */
  readonly terminal: boolean;
  /** Whether the run reached a successful outcome (true for
   *  `completed` only). */
  readonly successful: boolean;
}

export const RUNTIME_RUN_STATUS_METADATA: Readonly<
  Record<RuntimeRunStatus, RuntimeRunStatusMetadata>
> = {
  queued: {
    label: "Queued",
    description:
      "Run is enqueued but the runtime worker has not picked it up yet — earliest in-flight state.",
    terminal: false,
    successful: false,
  },
  pending: {
    label: "Pending",
    description:
      "Run is initializing — context assembly / pre-flight checks in progress. No tool dispatches yet.",
    terminal: false,
    successful: false,
  },
  running: {
    label: "Running",
    description:
      "Run is actively dispatching tool calls / streaming model responses — the lion's share of runtime wall-clock lives here.",
    terminal: false,
    successful: false,
  },
  awaiting_approval: {
    label: "Awaiting Approval",
    description:
      "Run paused at a critical-approval gate. Resumes once an approver acts; counts against approval-aging telemetry.",
    terminal: false,
    successful: false,
  },
  completed: {
    label: "Completed",
    description:
      "Run finished cleanly — terminal success. Trace is preserved through retention window; runtime artifacts garbage-collected after.",
    terminal: true,
    successful: true,
  },
  failed: {
    label: "Failed",
    description:
      "Run terminated with an error — trace row carries the failure reason. Operator may retry or inspect the stack.",
    terminal: true,
    successful: false,
  },
  cancelled: {
    label: "Cancelled",
    description:
      "Run was cancelled by the operator or upstream system before completion. Terminal but distinct from `failed`.",
    terminal: true,
    successful: false,
  },
};

export function getRuntimeRunStatusMetadata(
  status: RuntimeRunStatus,
): RuntimeRunStatusMetadata {
  return RUNTIME_RUN_STATUS_METADATA[status];
}

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
  deletedGraphEventsCount: 0,
  deletedNoteReferencesCount: 0,
  deletedCagBlockUsagesCount: 0,
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
  /**
   * #643 cascade-delete sub-count. `agsRuntimeGraphEvents` rows
   * whose `runtimeRunId` matched one of the deleted runs. Always
   * `>= 0`.
   */
  readonly deletedGraphEventsCount: number;
  /**
   * #644 cascade-delete sub-counts. Phase 14 §6/§7 per-runtime-trace
   * usage tables on the graph-promotion module side. Always `>= 0`.
   */
  readonly deletedNoteReferencesCount: number;
  readonly deletedCagBlockUsagesCount: number;
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
  // Eight sibling tables key on runtimeRunId (#637 extended to 5,
  // #643 added agsRuntimeGraphEvents, #644 added agsRuntimeNoteRefs
  // + agsCagBlockRuntimeUsages). Issue them in parallel via
  // Promise.all since they're independent of each other.
  const [
    deletedSteps,
    deletedToolCalls,
    deletedMemoryEvents,
    deletedPolicyEvents,
    deletedHookExecutions,
    deletedGraphEvents,
    deletedNoteReferences,
    deletedCagBlockUsages,
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
    db
      .delete(agsRuntimeGraphEvents)
      .where(inArray(agsRuntimeGraphEvents.runtimeRunId, runIds))
      .returning({ id: agsRuntimeGraphEvents.id }),
    db
      .delete(agsRuntimeNoteReferences)
      .where(inArray(agsRuntimeNoteReferences.runtimeRunId, runIds))
      .returning({ id: agsRuntimeNoteReferences.id }),
    db
      .delete(agsCagBlockRuntimeUsages)
      .where(inArray(agsCagBlockRuntimeUsages.runtimeRunId, runIds))
      .returning({ id: agsCagBlockRuntimeUsages.id }),
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
    deletedGraphEventsCount: deletedGraphEvents.length,
    deletedNoteReferencesCount: deletedNoteReferences.length,
    deletedCagBlockUsagesCount: deletedCagBlockUsages.length,
  };
}
