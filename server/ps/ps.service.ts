/**
 * PS Module — Service Layer
 *
 * Orchestrates repository calls and enforces minimal business rules.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import { logActivity } from "../modules/registry";
import { classifyScenario as runClassifier } from "./ps.classifier";
import type {
  CreateSystemInput,
  CreateWizardRunInput,
  ClassificationInput,
  CreateResourceRequestInput,
  CreateResourceAssignmentInput,
  UpdateResourceAssignmentInput,
  PsResourceRequestStatus,
  PsAssignmentStatus,
  DemandSummary,
  AssignmentSummary,
} from "./ps.types";
import { generateDemandSpecs, resolveQuantity } from "./ps.demand";
import {
  validateStatusTransition,
  validateSystemMatch,
  computeAssignmentSummary,
} from "./ps.assignment";
import {
  getSystemMetrics,
  getWizardMetrics,
  getDemandMetrics,
  getAssignmentMetrics,
  getFulfillmentMetrics,
  getRecentActivity,
  type MonitoringSummary,
} from "./ps.monitoring";

// ── Systems ──────────────────────────────────────────────────────────────

export async function createSystem(input: CreateSystemInput, actorId: number) {
  if (!input.name.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "System name is required" });
  }

  const system = await repo.createSystem({
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    systemType: input.systemType,
    lifecycleType: input.lifecycleType || null,
    governanceProfile: input.governanceProfile || null,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "system.create",
    entityType: "ps_system",
    entityId: system.id,
    newValue: { name: system.name, systemType: system.systemType },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "system.create",
    targetType: "ps_system",
    targetId: system.id,
  });

  // Auto-generate demand based on system type
  const demand = await generateDemandForSystem(
    input.workspaceId,
    system.id,
    input.systemType,
    actorId,
  );

  return { ...system, _generatedDemand: demand };
}

export async function getSystem(workspaceId: number, id: number) {
  const system = await repo.getSystemById(workspaceId, id);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }
  return system;
}

export async function listSystems(workspaceId: number, status?: string) {
  return repo.listSystems(workspaceId, status);
}

// ── Wizard Runs ──────────────────────────────────────────────────────────

export async function createWizardRun(input: CreateWizardRunInput, actorId: number) {
  if (!input.scenarioText.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Scenario text is required" });
  }

  const run = await repo.createWizardRun({
    workspaceId: input.workspaceId,
    scenarioText: input.scenarioText.trim(),
    inputPayload: input.inputPayload,
    resultPayload: input.resultPayload,
    confidence: input.confidence != null ? String(input.confidence) : null,
    selectedSystemType: input.selectedSystemType || null,
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "wizard_run.create",
    entityType: "ps_wizard_run",
    entityId: run.id,
    newValue: { scenarioText: run.scenarioText, selectedSystemType: run.selectedSystemType },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "wizard_run.create",
    targetType: "ps_wizard_run",
    targetId: run.id,
  });

  return run;
}

export async function getWizardRun(workspaceId: number, id: number) {
  const run = await repo.getWizardRunById(workspaceId, id);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Wizard run not found" });
  }
  return run;
}

export async function listWizardRuns(workspaceId: number) {
  return repo.listWizardRuns(workspaceId);
}

// ── Classification ────────────────────────────────────────────────────

export function classifyScenario(input: ClassificationInput) {
  return runClassifier(input);
}

// ── Catalog ──────────────────────────────────────────────────────────────

export async function getCatalog() {
  return repo.getCatalogSystemTypes();
}

// ── Resource Requests (Demand) ──────────────────────────────────────

export async function createResourceRequest(input: CreateResourceRequestInput, actorId: number) {
  if (!input.role.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Role is required" });
  }

  // Verify system exists
  const system = await repo.getSystemById(input.workspaceId, input.psSystemId);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }

  const request = await repo.createResourceRequest({
    workspaceId: input.workspaceId,
    psSystemId: input.psSystemId,
    role: input.role.trim(),
    capabilityTags: input.capabilityTags || [],
    quantity: input.quantity ?? 1,
    seniorityLevel: input.seniorityLevel || "mid",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    allocationPercentage: input.allocationPercentage ?? 100,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "resource_request.create",
    entityType: "ps_resource_request",
    entityId: request.id,
    newValue: { role: request.role, quantity: request.quantity, psSystemId: request.psSystemId },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_request.create",
    targetType: "ps_resource_request",
    targetId: request.id,
  });

  return request;
}

export async function listResourceRequests(workspaceId: number, status?: string) {
  return repo.listResourceRequests(workspaceId, status);
}

export async function listResourceRequestsBySystem(workspaceId: number, psSystemId: number) {
  return repo.listResourceRequestsBySystem(workspaceId, psSystemId);
}

export async function updateResourceRequestStatus(
  workspaceId: number,
  id: number,
  status: PsResourceRequestStatus,
  actorId: number,
) {
  const updated = await repo.updateResourceRequestStatus(workspaceId, id, status);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource request not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "resource_request.status_change",
    entityType: "ps_resource_request",
    entityId: id,
    newValue: { status },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_request.status_change",
    targetType: "ps_resource_request",
    targetId: id,
  });

  return updated;
}

export async function getDemandSummary(workspaceId: number, psSystemId: number): Promise<DemandSummary> {
  const requests = await repo.listResourceRequestsBySystem(workspaceId, psSystemId);

  const byStatus: Record<PsResourceRequestStatus, number> = {
    draft: 0,
    open: 0,
    partially_filled: 0,
    filled: 0,
    closed: 0,
  };
  let totalQuantity = 0;

  for (const r of requests) {
    const s = r.status as PsResourceRequestStatus;
    if (byStatus[s] !== undefined) byStatus[s]++;
    totalQuantity += r.quantity ?? 0;
  }

  return {
    psSystemId,
    totalRequests: requests.length,
    totalQuantity,
    byStatus,
    roles: requests.map((r) => ({
      role: r.role,
      quantity: r.quantity ?? 1,
      status: r.status,
    })),
  };
}

// ── Demand Generation ────────────────────────────────────────────────

/**
 * Generate resource requests for a system based on its type.
 * Called during system creation or wizard completion.
 */
