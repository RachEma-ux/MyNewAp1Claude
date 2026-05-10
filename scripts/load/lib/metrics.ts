/**
 * Phase 12 (Roadmap V3) — runtime load certification: metrics math.
 *
 * Pure functions for percentile + summary statistics. Used by the
 * SLO checker (`slo-checker.ts`) and the report formatter
 * (`report-formatter.ts`). No I/O, no side effects.
 *
 * **Percentile algorithm:** linear interpolation between order
 * statistics — the same definition used by k6 / autocannon /
 * Prometheus, so operator metrics fed in from any of those tools
 * agree with the checker.
 */

/**
 * Compute the p-th percentile of a sample array. p is in [0, 100].
 *
 * Returns NaN when the input is empty — callers MUST check before
 * propagating to assertions. The SLO checker treats NaN as UNKNOWN
 * (distinct from FAIL: empty captures don't get a passing or
 * failing grade, just "we don't know").
 */
export function percentile(samples: ReadonlyArray<number>, p: number): number {
  if (samples.length === 0) return NaN;
  if (p < 0 || p > 100 || Number.isNaN(p)) {
    throw new Error(`percentile p must be in [0,100], got ${p}`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  // Linear interpolation: rank = p/100 * (n-1)
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const fraction = rank - lo;
  return sorted[lo] * (1 - fraction) + sorted[hi] * fraction;
}

export function p50(samples: ReadonlyArray<number>): number {
  return percentile(samples, 50);
}

export function p95(samples: ReadonlyArray<number>): number {
  return percentile(samples, 95);
}

export function p99(samples: ReadonlyArray<number>): number {
  return percentile(samples, 99);
}

export function mean(samples: ReadonlyArray<number>): number {
  if (samples.length === 0) return NaN;
  let total = 0;
  for (const v of samples) total += v;
  return total / samples.length;
}

export interface SampleSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export function summarize(samples: ReadonlyArray<number>): SampleSummary {
  if (samples.length === 0) {
    return { count: 0, min: NaN, max: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN };
  }
  let min = samples[0];
  let max = samples[0];
  for (const v of samples) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    count: samples.length,
    min,
    max,
    mean: mean(samples),
    p50: p50(samples),
    p95: p95(samples),
    p99: p99(samples),
  };
}

/**
 * Linear regression slope of an array, treating each sample as
 * spaced 1 unit apart. Used by S5 (long-run memory) — a non-zero
 * slope across a 2-minute window indicates unbounded growth.
 *
 * Returns NaN for arrays of length < 2.
 */
export function linearSlope(samples: ReadonlyArray<number>): number {
  if (samples.length < 2) return NaN;
  const n = samples.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = samples[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  // Slope = (n*ΣXY - ΣX*ΣY) / (n*ΣXX - (ΣX)²)
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return NaN;
  return (n * sumXY - sumX * sumY) / denom;
}
