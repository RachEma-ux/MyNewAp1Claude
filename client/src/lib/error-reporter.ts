/**
 * Universal client-side error reporter.
 *
 * Captures every error type the browser surfaces — tRPC query
 * errors, tRPC mutation errors, JS runtime exceptions
 * (`window.onerror`), and unhandled promise rejections — and posts
 * them to `agentStudio.clientObservability.recordClientError`.
 *
 * Server hook mirrors the event into `logs/error-events-YYYY-MM-DD.jsonl`
 * + the `ags_workspace_error_events` table.
 *
 * Design notes:
 *
 *   - Fire-and-forget: the reporter NEVER blocks the UI. Reports
 *     race with the user's next interaction; a dropped report is
 *     preferable to a stalled operator.
 *
 *   - Coalesced: identical error fingerprints (sourceKind + sourceId
 *     + errorClass + first 80 chars of message) fired within a 30s
 *     window are deduped. Without this, a thrashing render-loop can
 *     fill the log file with thousands of identical lines.
 *
 *   - Bypass for the reporter itself: any error whose path is the
 *     reporting procedure (`clientObservability.recordClientError`)
 *     is silently dropped to avoid an infinite report-of-report loop.
 *
 *   - The reporter installs its global listeners exactly once. Idempotent.
 */

import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

const REPORTER_PROC_PATH = "agentStudio.clientObservability.recordClientError";
const COALESCE_WINDOW_MS = 30_000;
const recentlyReported = new Map<string, number>();

type ReportInput = {
  sourceKind: string;
  sourceId?: string;
  errorClass: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
};

function fingerprint(input: ReportInput): string {
  const msgHead = input.errorMessage.slice(0, 80);
  return `${input.sourceKind}|${input.sourceId ?? ""}|${input.errorClass}|${msgHead}`;
}

function shouldCoalesce(input: ReportInput): boolean {
  const fp = fingerprint(input);
  const now = Date.now();
  const last = recentlyReported.get(fp);
  if (last !== undefined && now - last < COALESCE_WINDOW_MS) {
    return true;
  }
  recentlyReported.set(fp, now);
  // Cheap GC: when the map gets large, prune entries older than window.
  if (recentlyReported.size > 1024) {
    const cutoff = now - COALESCE_WINDOW_MS;
    for (const [k, ts] of recentlyReported) {
      if (ts < cutoff) recentlyReported.delete(k);
    }
  }
  return false;
}

async function postReport(input: ReportInput): Promise<void> {
  if (typeof window === "undefined") return;
  if (input.sourceId === REPORTER_PROC_PATH) return; // bypass self-recursion
  if (shouldCoalesce(input)) return;
  try {
    await fetch("/api/trpc/agentStudio.clientObservability.recordClientError", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // tRPC HTTP transport wraps the input under `{ json: <value> }` for
      // superjson, but for a singleton mutation call the simpler
      // `{ <field>: <value> }` body is accepted by the legacy
      // adapter. We post via the explicit URL to avoid pulling the
      // trpc client into this module (and creating a dependency
      // cycle with main.tsx that holds the client instance).
      body: JSON.stringify({ json: input }),
    });
  } catch {
    // Fail-soft. Never propagate reporter failure into the UI.
  }
}

function classifyTrpcClientError(err: unknown): { code: string; message: string } {
  if (err instanceof TRPCClientError) {
    const data = (err.data as { code?: string } | undefined) ?? undefined;
    return {
      code: data?.code ? `TRPCClientError(${data.code})` : "TRPCClientError",
      message: err.message,
    };
  }
  if (err instanceof Error) return { code: err.name, message: err.message };
  return { code: "UnknownError", message: String(err) };
}

/**
 * Wire React Query's mutation + query caches to the reporter. Call
 * exactly once at app boot, immediately after creating the
 * QueryClient.
 */
export function wireQueryCacheReporter(queryClient: QueryClient): void {
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    const err = event.mutation.state.error;
    if (err === null || err === undefined) return;
    const { code, message } = classifyTrpcClientError(err);
    const procPath = (() => {
      const opts = event.mutation.options as
        | { mutationKey?: unknown[] }
        | undefined;
      if (opts?.mutationKey && Array.isArray(opts.mutationKey)) {
        return opts.mutationKey.map(String).join(".");
      }
      return undefined;
    })();
    void postReport({
      sourceKind: "client_mutation",
      sourceId: procPath,
      errorClass: code,
      errorMessage: message,
    });
  });

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    const err = event.query.state.error;
    if (err === null || err === undefined) return;
    const { code, message } = classifyTrpcClientError(err);
    const procPath = Array.isArray(event.query.queryKey)
      ? event.query.queryKey.map(String).join(".")
      : undefined;
    void postReport({
      sourceKind: "client_query",
      sourceId: procPath,
      errorClass: code,
      errorMessage: message,
    });
  });
}

let globalsInstalled = false;
/**
 * Install `window.onerror` + `unhandledrejection` listeners. Idempotent.
 */
export function installGlobalErrorListeners(): void {
  if (globalsInstalled) return;
  if (typeof window === "undefined") return;
  globalsInstalled = true;

  window.addEventListener("error", (event) => {
    void postReport({
      sourceKind: "window_onerror",
      sourceId: event.filename || undefined,
      errorClass:
        event.error instanceof Error ? event.error.name : "WindowError",
      errorMessage:
        event.error instanceof Error
          ? event.error.message
          : String(event.message ?? "unknown"),
      metadata: {
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const { code, message } = classifyTrpcClientError(reason);
    void postReport({
      sourceKind: "unhandled_rejection",
      errorClass: code,
      errorMessage: message,
    });
  });
}

/**
 * Convenience composite: wire React Query + install global listeners.
 * Call once from main.tsx.
 */
export function bootstrapClientErrorReporter(queryClient: QueryClient): void {
  wireQueryCacheReporter(queryClient);
  installGlobalErrorListeners();
}
