/**
 * OmniRAG Adapter — Phase-1 integration
 *
 * Server-side adapter that communicates with the external OmniRAG
 * service and normalizes responses into the canonical internal shape
 * defined in 00_canonical_implementation_brief.md.
 *
 * Phase-1 scope:
 *   - health check (cached briefly)
 *   - list pipelines
 *   - invoke pipeline (sync)
 *   - submit async job + poll task status
 *   - normalize all responses
 *   - timeout + retries on transient errors
 *   - inject auth headers if OMNIRAG_API_KEY is set
 *
 * This adapter is internal to MyNewAp1Claude — the frontend never
 * talks to OmniRAG directly. The tRPC layer in graphrag/router.ts
 * calls these functions and returns the normalized shape to the UI.
 *
 * Config:
 *   OMNIRAG_URL        — base URL (default http://localhost:8686)
 *   OMNIRAG_API_KEY    — optional Bearer token
 *   OMNIRAG_ENABLED    — feature flag (truthy string enables)
 */

// ── Canonical result shape (from 00_canonical_implementation_brief.md) ──

export interface OmniRagQueryResult {
  success: boolean;
  status: "completed" | "failed" | "running" | "offline" | "fallback";
  answer: string;
  context: Record<string, unknown>;
  confidence: number | null;
  traceId: string | null;
  pipelineName: string | null;
  runId: string | null;
  error: string | null;
}

export interface OmniRagPipeline {
  name: string;
  description: string;
}

export interface OmniRagHealthStatus {
  healthy: boolean;
  lastCheckAt: number;
  lastSuccessAt: number | null;
  error: string | null;
}

// ── Config ──────────────────────────────────────────────────────────────

const OMNIRAG_BASE_URL =
  process.env.OMNIRAG_URL || "http://localhost:8686";
const OMNIRAG_API_KEY = process.env.OMNIRAG_API_KEY || "";

