/**
 * Central Coordinator — Types
 *
 * The coordinator orchestrates real multi-module workflows. It never
 * imports module internals. It reaches modules only via:
 *   - Module Gateway (sync command)
 *   - Handoff Manager (ownership transfer)
 *   - Event Bus (async notifications)
 *
 * If a flow is just `A → B`, do NOT use the coordinator — use a handoff
 * directly.
 */

export type WorkflowStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "compensating"
  | "compensated"
  | "cancelled";

export type WorkflowStepKind =
  | "gateway-call"
  | "handoff"
  | "event-publish"
  | "wait-for-event"
  | "compensation";

export interface WorkflowStep {
  stepId: string;
  kind: WorkflowStepKind;
  /** target module (for gateway-call / handoff). */
  module?: string;
  /** action key or handoff type. */
  action?: string;
  /** event type (for event-publish / wait-for-event). */
  eventType?: string;
  /** payload to pass to the lane. */
  payload?: Record<string, unknown>;
  /** optional governance receipt id. */
  governanceReceiptId?: string;
  /** result captured during execution. */
  result?: unknown;
  /** error if the step failed. */
  error?: string;
  /** state. */
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  /** start/end timestamps. */
  startedAt?: string;
  completedAt?: string;
}

export interface Workflow {
  workflowId: string;
  workflowType: string;
  workspaceId: number | string;
  actorId: number | string;
  correlationId: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface SubmitWorkflowInput {
  workflowType: string;
  workspaceId: number | string;
  actorId: number | string;
  steps: Array<Omit<WorkflowStep, "status">>;
  correlationId?: string;
}
