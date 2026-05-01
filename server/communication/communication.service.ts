/**
 * Communication Service — module-owned business logic
 *
 * Single source of truth for Communication writes. Both the tRPC
 * router and the gateway public-API call into here. Persistence
 * goes through the repository (CommunicationDB only); audit/log
 * activity goes through the platform registry; events are
 * published on the platform Event Bus.
 */

import * as repo from "./communication.repository";
import { logActivity } from "../modules/registry";
import { publishEvent, makeEnvelope } from "../platform/events";
import { COMMUNICATION_EVENTS } from "./events";
import {
  validateConversationTransition,
  validateMeetingTransition,
} from "./communication.validation";
import type {
  AddMessageInput,
  CreateConversationInput,
  CreateMeetingInput,
  CreateNotificationInput,
} from "./contracts";
import type {
  CommunicationConversation,
  CommunicationMessage,
  CommunicationMeeting,
  CommunicationNotification,
  CommunicationParticipant,
} from "../../drizzle/tables/communicationdb";

const SOURCE = "communication";

// ── Conversations ───────────────────────────────────────────────────────────

export async function createConversation(
  input: CreateConversationInput,
  actorId?: number,
): Promise<CommunicationConversation> {
  const created = await repo.createConversation({
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId ?? actorId,
    title: input.title,
    conversationType: input.conversationType ?? "human",
    sourceModule: input.sourceModule,
    sourceRefId: input.sourceRefId,
    metadataJson: input.metadata,
    status: "active",
  });

  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "conversation.create",
    targetType: "conversation",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.conversationCreated,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        conversationId: created.id,
        workspaceId: created.workspaceId,
        ownerUserId: created.ownerUserId,
        conversationType: created.conversationType,
        sourceModule: created.sourceModule,
      },
    }),
  );
  return created;
}

export async function listConversations(filters: {
  workspaceId: number;
  ownerUserId?: number;
  status?: string;
  conversationType?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationConversation[]> {
  return repo.listConversations(filters);
}

export interface ConversationWithMessages extends CommunicationConversation {
  messages: CommunicationMessage[];
}

export async function getConversation(
  id: number,
): Promise<ConversationWithMessages | null> {
  const conv = await repo.getConversationById(id);
  if (!conv) return null;
  const messages = await repo.listMessages(id);
  return { ...conv, messages };
}

export async function archiveConversation(
  id: number,
  actorId?: number,
): Promise<CommunicationConversation> {
  const existing = await repo.getConversationById(id);
  if (!existing) throw new Error(`Conversation ${id} not found`);
  validateConversationTransition(existing.status as "active" | "archived" | "deleted", "archived");
  const updated = await repo.updateConversation(id, { status: "archived" });

  await logActivity({
    workspaceId: existing.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "conversation.archive",
    targetType: "conversation",
    targetId: id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.conversationArchived,
      sourceModule: SOURCE,
      workspaceId: existing.workspaceId,
      actorId,
      payload: { conversationId: id, workspaceId: existing.workspaceId },
    }),
  );
  return updated;
}

export async function deleteConversation(
  id: number,
  actorId?: number,
): Promise<{ deleted: true; id: number }> {
  const existing = await repo.getConversationById(id);
  if (!existing) throw new Error(`Conversation ${id} not found`);
  await repo.deleteConversationCascade(id);

  await logActivity({
    workspaceId: existing.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "conversation.delete",
    targetType: "conversation",
    targetId: id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.conversationDeleted,
      sourceModule: SOURCE,
      workspaceId: existing.workspaceId,
      actorId,
      payload: { conversationId: id, workspaceId: existing.workspaceId },
    }),
  );
  return { deleted: true, id };
}

export async function renameConversation(
  id: number,
  title: string,
  actorId?: number,
): Promise<CommunicationConversation> {
  const existing = await repo.getConversationById(id);
  if (!existing) throw new Error(`Conversation ${id} not found`);
  const updated = await repo.updateConversation(id, { title });
  await logActivity({
    workspaceId: existing.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "conversation.rename",
    targetType: "conversation",
    targetId: id,
  });
  return updated;
}

// ── Messages ────────────────────────────────────────────────────────────────

export async function addMessage(
  input: AddMessageInput,
  actorId?: number,
): Promise<CommunicationMessage> {
  const conv = await repo.getConversationById(input.conversationId);
  if (!conv) throw new Error(`Conversation ${input.conversationId} not found`);
  const created = await repo.addMessage({
    conversationId: input.conversationId,
    senderUserId: input.senderUserId ?? actorId,
    role: input.role,
    content: input.content,
    contentType: input.contentType ?? "text",
    metadataJson: input.metadata,
  });

  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.messageSent,
      sourceModule: SOURCE,
      workspaceId: conv.workspaceId,
      actorId,
      payload: {
        messageId: created.id,
        conversationId: created.conversationId,
        role: created.role,
        contentType: created.contentType,
        contentLength: created.content.length,
      },
    }),
  );
  return created;
}

