/**
 * PM Central Service — module-owned business logic
 *
 * Single source of truth for PM Central writes. Both the tRPC router
 * and the gateway public-API call into here. Persistence goes
 * through the repository (PMDB only); platform audit goes through
 * the registry; events are published on the platform Event Bus.
 */

import * as repo from "./pm.repository";
import { logActivity as platformLog } from "../modules/registry";
import { publishEvent, makeEnvelope } from "../platform/events";
import { PM_CENTRAL_EVENTS } from "./events";
import {
  validateProjectTransition,
  validatePlanTransition,
  validateMilestoneTransition,
  validateTaskTransition,
  validateRiskTransition,
  validateIssueTransition,
} from "./pm.validation";
import type {
  CreatePmProjectInput,
  CreatePmPlanInput,
  CreatePmMilestoneInput,
  CreatePmTaskInput,
  CreatePmRiskInput,
  CreatePmIssueInput,
  RecordPmDecisionInput,
  ReceivePsHandoffInput,
  PmCentralSummary,
} from "./contracts";
import type {
  PmProject,
  PmPlan,
  PmMilestone,
  PmTask,
  PmRisk,
  PmIssue,
  PmDecision,
  PmHandoff,
} from "../../drizzle/tables/pmdb";

const SOURCE = "pmCentral";

// ── Internal: dual-log (platform registry + pmdb activity log) ───────────────

async function audit(opts: {
  workspaceId?: number;
  pmProjectId?: number | null;
  actorId?: number;
  action: string;
  message?: string;
  targetType?: string;
  targetId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (opts.workspaceId !== undefined) {
    await platformLog({
      workspaceId: opts.workspaceId,
      moduleKey: SOURCE,
      actorId: opts.actorId,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      metadata: opts.metadata,
    });
  }
  try {
    await repo.logActivity({
      pmProjectId: opts.pmProjectId ?? null,
      actorUserId: opts.actorId ?? null,
      eventType: opts.action,
      message: opts.message ?? null,
      metadataJson: opts.metadata ?? null,
    });
  } catch {
    // pmdb activity log is best-effort; don't block the main write
  }
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function createProject(
  input: CreatePmProjectInput,
  actorId: number,
): Promise<PmProject> {
  const created = await repo.createProject({
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    priority: input.priority ?? "normal",
    ownerUserId: input.ownerUserId,
    sourceModule: input.sourceModule,
    sourceRefId: input.sourceRefId,
    sourceHandoffId: input.sourceHandoffId,
    metadataJson: input.metadata,
    status: "draft",
    createdBy: actorId,
  });
  await audit({
    workspaceId: input.workspaceId,
    pmProjectId: created.id,
    actorId,
    action: "project.create",
    targetType: "pm_project",
    targetId: created.id,
    message: `Project "${created.name}" created`,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.projectCreated,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        pmProjectId: created.id,
        workspaceId: created.workspaceId,
        sourceModule: created.sourceModule,
        sourceRefId: created.sourceRefId,
        status: created.status,
        priority: created.priority,
      },
    }),
  );
  return created;
}

export async function listProjects(filters: {
  workspaceId: number;
  status?: string;
  sourceModule?: string;
  sourceRefId?: number;
  limit?: number;
  offset?: number;
}): Promise<PmProject[]> {
  return repo.listProjects(filters);
}

export async function getProject(id: number): Promise<PmProject> {
  const row = await repo.getProjectById(id);
  if (!row) throw new Error(`PM project ${id} not found`);
  return row;
}

export async function updateProjectStatus(
  id: number,
  to: PmProject["status"],
  actorId: number,
): Promise<PmProject> {
  const existing = await repo.getProjectById(id);
  if (!existing) throw new Error(`PM project ${id} not found`);
  validateProjectTransition(existing.status as any, to as any);
  const updated = await repo.updateProject(id, { status: to });
  await audit({
    workspaceId: existing.workspaceId,
    pmProjectId: id,
    actorId,
    action: "project.status.update",
    targetType: "pm_project",
    targetId: id,
    metadata: { from: existing.status, to },
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.projectStatusChanged,
      sourceModule: SOURCE,
      workspaceId: existing.workspaceId,
      actorId,
      payload: {
        pmProjectId: id,
        workspaceId: existing.workspaceId,
        status: to,
      },
    }),
  );
  return updated;
}

