/**
 * Runtime ProposedToolCall validator wiring — Follow-up A1.
 *
 * Bridges the chat-stream / chat-service tool-call loop to the Phase 8
 * validator. Production tool-use responses don't yet carry a structured
 * envelope (rationale + evidence ids), so this helper builds the
 * envelope from what the runtime knows:
 *
 *   - `mcpServerId` and `toolName` from the dispatch path
 *   - `arguments` from the model's parsed tool-call args
 *   - `riskLevel` + `requiresApproval` derived from the manifest's
 *     riskClass via the locked D-APP-EXT-4 mapping (so gates 5/6
 *     are tautological — the model wouldn't fabricate the manifest)
 *   - `rationale` empty, `evidence*` empty (gates 3 trivially passes)
 *
 * The validator's still-active gates in this configuration are the
 * meaningful safety net for runtime that doesn't emit envelopes:
 *
 *   - Gate 1 — invented tool (caller named a tool the live registry
 *              doesn't have)
 *   - Gate 2 — argument schema (missing required params, unknown
 *              params, type mismatches)
 *   - Gate 7 — quarantined hard-block (D-TOOL-1 default-deny)
 *   - Gate 8 — sandbox prerequisite for code_execution (D-SBX-2)
 *
 * As tool-use envelopes evolve to carry rationale + evidence (later
 * follow-up), the same wire-up will start exercising gates 3 and 4
 * automatically — the helper accepts those fields when present.
 */

import type { McpTool } from "../mcp/types";
import {
  approvalRequiredFor,
  riskClassToRiskLevel,
  validateProposedToolCall,
  type ProposedToolCall,
  type ProposedToolCallValidationCode,
  type ProposedToolCallValidationResult,
  type ProposedToolCallValidatorContext,
} from "../mcp/proposed-tool-call";
import { readRiskClass } from "../cag/risk-classifier";
import {
  createApprovalRequest as defaultCreateApprovalRequest,
  evaluateApprovalGate as defaultEvaluateApprovalGate,
  type ApprovalDecision,
} from "../approval/approval-gate";
import {
  hashProposedToolCall,
} from "../mcp/proposed-tool-call";
import {
  recordToolCallTrace as defaultRecordToolCallTrace,
  type DispatchResult,
} from "./trace-writer";

export interface RuntimeValidationInput {
  /** Canonical MCP server id (matches the agsMcpToolKnowledge mirror). */
  mcpServerId: string;
  /** Tool name as advertised by the registry. */
  toolName: string;
  /** Live snapshot of the tool from this server's registry snapshot. */
  liveTool: McpTool;
  /** Parsed arguments from the model's tool-call. */
  arguments: Record<string, unknown>;
  /** Optional model-provided rationale. Empty string when absent. */
  rationale?: string;
  /**
   * Optional evidence ids surfaced this turn. Empty when the model
   * doesn't emit a structured envelope yet.
   */
  evidenceChunkIds?: string[];
  knowledgeUnitIds?: number[];
  toolKnowledgeIds?: number[];
  cagBlockIds?: string[];
  /** Sandbox health probe; true when no probe is wired (dispatcher remains the source of truth). */
  sandboxHealthOk?: boolean;
}

/**
 * Result shape with rejection details flattened to top-level fields so
 * runtime callers (chat-stream / chat-service) can branch on `ok`
 * under `strictNullChecks: false` without TS losing the discrimination.
 */
export interface RuntimeValidationResult {
  ok: boolean;
  code: ProposedToolCallValidationCode | null;
  message: string | null;
  raw: ProposedToolCallValidationResult;
  call: ProposedToolCall;
}

/**
 * Build the runtime ProposedToolCall + validator context, then run the
 * validator. Returns the verdict; callers decide what to do with a
 * rejection (chat-stream emits a tool_end event; chat-service writes a
 * tool message and continues).
 */
