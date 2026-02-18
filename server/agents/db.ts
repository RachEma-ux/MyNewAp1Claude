import { getDb } from '../db';
import { agents, conversations, messages } from '../../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Create a new agent
 */
export async function createAgent(data: {
  workspaceId: number;
  name: string;
  description?: string;
  systemPrompt: string;
  modelId?: string;
  roleClass?: string;
  temperature?: string;
  hasDocumentAccess?: boolean;
  hasToolAccess?: boolean;
  allowedTools?: string[];
  maxIterations?: number;
  autoSummarize?: boolean;
  createdBy: number;
}) {
  const db = getDb();
  if (!db) throw new Error('Database not available');

  const [result] = await db.insert(agents).values({
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description,
    systemPrompt: data.systemPrompt,
    modelId: data.modelId || 'default',
    roleClass: data.roleClass || 'general',
    temperature: data.temperature || '0.7',
    hasDocumentAccess: data.hasDocumentAccess ?? true,
    hasToolAccess: data.hasToolAccess ?? false,
    allowedTools: data.allowedTools || null,
    limits: {
      maxIterations: data.maxIterations || 10,
      autoSummarize: data.autoSummarize ?? false,
    },
    createdBy: data.createdBy,
  }).returning();

  return result.id;
}

/**
 * Get agent by ID
 */
export async function getAgent(agentId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  const results = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return results[0] || null;
}

/**
 * List agents in a workspace
 */
export async function listAgents(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  return db.select().from(agents).where(eq(agents.workspaceId, workspaceId)).orderBy(desc(agents.createdAt));
}

/**
 * Update agent
 */
export async function updateAgent(
  agentId: number,
  data: Partial<{
    name: string;
    description: string;
    systemPrompt: string;
    modelId: number;
    temperature: string;
    hasDocumentAccess: boolean;
    hasToolAccess: boolean;
    allowedTools: string[];
    maxIterations: number;
    autoSummarize: boolean;
  }>
) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  const updateData: any = { ...data };
  if (data.allowedTools) {
    updateData.allowedTools = JSON.stringify(data.allowedTools);
  }

  await db.update(agents).set(updateData).where(eq(agents.id, agentId));
}

/**
 * Delete agent
 */
export async function deleteAgent(agentId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(agents).where(eq(agents.id, agentId));
}

/**
 * Create a conversation
 */
export async function createConversation(data: {
  workspaceId: number;
  agentId?: number;
  title?: string;
  userId: number;
  modelId?: number;
  temperature?: string;
}) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  const [conv] = await db.insert(conversations).values({
    workspaceId: data.workspaceId,
    agentId: data.agentId,
    title: data.title,
    userId: data.userId,
    modelId: data.modelId,
    temperature: data.temperature,
  }).returning();

  return conv.id;
}

/**
 * Get conversation by ID
 */
export async function getConversation(conversationId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  const results = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return results[0] || null;
}

/**
 * List conversations in a workspace
 */
export async function listConversations(workspaceId: number, agentId?: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  if (agentId) {
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.agentId, agentId)))
      .orderBy(desc(conversations.updatedAt));
  }
  
  return db.select().from(conversations).where(eq(conversations.workspaceId, workspaceId)).orderBy(desc(conversations.updatedAt));
}

/**
 * Update conversation
 */
export async function updateConversation(
  conversationId: number,
  data: Partial<{
    title: string;
    modelId: number;
    temperature: string;
  }>
) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  await db.update(conversations).set(data).where(eq(conversations.id, conversationId));
}

/**
 * Delete conversation
 */
export async function deleteConversation(conversationId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}

/**
 * Add message to conversation
 */
export async function addMessage(data: {
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount?: number;
  retrievedChunks?: any[];
  toolCalls?: any[];
}) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  const [msg] = await db.insert(messages).values({
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    tokenCount: data.tokenCount,
    retrievedChunks: data.retrievedChunks ? JSON.stringify(data.retrievedChunks) : null,
    toolCalls: data.toolCalls ? JSON.stringify(data.toolCalls) : null,
  }).returning();

  return msg.id;
}

/**
 * Get messages in a conversation
 */
export async function getMessages(conversationId: number, limit?: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  let query = db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  
  if (limit) {
    query = query.limit(limit) as any;
  }
  
  return query;
}

/**
 * Delete message
 */
export async function deleteMessage(messageId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(messages).where(eq(messages.id, messageId));
}

/**
 * Get conversation with messages
 */
export async function getConversationWithMessages(conversationId: number) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return null;
  }

  const msgs = await getMessages(conversationId);
  
  return {
    ...conversation,
    messages: msgs,
  };
}