export async function updateProject(
  id: number,
  patch: { name?: string; description?: string; priority?: PmProject["priority"]; ownerUserId?: number },
  actorId: number,
): Promise<PmProject> {
  const existing = await repo.getProjectById(id);
  if (!existing) throw new Error(`PM project ${id} not found`);
  const updated = await repo.updateProject(id, patch);
  await audit({
    workspaceId: existing.workspaceId,
    pmProjectId: id,
    actorId,
    action: "project.update",
    targetType: "pm_project",
    targetId: id,
    metadata: patch as Record<string, unknown>,
  });
  return updated;
}

export async function archiveProject(
  id: number,
  actorId: number,
): Promise<PmProject> {
  return updateProjectStatus(id, "archived", actorId);
}

// ── Plans ───────────────────────────────────────────────────────────────────

export async function createPlan(
  input: CreatePmPlanInput,
  actorId: number,
): Promise<PmPlan> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.createPlan({
    pmProjectId: input.pmProjectId,
    title: input.title,
    description: input.description,
    metadataJson: input.metadata,
    planStatus: "draft",
    createdBy: actorId,
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "plan.create",
    targetType: "pm_plan",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.planCreated,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: { pmPlanId: created.id, pmProjectId: project.id },
    }),
  );
  return created;
}

export async function listPlansByProject(pmProjectId: number): Promise<PmPlan[]> {
  return repo.listPlansByProject(pmProjectId);
}

export async function getPlan(id: number): Promise<PmPlan> {
  const row = await repo.getPlanById(id);
  if (!row) throw new Error(`PM plan ${id} not found`);
  return row;
}

async function transitionPlan(
  id: number,
  to: PmPlan["planStatus"],
  actorId: number,
  eventType?: string,
): Promise<PmPlan> {
  const existing = await repo.getPlanById(id);
  if (!existing) throw new Error(`PM plan ${id} not found`);
  validatePlanTransition(existing.planStatus as any, to as any);
  const updated = await repo.updatePlan(id, { planStatus: to });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: `plan.${to}`,
    targetType: "pm_plan",
    targetId: id,
  });
  if (eventType) {
    await publishEvent(
      makeEnvelope({
        eventType,
        sourceModule: SOURCE,
        workspaceId: project?.workspaceId ?? 0,
        actorId,
        payload: { pmPlanId: id, pmProjectId: existing.pmProjectId, status: to },
      }),
    );
  }
  return updated;
}

export async function approvePlan(id: number, actorId: number): Promise<PmPlan> {
  return transitionPlan(id, "approved", actorId, PM_CENTRAL_EVENTS.planApproved);
}

export async function activatePlan(id: number, actorId: number): Promise<PmPlan> {
  return transitionPlan(id, "active", actorId);
}

export async function supersedePlan(id: number, actorId: number): Promise<PmPlan> {
  return transitionPlan(id, "superseded", actorId);
}

// ── Milestones ──────────────────────────────────────────────────────────────

export async function createMilestone(
  input: CreatePmMilestoneInput,
  actorId: number,
): Promise<PmMilestone> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.createMilestone({
    pmProjectId: input.pmProjectId,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    sortOrder: input.sortOrder ?? 0,
    status: "pending",
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "milestone.create",
    targetType: "pm_milestone",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.milestoneCreated,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: { pmMilestoneId: created.id, pmProjectId: project.id },
    }),
  );
  return created;
}

export async function listMilestonesByProject(pmProjectId: number): Promise<PmMilestone[]> {
  return repo.listMilestonesByProject(pmProjectId);
}