export async function generateDemandForSystem(
  workspaceId: number,
  psSystemId: number,
  systemType: string,
  actorId: number,
) {
  const specs = generateDemandSpecs(systemType);
  if (specs.length === 0) return [];

  const items = specs.map((spec) => ({
    workspaceId,
    psSystemId,
    role: spec.role,
    capabilityTags: spec.capabilityTags,
    quantity: resolveQuantity(spec),
    seniorityLevel: spec.seniorityLevel,
    startDate: null as Date | null,
    endDate: null as Date | null,
    allocationPercentage: 100,
    status: "draft",
    createdBy: actorId,
  }));

  const created = await repo.createResourceRequestsBatch(items);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "demand.generate",
    entityType: "ps_system",
    entityId: psSystemId,
    newValue: {
      systemType,
      requestCount: created.length,
      roles: created.map((r) => ({ role: r.role, quantity: r.quantity })),
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "demand.generate",
    targetType: "ps_system",
    targetId: psSystemId,
  });

  return created;
}

// ── Resource Assignments ─────────────────────────────────────────────

export async function createResourceAssignment(
  input: CreateResourceAssignmentInput,
  actorId: number,
) {
  if (!input.assignmentRole.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Assignment role is required" });
  }

  // Rule 1: Verify request exists
  const request = await repo.getResourceRequestById(input.workspaceId, input.resourceRequestId);
  if (!request) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource request not found" });
  }

  // Rule 2: Verify system match
  validateSystemMatch(request.psSystemId, input.psSystemId);

  // Verify system exists
  const system = await repo.getSystemById(input.workspaceId, input.psSystemId);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }

  const assignment = await repo.createResourceAssignment({
    workspaceId: input.workspaceId,
    resourceRequestId: input.resourceRequestId,
    psSystemId: input.psSystemId,
    assignmentRole: input.assignmentRole.trim(),
    assigneeRefType: input.assigneeRefType,
    assigneeRefId: input.assigneeRefId || null,
    assigneeDisplayName: input.assigneeDisplayName || null,
    allocationPercentage: input.allocationPercentage ?? 100,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    status: input.status || "proposed",
    source: input.source || "manual",
    notes: input.notes || null,
    createdBy: actorId,
    updatedBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "resource_assignment.create",
    entityType: "ps_resource_assignment",
    entityId: assignment.id,
    newValue: {
      assignmentRole: assignment.assignmentRole,
      assigneeRefType: assignment.assigneeRefType,
      resourceRequestId: assignment.resourceRequestId,
      psSystemId: assignment.psSystemId,
    },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_assignment.create",
    targetType: "ps_resource_assignment",
    targetId: assignment.id,
  });

  return assignment;
}

