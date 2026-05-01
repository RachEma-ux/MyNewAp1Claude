/**
 * Communication Repository — CommunicationDB queries
 *
 * All queries go through getCommunicationDb() — never touches the
 * main app DB or any other module's DB. Pure data access; no
 * business rules or audit/event side effects.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getCommunicationDb } from "./connection";
import * as schema from "../../drizzle/tables/communicationdb";

function db() {
  const d = getCommunicationDb();
  if (!d) throw new Error("CommunicationDB not connected");
  return d;
}

// ── Conversations ───────────────────────────────────────────────────────────

export async function createConversation(
  data: schema.InsertCommunicationConversation,
): Promise<schema.CommunicationConversation> {
  const [row] = await db()
    .insert(schema.communicationConversations)
    .values(data)
    .returning();
  return row;
}

export async function getConversationById(
  id: number,
): Promise<schema.CommunicationConversation | null> {
  const [row] = await db()
    .select()
    .from(schema.communicationConversations)
    .where(eq(schema.communicationConversations.id, id))
    .limit(1);
  return row ?? null;
}

export async function listConversations(filters: {
  workspaceId: number;
  ownerUserId?: number;
  status?: string;
  conversationType?: string;
  limit?: number;
  offset?: number;
}): Promise<schema.CommunicationConversation[]> {
  const conditions = [
    eq(schema.communicationConversations.workspaceId, filters.workspaceId),
  ];
  if (filters.ownerUserId !== undefined) {
    conditions.push(
      eq(schema.communicationConversations.ownerUserId, filters.ownerUserId),
    );
  }
  if (filters.status) {
    conditions.push(eq(schema.communicationConversations.status, filters.status));
  }
  if (filters.conversationType) {
    conditions.push(
      eq(
        schema.communicationConversations.conversationType,
        filters.conversationType,
      ),
    );
  }

  return db()
    .select()
    .from(schema.communicationConversations)
    .where(and(...conditions))
    .orderBy(desc(schema.communicationConversations.updatedAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
}

export async function updateConversation(
  id: number,
  data: Partial<schema.InsertCommunicationConversation>,
): Promise<schema.CommunicationConversation> {
  const [row] = await db()
    .update(schema.communicationConversations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.communicationConversations.id, id))
    .returning();
  return row;
}

export async function deleteConversationCascade(id: number): Promise<void> {
  await db()
    .delete(schema.communicationParticipants)
    .where(eq(schema.communicationParticipants.conversationId, id));
  await db()
    .delete(schema.communicationMessages)
    .where(eq(schema.communicationMessages.conversationId, id));
  await db()
    .delete(schema.communicationConversations)
    .where(eq(schema.communicationConversations.id, id));
}

// ── Messages ────────────────────────────────────────────────────────────────

export async function addMessage(
  data: schema.InsertCommunicationMessage,
): Promise<schema.CommunicationMessage> {
  const [row] = await db()
    .insert(schema.communicationMessages)
    .values(data)
    .returning();
  // Touch parent conversation's updatedAt so list ordering reflects activity.
  await db()
    .update(schema.communicationConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.communicationConversations.id, data.conversationId));
  return row;
}

export async function listMessages(
  conversationId: number,
  limit?: number,
  offset?: number,
): Promise<schema.CommunicationMessage[]> {
  return db()
    .select()
    .from(schema.communicationMessages)
    .where(eq(schema.communicationMessages.conversationId, conversationId))
    .orderBy(schema.communicationMessages.createdAt)
    .limit(limit ?? 200)
    .offset(offset ?? 0);
}

export async function deleteMessage(id: number): Promise<void> {
  await db()
    .delete(schema.communicationMessages)
    .where(eq(schema.communicationMessages.id, id));
}

// ── Meetings ────────────────────────────────────────────────────────────────

export async function createMeeting(
  data: schema.InsertCommunicationMeeting,
): Promise<schema.CommunicationMeeting> {
  const [row] = await db()
    .insert(schema.communicationMeetings)
    .values(data)
    .returning();
  return row;
}

export async function getMeetingById(
  id: number,
): Promise<schema.CommunicationMeeting | null> {
  const [row] = await db()
    .select()
    .from(schema.communicationMeetings)
    .where(eq(schema.communicationMeetings.id, id))
    .limit(1);
  return row ?? null;
}

export async function listMeetings(filters: {
  workspaceId: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<schema.CommunicationMeeting[]> {
  const conditions = [
    eq(schema.communicationMeetings.workspaceId, filters.workspaceId),
  ];
  if (filters.status) {
    conditions.push(eq(schema.communicationMeetings.status, filters.status));
  }
  return db()
    .select()
    .from(schema.communicationMeetings)
    .where(and(...conditions))
    .orderBy(desc(schema.communicationMeetings.startTime))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
}

export async function updateMeeting(
  id: number,
  data: Partial<schema.InsertCommunicationMeeting>,
): Promise<schema.CommunicationMeeting> {
  const [row] = await db()
    .update(schema.communicationMeetings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.communicationMeetings.id, id))
    .returning();
  return row;
}

// ── Participants ────────────────────────────────────────────────────────────

export async function addParticipant(
  data: schema.InsertCommunicationParticipant,
): Promise<schema.CommunicationParticipant> {
  const [row] = await db()
    .insert(schema.communicationParticipants)
    .values(data)
    .returning();
  return row;
}

export async function removeParticipant(id: number): Promise<void> {
  await db()
    .delete(schema.communicationParticipants)
    .where(eq(schema.communicationParticipants.id, id));
}

export async function listParticipants(filter: {
  conversationId?: number;
  meetingId?: number;
}): Promise<schema.CommunicationParticipant[]> {
  if (filter.conversationId !== undefined) {
    return db()
      .select()
      .from(schema.communicationParticipants)
      .where(
        eq(schema.communicationParticipants.conversationId, filter.conversationId),
      );
  }
  if (filter.meetingId !== undefined) {
    return db()
      .select()
      .from(schema.communicationParticipants)
      .where(eq(schema.communicationParticipants.meetingId, filter.meetingId));
  }
  return [];
}

// ── Notifications ───────────────────────────────────────────────────────────

export async function createNotification(
  data: schema.InsertCommunicationNotification,
): Promise<schema.CommunicationNotification> {
  const [row] = await db()
    .insert(schema.communicationNotifications)
    .values(data)
    .returning();
  return row;
}

export async function listNotifications(filters: {
  workspaceId: number;
  userId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<schema.CommunicationNotification[]> {
  const conditions = [
    eq(schema.communicationNotifications.workspaceId, filters.workspaceId),
  ];
  if (filters.userId !== undefined) {
    conditions.push(
      eq(schema.communicationNotifications.userId, filters.userId),
    );
  }
  if (filters.status) {
    conditions.push(
      eq(schema.communicationNotifications.status, filters.status),
    );
  }
  return db()
    .select()
    .from(schema.communicationNotifications)
    .where(and(...conditions))
    .orderBy(desc(schema.communicationNotifications.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
}

export async function updateNotification(
  id: number,
  data: Partial<schema.InsertCommunicationNotification>,
): Promise<schema.CommunicationNotification> {
  const [row] = await db()
    .update(schema.communicationNotifications)
    .set(data)
    .where(eq(schema.communicationNotifications.id, id))
    .returning();
  return row;
}

// ── Summary / health ────────────────────────────────────────────────────────

export async function summary(workspaceId: number): Promise<{
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  scheduledMeetings: number;
  unreadNotifications: number;
}> {
  const [convStats] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
    })
    .from(schema.communicationConversations)
    .where(eq(schema.communicationConversations.workspaceId, workspaceId));

  const [msgStats] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.communicationMessages)
    .innerJoin(
      schema.communicationConversations,
      eq(
        schema.communicationConversations.id,
        schema.communicationMessages.conversationId,
      ),
    )
    .where(eq(schema.communicationConversations.workspaceId, workspaceId));

  const [meetingStats] = await db()
    .select({
      scheduled: sql<number>`count(*) filter (where status = 'scheduled')::int`,
    })
    .from(schema.communicationMeetings)
    .where(eq(schema.communicationMeetings.workspaceId, workspaceId));

  const [notifStats] = await db()
    .select({
      unread: sql<number>`count(*) filter (where status = 'unread')::int`,
    })
    .from(schema.communicationNotifications)
    .where(eq(schema.communicationNotifications.workspaceId, workspaceId));

  return {
    totalConversations: Number(convStats?.total ?? 0),
    activeConversations: Number(convStats?.active ?? 0),
    totalMessages: Number(msgStats?.total ?? 0),
    scheduledMeetings: Number(meetingStats?.scheduled ?? 0),
    unreadNotifications: Number(notifStats?.unread ?? 0),
  };
}

export async function pingDb(): Promise<boolean> {
  try {
    await db().execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
