/**
 * Workforce Assignment Bridge — Lifecycle State Machine
 *
 * Explicit state transitions for resource_requests and resource_assignments.
 * No illegal jumps allowed. All transitions must be audited.
 */

import { TRPCError } from "@trpc/server";

// ============================================================================
// Request Lifecycle
// ============================================================================

export const REQUEST_STATUSES = [
  "draft",
  "requested",
  "under_hr_review",
  "candidate_proposed",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type RequestStatus = typeof REQUEST_STATUSES[number];

/** Allowed transitions: from → [to, to, ...] */
export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  draft: ["requested", "cancelled"],
  requested: ["under_hr_review", "cancelled"],
  under_hr_review: ["candidate_proposed", "rejected", "cancelled"],
  candidate_proposed: ["pending_approval", "under_hr_review", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: [], // terminal
  rejected: [], // terminal
  cancelled: [], // terminal
};

/**
 * Validate and enforce a request status transition.
 * Throws if the transition is illegal.
 */
export function validateRequestTransition(
  from: string,
  to: string,
): { from: RequestStatus; to: RequestStatus } {
  if (!REQUEST_STATUSES.includes(from as RequestStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid request status: ${from}`,
    });
  }
  if (!REQUEST_STATUSES.includes(to as RequestStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid target request status: ${to}`,
    });
  }

  const fromStatus = from as RequestStatus;
  const toStatus = to as RequestStatus;
  const allowed = REQUEST_TRANSITIONS[fromStatus];

  if (!allowed.includes(toStatus)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Illegal request transition: ${fromStatus} → ${toStatus}. Allowed: [${allowed.join(", ")}]`,
    });
  }

  return { from: fromStatus, to: toStatus };
}

// ============================================================================
// Assignment Lifecycle
// ============================================================================

export const ASSIGNMENT_STATUSES = [
  "pending",
  "active",
  "released",
  "completed",
  "cancelled",
] as const;

export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number];

export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  pending: ["active", "cancelled"],
  active: ["released", "completed", "cancelled"],
  released: [], // terminal
  completed: [], // terminal
  cancelled: [], // terminal
};

/**
 * Validate and enforce an assignment status transition.
 * Throws if the transition is illegal.
 */
export function validateAssignmentTransition(
  from: string,
  to: string,
): { from: AssignmentStatus; to: AssignmentStatus } {
  if (!ASSIGNMENT_STATUSES.includes(from as AssignmentStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid assignment status: ${from}`,
    });
  }
  if (!ASSIGNMENT_STATUSES.includes(to as AssignmentStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid target assignment status: ${to}`,
    });
  }

  const fromStatus = from as AssignmentStatus;
  const toStatus = to as AssignmentStatus;
  const allowed = ASSIGNMENT_TRANSITIONS[fromStatus];

  if (!allowed.includes(toStatus)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Illegal assignment transition: ${fromStatus} → ${toStatus}. Allowed: [${allowed.join(", ")}]`,
    });
  }

  return { from: fromStatus, to: toStatus };
}
