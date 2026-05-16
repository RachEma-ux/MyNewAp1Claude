/**
 * Runtime Trace Writer — Retrofit P10.
 *
 * Wires the post-P5/P6/P8/P9 surfaces into the trace tables so a
 * reviewer can read one record per turn (`agsRacRuntimeTraces`) plus
 * one record per tool call (`agsToolCallTraces`) and reconstruct the
 * full lifecycle:
 *
 *   ProposedToolCall (Phase 8)
 *     → validator verdict
 *     → approval status (Phase 9)
 *     → governance verdict (existing)
 *     → MCP dispatch result (existing)
 *
 * The runtime trace row already exists by the time the planner has run
 * (it's written by `services/rac/composer.ts` in the prior arc); P10
 * only patches in the new fields. Tool-call traces are inserted fresh
 * for every dispatch attempt (D-PTC-5).
 *
 * Pure builders are exported so the assembly logic is testable without
 * a live ASDB. The DB-backed wrappers are exercised end-to-end in
 * Phase 13.
 */

import { eq } from "drizzle-orm";
import { getAsDb, getAsDbForWorkspace } from "../../db/connection";
import {
  agsRacRuntimeTraces,
  agsToolCallTraces,
} from "../../../../drizzle/tables/agent-studio";
import type {
  ProposedToolCall,
  ProposedToolCallValidationResult,
} from "../mcp/proposed-tool-call";
import type { ApprovalDecision } from "../approval/approval-gate";

// ── Pure builders ─────────────────────────────────────────────────────

/**
 * Closed-taxonomy runtime validation verdict. Promoted to a tuple at
 * T-G.56 so the metadata table + lockstep tests can be authored.
 */
export const RUNTIME_VALIDATION_VERDICTS = ["ok", "rejected"] as const;
export type ValidationVerdict = (typeof RUNTIME_VALIDATION_VERDICTS)[number];
export type DispatchResult = "ok" | "error" | "blocked";

// ============================================================================
// Per-validation-verdict operator-facing metadata (T-G.56)
// ============================================================================

export interface RuntimeValidationVerdictMetadata {
  /** Display label rendered in the trace-writer verdict column. */
  readonly label: string;
  /** Short operator-facing description of what this verdict implies
   *  for the downstream dispatch chain. */
  readonly description: string;
  /** Whether dispatch may proceed at this verdict (true for `ok`;
   *  false for `rejected` which hard-stops the chain before dispatch). */
  readonly allowsDispatch: boolean;
}

export const RUNTIME_VALIDATION_VERDICT_METADATA: Readonly<
  Record<ValidationVerdict, RuntimeValidationVerdictMetadata>
> = {
  ok: {
    label: "Passed",
    description:
      "Proposed-tool-call validation passed — shape and risk-class checks succeeded; chain proceeds to the approval gate.",
    allowsDispatch: true,
  },
  rejected: {
    label: "Rejected",
    description:
      "Proposed-tool-call validation failed — shape or risk-class check rejected the call. Dispatch refuses; trace row carries the rejection code.",
    allowsDispatch: false,
  },
};

export function getRuntimeValidationVerdictMetadata(
  verdict: ValidationVerdict,
): RuntimeValidationVerdictMetadata {
  return RUNTIME_VALIDATION_VERDICT_METADATA[verdict];
}

export function validationVerdictFromResult(
  result: ProposedToolCallValidationResult,
): { verdict: ValidationVerdict; code: string | null; message: string | null } {
  if (result.ok) return { verdict: "ok", code: null, message: null };
  const failure = result as Extract<ProposedToolCallValidationResult, { ok: false }>;
  return {
    verdict: "rejected",
    code: failure.code,
    message: failure.message,
  };
}

/**
 * Map the approval-gate decision onto the trace's `approvalStatus`
 * column. The trace surface is broader than the gate (it accepts
 * `null` for tools that don't require approval at all), so non-required
 * calls get `null`.
 */