export async function listMessages(
  conversationId: number,
  limit?: number,
  offset?: number,
): Promise<CommunicationMessage[]> {
  return repo.listMessages(conversationId, limit, offset);
}

export async function deleteMessage(
  id: number,
  actorId?: number,
  workspaceId?: number,
): Promise<{ deleted: true; id: number }> {
  await repo.deleteMessage(id);
  if (workspaceId !== undefined) {
    await logActivity({
      workspaceId,
      moduleKey: SOURCE,
      actorId,
      action: "message.delete",
      targetType: "message",
      targetId: id,
    });
  }
  return { deleted: true, id };
}

// ── Meetings ────────────────────────────────────────────────────────────────

export async function createMeeting(
  input: CreateMeetingInput,
  actorId?: number,
): Promise<CommunicationMeeting> {
  const created = await repo.createMeeting({
    workspaceId: input.workspaceId,
    title: input.title,
    meetingType: input.meetingType ?? "video",
    startTime: input.startTime,
    endTime: input.endTime,
    meetingUrl: input.meetingUrl,
    createdBy: input.createdBy,
    metadataJson: input.metadata,
    status: "scheduled",
  });

  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "meeting.create",
    targetType: "meeting",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.meetingScheduled,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        meetingId: created.id,
        workspaceId: created.workspaceId,
        meetingType: created.meetingType,
        startTime: created.startTime?.toISOString() ?? null,
      },
    }),
  );
  return created;
}

export async function listMeetings(filters: {
  workspaceId: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationMeeting[]> {
  return repo.listMeetings(filters);
}

export async function getMeeting(
  id: number,
): Promise<CommunicationMeeting | null> {
  return repo.getMeetingById(id);
}

export async function cancelMeeting(
  id: number,
  actorId?: number,
  reason?: string,
): Promise<CommunicationMeeting> {
  const existing = await repo.getMeetingById(id);
  if (!existing) throw new Error(`Meeting ${id} not found`);
  validateMeetingTransition(
    existing.status as "scheduled" | "active" | "completed" | "cancelled",
    "cancelled",
  );
  const updated = await repo.updateMeeting(id, { status: "cancelled" });
  await logActivity({
    workspaceId: existing.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "meeting.cancel",
    targetType: "meeting",
    targetId: id,
    metadata: reason ? { reason } : undefined,
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.meetingCancelled,
      sourceModule: SOURCE,
      workspaceId: existing.workspaceId,
      actorId,
      payload: { meetingId: id, workspaceId: existing.workspaceId, reason },
    }),
  );
  return updated;
}

export async function completeMeeting(
  id: number,
  actorId?: number,
): Promise<CommunicationMeeting> {
  const existing = await repo.getMeetingById(id);
  if (!existing) throw new Error(`Meeting ${id} not found`);
  validateMeetingTransition(
    existing.status as "scheduled" | "active" | "completed" | "cancelled",
    "completed",
  );
  const updated = await repo.updateMeeting(id, {
    status: "completed",
    endTime: existing.endTime ?? new Date(),
  });
  await logActivity({
    workspaceId: existing.workspaceId,
    moduleKey: SOURCE,
    actorId,
    action: "meeting.complete",
    targetType: "meeting",
    targetId: id,
  });
  return updated;
}

// ── Participants ────────────────────────────────────────────────────────────

export async function addParticipant(input: {
  conversationId?: number;
  meetingId?: number;
  userId?: number;
  externalLabel?: string;
  participantRole?:
    | "owner"
    | "participant"
    | "observer"
    | "bot"
    | "agent";
}): Promise<CommunicationParticipant> {
  return repo.addParticipant({
    conversationId: input.conversationId,
    meetingId: input.meetingId,
    userId: input.userId,
    externalLabel: input.externalLabel,
    participantRole: input.participantRole ?? "participant",
    joinedAt: new Date(),
  });
}

export async function removeParticipant(id: number): Promise<{
  removed: true;
  id: number;
}> {
  await repo.removeParticipant(id);
  return { removed: true, id };
}

export async function listParticipants(filter: {
  conversationId?: number;
  meetingId?: number;
}): Promise<CommunicationParticipant[]> {
  return repo.listParticipants(filter);
}

// ── Notifications ───────────────────────────────────────────────────────────

export async function createNotification(
  input: CreateNotificationInput,
  actorId?: number,
): Promise<CommunicationNotification> {
  const created = await repo.createNotification({
    workspaceId: input.workspaceId,
    userId: input.userId,
    sourceModule: input.sourceModule,
    eventType: input.eventType,
    title: input.title,
    body: input.body,
    metadataJson: input.metadata,
    status: "unread",
  });

  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.notificationCreated,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        notificationId: created.id,
        workspaceId: created.workspaceId,
        userId: created.userId,
        eventType: created.eventType,
        sourceModule: created.sourceModule,
      },
    }),
  );
  return created;
}

