/**
 * Projection staleness detector — Phase 22 §T-I.43.
 *
 * Closes the detection-gap for kind #7 `neo4j_projection_stale`. The
 * audit doc had this listed as 🟡 "Detection state exists in DB but no
 * observability surface". The detection state was actually NOT
 * shipped — `agsGraphProjectionSyncJobs` rows persist status +
 * completedAt per-projection, but no module computed the freshness
 * gap. This module is the pure-function half of the detection slice;
 * a follow-up cron wires it on top of a real DB query.
 *
 * Stale = `now - max(completedAt where status === "succeeded")` per
 * `projectionKey` exceeds the threshold (default 1 hour). Projections
 * with no completed runs are reported separately so the operator can
 * distinguish "never-projected" from "stuck-at-old-state".
 *
 * Per-projection result categories:
 *   - `stale` — has a succeeded run, but it's older than threshold.
 *   - `fresh` — has a succeeded run within threshold. Reported in
 *     summary counts but not in the `stale` list.
 *   - `never_succeeded` — no row with status === "succeeded" exists.
 *
 * Pure function — no DB I/O. The DB-reading cron wrapper lives in
 * `staleness-detector-cron.ts` (separate slice when scheduling lands).
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `*_API_KEY` reads
 *   - No `dispatchMcpToolCall` import
 *   - No `neo4j-driver` / `GraphRepository` imports
 *   - No `openrouter` imports
 *   - Pure function over input array; no DB I/O
 */

import {
  recordFailureStateEvent,
  type RecordFailureStateEventInput,
} from "../../failure-states/observability-bridge.js";

export interface ProjectionSyncJobRow {
  readonly id: number;
  readonly projectionKey: string;
  readonly status: string;
  readonly completedAt: Date | null;
}

export interface StaleProjectionFinding {
  readonly projectionKey: string;
  readonly lastSucceededAt: Date;
  readonly lagMs: number;
}

export interface NeverSucceededProjectionFinding {
  readonly projectionKey: string;
  readonly attemptedRunCount: number;
}

export interface ProjectionStalenessSummary {
  /** Distinct projectionKey values seen across all rows. */
  readonly distinctProjectionCount: number;
  /** Per-projection rollup of stale entries. */
  readonly stale: readonly StaleProjectionFinding[];
  /** Per-projection rollup of projections with zero successful runs. */
  readonly neverSucceeded: readonly NeverSucceededProjectionFinding[];
  /** Distinct projections within freshness threshold. */
  readonly freshCount: number;
}

export interface DetectStaleProjectionsOptions {
  /** Override the clock for deterministic tests. */
  readonly now?: Date;
  /** Maximum permitted lag (ms) before a projection is reported as
   *  stale. Default: 1 hour. */
  readonly thresholdMs?: number;
}

const DEFAULT_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Pure-function detector. Returns a structured rollup; emission is a
 * separate concern (see `emitStaleProjections`).
 */
