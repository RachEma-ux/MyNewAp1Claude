/**
 * Agents — DB helpers (agent records + Communication-backed conversations)
 *
 * Agent CRUD continues to live on the platform `agents` table.
 *
 * Conversation/message helpers in this file are now thin adapters over
 * the Communication module's service. They map agent-domain shape
 * (`agentId`, `modelId`, `temperature`, `tokenCount`, `retrievedChunks`,
 * `toolCalls`) onto Communication's canonical fields:
 *   - `agentId`              → `sourceModule="agents" + sourceRefId=agentId`
 *   - `userId`               → `ownerUserId`
 *   - `modelId`/`temperature`→ `metadataJson.modelId` / `metadataJson.temperature`
 *   - `tokenCount` etc.      → `metadataJson.{tokenCount,retrievedChunks,toolCalls}`
 *
 * Communication owns the database. This file performs no SQL writes
 * to the legacy `conversations`/`messages` tables.
 */
import { getDb } from '../db';
import { agents } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import * as comm from '../communication/communication.service';
import type {
  CommunicationConversation,
  CommunicationMessage,
} from '../../drizzle/tables/communicationdb';

const SOURCE_MODULE = 'agents';

// ══════════════════════════════════════════════════════════════════════════════
// Agent CRUD — owns the `agents` table
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// Conversation/message adapters → Communication module
// ══════════════════════════════════════════════════════════════════════════════

export interface LegacyAgentConversation {
  id: number;
  workspaceId: number;
  agentId: number | null;
  userId: number | null;
  title: string | null;
  modelId: number | null;
  temperature: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegacyAgentMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  tokenCount: number | null;
  retrievedChunks: any[] | null;
  toolCalls: any[] | null;
  createdAt: Date;
}

function toLegacyConversation(c: CommunicationConversation): LegacyAgentConversation {
  const meta = (c.metadataJson ?? {}) as Record<string, unknown>;
  const isAgent = c.sourceModule === SOURCE_MODULE;
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    agentId: isAgent ? c.sourceRefId ?? null : null,
    userId: c.ownerUserId ?? null,
    title: c.title ?? null,
    modelId: typeof meta.modelId === 'number' ? (meta.modelId as number) : null,
    temperature: typeof meta.temperature === 'string' ? (meta.temperature as string) : null,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toLegacyMessage(m: CommunicationMessage): LegacyAgentMessage {
  const meta = (m.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    tokenCount: typeof meta.tokenCount === 'number' ? (meta.tokenCount as number) : null,
    retrievedChunks: Array.isArray(meta.retrievedChunks) ? (meta.retrievedChunks as any[]) : null,
    toolCalls: Array.isArray(meta.toolCalls) ? (meta.toolCalls as any[]) : null,
    createdAt: m.createdAt,
  };
}

/**
 * Create a conversation (delegates to Communication).
 * `agentId` is preserved as `sourceModule="agents" + sourceRefId=agentId`.
 */
export async function createConversation(data: {
  workspaceId: number;
  agentId?: number;
  title?: string;
  userId: number;
  modelId?: number;
  temperature?: string;
}): Promise<number> {
  const created = await comm.createConversation(
    {
      workspaceId: data.workspaceId,
      ownerUserId: data.userId,
      title: data.title?.trim() || (data.agentId ? `Agent ${data.agentId}` : 'Conversation'),
      conversationType: data.agentId ? 'agent' : 'human',
      sourceModule: data.agentId ? SOURCE_MODULE : undefined,
      sourceRefId: data.agentId,
      metadata: {
        modelId: data.modelId,
        temperature: data.temperature,
      },
    },
    data.userId,
  );
  return created.id;
}

/**
 * Get conversation by ID (delegates to Communication, mapped to legacy shape).
 */
export async function getConversation(
  conversationId: number,
): Promise<LegacyAgentConversation | null> {
  try {
    const c = await comm.getConversation(conversationId);
    return toLegacyConversation(c);
  } catch (err: any) {
    if (/not found/i.test(err?.message ?? '')) return null;
    throw err;
  }
}

/**
 * List conversations in a workspace (optionally filtered to a single agent).
 */
export async function listConversations(
  workspaceId: number,
  agentId?: number,
): Promise<LegacyAgentConversation[]> {
  const list = await comm.listConversations({
    workspaceId,
    conversationType: agentId !== undefined ? 'agent' : undefined,
    limit: 200,
  });
  const filtered =
    agentId !== undefined
      ? list.filter((c) => c.sourceModule === SOURCE_MODULE && c.sourceRefId === agentId)
      : list;
  return filtered.map(toLegacyConversation);
}

/**
 * Update conversation title (delegates to Communication).
 *
 * `modelId`/`temperature` are no longer mutable through this path —
 * they're agent-level config, not conversation state. The fields are
 * accepted for backwards compatibility but silently ignored.
 */
export async function updateConversation(
  conversationId: number,
  data: Partial<{
    title: string;
    modelId: number;
    temperature: string;
  }>,
): Promise<void> {
  if (typeof data.title === 'string' && data.title.length > 0) {
    await comm.renameConversation(conversationId, data.title);
  }
}

/**
 * Delete conversation (delegates to Communication; cascades to messages).
 */
export async function deleteConversation(conversationId: number): Promise<void> {
  await comm.deleteConversation(conversationId);
}

/**
 * Add message to conversation (delegates to Communication).
 * Agent-domain extras (`tokenCount`, `retrievedChunks`, `toolCalls`)
 * ride along inside the Communication message metadata.
 */
export async function addMessage(data: {
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount?: number;
  retrievedChunks?: any[];
  toolCalls?: any[];
}): Promise<number> {
  const created = await comm.addMessage({
    conversationId: data.conversationId,
    role: data.role,
    content: data.content,
    contentType: 'text',
    metadata: {
      tokenCount: data.tokenCount,
      retrievedChunks: data.retrievedChunks,
      toolCalls: data.toolCalls,
    },
  });
  return created.id;
}

/**
 * Get messages in a conversation (mapped to legacy shape).
 */
export async function getMessages(
  conversationId: number,
  limit?: number,
): Promise<LegacyAgentMessage[]> {
  const list = await comm.listMessages(conversationId, limit);
  return list.map(toLegacyMessage);
}

/**
 * Delete a single message (delegates to Communication).
 */
export async function deleteMessage(messageId: number): Promise<void> {
  await comm.deleteMessage(messageId);
}

/**
 * Get conversation with messages bundled.
 */
export async function getConversationWithMessages(conversationId: number) {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  const messages = await getMessages(conversationId);
  return { ...conversation, messages };
}
