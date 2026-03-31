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
  wfVersions,
  wfTemplates,
  wfCatalogImports,
} from "../../drizzle/tables/wfdb";
import { executeWorkflow as runWorkflow } from "./executor";

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
  // Use the real execution engine
  const executionId = await runWorkflow(workflowId, triggerType);
  // Fetch and return the execution record
  const [exec] = await db()
    .select()
    .from(wfExecutions)
    .where(eq(wfExecutions.id, executionId))
    .limit(1);
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

// ── Versions ─────────────────────────────────────────────────────────────────

export async function createVersion(workflowId: number) {
  // Get current workflow state
  const wf = await getWorkflow(workflowId);
  if (!wf) throw new Error("Workflow not found");

  // Get current max version
  const versions = await db()
    .select()
    .from(wfVersions)
    .where(eq(wfVersions.workflowId, workflowId))
    .orderBy(desc(wfVersions.version));
  const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;

  // Save snapshot
  const [version] = await db()
    .insert(wfVersions)
    .values({
      workflowId,
      version: nextVersion,
      snapshot: {
        name: wf.name,
        description: wf.description,
        category: wf.category,
        status: wf.status,
        tags: wf.tags,
        steps: wf.steps,
      },
    })
    .returning();

  // Update workflow version number
  await db()
    .update(wfWorkflows)
    .set({ version: nextVersion, updatedAt: new Date() })
    .where(eq(wfWorkflows.id, workflowId));

  return version;
}

export async function listVersions(workflowId: number) {
  return db()
    .select()
    .from(wfVersions)
    .where(eq(wfVersions.workflowId, workflowId))
    .orderBy(desc(wfVersions.version));
}