export async function validateRuntimeToolCall(
  input: RuntimeValidationInput,
): Promise<RuntimeValidationResult> {
  const riskClass = readRiskClass(input.liveTool);
  const call: ProposedToolCall = {
    mcpServerId: input.mcpServerId,
    toolName: input.toolName,
    arguments: input.arguments,
    rationale: input.rationale ?? "",
    evidenceChunkIds: input.evidenceChunkIds ?? [],
    knowledgeUnitIds: input.knowledgeUnitIds,
    toolKnowledgeIds: input.toolKnowledgeIds,
    cagBlockIds: input.cagBlockIds,
    riskLevel: riskClassToRiskLevel(riskClass),
    requiresApproval: approvalRequiredFor(riskClass),
  };

  const ctx: ProposedToolCallValidatorContext = {
    resolveTool: async (serverId, name) =>
      serverId === input.mcpServerId && name === input.toolName
        ? input.liveTool
        : null,
    resolveRiskClass: () => riskClass,
    retrievalChunkIdSet: new Set(input.evidenceChunkIds ?? []),
    knowledgeUnitIdSet: new Set(input.knowledgeUnitIds ?? []),
    cagBlockIdSet: new Set(input.cagBlockIds ?? []),
    sandboxHealthOk: input.sandboxHealthOk ?? true,
  };

  const result = await validateProposedToolCall(call, ctx);
  if (result.ok) {
    return { ok: true, code: null, message: null, raw: result, call };
  }
  const failure = result as Extract<ProposedToolCallValidationResult, { ok: false }>;
  return {
    ok: false,
    code: failure.code,
    message: failure.message,
    raw: result,
    call,
  };
}

// ── Approval-gate orchestration (Follow-up A2) ────────────────────────

/**
 * Reason codes the runtime callers (chat-stream / chat-service) branch
 * on after the dispatch gate.
 */
export type RuntimeDispatchRejection =
  | "validator_rejected"
  | "approval_denied"
  | "approval_expired"
  | "approval_pending"
  | "approval_required"
  // C2-c4 PR-3 (D-RESUME-2) — operator did not decide within
  // APPROVAL_RESUME_TIMEOUT_SEC (default 300s). Distinct from
  // approval_expired (which means an operator-granted TTL elapsed).
  | "approval_timeout";

/**
 * Flattened so callers branch on `ok` cleanly under strictNullChecks:
 * false. Rejection fields are nullable on the ok-side; the truthy
 * `ok` is the discriminator the call sites care about.
 */
export interface RuntimeDispatchVerdict {
  ok: boolean;
  reason: RuntimeDispatchRejection | null;
  message: string | null;
  code: ProposedToolCallValidationCode | null;
  call: ProposedToolCall;
  approvalRequestId: number | null;
}

export interface GateRuntimeDispatchInput {
  validation: RuntimeValidationResult;
  agentDraftId: number;
  /**
   * Used as `runtimeRunId` on a freshly-created approval row. Live chat
   * has no formal "runtime run" — the chat session id stands in. Schema
   * column is integer NOT NULL, so a non-zero value is required.
   */
  runtimeRunId: number;
  /** Optional human note recorded with a freshly-created approval row. */
  description?: string | null;
  /** Injectable for tests. */
  evaluateGate?: typeof defaultEvaluateApprovalGate;
  createRequest?: typeof defaultCreateApprovalRequest;
}

/**
 * Compose the validator + approval gate into a single runtime verdict
 * the chat loops can branch on. Pure orchestration — DB calls happen
 * inside `evaluateApprovalGate` / `createApprovalRequest` (or the
 * injected fakes during tests).
 *
 * Decision tree:
 *   1. Validator rejected            → reason="validator_rejected"
 *   2. requiresApproval=false        → ok=true (no gate)
 *   3. Gate "permit"                 → ok=true (carries approvalRequestId)
 *   4. Gate "denied"                 → reason="approval_denied"
 *   5. Gate "expired"                → reason="approval_expired"
 *   6. Gate "pending"                → reason="approval_pending"
 *   7. Gate "approval_required"      → createApprovalRequest, then
 *                                      reason="approval_required"
 *                                      (carries new approvalRequestId)
 */
export async function gateRuntimeDispatch(
  input: GateRuntimeDispatchInput,
): Promise<RuntimeDispatchVerdict> {
  if (!input.validation.ok) {
    return {
      ok: false,
      reason: "validator_rejected",
      message: input.validation.message ?? "validator rejected",
      code: input.validation.code,
      call: input.validation.call,
      approvalRequestId: null,
    };
  }

  const call = input.validation.call;
  if (!call.requiresApproval) {
    return {
      ok: true,
      reason: null,
      message: null,
      code: null,
      call,
      approvalRequestId: null,
    };
  }

  const evaluate = input.evaluateGate ?? defaultEvaluateApprovalGate;
  const createRequest = input.createRequest ?? defaultCreateApprovalRequest;

  const gate = await evaluate({
    agentDraftId: input.agentDraftId,
    proposedToolCall: call,
  });

  switch (gate.decision as ApprovalDecision) {
    case "permit":
      return {
        ok: true,
        reason: null,
        message: null,
        code: null,
        call,
        approvalRequestId: gate.approvalRequestId,
      };
    case "denied":
      return {
        ok: false,
        reason: "approval_denied",
        message: gate.reason,
        code: null,
        call,
        approvalRequestId: gate.approvalRequestId,
      };
    case "expired":
      return {
        ok: false,
        reason: "approval_expired",
        message: gate.reason,
        code: null,
        call,
        approvalRequestId: gate.approvalRequestId,
      };
    case "pending":
      return {
        ok: false,
        reason: "approval_pending",
        message: gate.reason,
        code: null,
        call,
        approvalRequestId: gate.approvalRequestId,
      };
    case "approval_required": {
      const created = await createRequest({
        runtimeRunId: input.runtimeRunId,
        agentDraftId: input.agentDraftId,
        proposedToolCall: call,
        description: input.description ?? null,
      });
      return {
        ok: false,
        reason: "approval_required",
        message: created.created
          ? "approval newly created — awaiting decision"
          : "approval already pending — awaiting decision",
        code: null,
        call,
        approvalRequestId: created.approvalRequestId,
      };
    }
  }
}

