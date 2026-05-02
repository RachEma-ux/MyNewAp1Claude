/**
 * API pipeline — generic HTTP sync.
 *
 * Performs a single fetch against an external API endpoint. The full
 * record (request, response, status, duration) is returned for the
 * service to persist as a `data_acquisition_api_records` row.
 *
 * Behavior:
 *   - Does NOT throw on non-2xx — the run row records the failure.
 *   - Aborts after `timeoutMs` (default 5000) and records `status_code: 0`
 *     with an error message.
 *   - No external SDKs; pure global `fetch`.
 *
 * Auth headers / API keys are passed in by the caller (sourced from
 * the source row's `configJson`).
 */

export interface ApiSyncInput {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface ApiSyncResult {
  endpoint: string;
  method: string;
  statusCode: number;
  requestJson: Record<string, unknown> | null;
  responseJson: Record<string, unknown> | null;
  durationMs: number;
  fetchedAt: Date;
  errorMessage?: string;
}

export async function runApiSync(input: ApiSyncInput): Promise<ApiSyncResult> {
  const method = input.method ?? "GET";
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5000);
  const requestJson: Record<string, unknown> = {
    method,
    headers: input.headers ?? {},
    body: input.body ?? null,
  };
  try {
    const res = await fetch(input.endpoint, {
      method,
      headers: input.headers,
      body: input.body !== undefined && method !== "GET" ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
    let responseJson: Record<string, unknown> | null = null;
    const text = await res.text().catch(() => "");
    try {
      responseJson = text ? JSON.parse(text) : null;
    } catch {
      responseJson = { raw: text };
    }
    return {
      endpoint: input.endpoint,
      method,
      statusCode: res.status,
      requestJson,
      responseJson,
      durationMs: Date.now() - start,
      fetchedAt: new Date(),
      errorMessage: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      endpoint: input.endpoint,
      method,
      statusCode: 0,
      requestJson,
      responseJson: null,
      durationMs: Date.now() - start,
      fetchedAt: new Date(),
      errorMessage: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
