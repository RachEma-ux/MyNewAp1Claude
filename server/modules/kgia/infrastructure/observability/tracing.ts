/**
 * KGIA Observability — Tracing
 *
 * Lightweight tracing for KGIA pipeline execution.
 * Tracks node execution times, spans, and errors.
 */

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
  error?: string;
}

let traceCounter = 0;

/**
 * Generate a trace ID for a run.
 */
export function createTraceId(runId: number): string {
  return `kgia-${runId}-${Date.now()}-${++traceCounter}`;
}

/**
 * Start a new trace span.
 */
export function startSpan(traceId: string, name: string, parentSpanId?: string): TraceSpan {
  return {
    traceId,
    spanId: `${traceId}:${name}:${Date.now()}`,
    parentSpanId,
    name,
    startTime: Date.now(),
    status: "ok",
    attributes: {},
  };
}

/**
 * End a trace span.
 */
export function endSpan(span: TraceSpan, error?: string): TraceSpan {
  const endTime = Date.now();
  return {
    ...span,
    endTime,
    durationMs: endTime - span.startTime,
    status: error ? "error" : "ok",
    error,
  };
}

/**
 * Collect all spans into a trace summary.
 */
export function summarizeTrace(spans: TraceSpan[]): {
  traceId: string;
  totalDurationMs: number;
  nodeCount: number;
  errorCount: number;
  slowestNode: string;
  timeline: Array<{ name: string; durationMs: number; status: string }>;
} {
  if (spans.length === 0) {
    return { traceId: "", totalDurationMs: 0, nodeCount: 0, errorCount: 0, slowestNode: "", timeline: [] };
  }

  const sorted = [...spans].sort((a, b) => a.startTime - b.startTime);
  const totalDurationMs = (sorted[sorted.length - 1].endTime ?? Date.now()) - sorted[0].startTime;
  const errorCount = spans.filter((s) => s.status === "error").length;
  const slowest = spans.reduce((a, b) => ((a.durationMs ?? 0) > (b.durationMs ?? 0) ? a : b));

  return {
    traceId: spans[0].traceId,
    totalDurationMs,
    nodeCount: spans.length,
    errorCount,
    slowestNode: slowest.name,
    timeline: sorted.map((s) => ({
      name: s.name,
      durationMs: s.durationMs ?? 0,
      status: s.status,
    })),
  };
}
