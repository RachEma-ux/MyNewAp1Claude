/**
 * `summarizeCagCapabilityPacks` — stable-shape row-state aggregator
 * over `CagCapabilityPack[]` (T-G.59).
 *
 * Companion to the CAG per-kind metadata canonization shipped at
 * T-G.40-G.46 (#1156-#1162). Instantiates the registry-plus-row-state
 * aggregator pair pattern (lesson 30 of the V1+ session memory) on
 * the CAG-pack surface — row-side counterpart to the in-process
 * pack registry (which is the DB itself; no process-local map).
 *
 * Stable-shape guarantees (mirrors T-X.6 / T-D.16 / T-F.9 / etc.):
 *   - `byStatus[status]` zero-filled across `CAG_PACK_STATUSES`.
 *   - `byCompileResult[result]` zero-filled across
 *     `CAG_COMPILE_RESULTS`; null compileResult counted via
 *     `nullCompileResultCount` axis (does NOT pollute the closed
 *     taxonomy counters).
 *   - `byGovernanceVerdict[verdict]` zero-filled across
 *     `CAG_GOVERNANCE_VERDICTS`; null counted via
 *     `nullGovernanceVerdictCount`.
 *   - `tokenBudgetEstimateStats` / `useCountStats` are null when
 *     zero packs have a value (no NaN/0 ambiguity).
 *   - All percent gauges rounded to 1 decimal; 0-on-empty.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure function. No DB I/O. No `credential-resolver` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` imports.
 */

import {
  CAG_COMPILE_RESULTS,
  CAG_GOVERNANCE_VERDICTS,
  CAG_PACK_STATUSES,
  type CagCapabilityPack,
  type CagCompileResult,
  type CagGovernanceVerdict,
  type CagPackStatus,
} from "./types.js";

export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface CagCapabilityPackListSummary {
  readonly total: number;
  /** Per-status count, zero-filled across `CAG_PACK_STATUSES`. */
  readonly byStatus: Readonly<Record<CagPackStatus, number>>;
  /** Per-compileResult count, zero-filled across closed taxonomy.
   *  Null compileResult counted via `nullCompileResultCount`. */
  readonly byCompileResult: Readonly<Record<CagCompileResult, number>>;
  /** Packs with `compileResult === null` (uncompiled / not yet
   *  validated). */
  readonly nullCompileResultCount: number;
  /** Per-governanceVerdict count, zero-filled across closed taxonomy. */
  readonly byGovernanceVerdict: Readonly<
    Record<CagGovernanceVerdict, number>
  >;
  /** Packs with `governanceVerdict === null` (governance not yet
   *  evaluated). */
  readonly nullGovernanceVerdictCount: number;
  /** Packs whose `compileWarnings` array is non-empty. */
  readonly withCompileWarnings: number;
  /** Packs whose `governanceBlockers` array is non-empty. */
  readonly withGovernanceBlockers: number;
  /** Packs whose `expiresAt` is non-null AND <= now. */
  readonly expiredCount: number;
  /** Packs whose `expiresAt` is non-null AND > now. */
  readonly notYetExpiredCount: number;
  /** Packs whose `expiresAt` is null (never expires by default). */
  readonly noExpiryCount: number;
  /** Stats over `tokenBudgetEstimate` across packs with a non-null
   *  value. `null` when 0 packs have a value (no NaN). */
  readonly tokenBudgetEstimateStats: NumericStats | null;
  /** Stats over `useCount` across all packs. `null` when input is
   *  empty (no NaN). */
  readonly useCountStats: NumericStats | null;
}

export interface SummarizeCagCapabilityPacksOptions {
  /** Override the clock for `expiresAt` partition. Tests inject. */
  readonly now?: Date;
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

export function summarizeCagCapabilityPacks(
  packs: readonly CagCapabilityPack[],
  options: SummarizeCagCapabilityPacksOptions = {},
): CagCapabilityPackListSummary {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  const byStatus: Record<string, number> = {};
  for (const s of CAG_PACK_STATUSES) byStatus[s] = 0;
  const byCompileResult: Record<string, number> = {};
  for (const r of CAG_COMPILE_RESULTS) byCompileResult[r] = 0;
  const byGovernanceVerdict: Record<string, number> = {};
  for (const v of CAG_GOVERNANCE_VERDICTS) byGovernanceVerdict[v] = 0;

  let nullCompileResultCount = 0;
  let nullGovernanceVerdictCount = 0;
  let withCompileWarnings = 0;
  let withGovernanceBlockers = 0;
  let expiredCount = 0;
  let notYetExpiredCount = 0;
  let noExpiryCount = 0;

  const tokenBudgetValues: number[] = [];
  const useCountValues: number[] = [];

  for (const p of packs) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    if (p.compileResult === null) {
      nullCompileResultCount += 1;
    } else {
      byCompileResult[p.compileResult] =
        (byCompileResult[p.compileResult] ?? 0) + 1;
    }
    if (p.governanceVerdict === null) {
      nullGovernanceVerdictCount += 1;
    } else {
      byGovernanceVerdict[p.governanceVerdict] =
        (byGovernanceVerdict[p.governanceVerdict] ?? 0) + 1;
    }
    if (p.compileWarnings.length > 0) withCompileWarnings += 1;
    if (p.governanceBlockers.length > 0) withGovernanceBlockers += 1;
    if (p.expiresAt === null) {
      noExpiryCount += 1;
    } else if (p.expiresAt.getTime() <= nowMs) {
      expiredCount += 1;
    } else {
      notYetExpiredCount += 1;
    }
    if (p.tokenBudgetEstimate !== null) {
      tokenBudgetValues.push(p.tokenBudgetEstimate);
    }
    useCountValues.push(p.useCount);
  }

  return {
    total: packs.length,
    byStatus: byStatus as Readonly<Record<CagPackStatus, number>>,
    byCompileResult: byCompileResult as Readonly<
      Record<CagCompileResult, number>
    >,
    nullCompileResultCount,
    byGovernanceVerdict: byGovernanceVerdict as Readonly<
      Record<CagGovernanceVerdict, number>
    >,
    nullGovernanceVerdictCount,
    withCompileWarnings,
    withGovernanceBlockers,
    expiredCount,
    notYetExpiredCount,
    noExpiryCount,
    tokenBudgetEstimateStats: computeStats(tokenBudgetValues),
    useCountStats: computeStats(useCountValues),
  };
}
