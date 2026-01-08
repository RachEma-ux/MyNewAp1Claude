import { eq, and, desc, sql, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import {
  InsertUser,
  users,
  workspaces,
  InsertWorkspace,
  Workspace,
  workspaceMembers,
  InsertWorkspaceMember,
  models,
  InsertModel,
  Model,
  documents,
  InsertDocument,
  Document,
  agents,
  InsertAgent,
  Agent,
  conversations,
  InsertConversation,
  Conversation,
  messages,
  InsertMessage,
  Message,
  documentChunks,
  InsertDocumentChunk,
  DocumentChunk,
  workflows,
  Workflow,
  workflowVersions,
  InsertWorkflow,
  workflowExecutions,
  workflowExecutionLogs,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

import mysql from 'mysql2/promise';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// User Management
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// Workspace Management
// ============================================================================

export async function createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(workspaces).values(workspace);
  const workspaceId = Number(result[0].insertId);

  // Add creator as owner
  await db.insert(workspaceMembers).values({
    workspaceId,
    userId: workspace.ownerId,
    role: "owner",
  });

  const created = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return created[0]!;
}

export async function getUserWorkspaces(userId: number): Promise<Workspace[]> {
  const db = getDb();
  if (!db) return [];

  const result = await db
    .select({
      workspace: workspaces,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.updatedAt));

  return result.map((r) => r.workspace);
}

export async function getWorkspaceById(workspaceId: number): Promise<Workspace | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return result[0];
}

export async function updateWorkspace(workspaceId: number, updates: Partial<Workspace>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(workspaces).set(updates).where(eq(workspaces.id, workspaceId));
}

export async function deleteWorkspace(workspaceId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function hasWorkspaceAccess(userId: number, workspaceId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);

  return result.length > 0;
}

// ============================================================================
// Model Management
// ============================================================================

export async function createModel(model: InsertModel): Promise<Model> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(models).values(model);
  const modelId = Number(result[0].insertId);

  const created = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
  return created[0]!;
}

export async function getAllModels(): Promise<Model[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(models).orderBy(desc(models.createdAt));
}

export async function getModelById(modelId: number): Promise<Model | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
  return result[0];
}

export async function getModelsByType(modelType: "llm" | "embedding" | "reranker"): Promise<Model[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(models).where(eq(models.modelType, modelType)).orderBy(desc(models.createdAt));
}

export async function updateModel(modelId: number, updates: Partial<Model>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(models).set(updates).where(eq(models.id, modelId));
}

export async function deleteModel(modelId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(models).where(eq(models.id, modelId));
}

// ============================================================================
// Document Management
// ============================================================================

export async function createDocument(document: InsertDocument): Promise<Document> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(documents).values(document);
  const documentId = Number(result[0].insertId);

  const created = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return created[0]!;
}

export async function getWorkspaceDocuments(workspaceId: number): Promise<Document[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(documents).where(eq(documents.workspaceId, workspaceId)).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(documentId: number): Promise<Document | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return result[0];
}

export async function updateDocument(documentId: number, updates: Partial<Document>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(documents).set(updates).where(eq(documents.id, documentId));
}

export async function deleteDocument(documentId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(documents).where(eq(documents.id, documentId));
}

// ============================================================================
// Agent Management
// ============================================================================

export async function createAgent(agent: InsertAgent): Promise<Agent> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(agents).values(agent);
  const agentId = Number(result[0].insertId);

  const created = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return created[0]!;
}

export async function getWorkspaceAgents(workspaceId: number): Promise<Agent[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(agents).where(eq(agents.workspaceId, workspaceId)).orderBy(desc(agents.createdAt));
}

export async function getAgentById(agentId: number): Promise<Agent | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return result[0];
}

export async function updateAgent(agentId: number, updates: Partial<Agent>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(agents).set(updates).where(eq(agents.id, agentId));
}

export async function deleteAgent(agentId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(agents).where(eq(agents.id, agentId));
}

// ============================================================================
// Conversation Management
// ============================================================================

export async function createConversation(conversation: InsertConversation): Promise<Conversation> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(conversations).values(conversation);
  const conversationId = Number(result[0].insertId);

  const created = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return created[0]!;
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

// ============================================================================
// Message Management
// ============================================================================

