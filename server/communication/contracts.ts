/**
 * Communication — Contracts (DTO + Zod schemas exposed to other modules)
 *
 * Other modules use these to validate payloads they exchange with
 * Communication via the Module Gateway, Handoff, or Event Bus. Pure
 * types/schemas — no runtime services.
 */

import { z } from "zod";

export const CommunicationConversationTypeSchema = z.enum([
  "human",
  "agent",
  "system",
  "support",
  "meeting",
]);
export type CommunicationConversationType = z.infer<
  typeof CommunicationConversationTypeSchema
>;

export const CommunicationConversationStatusSchema = z.enum([
  "active",
  "archived",
  "deleted",
]);

export const CommunicationMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "agent",
  "bot",
]);

export const CommunicationMessageContentTypeSchema = z.enum([
  "text",
  "markdown",
  "json",
]);

export const CommunicationMeetingTypeSchema = z.enum([
  "video",
  "audio",
  "text",
  "hybrid",
]);

export const CommunicationMeetingStatusSchema = z.enum([
  "scheduled",
  "active",
  "completed",
  "cancelled",
]);

export const CommunicationParticipantRoleSchema = z.enum([
  "owner",
  "participant",
  "observer",
  "bot",
  "agent",
]);

export const CommunicationNotificationStatusSchema = z.enum([
  "unread",
  "read",
  "archived",
]);

export const CreateConversationInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  ownerUserId: z.number().int().positive().optional(),
  title: z.string().min(1).max(500),
  conversationType: CommunicationConversationTypeSchema.optional(),
  sourceModule: z.string().max(50).optional(),
  sourceRefId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateConversationInput = z.infer<
  typeof CreateConversationInputSchema
>;

export const AddMessageInputSchema = z.object({
  conversationId: z.number().int().positive(),
  senderUserId: z.number().int().positive().optional(),
  role: CommunicationMessageRoleSchema,
  content: z.string().min(1),
  contentType: CommunicationMessageContentTypeSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AddMessageInput = z.infer<typeof AddMessageInputSchema>;

export const CreateMeetingInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  meetingType: CommunicationMeetingTypeSchema.optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  meetingUrl: z.string().max(1000).optional(),
  createdBy: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateMeetingInput = z.infer<typeof CreateMeetingInputSchema>;

export const CreateNotificationInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  userId: z.number().int().positive(),
  sourceModule: z.string().max(50).optional(),
  eventType: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateNotificationInput = z.infer<
  typeof CreateNotificationInputSchema
>;

export interface CommunicationSummary {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  scheduledMeetings: number;
  unreadNotifications: number;
  dbConnected: boolean;
}
