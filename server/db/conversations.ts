import { eq, and, desc, sql } from "drizzle-orm";
import {
  conversations,
  InsertConversation,
  Conversation,
  messages,
  InsertMessage,
  Message,
  agents,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createConversation(conversation: InsertConversation): Promise<Conversation> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(conversations).values(conversation).returning();
  return created;
}

export async function getUserConversations(userId: number, workspaceId?: number): Promise<Conversation[]> {
  const db = getDb();
  if (!db) return [];

  if (workspaceId) {
    return await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.workspaceId, workspaceId)))
      .orderBy(desc(conversations.updatedAt));
  }

  return await db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
}

export async function getConversationById(conversationId: number): Promise<Conversation | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return result[0];
}

export async function updateConversation(conversationId: number, updates: Partial<Conversation>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(conversations).set(updates).where(eq(conversations.id, conversationId));
}

export async function deleteConversation(conversationId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}

export async function createMessage(message: InsertMessage): Promise<Message> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(messages).values(message).returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, message.conversationId));

  return created;
}

export async function getConversationMessages(conversationId: number): Promise<Message[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function getConversationsWithDetails(userId: number, workspaceId?: number) {
  const db = getDb();
  if (!db) return [];

  const query = db
    .select({
      id: conversations.id,
      title: conversations.title,
      agentId: conversations.agentId,
      agentName: agents.name,
      status: sql<string>`CASE
        WHEN ${conversations.updatedAt} > NOW() - INTERVAL '1 hour' THEN 'active'
        ELSE 'completed'
      END`,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id})`,
      lastMessage: sql<string>`(SELECT ${messages.content} FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id} ORDER BY ${messages.createdAt} DESC LIMIT 1)`,
    })
    .from(conversations)
    .leftJoin(agents, eq(conversations.agentId, agents.id))
    .where(
      workspaceId
        ? and(eq(conversations.userId, userId), eq(conversations.workspaceId, workspaceId))
        : eq(conversations.userId, userId)
    )
    .orderBy(desc(conversations.updatedAt));

  return await query;
}

export async function deleteConversationWithMessages(conversationId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}

export async function bulkDeleteConversations(conversationIds: number[]): Promise<void> {
  const db = getDb();
  if (!db || conversationIds.length === 0) return;

  await db.delete(messages).where(sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`);
  await db.delete(conversations).where(sql`${conversations.id} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`);
}
