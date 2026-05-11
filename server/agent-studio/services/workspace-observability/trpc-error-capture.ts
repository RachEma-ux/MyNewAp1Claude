/**
 * tRPC error capture helpers.
 *
 * Phase 22 follow-up. Wires the dormant `ags_workspace_error_events`
 * table to actual tRPC error flow, so the operator's diagnostics
 * panel surfaces every unexpected backend failure instead of only
 * the ones services explicitly record by hand.
 *
 * Two surfaces ship here:
 *
 *   1. `classifyTrpcErrorForCapture(err)` — given a thrown value,
 *      decides whether it's worth persisting. TRPCError codes that
 *      represent expected operator-side failures (BAD_REQUEST,
 *      UNAUTHORIZED, FORBIDDEN, NOT_FOUND, PRECONDITION_FAILED,
 *      CONFLICT, METHOD_NOT_SUPPORTED, TIMEOUT) are SKIPPED — those
 *      are the operator doing something wrong, not the backend
 *      breaking. Everything else (INTERNAL_SERVER_ERROR, undeclared
 *      TRPCError codes, raw Error instances) is CAPTURED.
 *
 *   2. `captureUnexpectedTrpcError(sourceKind, err, ctx?)` — async
 *      helper that any service can call from a catch block to
 *      record the error if it qualifies. Returns the event row id
 *      on success, null on no-op (filtered out or ASDB null).
 *      Fail-soft — never throws.
 *
 * The middleware-mount path is documented but not wired in this PR;
 * routers opt in incrementally so the rollout has explicit blast
 * radius.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

import { TRPCError } from "@trpc/server";
import { recordErrorEvent } from "./error-events.js";

/**
 * TRPCError codes that represent EXPECTED operator-side failures.
 * These are NOT captured — they're the API surface working as
 * designed (the operator hit an invalid input, a permission denial,
 * a not-found, a stale state conflict, etc.).
 */
export const EXPECTED_TRPC_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "CONFLICT",
  "METHOD_NOT_SUPPORTED",
  "TIMEOUT",
  "PARSE_ERROR",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "PAYLOAD_TOO_LARGE",
  "NOT_ACCEPTABLE",
]);

export type CaptureDecision =
  | {
      readonly capture: true;
      readonly errorClass: string;
      readonly errorMessage: string;
    }
  | {
      readonly capture: false;
      readonly skipReason:
        | "expected_trpc_code"
        | "not_an_error";
    };

export function classifyTrpcErrorForCapture(err: unknown): CaptureDecision {
  if (err instanceof TRPCError) {
    if (EXPECTED_TRPC_CODES.has(err.code)) {
      return { capture: false, skipReason: "expected_trpc_code" };
    }
    return {
      capture: true,
      errorClass: `TRPCError:${err.code}`,
      errorMessage: err.message,
    };
  }
  if (err instanceof Error) {
    return {
      capture: true,
      errorClass: err.name || "Error",
      errorMessage: err.message,
    };
  }
  return { capture: false, skipReason: "not_an_error" };
}

export interface CaptureContext {
  readonly userId?: number | null;
  readonly sourceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface CaptureOptions {
  readonly recordErrorEvent?: typeof recordErrorEvent;
}

/**
 * Records an unexpected error to `ags_workspace_error_events` if it
 * qualifies. Returns the event row id on success, `null` on no-op
 * (filtered out, ASDB null, or recorder threw).
 *
 * Fail-soft — this function never throws. The caller is already in
 * an error path; double-throwing would mask the original error.
 */
export async function captureUnexpectedTrpcError(
  sourceKind: string,
  err: unknown,
  ctx: CaptureContext = {},
  options: CaptureOptions = {},
): Promise<number | null> {
  const decision = classifyTrpcErrorForCapture(err);
  if (!decision.capture) return null;

  const recorder = options.recordErrorEvent ?? recordErrorEvent;

  try {
    const event = await recorder({
      sourceKind,
      sourceId: ctx.sourceId ?? null,
      userId: ctx.userId ?? null,
      errorClass: decision.errorClass,
      errorMessage: decision.errorMessage,
      metadata: ctx.metadata ?? null,
    });
    return event ? event.id : null;
  } catch {
    // Fail-soft: observability MUST NOT mask the original failure.
    return null;
  }
}
