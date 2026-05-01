/**
 * Handoff Manager — Types
 *
 * A handoff is one module asking another module to OWN a unit of work.
 * The receiving module creates the target record. The source module
 * never writes the target module's DB.
 */

export type HandoffStatus =
  | "draft"
  | "submitted"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface Handoff {
  handoffId: string;
  fromModule: string;
  toModule: string;
  type: string;
  payload: Record<string, unknown>;
  actorId: number | string;
  workspaceId: number | string;
  correlationId: string;
  governanceReceipt?: string;
  status: HandoffStatus;
  callbackUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface SubmitHandoffInput {
  fromModule: string;
  toModule: string;
  type: string;
  payload: Record<string, unknown>;
  actorId: number | string;
  workspaceId: number | string;
  governanceReceipt?: string;
  callbackUrl?: string;
  correlationId?: string;
}

export type HandoffAcceptor = (handoff: Handoff) => Promise<{
  accepted: boolean;
  reason?: string;
}>;
