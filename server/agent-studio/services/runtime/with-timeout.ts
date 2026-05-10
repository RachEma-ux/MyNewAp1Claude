/**
 * H2-c8 + H3-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`)
 * — shared `withTimeout` helper for the orchestrator-adjacent layer.
 *
 * Cycle-7 H1-c7 added a `withTimeout` to `services/mcp/dispatcher.ts`
 * but it lives behind the dispatcher's private TIMEOUT_SENTINEL +
 * the dispatcher-specific `tool_call_timeout` mapping path. The
 * orchestrator + CAG resolver + retrieval planner all need the same
 * timeout-envelope shape (race a promise against a `setTimeout`,
 * clearTimeout on win, throw a tagged error on timeout) but for
 * different cycle-8 closures (H2-c8 CAG resolver, H3-c8 retrieval
 * planner). Lifting the helper into a shared module keeps both
 * closures from re-implementing the same Promise.race + clearTimeout
 * pattern (cycle-7 lesson on shared helpers).
 *
 * Design choices (matching the H1-c7 dispatcher pattern):
 *   - **Tagged sentinel.** The error carries a Symbol marker so the
 *     caller can distinguish "we timed out" from "the inner promise
 *     rejected" via `isTimeoutError(e)`. Pure-string matching on
 *     `.message` is fragile when error messages drift.
 *   - **clearTimeout on win.** If the inner promise resolves before
 *     the timer, we clear the pending timer so it doesn't keep the
 *     event loop alive past the function return.
 *   - **No retry.** Caller decides retry semantics; the helper is a
 *     bounded-wait primitive, not a retry loop.
 */

const TIMEOUT_SENTINEL = Symbol("runtime-with-timeout");

/**
 * Race `promise` against a `timeoutMs` timer. Resolves with the
 * promise's value if it wins; throws a sentinel-tagged Error if the
 * timer wins. The sentinel is detectable via `isTimeoutError`.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            `${label} exceeded ${timeoutMs}ms timeout`,
          ) as Error & { [TIMEOUT_SENTINEL]?: true };
          err[TIMEOUT_SENTINEL] = true;
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Type guard for timeout errors thrown by `withTimeout`. */
export function isTimeoutError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as Record<symbol, unknown>)[TIMEOUT_SENTINEL] === true
  );
}
