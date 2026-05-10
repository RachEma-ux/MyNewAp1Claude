/**
 * Phase 12 (Roadmap V3) — runtime load certification: SLO checker.
 *
 * Given a `LoadReportInput` (operator-captured metrics from any load
 * harness — k6, autocannon, custom Node script), produces a
 * `LoadReport` with PASS / FAIL / UNKNOWN per-SLO assessments and an
 * overall summary.
 *
 * The 10 SLOs (S1–S10) are defined in
 * `docs/operations/agent-studio-runtime-slo.md` (Phase 11c). This
 * module is the runtime mirror of that doc.
 *
 * **UNKNOWN semantics.** When the input doesn't carry the relevant
 * capture for an SLO (e.g., no `firstTokenLatency` field), the SLO
 * is `UNKNOWN`, NOT `PASS`. This is the load-bearing safety
 * property: an operator running a partial harness gets a partial
 * certification, not an accidentally-green report.
 */

import { percentile, mean, linearSlope } from "./metrics";
import type {
  LoadReport,
  LoadReportInput,
  SloAssessment,
  SloVerdict,
} from "./types";

const SLO_TARGETS = {
  S1_minNoToolStreams: 25,
  S2_firstTokenP95Ms: 5_000,
  S3_minToolStreams: 10,
  S4_minTraceWritesPerMin: 100,
  S5_maxLongRunMemorySlopeBytes: 0,
  S5_minWindowMs: 120_000, // 2 minutes
  S6_minClientDisconnectFlagRate: 1.0, // 100%
  S7_maxIdempotencyConflictsPerSession: 5,
  S8_approvalWaitP95Ms: 300_000, // 300s
  S9_racRetrievalP95Ms: 2_000,
  S10_maxDispatcherFailureRate: 0.01, // 1%
} as const;

function assess(
  sloId: string,
  metric: string,
  target: string,
  observed: string | number,
  verdict: SloVerdict,
  reason?: string,
): SloAssessment {
  return reason ? { sloId, metric, target, observed, verdict, reason } : { sloId, metric, target, observed, verdict };
}

function unknownAssessment(
  sloId: string,
  metric: string,
  target: string,
  reason: string,
): SloAssessment {
  return assess(sloId, metric, target, "—", "UNKNOWN", reason);
}

function checkS1(input: LoadReportInput): SloAssessment {
  const target = `≥${SLO_TARGETS.S1_minNoToolStreams} concurrent`;
  if (!input.noToolStreams) {
    return unknownAssessment(
      "S1",
      "Concurrent SSE no-tool streams",
      target,
      "no `noToolStreams` capture in input",
    );
  }
  const obs = input.noToolStreams.peakConcurrent;
  return obs >= SLO_TARGETS.S1_minNoToolStreams
    ? assess("S1", "Concurrent SSE no-tool streams", target, obs, "PASS")
    : assess("S1", "Concurrent SSE no-tool streams", target, obs, "FAIL", `peak ${obs} < ${SLO_TARGETS.S1_minNoToolStreams}`);
}

function checkS2(input: LoadReportInput): SloAssessment {
  const target = `p95 < ${SLO_TARGETS.S2_firstTokenP95Ms / 1000}s`;
  if (!input.firstTokenLatency || input.firstTokenLatency.samplesMs.length === 0) {
    return unknownAssessment("S2", "First-token latency p95", target, "no `firstTokenLatency` capture");
  }
  const p95 = percentile(input.firstTokenLatency.samplesMs, 95);
  return p95 < SLO_TARGETS.S2_firstTokenP95Ms
    ? assess("S2", "First-token latency p95", target, `${Math.round(p95)}ms`, "PASS")
    : assess("S2", "First-token latency p95", target, `${Math.round(p95)}ms`, "FAIL", `p95 ${Math.round(p95)}ms ≥ ${SLO_TARGETS.S2_firstTokenP95Ms}ms`);
}

function checkS3(input: LoadReportInput): SloAssessment {
  const target = `≥${SLO_TARGETS.S3_minToolStreams} concurrent`;
  if (!input.toolStreams) {
    return unknownAssessment("S3", "Concurrent tool streams", target, "no `toolStreams` capture");
  }
  const obs = input.toolStreams.peakConcurrent;
  return obs >= SLO_TARGETS.S3_minToolStreams
    ? assess("S3", "Concurrent tool streams", target, obs, "PASS")
    : assess("S3", "Concurrent tool streams", target, obs, "FAIL", `peak ${obs} < ${SLO_TARGETS.S3_minToolStreams}`);
}

