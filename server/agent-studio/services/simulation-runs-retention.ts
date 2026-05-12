/**
 * Simulation Runs — retention sweep service.
 *
 * Phase 22 follow-up #649. The `ags_simulation_runs` table accumulates
 * one row per simulation execution; `ags_simulation_run_steps` adds
 * many step rows per run. No retention before this PR — both tables
 * grow unbounded with every "run simulation" click.
 *
 * Pattern mirrors `runtime-runs-retention.ts` (#621, cascade extended
 * in #637/#643/#644) but on a smaller surface: simulation runs only
 * have one cascade child (steps), so this is a much simpler 2-table
 * cascade. Same fail-soft / empty-array short-circuit / union-filter
 * contract.
 *
 * Differences from runtime-runs:
 *  - Single cascade child (steps) vs 8 for runtime-runs.
 *  - Status set is different: `queued` / `running` / `passed` /
 *    `failed` / `cancelled` (simulation engine uses `verdict`
 *    separately).
 *  - Default terminal statuses: `passed` / `failed` / `cancelled`.
 *    `queued` + `running` preserved as in-progress; operators
 *    resolve those by inspecting the simulation engine directly.
 *  - No `environment` field on simulations.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsSimulationRuns,
  agsSimulationRunSteps,
} from "../../../drizzle/tables/agent-studio.js";

export type SimulationRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly SimulationRunStatus[] = [
  "passed",
  "failed",
  "cancelled",
];

const ZERO_RESULT: PruneOldSimulationRunsResult = {
  deletedRunsCount: 0,
  deletedStepsCount: 0,
};

export interface PruneOldSimulationRunsInput {
  /** Cutoff — runs with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["passed", "failed", "cancelled"]`. Operators preserving `failed`
   * forensics pass `["passed"]`.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly SimulationRunStatus[];
  /**
   * Restrict to a single agent (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly agentId?: number | readonly number[];
  /**
   * Restrict to a single scenario (`eq`) or set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly scenarioId?: number | readonly number[];
}

export interface PruneOldSimulationRunsResult {
  readonly deletedRunsCount: number;
  readonly deletedStepsCount: number;
}

export interface PruneOldSimulationRunsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldSimulationRuns(
  input: PruneOldSimulationRunsInput,
  options: PruneOldSimulationRunsOptions = {},
): Promise<PruneOldSimulationRunsResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.scenarioId) && input.scenarioId.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsSimulationRuns.createdAt, input.olderThan),
    inArray(agsSimulationRuns.status, statuses as SimulationRunStatus[]),
  ];
  const agentIdInput = input.agentId;
  if (agentIdInput !== undefined) {
    if (Array.isArray(agentIdInput)) {
      filters.push(inArray(agsSimulationRuns.agentId, agentIdInput));
    } else {
      filters.push(eq(agsSimulationRuns.agentId, agentIdInput as number));
    }
  }
  const scenarioIdInput = input.scenarioId;
  if (scenarioIdInput !== undefined) {
    if (Array.isArray(scenarioIdInput)) {
      filters.push(inArray(agsSimulationRuns.scenarioId, scenarioIdInput));
    } else {
      filters.push(
        eq(agsSimulationRuns.scenarioId, scenarioIdInput as number),
      );
    }
  }

  // SELECT eligible runIds first so we can cascade-delete steps + get
  // accurate per-table counts.
  const candidates = await db
    .select({ id: agsSimulationRuns.id })
    .from(agsSimulationRuns)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const runIds = candidates.map((r) => Number(r.id));

  // Cascade-delete steps first, then parent runs. Single child here
  // (simulations don't have the runtime-runs side-tables), so a plain
  // sequential pair is fine.
  const deletedSteps = await db
    .delete(agsSimulationRunSteps)
    .where(inArray(agsSimulationRunSteps.runId, runIds))
    .returning({ id: agsSimulationRunSteps.id });

  const deletedRuns = await db
    .delete(agsSimulationRuns)
    .where(inArray(agsSimulationRuns.id, runIds))
    .returning({ id: agsSimulationRuns.id });

  return {
    deletedRunsCount: deletedRuns.length,
    deletedStepsCount: deletedSteps.length,
  };
}