/** Feature flag — only truthy strings enable the OmniRAG routes. */
export function isOmniRagEnabled(): boolean {
  const flag = (process.env.OMNIRAG_ENABLED || "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

// ── Timeouts ────────────────────────────────────────────────────────────

const HEALTH_TIMEOUT_MS = 5_000;
const PIPELINES_TIMEOUT_MS = 5_000;
const INVOKE_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 5_000;

// ── Health cache ────────────────────────────────────────────────────────

const HEALTH_CACHE_TTL_MS = 15_000; // 15 seconds — conservative default

let cachedHealth: OmniRagHealthStatus = {
  healthy: false,
  lastCheckAt: 0,
  lastSuccessAt: null,
  error: null,
};

// ── Internal helpers ────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (OMNIRAG_API_KEY) {
    headers["Authorization"] = `Bearer ${OMNIRAG_API_KEY}`;
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry wrapper — retries on transient failures (network errors,
 * 502/503/504). Does NOT retry on 4xx or successful responses.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      // Only retry on network-level errors (AbortError = timeout,
      // TypeError = fetch failed). Do NOT retry on HTTP-level errors
      // (those are handled by the caller via response.ok checks).
      const isRetryable =
        err?.name === "AbortError" ||
        err?.name === "TypeError" ||
        err?.message?.includes("fetch failed");
      if (!isRetryable || attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Health check — cached for HEALTH_CACHE_TTL_MS. Returns the cached
 * result if fresh; otherwise probes the OmniRAG /health endpoint.
 */
export async function checkHealth(): Promise<OmniRagHealthStatus> {
  const now = Date.now();
  if (now - cachedHealth.lastCheckAt < HEALTH_CACHE_TTL_MS) {
    return { ...cachedHealth };
  }

  try {
    const res = await fetchWithTimeout(
      `${OMNIRAG_BASE_URL}/health`,
      { method: "GET", headers: authHeaders() },
      HEALTH_TIMEOUT_MS
    );
    const healthy = res.ok;
    cachedHealth = {
      healthy,
      lastCheckAt: now,
      lastSuccessAt: healthy ? now : cachedHealth.lastSuccessAt,
      error: healthy ? null : `OmniRAG returned ${res.status}`,
    };
  } catch (err: any) {
    cachedHealth = {
      healthy: false,
      lastCheckAt: now,
      lastSuccessAt: cachedHealth.lastSuccessAt,
      error: err?.message ?? "Health check failed",
    };
  }

  return { ...cachedHealth };
}

/**
 * List available pipelines from OmniRAG.
 */
export async function listPipelines(): Promise<OmniRagPipeline[]> {
  try {
    const res = await withRetry(() =>
      fetchWithTimeout(
        `${OMNIRAG_BASE_URL}/pipelines`,
        { method: "GET", headers: authHeaders() },
        PIPELINES_TIMEOUT_MS
      )
    );
    if (!res.ok) return [];
    const data = await res.json();
    // OmniRAG returns an array of pipeline objects. Normalize to
    // our minimal shape.
    if (Array.isArray(data)) {
      return data.map((p: any) => ({
        name: String(p.name ?? p.id ?? "unnamed"),
        description: String(p.description ?? ""),
      }));
    }
    // Some OmniRAG versions wrap in { pipelines: [...] }
    if (Array.isArray(data?.pipelines)) {
      return data.pipelines.map((p: any) => ({
        name: String(p.name ?? p.id ?? "unnamed"),
        description: String(p.description ?? ""),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Invoke a pipeline synchronously. Normalizes the OmniRAG response
 * into the canonical OmniRagQueryResult shape.
 */
export async function invokeQuery(input: {
  question: string;
  pipeline?: string;
  context?: Record<string, unknown>;
}): Promise<OmniRagQueryResult> {
  const startMs = Date.now();

  // Pre-check health to avoid unnecessary invoke if offline
  const health = await checkHealth();
  if (!health.healthy) {
    return {
      success: false,
      status: "offline",
      answer: "",
      context: {},
      confidence: null,
      traceId: null,
      pipelineName: input.pipeline ?? null,
      runId: null,
      error:
        "OmniRAG is unavailable. " +
        (health.error ?? `Service at ${OMNIRAG_BASE_URL} is not reachable.`),
    };
  }

  try {
    const body: Record<string, unknown> = {
      query: input.question,
    };
    if (input.context) body.context = input.context;

    // Route selection:
    //   - Named pipeline → POST /pipelines/{name}/invoke
    //   - No pipeline → POST /v1/search (general search endpoint)
    // OmniRAG's /invoke endpoint doesn't exist at the root — the
    // actual API surface uses /v1/search for general queries and
    // /pipelines/{name}/invoke for pipeline-specific invocations.
    const invokeUrl = input.pipeline
      ? `${OMNIRAG_BASE_URL}/pipelines/${encodeURIComponent(input.pipeline)}/invoke`
      : `${OMNIRAG_BASE_URL}/v1/search`;

    const res = await withRetry(() =>
      fetchWithTimeout(
        invokeUrl,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        },
        INVOKE_TIMEOUT_MS
      )
    );

    const latencyMs = Date.now() - startMs;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        status: "failed",
        answer: "",
        context: {},
        confidence: null,
        traceId: null,
        pipelineName: input.pipeline ?? null,
        runId: null,
        error: `OmniRAG returned ${res.status}: ${errText}`.trim(),
      };
    }

    const data = await res.json();
    return normalizeInvokeResponse(data, input.pipeline ?? null, latencyMs);
  } catch (err: any) {
    return {
      success: false,
      status: "failed",
      answer: "",
      context: {},
      confidence: null,
      traceId: null,
      pipelineName: input.pipeline ?? null,
      runId: null,
      error: err?.message ?? "OmniRAG invoke failed",
    };
  }
}

/**
 * Submit an async job and return immediately with a run id.
 * The caller can poll via `pollTask` to get the result.
 */
export async function submitAsyncJob(input: {
  question: string;
  pipeline?: string;
  context?: Record<string, unknown>;
}): Promise<{ runId: string | null; error: string | null }> {
  const health = await checkHealth();
  if (!health.healthy) {
    return { runId: null, error: "OmniRAG is unavailable" };
  }

  try {
    const body: Record<string, unknown> = {
      query: input.question,
      question: input.question,
    };
    if (input.pipeline) body.pipeline = input.pipeline;
    if (input.context) body.context = input.context;

    const res = await fetchWithTimeout(
      `${OMNIRAG_BASE_URL}/invoke_async`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      },
      INVOKE_TIMEOUT_MS
    );

    if (!res.ok) {
      return { runId: null, error: `OmniRAG returned ${res.status}` };
    }

    const data = await res.json();
    const runId =
      data?.task_id ?? data?.taskId ?? data?.run_id ?? data?.runId ?? null;
    return { runId: runId ? String(runId) : null, error: null };
  } catch (err: any) {
    return { runId: null, error: err?.message ?? "Async submit failed" };
  }
}

/**
 * Poll a previously submitted async task.
 */
export async function pollTask(
  taskId: string
): Promise<OmniRagQueryResult> {
  try {
    const res = await fetchWithTimeout(
      `${OMNIRAG_BASE_URL}/tasks/${encodeURIComponent(taskId)}`,
      { method: "GET", headers: authHeaders() },
      POLL_TIMEOUT_MS
    );

    if (!res.ok) {
      return {
        success: false,
        status: "failed",
        answer: "",
        context: {},
        confidence: null,
        traceId: null,
        pipelineName: null,
        runId: taskId,
        error: `OmniRAG returned ${res.status}`,
      };
    }

    const data = await res.json();
    const taskStatus = String(
      data?.status ?? data?.state ?? "unknown"
    ).toLowerCase();

    if (taskStatus === "running" || taskStatus === "pending") {
      return {
        success: false,
        status: "running",
        answer: "",
        context: {},
        confidence: null,
        traceId: data?.trace_id ?? data?.traceId ?? null,
        pipelineName: data?.pipeline ?? null,
        runId: taskId,
        error: null,
      };
    }

    if (taskStatus === "completed" || taskStatus === "success") {
      return normalizeInvokeResponse(data, data?.pipeline ?? null, null);
    }

    return {
      success: false,
      status: "failed",
      answer: "",
      context: {},
      confidence: null,
      traceId: data?.trace_id ?? data?.traceId ?? null,
      pipelineName: data?.pipeline ?? null,
      runId: taskId,
      error: data?.error ?? `Task status: ${taskStatus}`,
    };
  } catch (err: any) {
    return {
      success: false,
      status: "failed",
      answer: "",
      context: {},
      confidence: null,
      traceId: null,
      pipelineName: null,
      runId: taskId,
      error: err?.message ?? "Poll failed",
    };
  }
}

// ── Response normalization ──────────────────────────────────────────────

/**
 * Normalize an OmniRAG invoke/task response into the canonical shape.
 * Handles multiple response formats that OmniRAG may return depending
 * on the pipeline type and version.
 */
function normalizeInvokeResponse(
  data: any,
  pipelineName: string | null,
  latencyMs: number | null
): OmniRagQueryResult {
  // OmniRAG responses vary by pipeline. Common shapes:
  //   { answer, context, confidence, trace_id, run_id, pipeline }
  //   { result, metadata }
  //   { output, details }
  const answer =
    typeof data?.answer === "string"
      ? data.answer
      : typeof data?.result === "string"
      ? data.result
      : typeof data?.output === "string"
      ? data.output
      : typeof data?.response === "string"
      ? data.response
      : JSON.stringify(data ?? {});

  const context: Record<string, unknown> = {};
  if (data?.context && typeof data.context === "object") {
    Object.assign(context, data.context);
  }
  if (data?.metadata && typeof data.metadata === "object") {
    Object.assign(context, data.metadata);
  }
  if (data?.details && typeof data.details === "object") {
    Object.assign(context, data.details);
  }
  // OmniRAG /v1/search returns { citations: [...] } — include them
  if (Array.isArray(data?.citations)) {
    context.citations = data.citations;
  }
  // Inject latency into context for the trace panel
  if (latencyMs != null) {
    context._latencyMs = latencyMs;
  }

  const confidence =
    typeof data?.confidence === "number" ? data.confidence : null;

  const traceId =
    data?.trace_id ?? data?.traceId ?? data?.request_id ?? null;
  const runId =
    data?.run_id ?? data?.runId ?? data?.task_id ?? data?.taskId ?? null;
  const pipeline =
    pipelineName ??
    data?.pipeline ??
    data?.pipeline_name ??
    data?.pipelineName ??
    null;

  return {
    success: true,
    status: "completed",
    answer,
    context,
    confidence,
    traceId: traceId ? String(traceId) : null,
    pipelineName: pipeline ? String(pipeline) : null,
    runId: runId ? String(runId) : null,
    error: null,
  };
}

// ── Exported for tests ──────────────────────────────────────────────────

export const _test = {
  normalizeInvokeResponse,
  fetchWithTimeout,
  withRetry,
  OMNIRAG_BASE_URL,
};
