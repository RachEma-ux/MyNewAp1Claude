/**
 * Graph Projection Queue Drain Cron.
 *
 * Wraps `drainPendingProjectionJobs` (#1479) in the shared
 * `makeRetentionCron` factory so pending rows in
 * `ags_graph_projection_sync_jobs` get processed automatically.
 * Without this cron, the queue grew unboundedly: every vault note
 * create/update/delete (via #1477/#1478) enqueued a row that no
 * consumer ever drained.
 *
 * Defaults:
 *   - Cron: `"*\/5 * * * *"` — every 5 minutes. Tight enough that
 *     operator-visible graph state stays fresh, loose enough that a
 *     Neo4j outage doesn't burn every row in seconds.
 *   - Retention envelope: NONE. The drain processes pending rows;
 *     prune of old completed/failed rows is a separate concern owned
 *     by a future retention cron.
 *
 * Env:
 *   - `AGS_PROJECTION_DRAIN_CRON_DISABLED` — `"1" | "true"` to disable.
 *   - `AGS_PROJECTION_DRAIN_CRON_EXPR` — override cron expression.
 *
 * Hard-rule compliance:
 *   - Uses the shared retention-cron factory; no new scheduling primitives
 *   - No `credential-resolver` / `*_API_KEY` reads
 *   - No `neo4j-driver` direct imports (delegates to GraphRepository)
 *   - No `openrouter` imports
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../../retention/make-retention-cron.js";
import {
  drainPendingProjectionJobs,
  type DrainOptions,
  type DrainSummary,
} from "./queue-drain.js";

export interface DrainCronInput {
  /** Max rows to drain per tick. Default 100 (drain orchestrator default). */
  readonly limit?: number;
  /** Test seam — replace the underlying drain. */
  readonly runDrain?: (options: DrainOptions) => Promise<DrainSummary>;
}

export interface DrainCronResult {
  readonly processed: number;
  readonly completed: number;
  readonly failed: number;
  readonly unknownEventKind: number;
  readonly drainedAt: string;
}

function summarize(
  summary: DrainSummary,
  drainedAt: string,
): DrainCronResult {
  return {
    processed: summary.processed,
    completed: summary.completed,
    failed: summary.failed,
    unknownEventKind: summary.unknownEventKind,
    drainedAt,
  };
}

const cron = makeRetentionCron<DrainCronInput, DrainCronResult>({
  logPrefix: "ags-projection-drain-cron",
  envPrefix: "AGS_PROJECTION_DRAIN",
  defaultCronExpr: "*/5 * * * *",
  defaultRetentionDays: null,
  buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
  runSweep: async (input) => {
    const drainedAt = new Date().toISOString();
    const runDrain = input.runDrain ?? drainPendingProjectionJobs;
    const summary = await runDrain({ limit: input.limit });
    return summarize(summary, drainedAt);
  },
  formatSweepLogTail: (r) =>
    `processed=${r.processed} completed=${r.completed} failed=${r.failed} unknown=${r.unknownEventKind}`,
  formatStartupLogTail: () => "scope=default",
});

export const DEFAULT_PROJECTION_DRAIN_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickProjectionDrainCronOptions = TickRetentionCronOptions<
  DrainCronInput,
  DrainCronResult
>;
export type TickProjectionDrainCronResult =
  TickRetentionCronResult<DrainCronResult>;
export type ProjectionDrainCronEnsureState =
  RetentionCronEnsureState<DrainCronResult>;
export type ProjectionDrainCronStatus =
  RetentionCronStatus<DrainCronResult>;

export const tickProjectionDrainCron = cron.tick;
export const getProjectionDrainCronStatus = cron.getStatus;
export const ensureProjectionDrainCronStarted = cron.ensureStarted;
export const _resetProjectionDrainCronForTests = cron.resetForTests;