export function detectStaleProjections(
  rows: readonly ProjectionSyncJobRow[],
  options: DetectStaleProjectionsOptions = {},
): ProjectionStalenessSummary {
  const now = (options.now ?? new Date()).getTime();
  const threshold = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;

  const lastSucceeded = new Map<string, Date>();
  const attemptedRuns = new Map<string, number>();
  const allKeys = new Set<string>();

  for (const row of rows) {
    allKeys.add(row.projectionKey);
    attemptedRuns.set(
      row.projectionKey,
      (attemptedRuns.get(row.projectionKey) ?? 0) + 1,
    );
    if (row.status === "succeeded" && row.completedAt !== null) {
      const prev = lastSucceeded.get(row.projectionKey);
      if (prev === undefined || row.completedAt.getTime() > prev.getTime()) {
        lastSucceeded.set(row.projectionKey, row.completedAt);
      }
    }
  }

  const stale: StaleProjectionFinding[] = [];
  const neverSucceeded: NeverSucceededProjectionFinding[] = [];
  let freshCount = 0;

  for (const key of allKeys) {
    const last = lastSucceeded.get(key);
    if (last === undefined) {
      neverSucceeded.push({
        projectionKey: key,
        attemptedRunCount: attemptedRuns.get(key) ?? 0,
      });
      continue;
    }
    const lagMs = now - last.getTime();
    if (lagMs > threshold) {
      stale.push({ projectionKey: key, lastSucceededAt: last, lagMs });
    } else {
      freshCount += 1;
    }
  }

  // Stable order: descending lag (most-stale first), then alphabetical.
  stale.sort((a, b) => {
    if (a.lagMs !== b.lagMs) return b.lagMs - a.lagMs;
    return a.projectionKey.localeCompare(b.projectionKey);
  });
  // Stable order: descending attempt count, then alphabetical.
  neverSucceeded.sort((a, b) => {
    if (a.attemptedRunCount !== b.attemptedRunCount) {
      return b.attemptedRunCount - a.attemptedRunCount;
    }
    return a.projectionKey.localeCompare(b.projectionKey);
  });

  return {
    distinctProjectionCount: allKeys.size,
    stale,
    neverSucceeded,
    freshCount,
  };
}

export interface EmitStaleProjectionsOptions {
  /** Emitter override; defaults to the canonical bridge. Set to `null`
   *  to suppress emission. */
  readonly recordFailureStateEvent?:
    | ((input: RecordFailureStateEventInput) => Promise<unknown>)
    | null;
  /** Threshold (ms) — used to stamp metadata so operators see the
   *  threshold the emission was computed against. */
  readonly thresholdMs?: number;
}

/**
 * Emits one `neo4j_projection_stale` event per stale projection. Pure
 * over the summary input; the only side effect is the bridge call.
 * Fire-and-forget per the bridge's fail-soft contract.
 */
export function emitStaleProjections(
  summary: ProjectionStalenessSummary,
  options: EmitStaleProjectionsOptions = {},
): void {
  const emitter =
    options.recordFailureStateEvent === undefined
      ? recordFailureStateEvent
      : options.recordFailureStateEvent;
  if (emitter === null) return;
  const threshold = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  for (const s of summary.stale) {
    void emitter({
      failureState: "neo4j_projection_stale",
      sourceKind: "graph-projection.staleness-detector",
      sourceId: s.projectionKey,
      errorMessage: `Projection ${s.projectionKey} stale: lag=${s.lagMs}ms (threshold=${threshold}ms)`,
      metadata: {
        projectionKey: s.projectionKey,
        lagMs: s.lagMs,
        thresholdMs: threshold,
        lastSucceededAt: s.lastSucceededAt.toISOString(),
      },
    }).catch(() => {
      // Fail-soft.
    });
  }
}

/**
 * Manual-trigger orchestrator (T-I.43 follow-up): loads rows from a
 * supplied row-fetcher, runs the pure detector, fires the emitter, and
 * returns the summary. The DB-reading default fetcher is the caller's
 * responsibility — tests inject a stub fetcher; production tRPC /
 * cron callers pass a Drizzle-based one.
 *
 * Decoupled from the cron factory because the detector should be
 * runnable both on-demand (operator-triggered tRPC) and on schedule
 * (`makeRetentionCron`); the cron wrapper is a separate slice.
 */
export type StalenessRowFetcher = () => Promise<readonly ProjectionSyncJobRow[]>;

export interface RunStalenessCheckOptions
  extends DetectStaleProjectionsOptions,
    EmitStaleProjectionsOptions {
  readonly fetchRows: StalenessRowFetcher;
}

export async function runStalenessCheck(
  options: RunStalenessCheckOptions,
): Promise<ProjectionStalenessSummary> {
  const rows = await options.fetchRows();
  const summary = detectStaleProjections(rows, {
    now: options.now,
    thresholdMs: options.thresholdMs,
  });
  emitStaleProjections(summary, {
    recordFailureStateEvent: options.recordFailureStateEvent,
    thresholdMs: options.thresholdMs,
  });
  return summary;
}