export async function updateMilestoneStatus(
  id: number,
  to: PmMilestone["status"],
  actorId: number,
): Promise<PmMilestone> {
  const existing = await repo.getMilestoneById(id);
  if (!existing) throw new Error(`PM milestone ${id} not found`);
  validateMilestoneTransition(existing.status as any, to as any);
  const updated = await repo.updateMilestone(id, { status: to });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: `milestone.${to}`,
    targetType: "pm_milestone",
    targetId: id,
  });
  if (to === "completed") {
    await publishEvent(
      makeEnvelope({
        eventType: PM_CENTRAL_EVENTS.milestoneCompleted,
        sourceModule: SOURCE,
        workspaceId: project?.workspaceId ?? 0,
        actorId,
        payload: { pmMilestoneId: id, pmProjectId: existing.pmProjectId },
      }),
    );
  }
  return updated;
}

export async function updateMilestone(
  id: number,
  patch: { title?: string; description?: string; dueDate?: Date; sortOrder?: number },
  actorId: number,
): Promise<PmMilestone> {
  const existing = await repo.getMilestoneById(id);
  if (!existing) throw new Error(`PM milestone ${id} not found`);
  const updated = await repo.updateMilestone(id, patch);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "milestone.update",
    targetType: "pm_milestone",
    targetId: id,
  });
  return updated;
}

export async function deleteMilestone(id: number, actorId: number): Promise<void> {
  const existing = await repo.getMilestoneById(id);
  if (!existing) throw new Error(`PM milestone ${id} not found`);
  await repo.deleteMilestone(id);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "milestone.delete",
    targetType: "pm_milestone",
    targetId: id,
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export async function createTask(
  input: CreatePmTaskInput,
  actorId: number,
): Promise<PmTask> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.createTask({
    pmProjectId: input.pmProjectId,
    milestoneId: input.milestoneId,
    title: input.title,
    description: input.description,
    assigneeUserId: input.assigneeUserId,
    priority: input.priority ?? "normal",
    dueDate: input.dueDate,
    metadataJson: input.metadata,
    status: "todo",
    createdBy: actorId,
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "task.create",
    targetType: "pm_task",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.taskCreated,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: {
        pmTaskId: created.id,
        pmProjectId: project.id,
        status: created.status,
        assigneeUserId: created.assigneeUserId,
      },
    }),
  );
  return created;
}

export async function listTasksByProject(pmProjectId: number): Promise<PmTask[]> {
  return repo.listTasksByProject(pmProjectId);
}

export async function updateTaskStatus(
  id: number,
  to: PmTask["status"],
  actorId: number,
): Promise<PmTask> {
  const existing = await repo.getTaskById(id);
  if (!existing) throw new Error(`PM task ${id} not found`);
  validateTaskTransition(existing.status as any, to as any);
  const updated = await repo.updateTask(id, { status: to });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: `task.${to}`,
    targetType: "pm_task",
    targetId: id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.taskStatusChanged,
      sourceModule: SOURCE,
      workspaceId: project?.workspaceId ?? 0,
      actorId,
      payload: {
        pmTaskId: id,
        pmProjectId: existing.pmProjectId,
        status: to,
        assigneeUserId: existing.assigneeUserId,
      },
    }),
  );
  return updated;
}

export async function updateTask(
  id: number,
  patch: {
    title?: string;
    description?: string;
    priority?: PmTask["priority"];
    dueDate?: Date;
    milestoneId?: number;
  },
  actorId: number,
): Promise<PmTask> {
  const existing = await repo.getTaskById(id);
  if (!existing) throw new Error(`PM task ${id} not found`);
  const updated = await repo.updateTask(id, patch);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "task.update",
    targetType: "pm_task",
    targetId: id,
  });
  return updated;
}

