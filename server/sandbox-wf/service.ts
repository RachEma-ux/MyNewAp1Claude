/**
 * WfDB — Service Layer
 *
 * CRUD functions for workflows, steps, executions, logs, and triggers.
 */

import { eq, and, sql, desc } from "drizzle-orm";
import { getWfDb } from "./connection";
import {
  wfWorkflows,
  wfSteps,
  wfExecutions,
  wfExecutionLogs,
  wfTriggers,
} from "../../drizzle/tables/wfdb";

function db() {
  const d = getWfDb();
  if (!d) throw new Error("WfDB not connected");
  return d;
}

// ── Workflows ────────────────────────────────────────────────────────────────

export async function listWorkflows(category?: string, status?: string) {
  const conditions: any[] = [];
  if (category && category !== "all") {
    conditions.push(eq(wfWorkflows.category, category));
  }
  if (status) {
    conditions.push(eq(wfWorkflows.status, status));
  }

  const workflows = conditions.length > 0
    ? await db().select().from(wfWorkflows).where(and(...conditions)).orderBy(wfWorkflows.id)
    : await db().select().from(wfWorkflows).orderBy(wfWorkflows.id);

  // Attach steps to each workflow
  const allSteps = await db().select().from(wfSteps).orderBy(wfSteps.sortOrder);
  return workflows.map((wf) => ({
    ...wf,
    steps: allSteps.filter((s) => s.workflowId === wf.id),
  }));
}

export async function getWorkflow(id: number) {
  const [wf] = await db().select().from(wfWorkflows).where(eq(wfWorkflows.id, id)).limit(1);
  if (!wf) return null;

  const steps = await db()
    .select()
    .from(wfSteps)
    .where(eq(wfSteps.workflowId, id))
    .orderBy(wfSteps.sortOrder);

  return { ...wf, steps };
}

export async function createWorkflow(data: {
  name: string;
  description?: string;
  category: string;
  status?: string;
  tags?: string[];
  updatedAgo?: string;
  steps?: { key: string; label: string; description?: string; status?: string }[];
}) {
  const [wf] = await db()
    .insert(wfWorkflows)
    .values({
      name: data.name,
      description: data.description || "",
      category: data.category,
      status: data.status || "draft",
      tags: data.tags || [],
      updatedAgo: data.updatedAgo || "",
    })
    .returning();

  if (data.steps && data.steps.length > 0) {
    await db()
      .insert(wfSteps)
      .values(
        data.steps.map((s, i) => ({
          workflowId: wf.id,
          key: s.key,
          label: s.label,
          description: s.description || "",
          status: s.status || "pending",
          sortOrder: i,
        }))
      );
  }

  return getWorkflow(wf.id);
}

export async function updateWorkflow(
  id: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    status?: string;
    tags?: string[];
    updatedAgo?: string;
  }
) {
  const updates: any = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.status !== undefined) updates.status = data.status;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.updatedAgo !== undefined) updates.updatedAgo = data.updatedAgo;

  await db().update(wfWorkflows).set(updates).where(eq(wfWorkflows.id, id));
  return getWorkflow(id);
}

export async function deleteWorkflow(id: number) {
  // Delete steps, triggers, then workflow
  await db().delete(wfSteps).where(eq(wfSteps.workflowId, id));
  await db().delete(wfTriggers).where(eq(wfTriggers.workflowId, id));
  // Delete execution logs for all executions of this workflow
  const execs = await db().select({ id: wfExecutions.id }).from(wfExecutions).where(eq(wfExecutions.workflowId, id));
  for (const exec of execs) {
    await db().delete(wfExecutionLogs).where(eq(wfExecutionLogs.executionId, exec.id));
  }
  await db().delete(wfExecutions).where(eq(wfExecutions.workflowId, id));
  await db().delete(wfWorkflows).where(eq(wfWorkflows.id, id));
  return { success: true };
}

// ── Steps ────────────────────────────────────────────────────────────────────

export async function updateStepStatus(workflowId: number, stepKey: string, status: string) {
  await db()
    .update(wfSteps)
    .set({ status })
    .where(and(eq(wfSteps.workflowId, workflowId), eq(wfSteps.key, stepKey)));
  return getWorkflow(workflowId);
}

// ── Triggers ─────────────────────────────────────────────────────────────────

export async function listTriggers(workflowId?: number) {
  if (workflowId) {
    return db().select().from(wfTriggers).where(eq(wfTriggers.workflowId, workflowId)).orderBy(wfTriggers.id);
  }
  return db().select().from(wfTriggers).orderBy(wfTriggers.id);
}

// ── Executions ───────────────────────────────────────────────────────────────

export async function listExecutions(workflowId?: number) {
  if (workflowId) {
    return db().select().from(wfExecutions).where(eq(wfExecutions.workflowId, workflowId)).orderBy(desc(wfExecutions.startedAt));
  }
  return db().select().from(wfExecutions).orderBy(desc(wfExecutions.startedAt));
}

export async function createExecution(workflowId: number, triggerType: string = "manual") {
  const [exec] = await db()
    .insert(wfExecutions)
    .values({
      workflowId,
      status: "running",
      triggerType,
    })
    .returning();

  // Get workflow steps and create log entries for each
  const steps = await db()
    .select()
    .from(wfSteps)
    .where(eq(wfSteps.workflowId, workflowId))
    .orderBy(wfSteps.sortOrder);

  // Create initial log entry
  await db().insert(wfExecutionLogs).values({
    executionId: exec.id,
    stepKey: "",
    status: "info",
    logLevel: "INFO",
    message: `[Execution #${exec.id}] Started for workflow #${workflowId} (trigger: ${triggerType})`,
  });

  // Simulate step execution by creating log entries
  for (const step of steps) {
    await db().insert(wfExecutionLogs).values({
      executionId: exec.id,
      stepKey: step.key,
      status: step.status === "done" ? "completed" : step.status === "failed" ? "failed" : "running",
      logLevel: step.status === "failed" ? "ERROR" : "INFO",
      message: `[${step.label}] ${step.description}`,
    });
  }

  // Mark execution completed
  await db()
    .update(wfExecutions)
    .set({
      status: "completed",
      completedAt: new Date(),
      duration: Math.floor(Math.random() * 5000) + 500,
    })
    .where(eq(wfExecutions.id, exec.id));

  // Final log
  await db().insert(wfExecutionLogs).values({
    executionId: exec.id,
    stepKey: "",
    status: "info",
    logLevel: "INFO",
    message: `[Execution #${exec.id}] Completed — ${steps.length} steps processed`,
  });

  return exec;
}

export async function getExecutionLogs(executionId: number) {
  return db()
    .select()
    .from(wfExecutionLogs)
    .where(eq(wfExecutionLogs.executionId, executionId))
    .orderBy(wfExecutionLogs.id);
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStats() {
  const workflows = await db().select().from(wfWorkflows);
  const steps = await db().select().from(wfSteps);

  return {
    total: workflows.length,
    running: workflows.filter((w) => w.status === "running").length,
    completed: workflows.filter((w) => w.status === "completed").length,
    failed: workflows.filter((w) => w.status === "failed").length,
    draft: workflows.filter((w) => w.status === "draft").length,
    totalSteps: steps.length,
    doneSteps: steps.filter((s) => s.status === "done").length,
  };
}
