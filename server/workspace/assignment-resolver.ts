/**
 * Workspace Assignment Resolver — Assignment-driven staffing
 *
 * Resolves real staffing data for a workspace from the resource_assignments bridge.
 * Workspace is READ-ONLY — it consumes bridge data, never writes to it.
 *
 * Core rule: If it is not in resource_assignment, it does not exist in Workspace.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  resourceAssignments,
  resourceRequests,
  hrWorkerProfiles,
  hrPeople,
} from "../../drizzle/schema";

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceAssignmentEntry {
  assignmentId: number;
  employeeId: number;
  employeeName: string;
  employeeNumber: string | null;
  positionId: number | null;
  projectRole: string;
  allocationPercent: number;
  status: string;
  startDate: string;
  endDate: string | null;
  requestId: number;
}

export interface WorkspaceConflict {
  employeeId: number;
  employeeName: string;
  type: "over_allocated" | "overlapping";
  currentAllocation: number;
  detail: string;
}

export interface WorkspaceWorkloadEntry {
  employeeId: number;
  employeeName: string;
  totalAllocation: number;
  assignmentCount: number;
}

export interface WorkspaceStaffingView {
  assignments: WorkspaceAssignmentEntry[];
  conflicts: WorkspaceConflict[];
  workload: WorkspaceWorkloadEntry[];
  summary: {
    totalAssignments: number;
    activeAssignments: number;
    totalAllocation: number;
    hasConflicts: boolean;
  };
}

// ============================================================================
// Resolver
// ============================================================================

/**
 * Resolve all bridge-sourced assignments for a workspace.
 *
 * Lookup strategy:
 * - If workspaceId is linked to a project (via purposeRef or direct projectId),
 *   find all resource_assignments for that project.
 * - Filters to non-terminal statuses (pending, active) by default.
 * - Joins HR data for employee names.
 * - Detects conflicts (over-allocation > 100%).
 */
export async function resolveWorkspaceAssignments(
  projectId: number,
  options?: { includeReleased?: boolean },
): Promise<WorkspaceStaffingView> {
  const db = getDb();
  if (!db) {
    return emptyStaffingView();
  }

  // Determine which statuses to include
  const activeStatuses = options?.includeReleased
    ? ["pending", "active", "released", "completed"]
    : ["pending", "active"];

  const statusFilter = sql`${resourceAssignments.status} IN (${sql.join(
    activeStatuses.map((s) => sql`${s}`),
    sql`, `,
  )})`;

  // Fetch assignments with employee info
  let rows: Array<{
    assignmentId: number;
    employeeId: number;
    displayName: string;
    employeeNumber: string | null;
    positionId: number | null;
    projectRole: string;
    allocationPercent: number;
    status: string;
    startDate: string;
    endDate: string | null;
    requestId: number;
  }>;

  try {
    rows = await db
      .select({
        assignmentId: resourceAssignments.id,
        employeeId: resourceAssignments.employeeId,
        displayName: hrPeople.displayName,
        employeeNumber: hrWorkerProfiles.employeeNumber,
        positionId: resourceAssignments.positionId,
        projectRole: resourceAssignments.projectRole,
        allocationPercent: resourceAssignments.allocationPercent,
        status: resourceAssignments.status,
        startDate: resourceAssignments.startDate,
        endDate: resourceAssignments.endDate,
        requestId: resourceAssignments.requestId,
      })
      .from(resourceAssignments)
      .innerJoin(hrWorkerProfiles, eq(resourceAssignments.employeeId, hrWorkerProfiles.id))
      .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
      .where(
        and(
          eq(resourceAssignments.projectId, projectId),
          statusFilter,
        ),
      );
  } catch {
    // Tables may not exist yet (migration not run)
    return emptyStaffingView();
  }

  // Map to assignment entries
  const assignments: WorkspaceAssignmentEntry[] = rows.map((r) => ({
    assignmentId: r.assignmentId,
    employeeId: r.employeeId,
    employeeName: r.displayName,
    employeeNumber: r.employeeNumber,
    positionId: r.positionId,
    projectRole: r.projectRole,
    allocationPercent: r.allocationPercent,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    requestId: r.requestId,
  }));

  // Compute workload per employee (across ALL their active assignments, not just this project)
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const workload: WorkspaceWorkloadEntry[] = [];
  const conflicts: WorkspaceConflict[] = [];

  for (const empId of employeeIds) {
    try {
      const [totals] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${resourceAssignments.allocationPercent}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(resourceAssignments)
        .where(
          and(
            eq(resourceAssignments.employeeId, empId),
            sql`${resourceAssignments.status} IN ('pending', 'active')`,
          ),
        );

      const totalAlloc = Number(totals?.total ?? 0);
      const assignCount = Number(totals?.count ?? 0);
      const empRow = rows.find((r) => r.employeeId === empId)!;

      workload.push({
        employeeId: empId,
        employeeName: empRow.displayName,
        totalAllocation: totalAlloc,
        assignmentCount: assignCount,
      });

      if (totalAlloc > 100) {
        conflicts.push({
          employeeId: empId,
          employeeName: empRow.displayName,
          type: "over_allocated",
          currentAllocation: totalAlloc,
          detail: `${empRow.displayName} is at ${totalAlloc}% allocation across ${assignCount} assignment(s).`,
        });
      }
    } catch {
      // Skip if query fails
    }
  }

  const activeAssignments = assignments.filter((a) => a.status === "active");
  const totalAllocation = assignments
    .filter((a) => a.status === "active" || a.status === "pending")
    .reduce((sum, a) => sum + a.allocationPercent, 0);

  return {
    assignments,
    conflicts,
    workload,
    summary: {
      totalAssignments: assignments.length,
      activeAssignments: activeAssignments.length,
      totalAllocation,
      hasConflicts: conflicts.length > 0,
    },
  };
}

/**
 * Get pending resource requests for a project (for "request resources" CTA).
 */
export async function getPendingRequests(projectId: number) {
  const db = getDb();
  if (!db) return [];

  try {
    return db
      .select({
        id: resourceRequests.id,
        requestedRole: resourceRequests.requestedRole,
        requiredSkill: resourceRequests.requiredSkill,
        status: resourceRequests.status,
        allocationPercent: resourceRequests.allocationPercent,
        createdAt: resourceRequests.createdAt,
      })
      .from(resourceRequests)
      .where(
        and(
          eq(resourceRequests.projectId, projectId),
          sql`${resourceRequests.status} NOT IN ('approved', 'rejected', 'cancelled')`,
        ),
      );
  } catch {
    return [];
  }
}

function emptyStaffingView(): WorkspaceStaffingView {
  return {
    assignments: [],
    conflicts: [],
    workload: [],
    summary: {
      totalAssignments: 0,
      activeAssignments: 0,
      totalAllocation: 0,
      hasConflicts: false,
    },
  };
}