export async function createMessage(message: InsertMessage): Promise<Message> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(messages).values(message);
  const messageId = Number(result[0].insertId);

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, message.conversationId));

  const created = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  return created[0]!;
}

export async function getConversationMessages(conversationId: number): Promise<Message[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

// ============================================================================
// Enhanced Conversation Queries
// ============================================================================

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
        WHEN ${conversations.updatedAt} > DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 'active'
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

  // Delete messages first (foreign key constraint)
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  
  // Delete conversation
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}

export async function bulkDeleteConversations(conversationIds: number[]): Promise<void> {
  const db = getDb();
  if (!db || conversationIds.length === 0) return;

  // Delete all messages for these conversations
  await db.delete(messages).where(sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`);
  
  // Delete conversations
  await db.delete(conversations).where(sql`${conversations.id} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`);
}

// ============================================================================
// Enhanced Document Queries
// ============================================================================

export async function getDocumentsWithDetails(workspaceId: number) {
  const db = getDb();
  if (!db) return [];

  const query = db
    .select({
      id: documents.id,
      filename: documents.filename,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      fileUrl: documents.fileUrl,
      fileKey: documents.fileKey,
      status: documents.status,
      errorMessage: documents.errorMessage,
      title: documents.title,
      author: documents.author,
      pageCount: documents.pageCount,
      wordCount: documents.wordCount,
      chunkCount: documents.chunkCount,
      embeddingModel: documents.embeddingModel,
      workspaceId: documents.workspaceId,
      uploadedBy: documents.uploadedBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      vectorsStored: sql<number>`(SELECT COUNT(*) FROM ${documentChunks} WHERE ${documentChunks.documentId} = ${documents.id} AND ${documentChunks.vectorId} IS NOT NULL)`,
    })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));

  return await query;
}

export async function getDocumentChunks(documentId: number): Promise<DocumentChunk[]> {
  const db = getDb();
  if (!db) return [];

  return await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

export async function deleteDocumentWithChunks(documentId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  // Delete chunks first (foreign key constraint)
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  
  // Delete document
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function bulkDeleteDocuments(documentIds: number[]): Promise<void> {
  const db = getDb();
  if (!db || documentIds.length === 0) return;

  // Delete all chunks for these documents
  await db.delete(documentChunks).where(sql`${documentChunks.documentId} IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`);
  
  // Delete documents
  await db.delete(documents).where(sql`${documents.id} IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`);
}

// ============================================================================
// Workflow Management
// ============================================================================

export async function createWorkflow(input: {
  userId: number;
  name: string;
  description?: string;
  nodes: string;
  edges: string;
  workspaceId?: number;
}): Promise<Workflow> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [workflow] = await db
    .insert(workflows)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description || null,
      nodes: input.nodes,
      edges: input.edges,
      workspaceId: input.workspaceId || null,
      triggerType: "manual",
      triggerConfig: null,
      status: "draft",
      enabled: true,
      lastRunAt: null,
      lastRunStatus: null,
    })
    .$returningId();

  const created = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflow.id))
    .limit(1);

  return created[0];
}

export async function updateWorkflow(
  id: number,
  input: {
    name?: string;
    description?: string;
    nodes?: string;
    edges?: string;
    permissions?: any;
    isPublic?: boolean;
  },
  userId: number
): Promise<Workflow> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Build update object
  const updates: any = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.nodes !== undefined) updates.nodes = input.nodes;
  if (input.edges !== undefined) updates.edges = input.edges;
  if (input.permissions !== undefined) updates.permissions = input.permissions;
  if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

  // Update the workflow
  await db
    .update(workflows)
    .set(updates)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)));

  // Return updated workflow
  const updated = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);

  if (!updated[0]) {
    throw new Error("Workflow not found or access denied");
  }

  return updated[0];
}

export async function getUserWorkflows(userId: number): Promise<Workflow[]> {
  console.log('[getUserWorkflows] called with userId:', userId);
  const db = getDb();
  if (!db) {
    console.log('[getUserWorkflows] DB is null!');
    return [];
  }

  const result = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.userId, userId),
        ne(workflows.status, "deleted")
      )
    )
    .orderBy(desc(workflows.updatedAt));
  
  console.log('[getUserWorkflows] returning', result.length, 'workflows');
  return result;
}

export async function getWorkflowById(
  id: number,
  userId: number
): Promise<Workflow | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
    .limit(1);

  return results[0] || null;
}

export async function deleteWorkflow(
  id: number,
  userId: number
): Promise<void> {
  const db = getDb();
  if (!db) return;

  // Soft delete: set status to 'deleted' instead of removing from database
  await db
    .update(workflows)
    .set({ status: "deleted" })
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)));
}

/**
 * Publish a workflow - creates an immutable version snapshot
 */
export async function publishWorkflow(
  workflowId: number,
  userId: number,
  changeNotes?: string
): Promise<{ versionId: number; version: number } | null> {
  const db = getDb();
  if (!db) return null;

  // Get the workflow
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  // Get the latest version number
  const latestVersions = await db
    .select({ version: workflowVersions.version })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflowId))
    .orderBy(desc(workflowVersions.version))
    .limit(1);

  const nextVersion = latestVersions.length > 0 ? latestVersions[0].version + 1 : 1;

  // Create immutable version snapshot
  const [newVersion] = await db.insert(workflowVersions).values({
    workflowId,
    version: nextVersion,
    name: workflow.name,
    description: workflow.description || null,
    nodes: workflow.nodes,
    edges: workflow.edges,
    schemaVersion: workflow.schemaVersion,
    triggerType: workflow.triggerType,
    triggerConfig: workflow.triggerConfig as any,
    publishedBy: userId,
    changeNotes: changeNotes || null,
    status: "published",
  });

  // Update workflow to reference this version
  await db
    .update(workflows)
    .set({
      publishedVersionId: newVersion.insertId,
      status: "published",
      draftData: null, // Clear draft data
    })
    .where(eq(workflows.id, workflowId));

  return {
    versionId: newVersion.insertId,
    version: nextVersion,
  };
}

/**
 * Get all versions of a workflow
 */
export async function getWorkflowVersions(
  workflowId: number,
  userId: number
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  // Verify user owns the workflow
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) return [];

  return await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflowId))
    .orderBy(desc(workflowVersions.version));
}

/**
 * Rollback workflow to a specific version
 */
export async function rollbackToVersion(
  workflowId: number,
  versionId: number,
  userId: number
): Promise<Workflow | null> {
  const db = getDb();
  if (!db) return null;

  // Verify user owns the workflow
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  // Get the version
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.id, versionId),
        eq(workflowVersions.workflowId, workflowId)
      )
    )
    .limit(1);

  if (!version) {
    throw new Error("Version not found");
  }

  // Restore workflow from version snapshot
  await db
    .update(workflows)
    .set({
      name: version.name,
      description: version.description,
      nodes: version.nodes,
      edges: version.edges,
      schemaVersion: version.schemaVersion,
      triggerType: version.triggerType,
      triggerConfig: version.triggerConfig as any,
    })
    .where(eq(workflows.id, workflowId));

  return await getWorkflowById(workflowId, userId);
}

/**
 * Create a new workflow execution
 */
export async function createWorkflowExecution(
  workflowId: number,
  userId: number,
  data: {
    versionId?: number;
    triggerType?: "time" | "event" | "webhook" | "manual";
    triggerData?: any;
  }
): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(workflowExecutions).values({
    workflowId,
    versionId: data.versionId || null,
    status: "pending",
    triggerType: data.triggerType || "manual",
    triggerData: data.triggerData || null,
    executedBy: userId,
  });

  return result.insertId;
}

/**
 * Update workflow execution status
 */
export async function updateWorkflowExecution(
  executionId: number,
  updates: {
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    completedAt?: Date;
    duration?: number;
    error?: string;
  }
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(workflowExecutions)
    .set(updates)
    .where(eq(workflowExecutions.id, executionId));
}

/**
 * Get workflow executions for a workflow
 */
export async function getWorkflowExecutions(
  workflowId: number,
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  // Verify user owns the workflow
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) return [];

  return await db
    .select()
    .from(workflowExecutions)
    .where(eq(workflowExecutions.workflowId, workflowId))
    .orderBy(desc(workflowExecutions.startedAt))
    .limit(limit);
}

/**
 * Get all workflow executions for a user (across all workflows)
 */
export async function getAllWorkflowExecutions(
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  // Get all workflows owned by the user
  const userWorkflows = await getUserWorkflows(userId);
  const workflowIds = userWorkflows.map((w) => w.id);

  if (workflowIds.length === 0) return [];

  // Join with workflows table to get workflow names
  const executions = await db
    .select({
      id: workflowExecutions.id,
      workflowId: workflowExecutions.workflowId,
      workflowName: workflows.name,
      status: workflowExecutions.status,
      startedAt: workflowExecutions.startedAt,
      completedAt: workflowExecutions.completedAt,
      duration: workflowExecutions.duration,
      error: workflowExecutions.error,
    })
    .from(workflowExecutions)
    .leftJoin(workflows, eq(workflowExecutions.workflowId, workflows.id))
    .where(inArray(workflowExecutions.workflowId, workflowIds))
    .orderBy(desc(workflowExecutions.startedAt))
    .limit(limit);

  // Add retryCount and logs as defaults (these are tracked separately in workflow_execution_logs table)
  return executions.map(exec => ({
    ...exec,
    retryCount: 0,
    logs: [],
  }));
}

/**
 * Get a single execution by ID
 */
export async function getWorkflowExecutionById(
  executionId: number,
  userId: number
): Promise<any | null> {
  const db = getDb();
  if (!db) return null;

  const [execution] = await db
    .select()
    .from(workflowExecutions)
    .where(eq(workflowExecutions.id, executionId))
    .limit(1);

  if (!execution) return null;

  // Verify user owns the workflow
  const workflow = await getWorkflowById(execution.workflowId, userId);
  if (!workflow) return null;

  return execution;
}

/**
 * Create an execution log entry
 */
export async function createExecutionLog(
  executionId: number,
  data: {
    nodeId: string;
    nodeType: string;
    nodeLabel?: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    input?: any;
    output?: any;
    error?: string;
    logLevel?: "debug" | "info" | "warn" | "error";
    message?: string;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
  }
): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(workflowExecutionLogs).values({
    executionId,
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    nodeLabel: data.nodeLabel || null,
    status: data.status,
    input: data.input || null,
    output: data.output || null,
    error: data.error || null,
    logLevel: data.logLevel || "info",
    message: data.message || null,
    startedAt: data.startedAt || new Date(),
    completedAt: data.completedAt || null,
    duration: data.duration || null,
  });

  return result.insertId;
}

/**
 * Get execution logs for an execution
 */
export async function getExecutionLogs(
  executionId: number,
  userId: number
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  // Verify user owns the execution
  const execution = await getWorkflowExecutionById(executionId, userId);
  if (!execution) return [];

  return await db
    .select()
    .from(workflowExecutionLogs)
    .where(eq(workflowExecutionLogs.executionId, executionId))
    .orderBy(workflowExecutionLogs.startedAt);
}

/**
 * Update an execution log entry
 */
export async function updateExecutionLog(
  executionId: number,
  nodeId: string,
  data: {
    status?: "pending" | "running" | "completed" | "failed" | "skipped";
    output?: any;
    error?: string;
    completedAt?: Date;
    duration?: number;
  }
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(workflowExecutionLogs)
    .set({
      status: data.status,
      output: data.output !== undefined ? data.output : undefined,
      error: data.error !== undefined ? data.error : undefined,
      completedAt: data.completedAt,
      duration: data.duration,
    })
    .where(
      and(
        eq(workflowExecutionLogs.executionId, executionId),
        eq(workflowExecutionLogs.nodeId, nodeId)
      )
    );
}

// ============================================================================
// LLM Control Plane Operations
// ============================================================================

import {
  llms,
  llmVersions,
  llmPromotions,
  llmAttestations,
  llmDriftEvents,
  llmAuditEvents,
  type LLM,
  type InsertLLM,
  type LLMVersion,
  type InsertLLMVersion,
  type LLMPromotion,
  type InsertLLMPromotion,
  type LLMAuditEvent,
  type InsertLLMAuditEvent,
} from "../drizzle/schema";
import { createHash } from "crypto";

/**
 * Create a new LLM identity
 */
export async function createLLM(data: InsertLLM): Promise<LLM> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  console.log('[createLLM] Inserting data:', JSON.stringify(data));

  // Use raw SQL to avoid Drizzle's DEFAULT keyword issues
  const now = new Date();
  const insertData = {
    name: data.name,
    description: data.description ?? null,
    role: data.role,
    ownerTeam: data.ownerTeam ?? null,
    archived: data.archived ?? false,
    createdBy: data.createdBy,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };

  console.log('[createLLM] Normalized insert data:', JSON.stringify(insertData));

  try {
    // Use raw SQL to bypass Drizzle's DEFAULT keyword generation
    const result = await db.execute(
      sql`INSERT INTO llms (name, description, role, ownerTeam, archived, createdBy, createdAt, updatedAt)
          VALUES (${insertData.name}, ${insertData.description}, ${insertData.role}, ${insertData.ownerTeam}, ${insertData.archived}, ${insertData.createdBy}, ${insertData.createdAt}, ${insertData.updatedAt})`
    );

    const insertId = (result as any).insertId || (result as any)[0]?.insertId;

    if (!insertId) {
      throw new Error('Failed to get inserted LLM ID');
    }

    console.log('[createLLM] Successfully inserted with ID:', insertId);

    // Emit audit event
    await emitLLMAuditEvent({
      eventType: "llm.created",
      llmId: insertId,
      actor: data.createdBy,
      actorType: "user",
      payload: { name: data.name, role: data.role },
    });

    // Fetch and return the created LLM
    const created = await db.select().from(llms).where(eq(llms.id, insertId)).limit(1);
    return created[0];
  } catch (error: any) {
    console.error('[createLLM] Insert failed:', error);
    console.error('[createLLM] Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
    });
    console.error('[createLLM] Data was:', JSON.stringify(insertData));
    throw new Error(`Failed to create LLM: ${error.message}`);
  }
}

/**
 * Get all LLMs (optionally filtered)
 */
export async function getLLMs(filter?: {
  role?: string;
  archived?: boolean;
}): Promise<LLM[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llms);

  const conditions = [];
  if (filter?.role) {
    conditions.push(eq(llms.role, filter.role as any));
  }
  if (filter?.archived !== undefined) {
    conditions.push(eq(llms.archived, filter.archived));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

/**
 * Get LLM by ID
 */
export async function getLLMById(id: number): Promise<LLM | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db.select().from(llms).where(eq(llms.id, id));
  return results[0] || null;
}

/**
 * Archive an LLM
 */
export async function archiveLLM(id: number, userId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(llms).set({ archived: true }).where(eq(llms.id, id));

  await emitLLMAuditEvent({
    eventType: "llm.archived",
    llmId: id,
    actor: userId,
    actorType: "user",
    payload: {},
  });
}

/**
 * Compute SHA-256 hash of configuration
 */
function computeConfigHash(config: any): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(config));
  return hash.digest("hex");
}

/**
 * Create a new LLM version
 */
export async function createLLMVersion(data: Omit<InsertLLMVersion, "configHash" | "version">): Promise<LLMVersion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Get the next version number
  const existingVersions = await db
    .select()
    .from(llmVersions)
    .where(eq(llmVersions.llmId, data.llmId))
    .orderBy(desc(llmVersions.version));

  const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

  // Compute config hash
  const configHash = computeConfigHash(data.config);

  const insertData: InsertLLMVersion = {
    ...data,
    version: nextVersion,
    configHash,
  };

  const [version] = await db.insert(llmVersions).values(insertData).$returningId();

  // Emit audit event
  await emitLLMAuditEvent({
    eventType: "llm.version.created",
    llmId: data.llmId,
    llmVersionId: version.id,
    actor: data.createdBy,
    actorType: "user",
    payload: { version: nextVersion, environment: data.environment },
    configHash,
    policyHash: data.policyHash,
    environment: data.environment,
  });

  return (await db.select().from(llmVersions).where(eq(llmVersions.id, version.id)))[0];
}

/**
 * Get all versions for an LLM
 */
export async function getLLMVersions(llmId: number): Promise<LLMVersion[]> {
  const db = getDb();
  if (!db) return [];

  return await db
    .select()
    .from(llmVersions)
    .where(eq(llmVersions.llmId, llmId))
    .orderBy(desc(llmVersions.version));
}

/**
 * Get specific LLM version
 */
export async function getLLMVersion(versionId: number): Promise<LLMVersion | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db.select().from(llmVersions).where(eq(llmVersions.id, versionId));
  return results[0] || null;
}

/**
 * Get latest callable version for an LLM in a specific environment
 */
export async function getLatestCallableVersion(
  llmId: number,
  environment: "sandbox" | "governed" | "production"
): Promise<LLMVersion | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(llmVersions)
    .where(
      and(
        eq(llmVersions.llmId, llmId),
        eq(llmVersions.environment, environment),
        eq(llmVersions.callable, true)
      )
    )
    .orderBy(desc(llmVersions.version))
    .limit(1);

  return results[0] || null;
}

/**
 * Update LLM version callable status
 */
export async function updateLLMVersionCallable(
  versionId: number,
  callable: boolean,
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmVersions)
    .set({ callable })
    .where(eq(llmVersions.id, versionId));

  const version = await getLLMVersion(versionId);
  if (version) {
    await emitLLMAuditEvent({
      eventType: callable ? "llm.version.enabled" : "llm.version.disabled",
      llmId: version.llmId,
      llmVersionId: versionId,
      actorType: "system",
      payload: { reason },
    });
  }
}

/**
 * Create a promotion request
 */
export async function createPromotion(data: Omit<InsertLLMPromotion, "requestedAt">): Promise<LLMPromotion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [promotion] = await db.insert(llmPromotions).values({
    ...data,
    requestedAt: new Date(),
  }).$returningId();

  const version = await getLLMVersion(data.llmVersionId);

  await emitLLMAuditEvent({
    eventType: "llm.promotion.requested",
    llmId: version?.llmId,
    llmVersionId: data.llmVersionId,
    promotionId: promotion.id,
    actor: data.requestedBy,
    actorType: "user",
    payload: {
      from: data.fromEnvironment,
      to: data.toEnvironment,
    },
  });

  return (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotion.id)))[0];
}

/**
 * Get promotions (with optional filters)
 */
export async function getPromotions(filter?: {
  status?: string;
  llmVersionId?: number;
}): Promise<LLMPromotion[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llmPromotions);

  const conditions = [];
  if (filter?.status) {
    conditions.push(eq(llmPromotions.status, filter.status as any));
  }
  if (filter?.llmVersionId) {
    conditions.push(eq(llmPromotions.llmVersionId, filter.llmVersionId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(llmPromotions.createdAt));
}

/**
 * Approve a promotion
 */
export async function approvePromotion(
  promotionId: number,
  approverId: number,
  comment?: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmPromotions)
    .set({
      status: "approved",
      approvedBy: approverId,
      approvedAt: new Date(),
      approvalComment: comment,
    })
    .where(eq(llmPromotions.id, promotionId));

  const promotion = (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId)))[0];

  if (promotion) {
    const version = await getLLMVersion(promotion.llmVersionId);
    await emitLLMAuditEvent({
      eventType: "llm.promotion.approved",
      llmId: version?.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: approverId,
      actorType: "user",
      payload: { comment },
    });
  }
}

/**
 * Reject a promotion
 */
export async function rejectPromotion(
  promotionId: number,
  rejecterId: number,
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmPromotions)
    .set({
      status: "rejected",
      rejectedBy: rejecterId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    })
    .where(eq(llmPromotions.id, promotionId));

  const promotion = (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId)))[0];

  if (promotion) {
    const version = await getLLMVersion(promotion.llmVersionId);
    await emitLLMAuditEvent({
      eventType: "llm.promotion.rejected",
      llmId: version?.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: rejecterId,
      actorType: "user",
      payload: { reason },
    });
  }
}

/**
 * Emit an LLM audit event (helper function)
 */
async function emitLLMAuditEvent(data: Omit<InsertLLMAuditEvent, "timestamp" | "createdAt">): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(llmAuditEvents).values({
      ...data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[LLM Audit] Failed to emit event:", error);
  }
}

/**
 * Get audit events for an LLM
 */
export async function getLLMAuditEvents(filter: {
  llmId?: number;
  llmVersionId?: number;
  eventType?: string;
  limit?: number;
}): Promise<LLMAuditEvent[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llmAuditEvents);

  const conditions = [];
  if (filter.llmId) {
    conditions.push(eq(llmAuditEvents.llmId, filter.llmId));
  }
  if (filter.llmVersionId) {
    conditions.push(eq(llmAuditEvents.llmVersionId, filter.llmVersionId));
  }
  if (filter.eventType) {
    conditions.push(eq(llmAuditEvents.eventType, filter.eventType));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  query = query.orderBy(desc(llmAuditEvents.timestamp));

  if (filter.limit) {
    query = query.limit(filter.limit) as any;
  }

  return await query;
}
