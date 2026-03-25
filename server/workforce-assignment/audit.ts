/**
 * Workforce Assignment Bridge — Audit Logging
 *
 * Reuses the existing HR audit infrastructure (hrAuditLog table + logHrAudit helper).
 * Bridge actions are logged with category "assignment" and action prefix "bridge.".
 */

import { logHrAudit } from "../hr/audit";

export type BridgeAuditAction =
  | "bridge.request.created"
  | "bridge.request.updated"
  | "bridge.request.submitted"
  | "bridge.request.cancelled"
  | "bridge.request.hr_review_started"
  | "bridge.candidate.validated"
  | "bridge.candidate.proposed"
  | "bridge.request.approved"
  | "bridge.request.rejected"
  | "bridge.assignment.created"
  | "bridge.assignment.activated"
  | "bridge.assignment.released"
  | "bridge.assignment.completed"
  | "bridge.assignment.cancelled"
  | "bridge.enforcement.blocked";

export interface BridgeAuditParams {
  actorId: number;
  action: BridgeAuditAction;
  requestId?: number;
  assignmentId?: number;
  employeeId?: number;
  projectId?: number;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a bridge audit event. Uses the existing HR audit infrastructure.
 */
export async function logBridgeAudit(params: BridgeAuditParams): Promise<void> {
  await logHrAudit({
    actorId: params.actorId,
    targetWorkerId: params.employeeId,
    action: params.action,
    category: "assignment",
    metadata: {
      _bridge: true,
      requestId: params.requestId,
      assignmentId: params.assignmentId,
      employeeId: params.employeeId,
      projectId: params.projectId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      reason: params.reason,
      ...params.metadata,
    },
  });
}
