/**
 * Sensor pipeline — time-series quality validator.
 *
 * Inspects a batch of normalized sensor readings and produces a quality
 * verdict shaped like the canonical `quality` block. Flags:
 *   - GAP_TOO_LARGE      gap between consecutive recordedAt > maxGapMs
 *   - VALUE_OUT_OF_RANGE numeric value outside the metric's clamp range
 *   - DUPLICATE_TIMESTAMP repeated recordedAt for the same device+metric
 *   - NO_RECORDED_AT     reading missing recordedAt
 */

import type { InsertDataAcquisitionSensorReading } from "../../../../../drizzle/schema";

export interface TimeSeriesValidationOpts {
  maxGapMs?: number;
  clampRange?: { min: number; max: number };
}

export interface TimeSeriesIssue {
  code:
    | "GAP_TOO_LARGE"
    | "VALUE_OUT_OF_RANGE"
    | "DUPLICATE_TIMESTAMP"
    | "NO_RECORDED_AT";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface TimeSeriesVerdict {
  confidenceScore: number;
  requiresReview: boolean;
  issues: TimeSeriesIssue[];
}

export function validateTimeSeries(
  readings: InsertDataAcquisitionSensorReading[],
  opts: TimeSeriesValidationOpts = {},
): TimeSeriesVerdict {
  const issues: TimeSeriesIssue[] = [];
  const seen = new Set<string>();
  let lastTs: number | null = null;
  for (const r of readings) {
    if (!r.recordedAt) {
      issues.push({
        code: "NO_RECORDED_AT",
        severity: "medium",
        message: `Reading on ${r.metricKey}/${r.deviceId ?? "?"} has no recordedAt`,
      });
      continue;
    }
    const ts = r.recordedAt instanceof Date ? r.recordedAt.getTime() : Number(r.recordedAt);
    const k = `${r.deviceId ?? ""}::${r.metricKey}::${ts}`;
    if (seen.has(k)) {
      issues.push({
        code: "DUPLICATE_TIMESTAMP",
        severity: "low",
        message: `Duplicate ${r.metricKey} reading at ${new Date(ts).toISOString()}`,
      });
    }
    seen.add(k);
    if (lastTs !== null && opts.maxGapMs && ts - lastTs > opts.maxGapMs) {
      issues.push({
        code: "GAP_TOO_LARGE",
        severity: "low",
        message: `Gap of ${ts - lastTs}ms exceeds ${opts.maxGapMs}ms between readings`,
      });
    }
    lastTs = ts;
    if (opts.clampRange) {
      const num = Number(r.value);
      if (Number.isFinite(num) && (num < opts.clampRange.min || num > opts.clampRange.max)) {
        issues.push({
          code: "VALUE_OUT_OF_RANGE",
          severity: "high",
          message: `Value ${num} outside [${opts.clampRange.min}, ${opts.clampRange.max}]`,
        });
      }
    }
  }
  const score = Math.max(0, 100 - issues.length * 10);
  const requiresReview = issues.some((i) => i.severity === "high") || issues.length >= 5;
  return { confidenceScore: score, requiresReview, issues };
}