export async function assignTask(
  id: number,
  assigneeUserId: number,
  actorId: number,
): Promise<PmTask> {
  const existing = await repo.getTaskById(id);
  if (!existing) throw new Error(`PM task ${id} not found`);
  const updated = await repo.updateTask(id, { assigneeUserId });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "task.assign",
    targetType: "pm_task",
    targetId: id,
    metadata: { assigneeUserId },
  });
  return updated;
}

export async function deleteTask(id: number, actorId: number): Promise<void> {
  const existing = await repo.getTaskById(id);
  if (!existing) throw new Error(`PM task ${id} not found`);
  await repo.deleteTask(id);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "task.delete",
    targetType: "pm_task",
    targetId: id,
  });
}

// ── Risks ───────────────────────────────────────────────────────────────────

export async function createRisk(
  input: CreatePmRiskInput,
  actorId: number,
): Promise<PmRisk> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.createRisk({
    pmProjectId: input.pmProjectId,
    title: input.title,
    description: input.description,
    severity: input.severity ?? "medium",
    probability: input.probability ?? "medium",
    mitigation: input.mitigation,
    status: "open",
    createdBy: actorId,
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "risk.create",
    targetType: "pm_risk",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.riskCreated,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: { pmRiskId: created.id, pmProjectId: project.id },
    }),
  );
  return created;
}

export async function listRisksByProject(pmProjectId: number): Promise<PmRisk[]> {
  return repo.listRisksByProject(pmProjectId);
}

export async function updateRisk(
  id: number,
  patch: {
    title?: string;
    description?: string;
    severity?: PmRisk["severity"];
    probability?: PmRisk["probability"];
    mitigation?: string;
  },
  actorId: number,
): Promise<PmRisk> {
  const existing = await repo.getRiskById(id);
  if (!existing) throw new Error(`PM risk ${id} not found`);
  const updated = await repo.updateRisk(id, patch);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "risk.update",
    targetType: "pm_risk",
    targetId: id,
  });
  return updated;
}

export async function closeRisk(id: number, actorId: number): Promise<PmRisk> {
  const existing = await repo.getRiskById(id);
  if (!existing) throw new Error(`PM risk ${id} not found`);
  validateRiskTransition(existing.status as any, "closed");
  const updated = await repo.updateRisk(id, { status: "closed" });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "risk.close",
    targetType: "pm_risk",
    targetId: id,
  });
  return updated;
}

// ── Issues ──────────────────────────────────────────────────────────────────

export async function createIssue(
  input: CreatePmIssueInput,
  actorId: number,
): Promise<PmIssue> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.createIssue({
    pmProjectId: input.pmProjectId,
    title: input.title,
    description: input.description,
    severity: input.severity ?? "medium",
    ownerUserId: input.ownerUserId,
    status: "open",
    createdBy: actorId,
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "issue.create",
    targetType: "pm_issue",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.issueCreated,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: { pmIssueId: created.id, pmProjectId: project.id },
    }),
  );
  return created;
}

export async function listIssuesByProject(pmProjectId: number): Promise<PmIssue[]> {
  return repo.listIssuesByProject(pmProjectId);
}

export async function updateIssue(
  id: number,
  patch: {
    title?: string;
    description?: string;
    severity?: PmIssue["severity"];
    ownerUserId?: number;
  },
  actorId: number,
): Promise<PmIssue> {
  const existing = await repo.getIssueById(id);
  if (!existing) throw new Error(`PM issue ${id} not found`);
  const updated = await repo.updateIssue(id, patch);
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "issue.update",
    targetType: "pm_issue",
    targetId: id,
  });
  return updated;
}

export async function closeIssue(id: number, actorId: number): Promise<PmIssue> {
  const existing = await repo.getIssueById(id);
  if (!existing) throw new Error(`PM issue ${id} not found`);
  validateIssueTransition(existing.status as any, "closed");
  const updated = await repo.updateIssue(id, { status: "closed" });
  const project = await repo.getProjectById(existing.pmProjectId);
  await audit({
    workspaceId: project?.workspaceId,
    pmProjectId: existing.pmProjectId,
    actorId,
    action: "issue.close",
    targetType: "pm_issue",
    targetId: id,
  });
  return updated;
}

