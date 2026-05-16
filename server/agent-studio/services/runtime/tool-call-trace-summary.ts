/**
 * `summarizeToolCallTraces` — stable-shape aggregator over an opaque
 * `agsToolCallTraces` row list (T-G.63).
 *
 * Companion to T-G.56 (`RUNTIME_VALIDATION_VERDICT_METADATA`) and
 * T-G.58 (`RUNTIME_DISPATCH_RESULT_METADATA`). 14th instantiation of
 * the lesson-30 aggregator-pair pattern in the post-compaction resume
 * window.
 *
 * Use case: the runtime trace dashboard renders per-run trace tables
 * + needs a one-line rollup ("128 traces — 4 rejected / 12 blocked /
 * 100 ok / 12 error — mean 240ms"). This aggregator is the
 * top-of-funnel for the runtime trace surface.
 *
 * Two structural choices:
 *   1. **Two-axis closed taxonomy** — `byValidationVerdict` (2 values)
 *      + `byDispatchResult` (3 values). They're correlated (only
 *      `validationVerdict === "ok"` reaches dispatch) but reported
 *      independently so operators can answer "how many got rejected
 *      pre-dispatch?" + "how many got blocked at the gate?" + "how
 *      many actually ran?".
 *   2. **NULL partition** — `dispatchResult` is null on rejected
 *      rows; the aggregator partitions null via
 *      `nullDispatchResultCount` (matches T-G.59 NULL-partition
 *      structural variant).
 *
 * Stable-shape guarantees:
 *   - `byValidationVerdict` zero-filled across the 2 closed values.
 *   - `byDispatchResult` zero-filled across the 3 closed values.
 *   - `nullDispatchResultCount` reports rows where dispatch never
 *     happened (rejected pre-dispatch).
 *   - `attemptedCount` + `successfulCount` derived from metadata.
 *   - `durationStats` is null when 0 rows have `durationMs`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  RUNTIME_DISPATCH_RESULTS,
  RUNTIME_DISPATCH_RESULT_METADATA,
  RUNTIME_VALIDATION_VERDICTS,
  type DispatchResult,
  type ValidationVerdict,
} from "./trace-writer.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface ToolCallTraceListSummary {
  readonly total: number;
  /** Per-validation-verdict count, zero-filled. */
  readonly byValidationVerdict: Readonly<
    Record<ValidationVerdict, number>
  >;
  /** Per-dispatch-result count, zero-filled. Null dispatchResult
   *  values are partitioned via `nullDispatchResultCount`. */
  readonly byDispatchResult: Readonly<Record<DispatchResult, number>>;
  /** Rows with `dispatchResult === null` (typically rejected
   *  validators short-circuit before dispatch). */
  readonly nullDispatchResultCount: number;
  /** Sum of dispatch results whose metadata `.attempted === true`
   *  (ok + error; excludes blocked + null). */
  readonly attemptedCount: number;
  /** Sum of dispatch results whose metadata `.successful === true`
   *  (ok only). */
  readonly successfulCount: number;
  /** `successfulCount / attemptedCount × 100`, 1-decimal. `null` when
   *  no attempts were made. */
  readonly attemptSuccessRate: number | null;
  /** Rows with non-null `errorMessage`. */
  readonly withErrorMessageCount: number;
  /** Duration stats over rows with non-null `durationMs`. */
  readonly durationStats: NumericStats | null;
}

export interface SummarizeToolCallTracesInput {
  readonly validationVerdict: ValidationVerdict;
  readonly dispatchResult: DispatchResult | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
}

function computeStats(values: readonly number[]): NumericStats | null {
  if (values.length === 0) return null;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: values.length,
    sum,
    mean: Math.round((sum / values.length) * 10) / 10,
    min,
    max,
  };
}

export function summarizeToolCallTraces(
  rows: readonly SummarizeToolCallTracesInput[],
): ToolCallTraceListSummary {
  const byValidationVerdict: Record<string, number> = {};
  for (const v of RUNTIME_VALIDATION_VERDICTS) byValidationVerdict[v] = 0;
  const byDispatchResult: Record<string, number> = {};
  for (const r of RUNTIME_DISPATCH_RESULTS) byDispatchResult[r] = 0;

  let nullDispatchResultCount = 0;
  let withErrorMessageCount = 0;
  const durations: number[] = [];

  for (const row of rows) {
    byValidationVerdict[row.validationVerdict] =
      (byValidationVerdict[row.validationVerdict] ?? 0) + 1;
    if (row.dispatchResult === null) {
      nullDispatchResultCount += 1;
    } else {
      byDispatchResult[row.dispatchResult] =
        (byDispatchResult[row.dispatchResult] ?? 0) + 1;
    }
    if (row.errorMessage !== null) withErrorMessageCount += 1;
    if (row.durationMs !== null) durations.push(row.durationMs);
  }

  let attemptedCount = 0;
  let successfulCount = 0;
  for (const result of RUNTIME_DISPATCH_RESULTS) {
    const meta = RUNTIME_DISPATCH_RESULT_METADATA[result];
    if (meta.attempted) attemptedCount += byDispatchResult[result];
    if (meta.successful) successfulCount += byDispatchResult[result];
  }
  const attemptSuccessRate =
    attemptedCount === 0
      ? null
      : Math.round((successfulCount / attemptedCount) * 1000) / 10;

  return {
    total: rows.length,
    byValidationVerdict: byValidationVerdict as Readonly<
      Record<ValidationVerdict, number>
    >,
    byDispatchResult: byDispatchResult as Readonly<
      Record<DispatchResult, number>
    >,
    nullDispatchResultCount,
    attemptedCount,
    successfulCount,
    attemptSuccessRate,
    withErrorMessageCount,
    durationStats: computeStats(durations),
  };
}
