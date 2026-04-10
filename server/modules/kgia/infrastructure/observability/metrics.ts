/**
 * KGIA Observability — Metrics
 *
 * In-memory metrics collection for KGIA operations.
 * Tracks counters, histograms, and gauges.
 */

interface MetricEntry {
  name: string;
  type: "counter" | "histogram" | "gauge";
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

const metricsBuffer: MetricEntry[] = [];
const MAX_BUFFER = 10000;

/**
 * Increment a counter metric.
 */
export function incrementCounter(name: string, labels: Record<string, string> = {}, delta: number = 1): void {
  push({ name, type: "counter", value: delta, labels, timestamp: Date.now() });
}

/**
 * Record a histogram value (e.g., latency).
 */
export function recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
  push({ name, type: "histogram", value, labels, timestamp: Date.now() });
}

/**
 * Set a gauge value.
 */
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  push({ name, type: "gauge", value, labels, timestamp: Date.now() });
}

// Pre-defined KGIA metrics
export const KGIA_METRICS = {
  runsTotal: (status: string) => incrementCounter("kgia_runs_total", { status }),
  runDuration: (ms: number, mode: string) => recordHistogram("kgia_run_duration_ms", ms, { mode }),
  queryPlanGenerated: (lang: string) => incrementCounter("kgia_query_plans_total", { language: lang }),
  queryBlocked: (reason: string) => incrementCounter("kgia_queries_blocked_total", { reason }),
  evidenceNodes: (count: number) => setGauge("kgia_evidence_nodes", count),
  policyDecision: (decision: string) => incrementCounter("kgia_policy_decisions_total", { decision }),
  sourceRegistered: (type: string) => incrementCounter("kgia_sources_registered_total", { type }),
  benchmarkRun: (passed: boolean) => incrementCounter("kgia_benchmark_runs_total", { passed: String(passed) }),
};

/**
 * Get current metrics snapshot (for diagnostics/export).
 */
export function getMetricsSnapshot(): MetricEntry[] {
  return [...metricsBuffer];
}

/**
 * Clear metrics buffer.
 */
export function clearMetrics(): void {
  metricsBuffer.length = 0;
}

function push(entry: MetricEntry): void {
  if (metricsBuffer.length >= MAX_BUFFER) metricsBuffer.shift();
  metricsBuffer.push(entry);
}
