/**
 * Workforce Assignment Bridge — Enforcement Layer
 *
 * Enforces the core governance rule: PM Central must not directly assign employees.
 * All assignments must flow through: request → validation → approval → assignment.
 *
 * This is the most important file in the bridge.
 */

import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import { resourceRequests, resourceAssignments } from "../../drizzle/schema";

// ============================================================================
// Allocation Policy Configuration
// ============================================================================

/**
 * Allocation overflow policy mode.
 * - "warn": log warning but allow assignment (current default)
 * - "strict": block assignment creation when allocation exceeds 100%
 */
export type AllocationPolicyMode = "warn" | "strict";

/**
 * Default allocation policy. Set to "warn" for backward compatibility.
 * Change to "strict" to enforce hard allocation limits.
 */
export const ALLOCATION_POLICY_DEFAULT: AllocationPolicyMode = "warn";

/** Runtime-overridable allocation policy. Tests and config can set this. */
let _allocationPolicyMode: AllocationPolicyMode = ALLOCATION_POLICY_DEFAULT;

export function setAllocationPolicyMode(mode: AllocationPolicyMode): void {
  _allocationPolicyMode = mode;
}

export function getAllocationPolicyMode(): AllocationPolicyMode {
  return _allocationPolicyMode;
}

// ============================================================================
// Approval Artifact Shape
// ============================================================================

/**
 * Explicit approval artifact stored on a request's metadata.
 * This is the binding source of truth for assignment creation.
 */
export interface ApprovalArtifact {
  approvedBy: number;
  approvedAt: string;
  candidateId: number;
  authorityChain: Record<string, unknown>;
}

/**
 * HR candidate proposal artifact stored on a request's metadata.
 */
export interface CandidateProposalArtifact {
  proposedCandidateId: number;
  proposedBy: number;
  proposedAt: string;
}

// ============================================================================
// Pre-check Contract
// ============================================================================

export interface AssignmentPreCheck {
  requestId: number;
  employeeId: number;
  projectId: number;
  actorId: number;
}

/**
 * Enforce governed assignment flow. Must pass ALL checks before an assignment can be created.
 *
 * Blocks:
 * - Assignment without approved request
 * - Assignment from non-approved request
 * - Assignment without HR candidate proposal artifact (D3)
 * - Assignment without approval artifact (D2)
 * - Assignment where employeeId != approved candidate (D1)
 * - Duplicate active assignment for same request
 * - Overlapping active assignments for same employee + project + time range
 *
 * Uses actorId for enforcement audit trace (D8).
 */
export async function requireGovernedAssignmentFlow(
  check: AssignmentPreCheck,
): Promise<{
  request: typeof resourceRequests.$inferSelect;
  approvalArtifact: ApprovalArtifact;
  candidateProposal: CandidateProposalArtifact;
}> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  }

  // 1. Request must exist
  const [request] = await db
    .select()
    .from(resourceRequests)
    .where(eq(resourceRequests.id, check.requestId))
    .limit(1);

  if (!request) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Resource request #${check.requestId} not found. Assignments require an approved request.`,
    });
  }

  // 2. Request must be approved
  if (request.status !== "approved") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Resource request #${check.requestId} is "${request.status}" — must be "approved" before creating assignment. ` +
        `Direct assignment bypass is forbidden.`,
    });
  }

  // 3. Request project must match
  if (request.projectId !== check.projectId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Project mismatch: request is for project #${request.projectId}, assignment targets project #${check.projectId}.`,
    });
  }

  const metadata = (request.metadata ?? {}) as Record<string, unknown>;

  // 4. [D3] HR candidate proposal artifact must exist
  const candidateProposal = extractCandidateProposal(metadata);
  if (!candidateProposal) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Resource request #${check.requestId} is missing HR candidate proposal artifact. ` +
        `An HR-validated candidate must be proposed before assignment creation. Actor: #${check.actorId}`,
    });
  }

  // 5. [D2] Approval artifact must exist
  const approvalArtifact = extractApprovalArtifact(metadata);
  if (!approvalArtifact) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Resource request #${check.requestId} is missing approval artifact. ` +
        `Request must have a formal approval record before assignment creation. Actor: #${check.actorId}`,
    });
  }

  // 6. [D1] Candidate binding: employeeId MUST equal approved candidate
  if (check.employeeId !== approvalArtifact.candidateId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Candidate binding violation: assignment targets employee #${check.employeeId} ` +
        `but approved candidate is #${approvalArtifact.candidateId}. ` +
        `Assignment must match the approved candidate. Actor: #${check.actorId}`,
    });
  }

  // 7. No duplicate active assignment for this request
  const [existingForRequest] = await db
    .select({ id: resourceAssignments.id })
    .from(resourceAssignments)
    .where(
      and(
        eq(resourceAssignments.requestId, check.requestId),
        sql`${resourceAssignments.status} NOT IN ('released', 'completed', 'cancelled')`,
      ),
    )
    .limit(1);

  if (existingForRequest) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Request #${check.requestId} already has an active assignment (#${existingForRequest.id}). ` +
        `Release or cancel the existing assignment first.`,
    });
  }

  // 8. No overlapping active assignments for same employee + project
  const [overlap] = await db
    .select({ id: resourceAssignments.id })
    .from(resourceAssignments)
    .where(
      and(
        eq(resourceAssignments.employeeId, check.employeeId),
        eq(resourceAssignments.projectId, check.projectId),
        sql`${resourceAssignments.status} IN ('pending', 'active')`,
      ),
    )
    .limit(1);

  if (overlap) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Employee #${check.employeeId} already has an active/pending assignment ` +
        `(#${overlap.id}) on project #${check.projectId}. Resolve conflict before creating new assignment.`,
    });
  }

  return { request, approvalArtifact, candidateProposal };
}

