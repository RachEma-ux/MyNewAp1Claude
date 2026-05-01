/**
 * Communication — Event types
 *
 * Names of events emitted by Communication. Use the platform Event
 * Bus envelope (`server/platform/events/envelope.ts`) when publishing.
 */

export const COMMUNICATION_EVENTS = {
  conversationCreated: "communication.conversation.created",
  conversationArchived: "communication.conversation.archived",
  conversationDeleted: "communication.conversation.deleted",
  messageSent: "communication.message.sent",
  meetingScheduled: "communication.meeting.scheduled",
  meetingCancelled: "communication.meeting.cancelled",
  notificationCreated: "communication.notification.created",
  notificationRead: "communication.notification.read",
} as const;

export type CommunicationEventType =
  (typeof COMMUNICATION_EVENTS)[keyof typeof COMMUNICATION_EVENTS];

export interface ConversationCreatedPayload {
  conversationId: number;
  workspaceId: number;
  ownerUserId?: number | null;
  conversationType: string;
  sourceModule?: string | null;
}

export interface ConversationArchivedPayload {
  conversationId: number;
  workspaceId: number;
}

export interface ConversationDeletedPayload {
  conversationId: number;
  workspaceId: number;
}

export interface MessageSentPayload {
  messageId: number;
  conversationId: number;
  role: string;
  contentType: string;
  contentLength: number;
}

export interface MeetingScheduledPayload {
  meetingId: number;
  workspaceId: number;
  meetingType: string;
  startTime?: string | null;
}

export interface MeetingCancelledPayload {
  meetingId: number;
  workspaceId: number;
  reason?: string;
}

export interface NotificationCreatedPayload {
  notificationId: number;
  workspaceId: number;
  userId: number;
  eventType: string;
  sourceModule?: string | null;
}

export interface NotificationReadPayload {
  notificationId: number;
  workspaceId: number;
  userId: number;
}
