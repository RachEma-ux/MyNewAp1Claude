/**
 * PM Central — Event types
 *
 * Names of events emitted by PM Central. Use the platform Event Bus
 * envelope (`server/platform/events/envelope.ts`) when publishing.
 */

export const PM_CENTRAL_EVENTS = {
  projectCreated: "pm.project.created",
  projectStatusChanged: "pm.project.status.changed",
  projectArchived: "pm.project.archived",
  planCreated: "pm.plan.created",
  planApproved: "pm.plan.approved",
  milestoneCreated: "pm.milestone.created",
  milestoneCompleted: "pm.milestone.completed",
  taskCreated: "pm.task.created",
  taskStatusChanged: "pm.task.status.changed",
  riskCreated: "pm.risk.created",
  issueCreated: "pm.issue.created",
  decisionRecorded: "pm.decision.recorded",
  handoffReceived: "pm.handoff.received",
  handoffAccepted: "pm.handoff.accepted",
  handoffRejected: "pm.handoff.rejected",
  handoffConverted: "pm.handoff.converted",
} as const;

export type PmCentralEventType =
  (typeof PM_CENTRAL_EVENTS)[keyof typeof PM_CENTRAL_EVENTS];

export interface PmProjectEventPayload {
  pmProjectId: number;
  workspaceId: number;
  sourceModule?: string | null;
  sourceRefId?: number | null;
  status?: string;
  priority?: string;
}

export interface PmTaskEventPayload {
  pmTaskId: number;
  pmProjectId: number;
  status: string;
  assigneeUserId?: number | null;
}

export interface PmHandoffEventPayload {
  pmHandoffId: number;
  sourceModule: string;
  sourceRefId?: number | null;
  status: string;
  targetPmProjectId?: number | null;
}
