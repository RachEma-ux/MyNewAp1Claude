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
 * - Assignment without HR validation (request must be past under_hr_review)
 * - Duplicate active assignment for same request
 * - Overlapping active assignments for same employee + project + time range
 */
export async function requireGovernedAssignmentFlow(
  check: AssignmentPreCheck,
): Promise<{ request: typeof resourceRequests.$inferSelect }> {
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

  // 4. No duplicate active assignment for this request
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

  // 5. No overlapping active assignments for same employee + project
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

  return { request };
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
 */
export async function checkAllocationOverflow(
  employeeId: number,
  additionalPercent: number,
): Promise<{ currentTotal: number; wouldOverflow: boolean }> {
  const db = getDb();
  if (!db) return { currentTotal: 0, wouldOverflow: false };

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
  return {
    currentTotal,
    wouldOverflow: currentTotal + additionalPercent > 100,
  };
}