export function approvalStatusForTrace(
  requiresApproval: boolean,
  decision: ApprovalDecision | null,
): string | null {
  if (!requiresApproval) return null;
  if (!decision) return null;
  switch (decision) {
    case "permit":
      return "allowed";
    case "denied":
      return "denied";
    case "expired":
      return "expired";
    case "pending":
      return "pending";
    case "approval_required":
      return "pending"; // a freshly-created request is pending
  }
}

/**
 * H5-c6 (cycle-6 audit closure §H5-c6) — distinguishes why an
 * `approvalStatus = "expired"` trace row got there. NULL when
 * `approvalStatus !== "expired"`.
 */
export type TraceTimeoutReason =
  | "approval_ttl_elapsed"
  | "operator_wait_timeout";

export interface ToolCallTraceInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  runtimeTraceId?: number | null;
  runtimeRunId?: number | null;
  messageId?: number | null;
  proposedToolCall: ProposedToolCall;
  proposedToolCallHash: string;
  validation: ProposedToolCallValidationResult;
  approvalDecision: ApprovalDecision | null;
  approvalRequestId?: number | null;
  governanceVerdict?: string | null;
  dispatchResult?: DispatchResult | null;
  dispatchAuditId?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  /**
   * H5-c6: caller's distinction when `approvalDecision === "expired"`.
   * Set to `"operator_wait_timeout"` when the verdict reason was
   * `approval_timeout` (chat-stream surrendered after the bounded
   * wait). Set to `"approval_ttl_elapsed"` when the audit gate
   * computed `expiresAt` was in the past (operator granted approval
   * but TTL elapsed before re-use). The build phase enforces the
   * "only set when expired" invariant.
   */
  traceTimeoutReason?: TraceTimeoutReason | null;
}

export interface ToolCallTraceRow {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  runtimeTraceId: number | null;
  runtimeRunId: number | null;
  messageId: number | null;
  proposedToolCallJson: Record<string, unknown>;
  proposedToolCallHash: string;
  validationVerdict: ValidationVerdict;
  validationCode: string | null;
  validationMessage: string | null;
  approvalRequestId: number | null;
  approvalStatus: string | null;
  governanceVerdict: string | null;
  dispatchResult: DispatchResult | null;
  dispatchAuditId: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  /** H5-c6: only set when approvalStatus === "expired"; else null. */
  traceTimeoutReason: TraceTimeoutReason | null;
}

/**
 * Pure assembler — takes the inputs and returns the row payload that
 * `recordToolCallTrace` will INSERT. Tests pin behavior here without
 * needing a live ASDB.
 *
 * Invariants:
 *   - validationVerdict is derived from `validation`, not from the
 *     caller's claim. Same for the validation code/message.
 *   - approvalStatus is null when `requiresApproval=false` (saves a
 *     downstream filter from having to special-case it).
 *   - When validator rejected, approval/dispatch fields are NOT
 *     populated — a rejection short-circuits before approval/dispatch.
 *     Callers that pass them anyway get them silently dropped.
 *
 * C2-c7 (cycle-7 audit closure §C2-c7) — runtimeTraceId / messageId
 * nullability is INTENTIONAL:
 *   - runtimeTraceId is null on early-rejection paths (validator
 *     rejection before the RAC trace is assigned) and on direct/system
 *     dispatches that bypass the chat loop. Operator UI joining
 *     trace rows back to RAC traces MUST tolerate null and render an
 *     "unattached trace" placeholder rather than dropping the row.
 *   - messageId is null when the dispatch was not initiated from a
 *     chat message (simulation / manual_test source). Same UI-tolerance
 *     contract.
 *   - Neither column carries a foreign-key constraint at the DB
 *     layer — partly because runtimeTraceId targets `agsRacRuntimeTraces`
 *     in ASDB while messageId targets `ags_messages` in MAIN DB
 *     (cross-DB FK is impossible), and partly because the trace
 *     writer is best-effort by L4-c5 contract — a delayed FK violation
 *     would re-introduce the silent-trace-loss problem the breadcrumb
 *     was designed to avoid.
 *   The persistence-side message-vs-trace asymmetry is documented on
 *   `persistRuntimeToolCallTrace` (proposed-tool-call-runtime.ts).
 *
 * L1-c8 (cycle-8 audit closure §L1-c8) — the cross-DB FK absence is
 * an operator-visible contract, not just an implementation note.
 * Operator dashboards joining trace rows MUST left-outer-join on
 * runtimeTraceId / messageId and tolerate the null row (orphan
 * rows are permitted by design, not a bug). A future single-database
 * consolidation that re-introduces strict FKs would break the
 * orphan-tolerance contract that the operator UI depends on.
 *
 * Lockstep: pinned by tests/agent-studio/l1-l4-c8-doc-bundle.test.ts
 * which source-scans for the L1-c8 marker + the cross-DB FK absence
 * keywords ("cross-DB FK is impossible" + "orphan").
 */
