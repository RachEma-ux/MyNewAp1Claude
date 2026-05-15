/**
 * Cross-region tRPC middleware factory — V2 Phase MR-1 Phase-2
 * eleventh slice. PR-V1-159.
 *
 * Wraps `guardCrossRegionAccess` (#909) into a tRPC middleware so
 * individual procedures opt-in by composition rather than embedding
 * the guard in each handler body. Operators add the middleware at
 * any workspace-scoped procedure that should enforce same-region
 * reads.
 *
 * Usage:
 *   ```ts
 *   import { createCrossRegionMiddleware } from "...";
 *
 *   const sameRegion = createCrossRegionMiddleware<MyInput>(
 *     (input) => input.workspaceId,
 *   );
 *
 *   export const myProcedure = protectedProcedure
 *     .input(MyInputSchema)
 *     .use(sameRegion)
 *     .query(async ({ input }) => { ... });
 *   ```
 *
 * Single-region operational baseline preserved:
 *   - When `AGS_PROCESS_REGION_KEY` is unset, the guard short-circuits
 *     and the middleware is a no-op (the procedure runs normally).
 *   - Unpinned workspaces fall back to the primary region; the guard
 *     short-circuits the same way.
 *
 * Throws `TRPCError({ code: "FORBIDDEN" })` with the
 * `CrossRegionAccessDeniedError`'s message when the guard denies.
 * Operators see a structured error code at the boundary instead of
 * a raw exception.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 */

import { TRPCError } from "@trpc/server";

import {
  guardCrossRegionAccess,
  type CrossRegionGuardContext,
} from "./cross-region-guard.js";
import { CrossRegionAccessDeniedError } from "./types.js";

export interface CreateCrossRegionMiddlewareOptions
  extends CrossRegionGuardContext {
  /** Test seam — override the guard for unit-level isolation.
   *  Default: the real `guardCrossRegionAccess`. */
  readonly guard?: (
    workspaceId: number,
    ctx?: CrossRegionGuardContext,
  ) => void;
}

/**
 * Build a tRPC-style middleware that extracts workspaceId from input
 * and calls the cross-region guard.
 *
 * The factory returns a callable middleware suitable for passing to
 * `procedure.use(middleware)`. The middleware signature is the
 * tRPC standalone-middleware shape: it receives `{ next, input }`
 * and returns `next()` (or throws).
 */
export function createCrossRegionMiddleware<TInput = unknown>(
  extractWorkspaceId: (input: TInput) => number | null | undefined,
  options: CreateCrossRegionMiddlewareOptions = {},
): (opts: {
  next: () => Promise<unknown>;
  input: TInput;
}) => Promise<unknown> {
  const guard = options.guard ?? guardCrossRegionAccess;
  return async function crossRegionMiddleware({ next, input }) {
    let workspaceId: number | null | undefined;
    try {
      workspaceId = extractWorkspaceId(input);
    } catch {
      // Extractor failed (shape mismatch). Best to let the
      // downstream handler surface its own input validation error
      // rather than masking it as FORBIDDEN.
      return next();
    }
    if (workspaceId == null || typeof workspaceId !== "number") {
      return next();
    }
    try {
      guard(workspaceId, options);
    } catch (err) {
      if (err instanceof CrossRegionAccessDeniedError) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: err.message,
          cause: err,
        });
      }
      throw err;
    }
    return next();
  };
}