// ============================================================================
// Artifact Extractors
// ============================================================================

/**
 * Extract and validate the approval artifact from request metadata.
 * Returns null if the artifact is missing or structurally invalid.
 */
export function extractApprovalArtifact(
  metadata: Record<string, unknown>,
): ApprovalArtifact | null {
  const approval = metadata.approval as Record<string, unknown> | undefined;
  if (!approval) return null;

  const { approvedBy, approvedAt, candidateId, authorityChain } = approval;
  if (
    typeof approvedBy !== "number" ||
    typeof approvedAt !== "string" ||
    typeof candidateId !== "number" ||
    !authorityChain || typeof authorityChain !== "object"
  ) {
    return null;
  }

  return {
    approvedBy: approvedBy as number,
    approvedAt: approvedAt as string,
    candidateId: candidateId as number,
    authorityChain: authorityChain as Record<string, unknown>,
  };
}

/**
 * Extract and validate the HR candidate proposal artifact from request metadata.
 * Returns null if the artifact is missing or structurally invalid.
 */
export function extractCandidateProposal(
  metadata: Record<string, unknown>,
): CandidateProposalArtifact | null {
  const proposedCandidateId = metadata.proposedCandidateId;
  const proposedBy = metadata.proposedBy;
  const proposedAt = metadata.proposedAt;

  if (
    typeof proposedCandidateId !== "number" ||
    typeof proposedBy !== "number" ||
    typeof proposedAt !== "string"
  ) {
    return null;
  }

  return {
    proposedCandidateId: proposedCandidateId as number,
    proposedBy: proposedBy as number,
    proposedAt: proposedAt as string,
  };
}

/**
 * Validate that the requester (PM) is not trying to self-approve.
 * Separation of duties: requester cannot be the approver.
 */
export function preventRequesterSelfApproval(
  requesterId: number,
  approverId: number,
): void {
  if (requesterId === approverId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Separation of duties violation: request creator cannot approve their own request.",
    });
  }
}

/**
 * Check total allocation for an employee across active assignments.
 * Returns current total and whether adding more would exceed 100%.
 *
 * In "strict" mode, throws a hard error if overflow is detected.
 * In "warn" mode (default), returns the result without blocking.
 */
export async function checkAllocationOverflow(
  employeeId: number,
  additionalPercent: number,
): Promise<{ currentTotal: number; wouldOverflow: boolean; policyMode: AllocationPolicyMode }> {
  const db = getDb();
  const mode = getAllocationPolicyMode();
  if (!db) return { currentTotal: 0, wouldOverflow: false, policyMode: mode };

  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${resourceAssignments.allocationPercent}), 0)`,
    })
    .from(resourceAssignments)
    .where(
      and(
        eq(resourceAssignments.employeeId, employeeId),
        sql`${resourceAssignments.status} IN ('pending', 'active')`,
      ),
    );

  const currentTotal = Number(result?.total ?? 0);
  const wouldOverflow = currentTotal + additionalPercent > 100;

  // [D6] Strict mode: block assignment if allocation would overflow
  if (wouldOverflow && mode === "strict") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Allocation overflow blocked (strict mode): employee #${employeeId} ` +
        `current allocation is ${currentTotal}%, adding ${additionalPercent}% would exceed 100%.`,
    });
  }

  return {
    currentTotal,
    wouldOverflow,
    policyMode: mode,
  };
}