export function buildToolCallTraceRow(input: ToolCallTraceInput): ToolCallTraceRow {
  const { verdict, code, message } = validationVerdictFromResult(input.validation);

  const isRejected = verdict === "rejected";
  const approvalStatus = isRejected
    ? null
    : approvalStatusForTrace(
        input.proposedToolCall.requiresApproval,
        input.approvalDecision,
      );

  // H5-c6: traceTimeoutReason is ONLY meaningful when approvalStatus
  // is "expired". Drop it on any other status so the column's
  // semantic stays clean — operators querying for `expired` rows can
  // group by `traceTimeoutReason` without filtering out spurious
  // values from rows where it doesn't apply.
  const traceTimeoutReason =
    approvalStatus === "expired" ? input.traceTimeoutReason ?? null : null;

  // M2-c7 (cycle-7 audit closure §M2-c7): mirror the H5-c6 + isRejected
  // "drop fields that don't apply to this verdict shape" pattern for
  // errorMessage. A successful dispatch (`dispatchResult === "ok"`)
  // MUST NOT carry a caller-provided errorMessage on the row — that
  // would seed garbage data into a column operators rely on for
  // failure forensics. Pre-cycle-7 the builder passed errorMessage
  // through unconditionally; the audit flagged this as a missing
  // invariant assertion (the test gap was the symptom — fixing the
  // builder closes the gap structurally rather than just testing it).
  const dispatchEffective = isRejected ? null : input.dispatchResult ?? null;
  const errorMessage =
    dispatchEffective === "ok" ? null : input.errorMessage ?? null;

  return {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    agentDraftId: input.agentDraftId,
    runtimeTraceId: input.runtimeTraceId ?? null,
    runtimeRunId: input.runtimeRunId ?? null,
    messageId: input.messageId ?? null,
    proposedToolCallJson: input.proposedToolCall as unknown as Record<string, unknown>,
    proposedToolCallHash: input.proposedToolCallHash,
    validationVerdict: verdict,
    validationCode: code,
    validationMessage: message,
    approvalRequestId: isRejected ? null : input.approvalRequestId ?? null,
    approvalStatus,
    governanceVerdict: isRejected ? null : input.governanceVerdict ?? null,
    dispatchResult: dispatchEffective,
    dispatchAuditId: isRejected ? null : input.dispatchAuditId ?? null,
    durationMs: input.durationMs ?? null,
    errorMessage,
    traceTimeoutReason,
  };
}

// ── Pure RAC trace patch builder ──────────────────────────────────────

export interface RacTracePatchInput {
  plannerMode?: string | null;
  plannerReason?: string | null;
  cagCompiledHash?: string | null;
}

export type RacTracePatch = Partial<{
  plannerMode: string | null;
  plannerReason: string | null;
  cagCompiledHash: string | null;
}>;