export async function listNotifications(filters: {
  workspaceId: number;
  userId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationNotification[]> {
  return repo.listNotifications(filters);
}

export async function markNotificationRead(
  id: number,
  actorId?: number,
): Promise<CommunicationNotification> {
  const updated = await repo.updateNotification(id, {
    status: "read",
    readAt: new Date(),
  });
  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.notificationRead,
      sourceModule: SOURCE,
      workspaceId: updated.workspaceId,
      actorId,
      payload: {
        notificationId: id,
        workspaceId: updated.workspaceId,
        userId: updated.userId,
      },
    }),
  );
  return updated;
}

export async function archiveNotification(
  id: number,
): Promise<CommunicationNotification> {
  return repo.updateNotification(id, { status: "archived" });
}

// ── Chat (provider-backed message send + persist) ──────────────────────────

export interface ChatSendInput {
  workspaceId: number;
  providerId: number;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  conversationId?: number;
  conversationTitle?: string;
  temperature?: number;
  maxTokens?: number;
  saveConversation?: boolean;
}

export interface ChatSendResult {
  conversationId: number;
  assistantMessageId: number;
  content: string;
  model?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Provider-backed chat send. Resolves the provider through the
 * platform's existing provider registry, persists the user prompt
 * + assistant reply to CommunicationDB. The persistence boundary
 * is owned by Communication; provider routing/usage tracking stays
 * with the existing provider/usage modules — Communication does
 * not duplicate them.
 */
export async function chatSendMessage(
  input: ChatSendInput,
  actorId?: number,
): Promise<ChatSendResult> {
  const { getProviderRegistry } = await import("../providers/registry");
  const { trackProviderUsage } = await import("../providers/usage");

  const provider = getProviderRegistry().getProvider(input.providerId);
  if (!provider) {
    throw new Error(`Provider with ID ${input.providerId} not found`);
  }

  // Resolve / create the conversation that owns this exchange.
  let conversationId = input.conversationId;
  if (!conversationId) {
    const conv = await createConversation(
      {
        workspaceId: input.workspaceId,
        title:
          input.conversationTitle ??
          (input.messages.find((m) => m.role === "user")?.content
            .slice(0, 80) ?? "New chat"),
        conversationType: "human",
        ownerUserId: actorId,
      },
      actorId,
    );
    conversationId = conv.id;
  }

  // Persist any user/system messages we haven't seen before. The chat
  // composer typically passes the full transcript each turn — we only
  // need to add the trailing user/system messages on top of what's
  // already stored.
  const existing = await repo.listMessages(conversationId);
  const existingCount = existing.length;
  const incoming = input.messages.slice(existingCount);
  for (const m of incoming) {
    await repo.addMessage({
      conversationId,
      senderUserId: m.role === "user" ? actorId : undefined,
      role: m.role,
      content: m.content,
      contentType: "text",
    });
  }

  const startTime = Date.now();
  const response = await provider.generate({
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  const latencyMs = Date.now() - startTime;

  // Persist the assistant reply.
  const assistantMessage = await repo.addMessage({
    conversationId,
    senderUserId: undefined,
    role: "assistant",
    content: response.content,
    contentType: "text",
    metadataJson: {
      model: response.model,
      usage: response.usage,
      finishReason: response.finishReason,
    },
  });

  await publishEvent(
    makeEnvelope({
      eventType: COMMUNICATION_EVENTS.messageSent,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        messageId: assistantMessage.id,
        conversationId,
        role: "assistant",
        contentType: "text",
        contentLength: response.content.length,
      },
    }),
  );

  if (response.usage) {
    const totalTokens =
      (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0);
    const costPer1k = 0.002;
    const cost = (totalTokens / 1000) * costPer1k;
    await trackProviderUsage({
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      modelName: response.model || "unknown",
      tokensUsed: totalTokens,
      cost,
      latencyMs,
    });
  }

  return {
    conversationId,
    assistantMessageId: assistantMessage.id,
    content: response.content,
    model: response.model,
    finishReason: response.finishReason,
    usage: response.usage,
  };
}

// ── Summary ────────────────────────────────────────────────────────────────

export async function getSummary(workspaceId: number) {
  const stats = await repo.summary(workspaceId);
  const dbConnected = await repo.pingDb();
  return { ...stats, dbConnected };
}
