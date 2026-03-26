/**
 * PS Module — Assignment Business Logic
 *
 * Validates assignment creation, enforces status transitions,
 * computes request fulfillment state, and produces system-level summaries.
 */

import { TRPCError } from "@trpc/server";
import type {
  PsAssignmentStatus,
  RequestFulfillment,
  RequestFulfillmentState,
  AssignmentSummary,
} from "./ps.types";
import type { PsResourceAssignment } from "../../drizzle/tables/ps";

// ── Status Transition Map ───────────────────────────────────────────

const VALID_TRANSITIONS: Record<PsAssignmentStatus, PsAssignmentStatus[]> = {
  proposed: ["requested", "rejected", "cancelled"],
  requested: ["confirmed", "rejected", "cancelled"],
  confirmed: ["active", "rejected", "cancelled"],
  active: ["completed", "cancelled"],
  rejected: [],
  cancelled: [],
  completed: [],
};

/**
 * Validate that a status transition is allowed.
 * Throws TRPCError if the transition is invalid.
 */
export function validateStatusTransition(
  currentStatus: PsAssignmentStatus,
  newStatus: PsAssignmentStatus,
): void {
  if (currentStatus === newStatus) return;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid assignment status transition: "${currentStatus}" → "${newStatus}". Allowed transitions from "${currentStatus}": ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}`,
    });
  }
}

/**
 * Validate that an assignment belongs to the same PS system as its request.
 */
export function validateSystemMatch(
  requestSystemId: number,
  assignmentSystemId: number,
): void {
  if (requestSystemId !== assignmentSystemId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Assignment system (${assignmentSystemId}) does not match request system (${requestSystemId}). Assignments must belong to the same PS system as their request.`,
    });
  }
}

// ── Fulfillment States ─────────────────────────────────────────────

/** Statuses that count toward fulfillment (not rejected/cancelled) */
const FULFILLMENT_STATUSES: Set<PsAssignmentStatus> = new Set([
  "proposed",
  "requested",
  "confirmed",
  "active",
  "completed",
]);

/**
 * Compute the fulfillment state for a single request based on its assignments.
 */
export function computeRequestFulfillment(
  requestId: number,
  role: string,
  requestedQuantity: number,
  assignments: PsResourceAssignment[],
): RequestFulfillment {
  const relevantAssignments = assignments.filter(
    (a) => FULFILLMENT_STATUSES.has(a.status as PsAssignmentStatus),
  );

  const activeCount = relevantAssignments.length;
  const totalCount = assignments.length;

  let fulfillmentState: RequestFulfillmentState;
  if (activeCount === 0) {
    fulfillmentState = "unfilled";
  } else if (activeCount >= requestedQuantity) {
    fulfillmentState = "filled";
  } else {
    fulfillmentState = "partially_filled";
  }

  return {
    requestId,
    role,
    requestedQuantity,
    activeAssignmentCount: activeCount,
    totalAssignmentCount: totalCount,
    fulfillmentState,
  };
}

/**
 * Compute system-level assignment summary from requests and assignments.
 */
export function computeAssignmentSummary(
  psSystemId: number,
  requests: Array<{ id: number; role: string; quantity: number | null }>,
  assignments: PsResourceAssignment[],
): AssignmentSummary {
  // Group assignments by request
  const assignmentsByRequest = new Map<number, PsResourceAssignment[]>();
  for (const a of assignments) {
    const list = assignmentsByRequest.get(a.resourceRequestId) || [];
    list.push(a);
    assignmentsByRequest.set(a.resourceRequestId, list);
  }

  let unfilledRequests = 0;
  let partiallyFilledRequests = 0;
  let filledRequests = 0;

  for (const req of requests) {
    const reqAssignments = assignmentsByRequest.get(req.id) || [];
    const fulfillment = computeRequestFulfillment(
      req.id,
      req.role,
      req.quantity ?? 1,
      reqAssignments,
    );
    switch (fulfillment.fulfillmentState) {
      case "unfilled":
        unfilledRequests++;
        break;
      case "partially_filled":
        partiallyFilledRequests++;
        break;
      case "filled":
        filledRequests++;
        break;
    }
  }

  // Count assignments by status
  const byAssignmentStatus: Record<PsAssignmentStatus, number> = {
    proposed: 0,
    requested: 0,
    confirmed: 0,
    active: 0,
    rejected: 0,
    cancelled: 0,
    completed: 0,
  };
  let lastAssignmentDate: string | null = null;

  for (const a of assignments) {
    const s = a.status as PsAssignmentStatus;
    if (byAssignmentStatus[s] !== undefined) byAssignmentStatus[s]++;
    const dateStr = a.createdAt?.toISOString() || null;
    if (dateStr && (!lastAssignmentDate || dateStr > lastAssignmentDate)) {
      lastAssignmentDate = dateStr;
    }
  }

  return {
    psSystemId,
    totalRequests: requests.length,
    totalAssignments: assignments.length,
    unfilledRequests,
    partiallyFilledRequests,
    filledRequests,
    byAssignmentStatus,
    lastAssignmentDate,
  };
}
