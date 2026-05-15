/**
 * Failure-state observability bridge — Phase 22 §T-I.5.
 *
 * Bridges the 25 closed-taxonomy failure states (`FAILURE_STATES`,
 * #1002) onto the existing `recordErrorEvent` recorder
 * (`services/workspace-observability/error-events.ts`) so operator
 * dashboards can group emissions by closed taxonomy WITHOUT changing
 * the storage shape.
 *
 * Wire format:
 *   - `errorClass` is set to `failure_state:<kind>` so a `LIKE
 *     'failure_state:%'` query surfaces the closed-taxonomy subset.
 *   - The closed `category` / `severity` / `recoverable` metadata is
 *     stamped into the JSON `metadata` column so dashboards can filter
 *     without re-deriving from the enum.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - Reuses the canonical recorder. No new DB writes outside it.
 *   - Fail-soft on ASDB-null (inherits from `recordErrorEvent`).
 */

import {
  FAILURE_STATE_METADATA,
  type FailureState,
  type FailureStateSeverity,
} from "./contracts.js";
import {
  recordErrorEvent,
  recordErrorEvents,
  type RecordErrorEventInput,
  type ErrorEventRow,
  type ServiceOptions,
} from "../workspace-observability/error-events.js";

/** Prefix used on the `errorClass` column to mark closed-taxonomy
 *  emissions. Dashboards filter by `LIKE 'failure_state:%'`. */
export const FAILURE_STATE_ERROR_CLASS_PREFIX = "failure_state:";

/** Compose the `errorClass` storage shape from a closed kind. */
export function failureStateErrorClass(kind: FailureState): string {
  return `${FAILURE_STATE_ERROR_CLASS_PREFIX}${kind}`;
}

/** Inverse — recovers the closed kind from a stored `errorClass`,
 *  or null when the row was emitted by a non-bridge caller. */
export function parseFailureStateFromErrorClass(
  errorClass: string,
): FailureState | null {
  if (!errorClass.startsWith(FAILURE_STATE_ERROR_CLASS_PREFIX)) return null;
  const candidate = errorClass.slice(
    FAILURE_STATE_ERROR_CLASS_PREFIX.length,
  );
  // The closed-taxonomy entries are stable; metadata table doubles as
  // a guard.
  if (candidate in FAILURE_STATE_METADATA) return candidate as FailureState;
  return null;
}

export interface RecordFailureStateEventInput {
  readonly failureState: FailureState;
  readonly sourceKind: string;
  readonly sourceId?: string | null;
  readonly userId?: number | null;
  readonly errorMessage: string;
  /** Per-emission severity override (defaults to the closed
   *  taxonomy's `defaultSeverity`). Use for cases where the default
   *  doesn't fit — e.g. a `neo4j_query_timeout` that breached the SLO
   *  budget warrants `critical` rather than the default `warning`. */
  readonly severityOverride?: FailureStateSeverity;
  /** Caller-supplied metadata. The bridge stamps taxonomy keys on
   *  top — caller-supplied metadata keys named the same are
   *  overwritten by the canonical values. */
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * Internal helper — applies the bridge encoding to one
 * `RecordFailureStateEventInput`, producing the underlying recorder's
 * input shape. Extracted so the singular + batch helpers share the
 * encoding logic verbatim.
 */
function encodeForRecorder(
  input: RecordFailureStateEventInput,
): RecordErrorEventInput {
  const meta = FAILURE_STATE_METADATA[input.failureState];
  return {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId ?? null,
    userId: input.userId ?? null,
    errorClass: failureStateErrorClass(input.failureState),
    errorMessage: input.errorMessage,
    metadata: {
      ...(input.metadata ?? {}),
      // Canonical fields stamp LAST so callers can't shadow them.
      failureStateKind: input.failureState,
      failureStateCategory: meta.category,
      failureStateSeverity: input.severityOverride ?? meta.defaultSeverity,
      failureStateRecoverable: meta.recoverable,
    },
  };
}

/**
 * Records a failure-state event through the canonical observability
 * recorder. Returns the recorded row, or `null` when ASDB is null
 * (fail-soft contract — observability never throws into an
 * already-failing flow).
 */
export async function recordFailureStateEvent(
  input: RecordFailureStateEventInput,
  options: ServiceOptions = {},
): Promise<ErrorEventRow | null> {
  return recordErrorEvent(encodeForRecorder(input), options);
}

/**
 * Bulk-emit failure-state events through the canonical batch recorder.
 * Use this when one operation produces multiple emissions (e.g. a
 * multi-finding scan, a multi-tool MCP schema diff, a fan-out worker
 * with multiple per-child failures). Empty-array short-circuits
 * BEFORE the ASDB probe (canonical observability contract).
 *
 * Each input is encoded individually — the per-emission
 * `severityOverride` is preserved, so callers can mix severities in
 * one batch.
 */
export async function recordFailureStateEvents(
  inputs: ReadonlyArray<RecordFailureStateEventInput>,
  options: ServiceOptions = {},
): Promise<readonly ErrorEventRow[]> {
  if (inputs.length === 0) return [];
  return recordErrorEvents(inputs.map(encodeForRecorder), options);
}
