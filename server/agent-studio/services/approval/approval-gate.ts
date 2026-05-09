/**
 * Approval Gate — Retrofit P9.
 *
 * Locks D-APP-EXT-1..7 from
 * `docs/architecture/agent-studio-approval-gate-extension.md`.
 *
 * Reuses `agsPendingPermissionRequests` (D-APP-EXT-1 — no new approval
 * table). Phase 8 produces the canonical hash; this gate is idempotent
 * on `(agentDraftId, proposedToolCallHash)` (D-APP-EXT-2).
 *
 * Approval permits MCP dispatch; it does NOT execute the tool
 * (D-APP-EXT-3). The dispatcher still re-runs governance + MCP schema
 * validation after the gate clears.
 *
 * State transitions write to `agsRuntimePolicyEvents` (D-APP-EXT-6) so
 * the same ledger that records dispatch events captures the approval
 * lifecycle.
 *
 * H1-c4 — `dual_control` non-coverage at this layer
 * --------------------------------------------------
 * This gate operates on `proposedToolCallHash` and consults
 * `agsPendingPermissionRequests.status` ∈ {pending, allowed, denied,
 * timed_out}. It does NOT read the YAML `approval:` field — a single
 * "allowed" row is permit, regardless of how many approvers signed off.
 *
 * Cycle-4 audit (`/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §H1-c4)
 * surfaced the question: does this matter? Today: NO. All 11 YAML
 * `approval: dual_control` entries (agent.controlPlane.promote,
 * agentPromotion.approve, keyRotation.{activateKey,revokeKey,
 * activateVersion,createRotation,rollbackRotation}, catalog.{approve,
 * publish,recall}, governance.unfreezeSubject) flow through tRPC
 * `governedProcedure` middleware → `requireGovernedAction.checkApproval`
 * (server/governance/requireGovernedAction.ts:597-604), which DOES count
 * distinct approver IDs. None resolve to this MCP gate path.
 *
 * Lockstep test: `tests/governance/dual-control-mcp-boundary.test.ts`
 * scans YAML for `approval: dual_control` entries and asserts each is
 * NOT in `MCP_GATE_BOUND_ACTION_KEYS`. The test fails if a future PR
 * (a) registers a new MCP-bound action with dual_control, or (b) flips
 * the only currently-MCP-bound key (`agentStudio.toolApprovals.decide`,
 * which is `approval: none`) to dual_control. Either change requires
 * adding dual_control logic to this file FIRST.
 *
 * H2-c4 — `GOVERNANCE_ENFORCE_APPROVALS` env-flag NON-applicability
 * -----------------------------------------------------------------
 * Cycle-3 R6-c3 (PR #319) introduced `GOVERNANCE_ENFORCE_APPROVALS=true|1`
 * to flip the platform-governance layer (`requireGovernedAction.checkApproval`,
 * server/governance/requireGovernedAction.ts) from placeholder-audit-and-
 * proceed to fail-closed. **That env flag does NOT and SHOULD NOT apply
 * to this gate.** The MCP approval gate is always-enforcing by
 * construction: it consults the actual DB state of
 * `agsPendingPermissionRequests.status` and returns the appropriate
 * verdict. There is no "for now, don't block" placeholder at this
 * layer to flip.
 *
 * Cycle-4 audit (`/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §H2-c4)
 * surfaced the asymmetry as a HIGH-tier finding because R6-c3's tests
 * lived only at the platform layer. Today the asymmetry is intentional;
 * `tests/governance/require-governed-action.test.ts` H2-c4 describe
 * block locks the invariant by asserting this file does NOT reference
 * the env-flag string.
 */
