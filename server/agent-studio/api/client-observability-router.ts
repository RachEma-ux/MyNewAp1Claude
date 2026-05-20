/**
 * Client observability sub-router.
 *
 * Surface for the browser to report its own error events back into
 * the workspace error-event log file (and ASDB row when available).
 * Pairs with `client/src/lib/error-reporter.ts`, which wires
 * `queryClient.getQueryCache().subscribe`, `getMutationCache().subscribe`,
 * `window.onerror`, and `unhandledrejection` into this endpoint.
 *
 * Why a dedicated endpoint instead of letting the existing
 * `recordErrorEvent` server hook handle everything: client-side
 * errors don't reach the server's tRPC error-capture path because
 * they're caught entirely in the browser (e.g. network failure
 * before the server saw the request, JS exception in a render).
 * The client-side reporter explicitly POSTs these events here so
 * they land in the same forensic log + DB table as server-thrown
 * errors.
 *
 * Fail-soft: the mutation never throws back to the browser. A
 * dropped report is preferable to escalating a downstream observability
 * failure into the operator's UI.
 */

import { z } from "zod";
import { router, publicProcedure } from "../../_core/trpc";
import { recordErrorEvent } from "../services/workspace-observability/error-events.js";

const SOURCE_KIND_REGEX = /^[a-z][a-z0-9_]*$/;

const RecordClientErrorInput = z.object({
  /**
   * Client-side classification: `client_mutation`, `client_query`,
   * `window_onerror`, `unhandled_rejection`, or any future `client_*`
   * variant. Enforced by regex to keep the source-kind taxonomy
   * disciplined; new kinds need a code change rather than a runtime
   * sprawl.
   */
  sourceKind: z.string().min(1).max(64).regex(SOURCE_KIND_REGEX),
  /**
   * Optional identifier — typically the tRPC procedure path
   * (`agentStudio.foo.bar`), the URL of the failing fetch, or the
   * source filename for a window.onerror.
   */
  sourceId: z.string().max(512).optional(),
  /** Error class (e.g. `TRPCClientError`, `TypeError`). */
  errorClass: z.string().min(1).max(128),
  /** Error message text, trimmed by the log appender if oversized. */
  errorMessage: z.string().min(1).max(16_384),
  /** Free-form metadata — stack, request payload shape, etc. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const clientObservabilityRouter = router({
  /**
   * Record a single client-side error event. publicProcedure so it
   * remains reachable when the auth session itself has decayed (a
   * common cause of client errors). The procedure intentionally
   * accepts no user id — if auth context is available the underlying
   * `recordErrorEvent` could attach it later via ctx, but the MVP
   * shape is "any browser can report at any time, fail-soft".
   */
  recordClientError: publicProcedure
    .input(RecordClientErrorInput)
    .mutation(async ({ input }) => {
      try {
        const row = await recordErrorEvent({
          sourceKind: input.sourceKind,
          sourceId: input.sourceId ?? null,
          userId: null,
          errorClass: input.errorClass,
          errorMessage: input.errorMessage,
          metadata: input.metadata ?? null,
        });
        return { ok: true as const, errorEventRowId: row?.id ?? null };
      } catch (e) {
        // Fail-soft. Never re-throw client error reporting failures.
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, reason: msg };
      }
    }),
});
