import { eq, and, desc, ne, inArray } from "drizzle-orm";
import {
  workflows,
  Workflow,
  workflowVersions,
  workflowExecutions,
  workflowExecutionLogs,
} from "../../drizzle/schema";
import { getDb } from "./connection";

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
    .returning({ id: workflows.id });

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

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.nodes !== undefined) updates.nodes = input.nodes;
  if (input.edges !== undefined) updates.edges = input.edges;
  if (input.permissions !== undefined) updates.permissions = input.permissions;
  if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

  await db
    .update(workflows)
    .set(updates)
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)));

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

  await db
    .update(workflows)
    .set({ status: "deleted" })
    .where(and(eq(workflows.id, id), eq(workflows.userId, userId)));
}

export async function publishWorkflow(
  workflowId: number,
  userId: number,
  changeNotes?: string
): Promise<{ versionId: number; version: number } | null> {
  const db = getDb();
  if (!db) return null;

  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const latestVersions = await db
    .select({ version: workflowVersions.version })
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflowId))
    .orderBy(desc(workflowVersions.version))
    .limit(1);

  const nextVersion = latestVersions.length > 0 ? latestVersions[0].version + 1 : 1;

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
  }).returning();

  await db
    .update(workflows)
    .set({
      publishedVersionId: newVersion.id,
      status: "published",
      draftData: null,
    })
    .where(eq(workflows.id, workflowId));

  return {
    versionId: newVersion.id,
    version: nextVersion,
  };
}

export async function getWorkflowVersions(
  workflowId: number,
  userId: number
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) return [];

  return await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.workflowId, workflowId))
    .orderBy(desc(workflowVersions.version));
}

export async function rollbackToVersion(
  workflowId: number,
  versionId: number,
  userId: number
): Promise<Workflow | null> {
  const db = getDb();
  if (!db) return null;

  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) {
    throw new Error("Workflow not found");
  }

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
  }).returning();

  return result.id;
}

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

export async function getWorkflowExecutions(
  workflowId: number,
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) return [];

  return await db
    .select()
    .from(workflowExecutions)
    .where(eq(workflowExecutions.workflowId, workflowId))
    .orderBy(desc(workflowExecutions.startedAt))
    .limit(limit);
}

export async function getAllWorkflowExecutions(
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  const userWorkflows = await getUserWorkflows(userId);
  const workflowIds = userWorkflows.map((w) => w.id);

  if (workflowIds.length === 0) return [];

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

  return executions.map(exec => ({
    ...exec,
    retryCount: 0,
    logs: [],
  }));
}

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

  const workflow = await getWorkflowById(execution.workflowId, userId);
  if (!workflow) return null;

  return execution;
}

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
  }).returning();

  return result.id;
}

export async function getExecutionLogs(
  executionId: number,
  userId: number
): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  const execution = await getWorkflowExecutionById(executionId, userId);
  if (!execution) return [];

  return await db
    .select()
    .from(workflowExecutionLogs)
    .where(eq(workflowExecutionLogs.executionId, executionId))
    .orderBy(workflowExecutionLogs.startedAt);
}

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