import { and, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import {
  agsPendingPermissionRequests,
  agsRuntimePolicyEvents,
} from "../../../../drizzle/tables/agent-studio";
import {
  hashProposedToolCall,
  type ProposedToolCall,
} from "../mcp/proposed-tool-call";
import { getApprovalEventBus } from "../runtime/approval-event-bus";

// ── H1-c4 — MCP gate boundary ─────────────────────────────────────────
// The set of YAML action-keys whose enforcement happens at THIS gate
// (`evaluateApprovalGate` / `decideApprovalRequest`). The gate is
// hash-driven, not action-key-driven, so this set is empty by design:
// no YAML entry is "MCP-bound" in the dual-control sense. Kept as an
// explicit named export so the lockstep test
// `tests/governance/dual-control-mcp-boundary.test.ts` can assert no
// `approval: dual_control` YAML entry has migrated into this set.
//
// If the gate is ever extended to consult action-key-level approval
// rules (e.g., to implement dual_control here), populate this set with
// the affected action-keys AND add the dual_control counting logic
// before doing so.
export const MCP_APPROVAL_GATE_ACTION_KEYS: ReadonlySet<string> = new Set();

// ── Pure state machine (D-APP-EXT-2) ──────────────────────────────────

export type ApprovalDecision =
  | "permit"
  | "expired"
  | "denied"
  | "pending"
  | "approval_required";

export interface ApprovalRowSnapshot {
  status: "pending" | "allowed" | "denied" | "timed_out";
  expiresAt: Date | null;
  proposedToolCallHash: string | null;
}

/**
 * Pure decision: given a candidate row and the current time, return the
 * gate verdict. Caller is responsible for the row lookup and any
 * subsequent writes. Logic is locked to D-APP-EXT-2.
 *
 *   - status="allowed" AND expiresAt > now    → permit
 *   - status="allowed" AND expiresAt <= now   → expired
 *   - status="timed_out"                      → expired
 *   - status="denied"                         → denied
 *   - status="pending"                        → pending
 *   - row not found                           → approval_required
 */
export function decideApprovalState(
  row: ApprovalRowSnapshot | null,
  now: Date,
): ApprovalDecision {
  if (!row) return "approval_required";
  switch (row.status) {
    case "allowed": {
      if (!row.expiresAt) return "permit"; // legacy row without expiry
      return row.expiresAt.getTime() > now.getTime() ? "permit" : "expired";
    }
    case "denied":
      return "denied";
    case "timed_out":
      return "expired";
    case "pending":
      return "pending";
  }
}

/**
 * D-APP-EXT-5: default 1-hour expiry; per-tool override via the Phase 7
 * mirror (`approvalTtlSeconds`). Returns the effective expiresAt for an
 * approval that is being marked `allowed` right now.
 */
const DEFAULT_APPROVAL_TTL_SECONDS = 3600; // 1 hour

export function computeExpiresAt(
  decidedAt: Date,
  ttlSecondsOverride: number | null | undefined,
): Date {
  const ttl =
    typeof ttlSecondsOverride === "number" && ttlSecondsOverride > 0
      ? ttlSecondsOverride
      : DEFAULT_APPROVAL_TTL_SECONDS;
  return new Date(decidedAt.getTime() + ttl * 1000);
}

// ── Service surface ───────────────────────────────────────────────────

export interface EvaluateApprovalGateInput {
  agentDraftId: number;
  proposedToolCall: ProposedToolCall;
  /** Optional override; tests pin to a fixed clock. */
  now?: Date;
}

export interface EvaluateApprovalGateResult {
  decision: ApprovalDecision;
  /** Canonical SHA-256 from Phase 8. */
  proposedToolCallHash: string;
  /** Existing row id when one was found; null on `approval_required`. */
  approvalRequestId: number | null;
  /** Reason code that downstream consumers (dispatcher, trace) surface. */
  reason: string;
}

/**
 * Look up the approval row keyed on `(agentDraftId, proposedToolCallHash)`,
 * apply the D-APP-EXT-2 state machine, and bump `lastUsedAt` on permit
 * so the audit trail records every successful re-use.
 *
 * Does NOT write `agsRuntimePolicyEvents` here — that's the dispatcher's
 * job for the dispatch event itself. State-transition rows are written
 * by `createApprovalRequest` and `decideApprovalRequest` (the two paths
 * that move the row between statuses).
 */
export async function evaluateApprovalGate(
  input: EvaluateApprovalGateInput,
): Promise<EvaluateApprovalGateResult> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const hash = hashProposedToolCall(input.proposedToolCall);
  const now = input.now ?? new Date();

  const rows = await db
    .select()
    .from(agsPendingPermissionRequests)
    .where(
      and(
        eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
        eq(agsPendingPermissionRequests.proposedToolCallHash, hash),
      ),
    )
    .limit(1);
  const row = rows[0] ?? null;

  const decision = decideApprovalState(
    row
      ? {
          status: row.status as ApprovalRowSnapshot["status"],
          expiresAt: row.expiresAt,
          proposedToolCallHash: row.proposedToolCallHash,
        }
      : null,
    now,
  );

  if (decision === "permit" && row) {
    await db
      .update(agsPendingPermissionRequests)
      .set({ lastUsedAt: now })
      .where(eq(agsPendingPermissionRequests.id, row.id));
  }

  return {
    decision,
    proposedToolCallHash: hash,
    approvalRequestId: row?.id ?? null,
    reason: reasonFor(decision),
  };
}

function reasonFor(decision: ApprovalDecision): string {
  switch (decision) {
    case "permit":
      return "approval_active";
    case "expired":
      return "approval_expired";
    case "denied":
      return "approval_denied";
    case "pending":
      return "approval_pending";
    case "approval_required":
      return "approval_required";
  }
}

// ── Create / decide flows (D-APP-EXT-6 audit) ─────────────────────────

export interface CreateApprovalRequestInput {
  runtimeRunId: number;
  agentDraftId: number;
  proposedToolCall: ProposedToolCall;
  /** Optional human note surfaced in the approval queue. */
  description?: string | null;
}

/**
 * Persist a new pending approval row keyed on the canonical hash. Idempotency
 * means the unique-ish lookup is `(agentDraftId, proposedToolCallHash)`;
 * if a row already exists this returns the existing id rather than
 * inserting a duplicate.
 *
 * Writes a `null → pending` row to `agsRuntimePolicyEvents`.
 */
