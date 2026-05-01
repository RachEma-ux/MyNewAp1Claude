/**
 * Communication — Domain Validation
 *
 * Lifecycle and invariant checks. Pure functions; no DB access.
 */

import type {
  CommunicationConversationStatusSchema,
  CommunicationMeetingStatusSchema,
} from "./contracts";

type ConversationStatus = "active" | "archived" | "deleted";
type MeetingStatus = "scheduled" | "active" | "completed" | "cancelled";

const CONVERSATION_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  active: ["archived", "deleted"],
  archived: ["active", "deleted"],
  deleted: [],
};

const MEETING_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  scheduled: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function validateConversationTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): void {
  const allowed = CONVERSATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid conversation status transition: ${from} → ${to}`,
    );
  }
}

export function validateMeetingTransition(
  from: MeetingStatus,
  to: MeetingStatus,
): void {
  const allowed = MEETING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid meeting status transition: ${from} → ${to}`);
  }
}

// Re-export the schemas for callers that want runtime parsing.
export type {
  CommunicationConversationStatusSchema,
  CommunicationMeetingStatusSchema,
};