// ── Decisions ───────────────────────────────────────────────────────────────

export async function recordDecision(
  input: RecordPmDecisionInput,
  actorId: number,
): Promise<PmDecision> {
  const project = await repo.getProjectById(input.pmProjectId);
  if (!project) throw new Error(`PM project ${input.pmProjectId} not found`);
  const created = await repo.recordDecision({
    pmProjectId: input.pmProjectId,
    title: input.title,
    decision: input.decision,
    rationale: input.rationale,
    decidedBy: actorId,
  });
  await audit({
    workspaceId: project.workspaceId,
    pmProjectId: input.pmProjectId,
    actorId,
    action: "decision.record",
    targetType: "pm_decision",
    targetId: created.id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.decisionRecorded,
      sourceModule: SOURCE,
      workspaceId: project.workspaceId,
      actorId,
      payload: { pmDecisionId: created.id, pmProjectId: project.id },
    }),
  );
  return created;
}

export async function listDecisionsByProject(pmProjectId: number): Promise<PmDecision[]> {
  return repo.listDecisionsByProject(pmProjectId);
}

// ── Handoffs ────────────────────────────────────────────────────────────────

export async function receivePsHandoff(
  input: ReceivePsHandoffInput,
  actorId?: number,
): Promise<PmHandoff> {
  const created = await repo.recordHandoff({
    handoffId: input.handoffId,
    sourceModule: input.sourceModule,
    sourceRefId: input.sourceProjectId,
    status: "received",
    payloadJson: input as unknown as Record<string, unknown>,
  });
  await audit({
    workspaceId: input.workspaceId,
    actorId,
    action: "handoff.received",
    targetType: "pm_handoff",
    targetId: created.id,
    metadata: { sourceModule: input.sourceModule, sourceProjectId: input.sourceProjectId },
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.handoffReceived,
      sourceModule: SOURCE,
      workspaceId: input.workspaceId,
      actorId,
      payload: {
        pmHandoffId: created.id,
        sourceModule: input.sourceModule,
        sourceRefId: input.sourceProjectId,
        status: "received",
        targetPmProjectId: null,
      },
    }),
  );
  return created;
}

export async function acceptHandoff(
  id: number,
  actorId: number,
): Promise<PmHandoff> {
  const existing = await repo.getHandoffById(id);
  if (!existing) throw new Error(`PM handoff ${id} not found`);
  if (existing.status !== "received") {
    throw new Error(`Handoff ${id} is not in 'received' state (got '${existing.status}')`);
  }
  const updated = await repo.updateHandoff(id, { status: "accepted" });
  const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
  const workspaceId = Number(payload.workspaceId);
  await audit({
    workspaceId: Number.isFinite(workspaceId) ? workspaceId : undefined,
    actorId,
    action: "handoff.accept",
    targetType: "pm_handoff",
    targetId: id,
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.handoffAccepted,
      sourceModule: SOURCE,
      workspaceId: Number.isFinite(workspaceId) ? workspaceId : 0,
      actorId,
      payload: {
        pmHandoffId: id,
        sourceModule: existing.sourceModule,
        sourceRefId: existing.sourceRefId,
        status: "accepted",
      },
    }),
  );
  return updated;
}

export async function rejectHandoff(
  id: number,
  reason: string,
  actorId: number,
): Promise<PmHandoff> {
  const existing = await repo.getHandoffById(id);
  if (!existing) throw new Error(`PM handoff ${id} not found`);
  if (existing.status === "converted" || existing.status === "rejected") {
    throw new Error(`Handoff ${id} is already ${existing.status}`);
  }
  const updated = await repo.updateHandoff(id, {
    status: "rejected",
    payloadJson: {
      ...((existing.payloadJson ?? {}) as Record<string, unknown>),
      rejectionReason: reason,
    },
  });
  const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
  const workspaceId = Number(payload.workspaceId);
  await audit({
    workspaceId: Number.isFinite(workspaceId) ? workspaceId : undefined,
    actorId,
    action: "handoff.reject",
    targetType: "pm_handoff",
    targetId: id,
    metadata: { reason },
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.handoffRejected,
      sourceModule: SOURCE,
      workspaceId: Number.isFinite(workspaceId) ? workspaceId : 0,
      actorId,
      payload: {
        pmHandoffId: id,
        sourceModule: existing.sourceModule,
        sourceRefId: existing.sourceRefId,
        status: "rejected",
      },
    }),
  );
  return updated;
}

