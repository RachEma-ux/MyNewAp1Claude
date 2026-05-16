/**
 * Graph Projection Staleness Cron (T-I.47).
 *
 * Wraps `runStalenessCheck` (T-I.44 orchestrator) in the shared
 * `makeRetentionCron` factory so the staleness scan runs automatically
 * on a daily schedule alongside the drift cron + the 18 retention
 * crons in the same status panel pattern.
 *
 * Defaults:
 *   - Cron: `"15 4 * * *"` — daily 04:15 UTC, between the runtime-runs
 *     sweep (04:00) and the drift cron (04:30). Slot in the daily-
 *     sweep ladder.
 *   - Retention envelope: NONE. Staleness is a scan, not a prune.
 *     `defaultRetentionDays: null` per the factory contract.
 *
 * Env:
 *   - `AGS_PROJECTION_STALENESS_CRON_DISABLED` — `"1" | "true"` to
 *     disable.
 *   - `AGS_PROJECTION_STALENESS_CRON_EXPR` — override cron expression.
 *
 * The staleness check itself fires `neo4j_projection_stale` bridge
 * events for each stale projection (T-I.43 emitter); the cron return
 * shape carries the rollup counts for the operator status panel.
 *
 * Hard-rule compliance:
 *   - Uses the shared retention-cron factory; no new scheduling primitives
 *   - No `credential-resolver` / `*_API_KEY` reads
 *   - No `dispatchMcpToolCall` import
 *   - No `neo4j-driver` / `GraphRepository` imports
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
  loadStalenessRowsFromAsDb,
  runStalenessCheck,
  type ProjectionStalenessSummary,
} from "./staleness-detector.js";

export interface StalenessCronInput {
  /** Override the freshness threshold (ms). Default 1 hour. */
  readonly thresholdMs?: number;
  /** Max rows to load from `agsGraphProjectionSyncJobs`. */
  readonly limit?: number;
  /** Test seam — replace the row loader. */
  readonly fetchRows?: () => Promise<
    ReadonlyArray<{
      readonly id: number;
      readonly projectionKey: string;
      readonly status: string;
      readonly completedAt: Date | null;
    }>
  >;
}

export interface StalenessCronResult {
  readonly distinctProjectionCount: number;
  readonly staleCount: number;
  readonly neverSucceededCount: number;
  readonly freshCount: number;
  readonly scannedAt: string;
}

function summarize(
  summary: ProjectionStalenessSummary,
  scannedAt: string,
): StalenessCronResult {
  return {
    distinctProjectionCount: summary.distinctProjectionCount,
    staleCount: summary.stale.length,
    neverSucceededCount: summary.neverSucceeded.length,
    freshCount: summary.freshCount,
    scannedAt,
  };
}

const cron = makeRetentionCron<StalenessCronInput, StalenessCronResult>({
  logPrefix: "ags-projection-staleness-cron",
  envPrefix: "AGS_PROJECTION_STALENESS",
  defaultCronExpr: "15 4 * * *",
  defaultRetentionDays: null,
  buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
  runSweep: async (input) => {
    const scannedAt = new Date().toISOString();
    const summary = await runStalenessCheck({
      fetchRows:
        input.fetchRows ??
        (() => loadStalenessRowsFromAsDb({ limit: input.limit })),
      thresholdMs: input.thresholdMs,
    });
    return summarize(summary, scannedAt);
  },
  formatSweepLogTail: (r) =>
    `projections=${r.distinctProjectionCount} stale=${r.staleCount} never_succeeded=${r.neverSucceededCount} fresh=${r.freshCount}`,
  formatStartupLogTail: () => "scope=default",
});

export const DEFAULT_PROJECTION_STALENESS_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickProjectionStalenessCronOptions = TickRetentionCronOptions<
  StalenessCronInput,
  StalenessCronResult
>;
export type TickProjectionStalenessCronResult =
  TickRetentionCronResult<StalenessCronResult>;
export type ProjectionStalenessCronEnsureState =
  RetentionCronEnsureState<StalenessCronResult>;
export type ProjectionStalenessCronStatus =
  RetentionCronStatus<StalenessCronResult>;

export const tickProjectionStalenessCron = cron.tick;
export const getProjectionStalenessCronStatus = cron.getStatus;
export const ensureProjectionStalenessCronStarted = cron.ensureStarted;
export const _resetProjectionStalenessCronForTests = cron.resetForTests;