/**
 * Pure: filter an arbitrary patch input down to ONLY the fields the
 * caller explicitly provided (i.e. keys that are present, even with
 * a `null` value). Missing keys are omitted from the output so the
 * downstream `patchRacRuntimeTrace` writer can build a SET clause
 * that targets only those fields.
 *
 * H4-c7 / C2-c7 (cycle-7 audit closure §H4-c7) — pre-cycle-7 this
 * function normalized every missing field to `null` and the writer
 * sent all 3 fields to Drizzle's `.set()`. Drizzle's
 * `.set({foo: null})` is indistinguishable from
 * `.set({foo: value})` in SQL — both write the literal NULL. Two
 * concurrent callers could race: caller A sets
 * `{plannerMode: "hybrid_cag_rag"}`; caller B then patches
 * `{plannerReason: "fresh"}` (no plannerMode key); the second UPDATE
 * overwrites A's plannerMode with NULL.
 *
 * The new contract distinguishes:
 *   - key absent              → leave the column alone (omit from SET)
 *   - key present with `null` → explicitly clear the column
 *   - key present with value  → set the column to that value
 *
 * Idempotent — calling twice on the same input produces the same
 * output. Returns an empty object when no keys were provided
 * (`patchRacRuntimeTrace` short-circuits in that case).
 */
export function buildRacTracePatch(input: RacTracePatchInput): RacTracePatch {
  const out: RacTracePatch = {};
  if ("plannerMode" in input) out.plannerMode = input.plannerMode ?? null;
  if ("plannerReason" in input) out.plannerReason = input.plannerReason ?? null;
  if ("cagCompiledHash" in input) out.cagCompiledHash = input.cagCompiledHash ?? null;
  return out;
}

// ── DB-backed writers ─────────────────────────────────────────────────

export async function recordToolCallTrace(
  input: ToolCallTraceInput,
): Promise<{ id: number }> {
  const db = getAsDbForWorkspace(input.workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  const row = buildToolCallTraceRow(input);
  const [created] = await db
    .insert(agsToolCallTraces)
    .values({
      workspaceId: row.workspaceId,
      agentId: row.agentId,
      agentDraftId: row.agentDraftId,
      runtimeTraceId: row.runtimeTraceId,
      runtimeRunId: row.runtimeRunId,
      messageId: row.messageId,
      proposedToolCallJson: row.proposedToolCallJson,
      proposedToolCallHash: row.proposedToolCallHash,
      validationVerdict: row.validationVerdict,
      validationCode: row.validationCode,
      validationMessage: row.validationMessage,
      approvalRequestId: row.approvalRequestId,
      approvalStatus: row.approvalStatus,
      governanceVerdict: row.governanceVerdict,
      dispatchResult: row.dispatchResult,
      dispatchAuditId: row.dispatchAuditId,
      durationMs: row.durationMs,
      errorMessage: row.errorMessage,
      traceTimeoutReason: row.traceTimeoutReason,
    })
    .returning({ id: agsToolCallTraces.id });
  return { id: created.id };
}

export async function patchRacRuntimeTrace(
  traceId: number,
  patch: RacTracePatchInput,
): Promise<void> {
  // V1+ MR-3 twenty-second batch (PR-V1-90): split-handle pattern
  // (same shape as #831 / #838 / #839 / #840). H4-c7 early-return
  // preserved — empty patch still short-circuits BEFORE the
  // discovery SELECT so we don't pay the round-trip for a no-op.
  const norm = buildRacTracePatch(patch);
  if (Object.keys(norm).length === 0) return;
  const lookupDb = getAsDb();
  if (!lookupDb) throw new Error("ASDB unavailable");
  const lookup = await lookupDb
    .select({ workspaceId: agsRacRuntimeTraces.workspaceId })
    .from(agsRacRuntimeTraces)
    .where(eq(agsRacRuntimeTraces.id, traceId))
    .limit(1);
  if (lookup.length === 0) return;
  const db = getAsDbForWorkspace(lookup[0].workspaceId);
  if (!db) throw new Error("ASDB unavailable");
  await db
    .update(agsRacRuntimeTraces)
    .set(norm)
    .where(eq(agsRacRuntimeTraces.id, traceId));
}