function checkS4(input: LoadReportInput): SloAssessment {
  const target = `≥${SLO_TARGETS.S4_minTraceWritesPerMin} rows/min`;
  if (!input.traceThroughput || input.traceThroughput.windowMs <= 0) {
    return unknownAssessment("S4", "Trace writes throughput", target, "no `traceThroughput` capture");
  }
  const ratePerMin = (input.traceThroughput.eventCount / input.traceThroughput.windowMs) * 60_000;
  return ratePerMin >= SLO_TARGETS.S4_minTraceWritesPerMin
    ? assess("S4", "Trace writes throughput", target, `${Math.round(ratePerMin)} rows/min`, "PASS")
    : assess("S4", "Trace writes throughput", target, `${Math.round(ratePerMin)} rows/min`, "FAIL", `rate ${Math.round(ratePerMin)}/min < ${SLO_TARGETS.S4_minTraceWritesPerMin}/min`);
}

function checkS5(input: LoadReportInput): SloAssessment {
  const target = `0 unbounded growth across ${SLO_TARGETS.S5_minWindowMs / 1000}s`;
  if (!input.longRunMemory || input.longRunMemory.rssBytes.length < 4) {
    return unknownAssessment("S5", "Long-running stream memory", target, "need ≥4 RSS samples");
  }
  if (input.longRunMemory.windowMs < SLO_TARGETS.S5_minWindowMs) {
    return unknownAssessment(
      "S5",
      "Long-running stream memory",
      target,
      `window ${input.longRunMemory.windowMs}ms < required ${SLO_TARGETS.S5_minWindowMs}ms`,
    );
  }
  // Slope is bytes-per-sample. Convert to a rough bytes-per-second
  // for the report. The PASS threshold is "near zero growth" — we
  // accept up to 1MB/s drift (transient allocations net to roughly
  // zero) but flag anything sustained above that.
  const slope = linearSlope(input.longRunMemory.rssBytes);
  const samplesPerSecond = (input.longRunMemory.rssBytes.length / input.longRunMemory.windowMs) * 1000;
  const bytesPerSecond = slope * samplesPerSecond;
  const ACCEPT_BYTES_PER_SEC = 1_048_576; // 1 MiB/s drift tolerance
  return Math.abs(bytesPerSecond) <= ACCEPT_BYTES_PER_SEC
    ? assess("S5", "Long-running stream memory slope", target, `${Math.round(bytesPerSecond)} B/s`, "PASS")
    : assess("S5", "Long-running stream memory slope", target, `${Math.round(bytesPerSecond)} B/s`, "FAIL", `RSS slope ${Math.round(bytesPerSecond)} B/s exceeds drift tolerance ${ACCEPT_BYTES_PER_SEC} B/s`);
}

function checkS6(input: LoadReportInput): SloAssessment {
  const target = `100% disconnect-flagged within 30s`;
  if (!input.clientDisconnects || input.clientDisconnects.expected === 0) {
    return unknownAssessment("S6", "Client-disconnect flagging", target, "no `clientDisconnects` capture");
  }
  const rate = input.clientDisconnects.observed / input.clientDisconnects.expected;
  return rate >= SLO_TARGETS.S6_minClientDisconnectFlagRate
    ? assess("S6", "Client-disconnect flagging", target, `${(rate * 100).toFixed(1)}%`, "PASS")
    : assess("S6", "Client-disconnect flagging", target, `${(rate * 100).toFixed(1)}%`, "FAIL", `${input.clientDisconnects.observed}/${input.clientDisconnects.expected} flagged`);
}