export async function listResourceAssignments(workspaceId: number, status?: string) {
  return repo.listResourceAssignments(workspaceId, status);
}

export async function listResourceAssignmentsByRequest(workspaceId: number, resourceRequestId: number) {
  return repo.listResourceAssignmentsByRequest(workspaceId, resourceRequestId);
}

export async function listResourceAssignmentsBySystem(workspaceId: number, psSystemId: number) {
  return repo.listResourceAssignmentsBySystem(workspaceId, psSystemId);
}

export async function updateResourceAssignment(
  input: UpdateResourceAssignmentInput,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(input.workspaceId, input.id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  const updateData: Record<string, any> = { updatedBy: actorId };
  if (input.assignmentRole !== undefined) updateData.assignmentRole = input.assignmentRole.trim();
  if (input.assigneeRefType !== undefined) updateData.assigneeRefType = input.assigneeRefType;
  if (input.assigneeRefId !== undefined) updateData.assigneeRefId = input.assigneeRefId;
  if (input.assigneeDisplayName !== undefined) updateData.assigneeDisplayName = input.assigneeDisplayName;
  if (input.allocationPercentage !== undefined) updateData.allocationPercentage = input.allocationPercentage;
  if (input.startDate !== undefined) updateData.startDate = input.startDate;
  if (input.endDate !== undefined) updateData.endDate = input.endDate;
  if (input.notes !== undefined) updateData.notes = input.notes;

  const updated = await repo.updateResourceAssignment(input.workspaceId, input.id, updateData);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "resource_assignment.update",
    entityType: "ps_resource_assignment",
    entityId: input.id,
    previousValue: { assignmentRole: existing.assignmentRole, assigneeDisplayName: existing.assigneeDisplayName },
    newValue: updateData,
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_assignment.update",
    targetType: "ps_resource_assignment",
    targetId: input.id,
  });

  return updated;
}

export async function updateResourceAssignmentStatus(
  workspaceId: number,
  id: number,
  status: PsAssignmentStatus,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(workspaceId, id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  // Rule 3: Validate status transition
  validateStatusTransition(existing.status as PsAssignmentStatus, status);

  const updated = await repo.updateResourceAssignmentStatus(workspaceId, id, status, actorId);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "resource_assignment.status_change",
    entityType: "ps_resource_assignment",
    entityId: id,
    previousValue: { status: existing.status },
    newValue: { status },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_assignment.status_change",
    targetType: "ps_resource_assignment",
    targetId: id,
  });

  return updated;
}

export async function deleteResourceAssignment(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(workspaceId, id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  const deleted = await repo.deleteResourceAssignment(workspaceId, id);
  if (!deleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "resource_assignment.delete",
    entityType: "ps_resource_assignment",
    entityId: id,
    previousValue: {
      assignmentRole: existing.assignmentRole,
      assigneeDisplayName: existing.assigneeDisplayName,
      status: existing.status,
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "resource_assignment.delete",
    targetType: "ps_resource_assignment",
    targetId: id,
  });

  return { success: true };
}

export async function getAssignmentSummary(
  workspaceId: number,
  psSystemId: number,
): Promise<AssignmentSummary> {
  const requests = await repo.listResourceRequestsBySystem(workspaceId, psSystemId);
  const assignments = await repo.listResourceAssignmentsBySystem(workspaceId, psSystemId);

  return computeAssignmentSummary(
    psSystemId,
    requests.map((r) => ({ id: r.id, role: r.role, quantity: r.quantity })),
    assignments,
  );
}

// ── Monitoring ────────────────────────────────────────────────────────

export async function getMonitoringSummary(workspaceId: number): Promise<MonitoringSummary> {
  const [systems, wizard, demand, assignments, fulfillment, activity] = await Promise.all([
    getSystemMetrics(workspaceId),
    getWizardMetrics(workspaceId),
    getDemandMetrics(workspaceId),
    getAssignmentMetrics(workspaceId),
    getFulfillmentMetrics(workspaceId),
    getRecentActivity(workspaceId),
  ]);

  return { systems, wizard, demand, assignments, fulfillment, activity };
}
