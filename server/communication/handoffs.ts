/**
 * Communication — Handoff types
 *
 * Communication accepts handoffs when other modules need it to own
 * a communication record (open a conversation thread, schedule a
 * meeting, post a notification). Producers should `submitHandoff`
 * with one of the literal `type` strings below.
 */

export const COMMUNICATION_HANDOFFS = {
  conversationOpen: "communication.conversation.open",
  meetingSchedule: "communication.meeting.schedule",
  notificationCreate: "communication.notification.create",
} as const;

export type CommunicationHandoffType =
  (typeof COMMUNICATION_HANDOFFS)[keyof typeof COMMUNICATION_HANDOFFS];

export interface ConversationOpenHandoffPayload {
  workspaceId: number;
  ownerUserId?: number;
  title: string;
  conversationType?: string;
  sourceModule?: string;
  sourceRefId?: number;
  metadata?: Record<string, unknown>;
}

export interface MeetingScheduleHandoffPayload {
  workspaceId: number;
  title: string;
  meetingType?: string;
  startTime?: string;
  createdBy: number;
  metadata?: Record<string, unknown>;
}

export interface NotificationCreateHandoffPayload {
  workspaceId: number;
  userId: number;
  sourceModule?: string;
  eventType: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}
