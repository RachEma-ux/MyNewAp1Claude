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
  FAILURE_STATE_SEVERITIES,
  summarizeFailureStateOccurrences,
  type FailureState,
  type FailureStateMetadata,
  type FailureStateOccurrenceSummary,
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
 * Canonical metadata stamps applied to every bridge emission. Public so
 * callers who emit through a non-bridge path (e.g. a custom dispatcher
 * with extra fields) can still produce the same operator-facing
 * dashboard signal.
 *
 * The stamps are stable across versions: kind / category / severity /
 * recoverable. Adding new fields to the stamp surface requires a
 * coordinated dashboard-query update (see operator dashboard queries
 * §7 in the audit doc).
 */
export interface CanonicalFailureStateAnnotations {
  readonly failureStateKind: FailureState;
  readonly failureStateCategory: FailureStateMetadata["category"];
  readonly failureStateSeverity: FailureStateSeverity;
  readonly failureStateRecoverable: boolean;
}

/**
 * Returns the canonical annotation stamps the bridge applies for the
 * given kind. The severity is derived from the closed taxonomy unless
 * `severityOverride` is supplied — same per-emission semantics as
 * `RecordFailureStateEventInput.severityOverride`.
 *
 * Pure function. Reads only from `FAILURE_STATE_METADATA`.
 */
export function getCanonicalFailureStateAnnotations(
  kind: FailureState,
  severityOverride?: FailureStateSeverity,
): CanonicalFailureStateAnnotations {
  const meta = FAILURE_STATE_METADATA[kind];
  return {
    failureStateKind: kind,
    failureStateCategory: meta.category,
    failureStateSeverity: severityOverride ?? meta.defaultSeverity,
    failureStateRecoverable: meta.recoverable,
  };
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
  const annotations = getCanonicalFailureStateAnnotations(
    input.failureState,
    input.severityOverride,
  );
  return {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId ?? null,
    userId: input.userId ?? null,
    errorClass: failureStateErrorClass(input.failureState),
    errorMessage: input.errorMessage,
    metadata: {
      ...(input.metadata ?? {}),
      // Canonical fields stamp LAST so callers can't shadow them.
      ...annotations,
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

// ============================================================================
// Event list aggregation (T-I.25)
// ============================================================================

export interface FailureStateEventListSummary {
  /** Total event rows in the input (regardless of whether they carry
   *  a closed-taxonomy `errorClass`). */
  readonly totalEvents: number;
  /** Subset that carries a `failure_state:<kind>` errorClass and
   *  resolved to a known kind. */
  readonly closedTaxonomyEvents: number;
  /** Events whose `errorClass` is free-form (not bridge-emitted). */
  readonly freeFormEvents: number;
  /** Per-failure-state kind breakdown (same shape as
   *  summarizeFailureStateOccurrences). Stable-shape on every closed
   *  taxonomy axis. */
  readonly occurrenceSummary: FailureStateOccurrenceSummary;
  /** Distinct `sourceKind` values across all events — useful for
   *  "how many emitters are firing right now" gauge. */
  readonly distinctSourceKinds: number;
  /** Oldest `createdAt` in the input (null for empty input). */
  readonly oldestAt: Date | null;
  /** Newest `createdAt` in the input (null for empty input). */
  readonly newestAt: Date | null;
}

/**
 * Reads the canonical failure-state annotations off a raw observability
 * row. Returns null when:
 *  - The row's `errorClass` doesn't carry the `failure_state:` prefix
 *    (free-form emission), or
 *  - The kind portion isn't in the closed taxonomy (stale ingest).
 *
 * The annotations are reconstructed from `errorClass` + `metadata` —
 * `errorClass` carries the kind, and the metadata payload should
 * mirror the canonical stamps. When metadata is missing or has been
 * stripped, the fallback is the canonical default for that kind.
 *
 * Pure function. Does NOT mutate the input.
 */
export function extractFailureStateAnnotations(
  row: Pick<ErrorEventRow, "errorClass" | "metadata">,
): CanonicalFailureStateAnnotations | null {
  const kind = parseFailureStateFromErrorClass(row.errorClass);
  if (kind === null) return null;
  const meta = row.metadata ?? {};
  const sevFromMeta = meta["failureStateSeverity"];
  const severityOverride = isFailureStateSeverity(sevFromMeta)
    ? sevFromMeta
    : undefined;
  return getCanonicalFailureStateAnnotations(kind, severityOverride);
}

function isFailureStateSeverity(value: unknown): value is FailureStateSeverity {
  return (
    typeof value === "string" &&
    (FAILURE_STATE_SEVERITIES as readonly string[]).includes(value)
  );
}

/**
 * Aggregates a list of observability `ErrorEventRow` records into the
 * canonical failure-state operator summary. Free-form rows (rows
 * whose `errorClass` does not begin with `failure_state:` or whose
 * kind isn't in the closed taxonomy) are counted separately so the
 * operator dashboard can show "of N total events, K are closed-
 * taxonomy and L are still using free-form errorClass."
 *
 * Stable-shape on the closed-taxonomy axes; Date fields are null on
 * empty input (rather than `new Date(0)` or NaN).
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeFailureStateEventList(
  events: ReadonlyArray<
    Pick<ErrorEventRow, "errorClass" | "sourceKind" | "createdAt">
  >,
): FailureStateEventListSummary {
  const closedTaxonomyKinds: string[] = [];
  let closedTaxonomyEvents = 0;
  let freeFormEvents = 0;
  const sourceKindSet = new Set<string>();
  let oldestAt: Date | null = null;
  let newestAt: Date | null = null;
  for (const e of events) {
    const kind = parseFailureStateFromErrorClass(e.errorClass);
    if (kind !== null) {
      closedTaxonomyEvents += 1;
      closedTaxonomyKinds.push(kind);
    } else {
      freeFormEvents += 1;
    }
    sourceKindSet.add(e.sourceKind);
    if (oldestAt === null || e.createdAt < oldestAt) oldestAt = e.createdAt;
    if (newestAt === null || e.createdAt > newestAt) newestAt = e.createdAt;
  }
  return {
    totalEvents: events.length,
    closedTaxonomyEvents,
    freeFormEvents,
    occurrenceSummary: summarizeFailureStateOccurrences(closedTaxonomyKinds),
    distinctSourceKinds: sourceKindSet.size,
    oldestAt,
    newestAt,
  };
}