export async function restoreVersion(workflowId: number, versionId: number) {
  const [version] = await db()
    .select()
    .from(wfVersions)
    .where(eq(wfVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error("Version not found");
  const snap = version.snapshot as any;

  await db()
    .update(wfWorkflows)
    .set({
      name: snap.name,
      description: snap.description,
      category: snap.category,
      tags: snap.tags,
      updatedAt: new Date(),
    })
    .where(eq(wfWorkflows.id, workflowId));

  return getWorkflow(workflowId);
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates() {
  return db().select().from(wfTemplates).orderBy(wfTemplates.id);
}

export async function getTemplate(id: number) {
  const [tmpl] = await db()
    .select()
    .from(wfTemplates)
    .where(eq(wfTemplates.id, id))
    .limit(1);
  return tmpl || null;
}

export async function createFromTemplate(templateId: number, name: string) {
  const tmpl = await getTemplate(templateId);
  if (!tmpl) throw new Error("Template not found");

  const steps = (tmpl.steps as any[]) || [];
  return createWorkflow({
    name: name || tmpl.name,
    description: tmpl.description,
    category: tmpl.category,
    tags: (tmpl.tags as string[]) || [],
    steps: steps.map((s: any) => ({
      key: s.key,
      label: s.label,
      description: s.description || "",
      status: "pending",
    })),
  });
}

// ── Trigger CRUD ─────────────────────────────────────────────────────────────

export async function createTrigger(data: {
  workflowId: number;
  name: string;
  type: string;
  config?: Record<string, any>;
  status?: string;
}) {
  const [trigger] = await db()
    .insert(wfTriggers)
    .values({
      workflowId: data.workflowId,
      name: data.name,
      type: data.type,
      config: data.config || {},
      status: data.status || "active",
    })
    .returning();
  return trigger;
}

export async function updateTrigger(id: number, data: { name?: string; type?: string; config?: Record<string, any>; status?: string }) {
  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.config !== undefined) updates.config = data.config;
  if (data.status !== undefined) updates.status = data.status;
  await db().update(wfTriggers).set(updates).where(eq(wfTriggers.id, id));
  const [trigger] = await db().select().from(wfTriggers).where(eq(wfTriggers.id, id)).limit(1);
  return trigger;
}

export async function deleteTrigger(id: number) {
  await db().delete(wfTriggers).where(eq(wfTriggers.id, id));
  return { success: true };
}

// ── Maestro Round-Table ─────────────────────────────────────────────

function buildRoundTableContext(
  history: { role: string; sender: string; content: string }[],
  priorResults: { name: string; response: string }[],
  currentMessage: string,
  participantName: string,
): string {
  const parts: string[] = [];

  // Previous conversation rounds
  if (history.length > 0) {
    parts.push("=== Conversation History ===");
    for (const h of history.slice(-20)) {
      parts.push(`[${h.sender}]: ${h.content}`);
    }
    parts.push("");
  }

  // Current round — what other participants already said
  if (priorResults.length > 0) {
    parts.push("=== This Round (other participants) ===");
    for (const r of priorResults) {
      parts.push(`[${r.name}]: ${r.response}`);
    }
    parts.push("");
  }

  parts.push(`=== User Message ===`);
  parts.push(currentMessage);
  parts.push("");
  parts.push(
    `You are "${participantName}". Respond in character. Be concise but thorough. ` +
    `Consider what the other participants have said (if any) and build on or respectfully disagree with their points.`,
  );

  return parts.join("\n");
}

export async function executeRoundTable(input: {
  message: string;
  participants: { catalogEntryId: number; name: string }[];
  conversationHistory?: { role: string; sender: string; content: string }[];
}) {
  const results: {
    catalogEntryId: number;
    name: string;
    response: string;
    status: string;
  }[] = [];

  for (const participant of input.participants) {
    try {
      const contextPrompt = buildRoundTableContext(
        input.conversationHistory || [],
        results,
        input.message,
        participant.name,
      );

      const { invokeCatalogEntry } = await import("../catalog/invoke");
      let response = "";

      for await (const event of invokeCatalogEntry({
        catalogEntryId: participant.catalogEntryId,
        actorUserId: 0,
        message: contextPrompt,
        triggerSource: "maestro_round_table",
      })) {
        if (event.type === "chunk") {
          response += (event as any).text || "";
        }
        if (event.type === "complete") {
          response = (event as any).result || response;
        }
        if (event.type === "error") {
          results.push({
            catalogEntryId: participant.catalogEntryId,
            name: participant.name,
            response: `Error: ${(event as any).error}`,
            status: "failed",
          });
          // Skip to next participant on error event
          continue;
        }
      }

      // Only push completed if we didn't already push a failed result
      if (!results.find((r) => r.catalogEntryId === participant.catalogEntryId)) {
        results.push({
          catalogEntryId: participant.catalogEntryId,
          name: participant.name,
          response: response || "(No response)",
          status: "completed",
        });
      }
    } catch (err: any) {
      // Only push if not already pushed
      if (!results.find((r) => r.catalogEntryId === participant.catalogEntryId)) {
        results.push({
          catalogEntryId: participant.catalogEntryId,
          name: participant.name,
          response: `[Error] ${err.message}`,
          status: "failed",
        });
      }
    }
  }

  return { results };
}

// ── Catalog Imports ─────────────────────────────────────────────────────

export async function listCatalogImports() {
  return db()
    .select()
    .from(wfCatalogImports)
    .where(eq(wfCatalogImports.status, "active"))
    .orderBy(wfCatalogImports.id);
}

export async function importCatalogEntry(data: {
  catalogEntryId: number;
  entryType: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  config?: Record<string, any>;
}) {
  // Check if already imported
  const existing = await db()
    .select()
    .from(wfCatalogImports)
    .where(
      and(
        eq(wfCatalogImports.catalogEntryId, data.catalogEntryId),
        eq(wfCatalogImports.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const [imported] = await db()
    .insert(wfCatalogImports)
    .values({
      catalogEntryId: data.catalogEntryId,
      entryType: data.entryType,
      name: data.name,
      description: data.description || "",
      category: data.category || "",
      tags: data.tags || [],
      config: data.config || {},
    })
    .returning();
  return imported;
}

export async function removeCatalogImport(id: number) {
  await db()
    .update(wfCatalogImports)
    .set({ status: "removed" })
    .where(eq(wfCatalogImports.id, id));
  return { success: true };
}
