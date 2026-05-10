/**
 * Phase 12 (Roadmap V3) — runtime load certification: type contracts.
 *
 * The shapes here form the boundary between "operator captures
 * metrics from a load test" and "the SLO checker assesses the
 * capture". Operators feed `LoadReportInput` from any source (k6,
 * autocannon, custom Node script, synthetic test); the checker
 * doesn't care how the metrics got captured.
 *
 * The 10 SLOs (S1–S10) are defined in
 * `docs/operations/agent-studio-runtime-slo.md` (Phase 11c). This
 * type module is the runtime mirror of that doc — drift between the
 * two is locked by `runtime-load-slo-checker.test.ts`.
 */

/**
 * Per-scenario timing samples (an array of millisecond values). The
 * checker computes percentiles over the array to derive p50 / p95 /
 * p99. Operators capture these via `performance.now()` deltas, k6
 * `__VU.iterationDuration`, autocannon `latency.p95`, etc.
 *
 * Empty array means the scenario didn't run; the checker reports
 * UNKNOWN (not PASS or FAIL) so a missing-scenario report doesn't
 * silently pass certification.
 */
export interface SampleSet {
  /** Human-readable scenario id (e.g. "no-tool-stream-ramp"). */
  scenarioId: string;
  /** Raw timing samples in milliseconds. */
  samplesMs: number[];
  /** Optional: total number of trials, if some failed and weren't sampled. */
  totalTrials?: number;
  /** Optional: failure count for divide-by-trials rate calculation. */
  failureCount?: number;
}

/**
 * Concurrency observation — the highest concurrent count observed
 * during a scenario. Drives S1 + S3.
 */
export interface ConcurrencyObservation {
  scenarioId: string;
  /** Peak concurrent count sustained for >= sustainedMs. */
  peakConcurrent: number;
  /** Duration the peak was sustained. */
  sustainedMs: number;
  /** Total scenario wall-clock duration in ms. */
  totalDurationMs: number;
}

/**
 * Throughput observation — rows-per-minute style metrics. Drives S4.
 */
export interface ThroughputObservation {
  scenarioId: string;
  /** Total events captured during the window. */
  eventCount: number;
  /** Window duration in ms (events / window = rate). */
  windowMs: number;
}

/**
 * Memory probe — RSS (resident set size) deltas captured via
 * `process.memoryUsage()` at snapshot intervals. Drives S5 (no
 * unbounded memory growth on a 2-min stream).
 */
export interface MemoryObservation {
  scenarioId: string;
  /** RSS samples in bytes, ordered by capture time. */
  rssBytes: number[];
  /** Wall-clock duration covered by the samples in ms. */
  windowMs: number;
}

/**
 * Counter observation — cumulative counters that should match the
 * cardinality the scenario produced. Drives S6 (client-disconnect
 * flagging) and S7 (idempotency conflicts).
 */
export interface CounterObservation {
  scenarioId: string;
  /** Total count of events expected (e.g., 80 disconnect attempts). */
  expected: number;
  /** Total count of events observed (e.g., 80 rows with clientDisconnected=true). */
  observed: number;
}

/**
 * Full input to the SLO checker. Operators capture as many of these
 * as their load harness produces; missing fields → UNKNOWN verdicts
 * for the affected SLOs.
 */
export interface LoadReportInput {
  /** ISO timestamp the load test ran. */
  timestamp: string;
  /** Free-form environment label (e.g. "staging-2026-05-10"). */
  environment: string;
  /** Map of SLO id → relevant captures. Each SLO can read multiple. */
  firstTokenLatency?: SampleSet;
  toolDispatchLatency?: SampleSet;
  approvalWaitLatency?: SampleSet;
  racRetrievalLatency?: SampleSet;
  noToolStreams?: ConcurrencyObservation;
  toolStreams?: ConcurrencyObservation;
  traceThroughput?: ThroughputObservation;
  longRunMemory?: MemoryObservation;
  clientDisconnects?: CounterObservation;
  idempotencyConflicts?: CounterObservation;
  dispatcherFailures?: ThroughputObservation;
  dispatcherTotal?: ThroughputObservation;
}

/** SLO verdict types — explicit UNKNOWN to catch missing captures. */
export type SloVerdict = "PASS" | "FAIL" | "UNKNOWN";

export interface SloAssessment {
  sloId: string; // S1..S10
  metric: string;
  target: string;
  observed: string | number;
  verdict: SloVerdict;
  /** Free-text reason — populated for FAIL/UNKNOWN; empty for PASS. */
  reason?: string;
}

export interface LoadReport {
  input: LoadReportInput;
  assessments: SloAssessment[];
  summary: {
    pass: number;
    fail: number;
    unknown: number;
    totalSlos: number;
    /** True iff every SLO is PASS. */
    overallPass: boolean;
  };
}