// ── Trace persistence (Follow-up A3) ──────────────────────────────────

/**
 * Map a runtime dispatch verdict back onto the `ApprovalDecision`
 * value the trace builder expects. Validator-rejected and no-approval-
 * required cases collapse to null (matches buildToolCallTraceRow's
 * "rejection drops downstream metadata" invariant).
 */
export function approvalDecisionFromVerdict(
  verdict: RuntimeDispatchVerdict,
): ApprovalDecision | null {
  if (!verdict.ok) {
    switch (verdict.reason) {
      case "approval_denied":
        return "denied";
      case "approval_expired":
        return "expired";
      case "approval_timeout":
        // C2-c4 PR-3 — chat-stream wait elapsed without operator
        // decision. Surfaces as "expired" in the trace ledger (closest
        // existing ApprovalDecision; the distinct rejection reason
        // preserves the original signal for audit consumers).
        return "expired";
      case "approval_pending":
        return "pending";
      case "approval_required":
        return "approval_required";
      case "validator_rejected":
      default:
        return null;
    }
  }
  // ok=true — only meaningful when an approval row backed the permit.
  return verdict.approvalRequestId !== null ? "permit" : null;
}

export interface PersistRuntimeTraceInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  runtimeRunId: number | null;
  runtimeTraceId: number | null;
  messageId: number | null;
  verdict: RuntimeDispatchVerdict;
  validation: RuntimeValidationResult;
  /**
   * Real dispatcher result when dispatch happened. Omit when the call
   * was blocked by the validator or approval gate.
   */
  dispatchResult?: {
    ok: boolean;
    error?: { message?: string };
    durationMs?: number;
  } | null;
  /** Optional governance verdict surfaced from evaluateMcpPreInvoke. */
  governanceVerdict?: string | null;
  /** Injectable for tests. */
  recordTrace?: typeof defaultRecordToolCallTrace;
}

/**
 * Persist one `agsToolCallTraces` row per runtime tool-call attempt.
 *
 * Best-effort: any error from the trace writer is swallowed so trace
 * persistence never blocks the chat loop. The dispatcher's existing
 * audit row in `agsRuntimePolicyEvents` remains the source of truth
 * for security-relevant events; this row is the per-ProposedToolCall
 * forensic surface (D-PTC-5).
 */
export async function persistRuntimeToolCallTrace(
  input: PersistRuntimeTraceInput,
): Promise<{ id: number | null }> {
  const record = input.recordTrace ?? defaultRecordToolCallTrace;
  const dispatchResult: DispatchResult | null = input.dispatchResult
    ? input.dispatchResult.ok
      ? "ok"
      : "error"
    : input.verdict.ok
      ? null
      : "blocked";
  try {
    const r = await record({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentDraftId: input.agentDraftId,
      runtimeRunId: input.runtimeRunId ?? null,
      runtimeTraceId: input.runtimeTraceId ?? null,
      messageId: input.messageId ?? null,
      proposedToolCall: input.verdict.call,
      proposedToolCallHash: hashProposedToolCall(input.verdict.call),
      validation: input.validation.raw,
      approvalDecision: approvalDecisionFromVerdict(input.verdict),
      approvalRequestId: input.verdict.approvalRequestId,
      governanceVerdict: input.governanceVerdict ?? null,
      dispatchResult,
      durationMs: input.dispatchResult?.durationMs ?? null,
      errorMessage: input.dispatchResult?.error?.message ?? null,
    });
    return { id: r.id };
  } catch (err) {
    // Best-effort: never block the chat loop on trace-write failure.
    // Surface as a warning so operators see persistent trace-write
    // outages (production observability hook). Review-polish PR.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ags-runtime] tool-call trace write failed (workspace=${input.workspaceId} agent=${input.agentId} draft=${input.agentDraftId}): ${msg}`,
    );
    return { id: null };
  }
}