export async function createApprovalRequest(
  input: CreateApprovalRequestInput,
): Promise<{ approvalRequestId: number; created: boolean }> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const hash = hashProposedToolCall(input.proposedToolCall);

  const existing = await db
    .select()
    .from(agsPendingPermissionRequests)
    .where(
      and(
        eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
        eq(agsPendingPermissionRequests.proposedToolCallHash, hash),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { approvalRequestId: existing[0].id, created: false };
  }

  const [created] = await db
    .insert(agsPendingPermissionRequests)
    .values({
      runtimeRunId: input.runtimeRunId,
      agentDraftId: input.agentDraftId,
      toolName: input.proposedToolCall.toolName,
      description: input.description ?? null,
      rawPayload: { proposedToolCall: input.proposedToolCall as unknown as Record<string, unknown> },
      proposedToolCallJson: input.proposedToolCall as unknown as Record<string, unknown>,
      proposedToolCallHash: hash,
      status: "pending",
    })
    .returning();

  await db.insert(agsRuntimePolicyEvents).values({
    runId: input.runtimeRunId,
    policyKey: "approval_gate",
    decision: "pending",
    reason: "approval_request_created",
    payload: {
      approvalRequestId: created.id,
      agentDraftId: input.agentDraftId,
      proposedToolCallHash: hash,
      toolName: input.proposedToolCall.toolName,
    },
  });

  return { approvalRequestId: created.id, created: true };
}

export interface DecideApprovalRequestInput {
  approvalRequestId: number;
  status: "allowed" | "denied" | "timed_out";
  decidedBy?: number | null;
  reason?: string | null;
  /** Per-tool override per D-APP-EXT-5; defaults to 1 hour. */
  ttlSecondsOverride?: number | null;
  /** Test override. */
  now?: Date;
}

/**
 * Flip status on a pending row. Computes expiresAt for `allowed`
 * (D-APP-EXT-5). Writes a state-transition row to
 * `agsRuntimePolicyEvents` (D-APP-EXT-6).
 */
export async function decideApprovalRequest(
  input: DecideApprovalRequestInput,
): Promise<{
  ok: boolean;
  status: string;
  expiresAt: Date | null;
  reason: string;
}> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const now = input.now ?? new Date();
  const expiresAt =
    input.status === "allowed"
      ? computeExpiresAt(now, input.ttlSecondsOverride ?? null)
      : null;

  const [updated] = await db
    .update(agsPendingPermissionRequests)
    .set({
      status: input.status,
      decidedBy: input.decidedBy ?? null,
      decidedAt: now,
      expiresAt,
      reason: input.reason ?? null,
    })
    .where(
      and(
        eq(agsPendingPermissionRequests.id, input.approvalRequestId),
        eq(agsPendingPermissionRequests.status, "pending"),
      ),
    )
    .returning();

  if (!updated) {
    // Row already terminal — DO NOT flip the row state, but DO emit a
    // rejection-audit row so a forensic reader can reconstruct that an
    // operator attempted a (now-rejected) second decide. M5-c4 closure
    // (`/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §M5-c4):
    // pre-cycle-4 the second-operator's attempt was silent, leaving no
    // trail of concurrent-decide races.
    const existing = await db
      .select()
      .from(agsPendingPermissionRequests)
      .where(eq(agsPendingPermissionRequests.id, input.approvalRequestId))
      .limit(1);
    const row = existing[0];
    if (!row) {
      return { ok: false, status: "missing", expiresAt: null, reason: "row_not_found" };
    }
    await db.insert(agsRuntimePolicyEvents).values({
      runId: row.runtimeRunId,
      policyKey: "approval_gate",
      decision: "rejected_already_decided",
      reason:
        input.reason ?? `attempted_redecide_to_${input.status}`,
      payload: {
        approvalRequestId: row.id,
        attemptedBy: input.decidedBy ?? null,
        attemptedStatus: input.status,
        currentStatus: row.status,
        proposedToolCallHash: row.proposedToolCallHash,
        toolName: row.toolName,
      },
    });
    return {
      ok: false,
      status: row.status,
      expiresAt: row.expiresAt,
      reason: "already_decided",
    };
  }

  await db.insert(agsRuntimePolicyEvents).values({
    runId: updated.runtimeRunId,
    policyKey: "approval_gate",
    decision: updated.status,
    reason: input.reason ?? `approval_${updated.status}`,
    payload: {
      approvalRequestId: updated.id,
      decidedBy: input.decidedBy ?? null,
      proposedToolCallHash: updated.proposedToolCallHash,
      toolName: updated.toolName,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  });

  // C2-c4 PR-2 (D-RESUME-1) — emit on the in-process bus so any
  // chat-stream waiter for this approvalRequestId can resume. Fired
  // AFTER the audit row write so the bus event always succeeds the
  // committed DB state. No-op if no subscribers; D-RESUME-3 covers
  // the approve-before-subscribe race in the caller via DB re-eval.
  getApprovalEventBus().emit({
    approvalRequestId: updated.id,
    status: updated.status as "allowed" | "denied" | "timed_out",
    expiresAt,
  });

  return {
    ok: true,
    status: updated.status,
    expiresAt,
    reason: `approval_${updated.status}`,
  };
}
