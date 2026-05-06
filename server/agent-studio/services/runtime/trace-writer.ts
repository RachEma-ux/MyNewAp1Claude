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
import { getAsDb } from "../../db/connection";
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

export type ValidationVerdict = "ok" | "rejected";
export type DispatchResult = "ok" | "error" | "blocked";

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
    dispatchResult: isRejected ? null : input.dispatchResult ?? null,
    dispatchAuditId: isRejected ? null : input.dispatchAuditId ?? null,
    durationMs: input.durationMs ?? null,
    errorMessage: input.errorMessage ?? null,
  };
}

// ── Pure RAC trace patch builder ──────────────────────────────────────

export interface RacTracePatchInput {
  plannerMode?: string | null;
  plannerReason?: string | null;
  cagCompiledHash?: string | null;
}

export interface RacTracePatch {
  plannerMode: string | null;
  plannerReason: string | null;
  cagCompiledHash: string | null;
}

/**
 * Pure: normalize an arbitrary patch into the canonical trace row shape
 * (every nullable field present, even if null). Callers can pass a
 * partial — anything missing comes back as null and the writer sends
 * the SET clause exactly once.
 */
export function buildRacTracePatch(input: RacTracePatchInput): RacTracePatch {
  return {
    plannerMode: input.plannerMode ?? null,
    plannerReason: input.plannerReason ?? null,
    cagCompiledHash: input.cagCompiledHash ?? null,
  };
}

// ── DB-backed writers ─────────────────────────────────────────────────

export async function recordToolCallTrace(
  input: ToolCallTraceInput,
): Promise<{ id: number }> {
  const db = getAsDb();
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
    })
    .returning({ id: agsToolCallTraces.id });
  return { id: created.id };
}

export async function patchRacRuntimeTrace(
  traceId: number,
  patch: RacTracePatchInput,
): Promise<void> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const norm = buildRacTracePatch(patch);
  await db
    .update(agsRacRuntimeTraces)
    .set({
      plannerMode: norm.plannerMode,
      plannerReason: norm.plannerReason,
      cagCompiledHash: norm.cagCompiledHash,
    })
    .where(eq(agsRacRuntimeTraces.id, traceId));
}