/**
 * Convert an accepted (or received) handoff into a real PM project.
 *
 * Idempotent: if the handoff already has `target_pm_project_id`, the
 * existing project is returned without creating a duplicate.
 */
export async function convertHandoffToProject(
  id: number,
  actorId: number,
): Promise<{ handoff: PmHandoff; project: PmProject }> {
  const existing = await repo.getHandoffById(id);
  if (!existing) throw new Error(`PM handoff ${id} not found`);
  if (existing.targetPmProjectId) {
    const project = await repo.getProjectById(existing.targetPmProjectId);
    if (project) return { handoff: existing, project };
  }
  const payload = (existing.payloadJson ?? {}) as Record<string, unknown>;
  const workspaceId = Number(payload.workspaceId);
  if (!Number.isFinite(workspaceId)) {
    throw new Error(`Handoff ${id} payload missing workspaceId`);
  }
  const name =
    typeof payload.name === "string" && payload.name.length > 0
      ? (payload.name as string)
      : `Project from ${existing.sourceModule} #${existing.sourceRefId ?? "?"}`;
  const description = buildHandoffDescription(payload);
  const project = await createProject(
    {
      workspaceId,
      name,
      description,
      sourceModule: existing.sourceModule,
      sourceRefId: existing.sourceRefId ?? undefined,
      sourceHandoffId: id,
      metadata: payload,
    },
    actorId,
  );
  const updated = await repo.updateHandoff(id, {
    status: "converted",
    targetPmProjectId: project.id,
  });
  await audit({
    workspaceId,
    pmProjectId: project.id,
    actorId,
    action: "handoff.convert",
    targetType: "pm_handoff",
    targetId: id,
    metadata: { pmProjectId: project.id },
  });
  await publishEvent(
    makeEnvelope({
      eventType: PM_CENTRAL_EVENTS.handoffConverted,
      sourceModule: SOURCE,
      workspaceId,
      actorId,
      payload: {
        pmHandoffId: id,
        sourceModule: existing.sourceModule,
        sourceRefId: existing.sourceRefId,
        status: "converted",
        targetPmProjectId: project.id,
      },
    }),
  );
  return { handoff: updated, project };
}

function buildHandoffDescription(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof payload.scenario === "string") lines.push(`Scenario:\n${payload.scenario}`);
  if (typeof payload.classification === "string")
    lines.push(`Classification: ${payload.classification}`);
  if (typeof payload.selectedScopeCode === "string")
    lines.push(`Scope: ${payload.selectedScopeCode}`);
  if (typeof payload.selectedScopeLabel === "string")
    lines.push(`Scope label: ${payload.selectedScopeLabel}`);
  if (payload.confidence !== undefined && payload.confidence !== null)
    lines.push(`Confidence: ${String(payload.confidence)}`);
  return lines.join("\n");
}

// ── Summary ─────────────────────────────────────────────────────────────────

export async function getSummary(workspaceId: number): Promise<PmCentralSummary> {
  try {
    const counts = await repo.summary(workspaceId);
    return { ...counts, dbConnected: true };
  } catch {
    return {
      totalProjects: 0,
      activeProjects: 0,
      blockedProjects: 0,
      overdueMilestones: 0,
      openRisks: 0,
      openIssues: 0,
      pendingHandoffs: 0,
      dbConnected: false,
    };
  }
}