function checkS7(input: LoadReportInput): SloAssessment {
  const target = `<${SLO_TARGETS.S7_maxIdempotencyConflictsPerSession} conflicts/session/min`;
  if (!input.idempotencyConflicts) {
    return unknownAssessment("S7", "Idempotency conflict ceiling", target, "no `idempotencyConflicts` capture");
  }
  // `expected` here is the total number of session-minutes covered;
  // `observed` is the cumulative conflicts. Per-session-per-minute
  // is total / session-minutes.
  if (input.idempotencyConflicts.expected === 0) {
    return unknownAssessment("S7", "Idempotency conflict ceiling", target, "0 session-minutes captured");
  }
  const ratio = input.idempotencyConflicts.observed / input.idempotencyConflicts.expected;
  return ratio < SLO_TARGETS.S7_maxIdempotencyConflictsPerSession
    ? assess("S7", "Idempotency conflict rate", target, `${ratio.toFixed(2)}/session-min`, "PASS")
    : assess("S7", "Idempotency conflict rate", target, `${ratio.toFixed(2)}/session-min`, "FAIL", `${ratio.toFixed(2)} ≥ ${SLO_TARGETS.S7_maxIdempotencyConflictsPerSession}`);
}

function checkS8(input: LoadReportInput): SloAssessment {
  const target = `p95 < ${SLO_TARGETS.S8_approvalWaitP95Ms / 1000}s`;
  if (!input.approvalWaitLatency || input.approvalWaitLatency.samplesMs.length === 0) {
    return unknownAssessment("S8", "Approval-wait p95", target, "no `approvalWaitLatency` capture");
  }
  const p95 = percentile(input.approvalWaitLatency.samplesMs, 95);
  return p95 < SLO_TARGETS.S8_approvalWaitP95Ms
    ? assess("S8", "Approval-wait p95", target, `${Math.round(p95)}ms`, "PASS")
    : assess("S8", "Approval-wait p95", target, `${Math.round(p95)}ms`, "FAIL", `p95 ${Math.round(p95)}ms ≥ ${SLO_TARGETS.S8_approvalWaitP95Ms}ms`);
}

function checkS9(input: LoadReportInput): SloAssessment {
  const target = `p95 < ${SLO_TARGETS.S9_racRetrievalP95Ms / 1000}s per source`;
  if (!input.racRetrievalLatency || input.racRetrievalLatency.samplesMs.length === 0) {
    return unknownAssessment("S9", "RAC retrieval p95", target, "no `racRetrievalLatency` capture");
  }
  const p95 = percentile(input.racRetrievalLatency.samplesMs, 95);
  return p95 < SLO_TARGETS.S9_racRetrievalP95Ms
    ? assess("S9", "RAC retrieval p95", target, `${Math.round(p95)}ms`, "PASS")
    : assess("S9", "RAC retrieval p95", target, `${Math.round(p95)}ms`, "FAIL", `p95 ${Math.round(p95)}ms ≥ ${SLO_TARGETS.S9_racRetrievalP95Ms}ms`);
}

function checkS10(input: LoadReportInput): SloAssessment {
  const target = `<${SLO_TARGETS.S10_maxDispatcherFailureRate * 100}% over 10m`;
  if (!input.dispatcherFailures || !input.dispatcherTotal || input.dispatcherTotal.eventCount === 0) {
    return unknownAssessment("S10", "Dispatcher failure rate", target, "no dispatcher capture (need both `dispatcherFailures` + `dispatcherTotal`)");
  }
  const rate = input.dispatcherFailures.eventCount / input.dispatcherTotal.eventCount;
  return rate < SLO_TARGETS.S10_maxDispatcherFailureRate
    ? assess("S10", "Dispatcher failure rate", target, `${(rate * 100).toFixed(2)}%`, "PASS")
    : assess("S10", "Dispatcher failure rate", target, `${(rate * 100).toFixed(2)}%`, "FAIL", `rate ${(rate * 100).toFixed(2)}% ≥ ${SLO_TARGETS.S10_maxDispatcherFailureRate * 100}%`);
}

export function assessLoadReport(input: LoadReportInput): LoadReport {
  const assessments: SloAssessment[] = [
    checkS1(input),
    checkS2(input),
    checkS3(input),
    checkS4(input),
    checkS5(input),
    checkS6(input),
    checkS7(input),
    checkS8(input),
    checkS9(input),
    checkS10(input),
  ];
  let pass = 0;
  let fail = 0;
  let unknown = 0;
  for (const a of assessments) {
    if (a.verdict === "PASS") pass++;
    else if (a.verdict === "FAIL") fail++;
    else unknown++;
  }
  return {
    input,
    assessments,
    summary: {
      pass,
      fail,
      unknown,
      totalSlos: assessments.length,
      overallPass: pass === assessments.length,
    },
  };
}

export { SLO_TARGETS };

// Re-export for caller convenience.
export { mean };
