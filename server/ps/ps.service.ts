/**
 * PS Module — Service Layer
 *
 * Orchestrates repository calls and enforces minimal business rules.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import { logActivity } from "../modules/registry";
import { classifyScenario as runLegacyClassifier } from "./ps.classifier";
import { loadActiveMatrix, evaluateMatrix } from "./ps.matrix-engine";
import * as matrixAdmin from "./ps.matrix-admin";
import * as matrixImport from "./ps.matrix-import";
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
  MatrixEvaluationInput,
  MatrixEvaluationResult,
  PsMatrixVersionStatus,
  MatrixImportSourceType,
  MatrixImportPayload,
  CreateMatrixImportRecordInput,
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

  // Merge matrixVersion into resultPayload if provided
  const resultPayload = input.resultPayload || {};
  if (input.matrixVersion) {
    (resultPayload as any).matrixVersion = input.matrixVersion;
  }

  const run = await repo.createWizardRun({
    workspaceId: input.workspaceId,
    scenarioText: input.scenarioText.trim(),
    inputPayload: input.inputPayload,
    resultPayload,
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

// ── Classification (legacy fallback) ──────────────────────────────────

export function classifyScenario(input: ClassificationInput) {
  return runLegacyClassifier(input);
}

// ── Matrix Classification Engine ─────────────────────────────────────

export async function evaluateMatrixClassification(
  input: MatrixEvaluationInput,
): Promise<MatrixEvaluationResult> {
  const matrix = await loadActiveMatrix(input.workspaceId);

  if (!matrix) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active matrix version found. Falling back to legacy classifier is required.",
    });
  }

  if (matrix.questions.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Active matrix has no questions defined",
    });
  }

  if (matrix.scopes.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Active matrix has no scopes defined",
    });
  }

  return evaluateMatrix(matrix, input.answers);
}

/**
 * Check if a matrix-based classification is available.
 * Used by the wizard to decide between matrix mode and legacy mode.
 */
export async function hasActiveMatrix(workspaceId: number): Promise<boolean> {
  const version = await repo.getActiveMatrixVersion(workspaceId);
  return version !== null;
}

// ── Matrix Version Management ────────────────────────────────────────

export async function getActiveMatrixVersion(workspaceId: number) {
  return repo.getActiveMatrixVersion(workspaceId);
}

export async function listMatrixVersions(workspaceId: number) {
  return repo.listMatrixVersions(workspaceId);
}

export async function createMatrixVersion(
  workspaceId: number,
  version: string,
  label: string,
  actorId: number,
) {
  const created = await repo.createMatrixVersion({
    workspaceId,
    version,
    label,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_version.create",
    entityType: "ps_matrix_version",
    entityId: created.id,
    newValue: { version: created.version, label: created.label },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_version.create",
    targetType: "ps_matrix_version",
    targetId: created.id,
  });

  return created;
}

export async function activateMatrixVersion(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  const activated = await repo.activateMatrixVersion(workspaceId, id);
  if (!activated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_version.activate",
    entityType: "ps_matrix_version",
    entityId: id,
    newValue: { status: "active" },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_version.activate",
    targetType: "ps_matrix_version",
    targetId: id,
  });

  return activated;
}

// ── Scope Management ─────────────────────────────────────────────────

export async function listMatrixScopes(workspaceId: number, versionId: number) {
  // Verify version exists and belongs to workspace
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listScopesByVersion(versionId);
}

export async function createMatrixScope(
  workspaceId: number,
  versionId: number,
  code: string,
  label: string,
  description: string | null,
  family: string | null,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const scope = await repo.createScope({
    versionId,
    code,
    label,
    description,
    family,
    isActive: 1,
  });

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_scope.create",
    entityType: "ps_scope_registry",
    entityId: scope.id,
    newValue: { code, label, versionId },
  });

  return scope;
}

export async function createMatrixScopesBatch(
  workspaceId: number,
  versionId: number,
  items: Array<{ code: string; label: string; description?: string; family?: string }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const rows = items.map((item) => ({
    versionId,
    code: item.code,
    label: item.label,
    description: item.description || null,
    family: item.family || null,
    isActive: 1,
  }));

  return repo.createScopesBatch(rows);
}

// ── Question Management ──────────────────────────────────────────────

export async function listMatrixQuestions(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listQuestionsByVersion(versionId);
}

export async function createMatrixQuestion(
  workspaceId: number,
  versionId: number,
  code: string,
  label: string,
  description: string | null,
  sortOrder: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const question = await repo.createQuestion({
    versionId,
    code,
    label,
    description,
    sortOrder,
    isActive: 1,
  });

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_question.create",
    entityType: "ps_matrix_question",
    entityId: question.id,
    newValue: { code, label, versionId },
  });

  return question;
}

export async function createMatrixQuestionsBatch(
  workspaceId: number,
  versionId: number,
  items: Array<{ code: string; label: string; description?: string; sortOrder?: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const rows = items.map((item, i) => ({
    versionId,
    code: item.code,
    label: item.label,
    description: item.description || null,
    sortOrder: item.sortOrder ?? i,
    isActive: 1,
  }));

  return repo.createQuestionsBatch(rows);
}

// ── Cell Management ──────────────────────────────────────────────────

export async function listMatrixCells(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listCellsByVersion(versionId);
}

export async function createMatrixCellsBatch(
  workspaceId: number,
  versionId: number,
  items: Array<{ questionId: number; scopeId: number; weight: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const rows = items.map((item) => ({
    versionId,
    questionId: item.questionId,
    scopeId: item.scopeId,
    weight: item.weight,
  }));

  return repo.createCellsBatch(rows);
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

// ── Matrix Admin — Extended Operations ──────────────────────────────

export async function getMatrixOverview(workspaceId: number) {
  return matrixAdmin.getMatrixOverview(workspaceId);
}

export async function duplicateMatrixVersion(
  workspaceId: number,
  sourceVersionId: number,
  newVersion: string,
  newLabel: string,
  actorId: number,
) {
  return matrixAdmin.duplicateMatrixVersion(workspaceId, sourceVersionId, newVersion, newLabel, actorId);
}

export async function archiveMatrixVersion(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  return matrixAdmin.archiveMatrixVersion(workspaceId, id, actorId);
}

export async function activateMatrixVersionValidated(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  const result = await matrixAdmin.activateMatrixVersionWithValidation(workspaceId, id, actorId);
  if (!result) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_version.activate",
    entityType: "ps_matrix_version",
    entityId: id,
    newValue: { status: "active" },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_version.activate",
    targetType: "ps_matrix_version",
    targetId: id,
  });

  return result;
}

export async function getMatrixValidationReport(workspaceId: number, versionId: number) {
  return matrixAdmin.validateMatrixVersion(workspaceId, versionId);
}

// ── Scope Editing ─────────────────────────────────────────────────────

export async function updateMatrixScope(
  workspaceId: number,
  versionId: number,
  id: number,
  data: { code?: string; label?: string; description?: string; family?: string; isActive?: number },
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const updated = await repo.updateScope(id, versionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scope not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_scope.update",
    entityType: "ps_scope_registry",
    entityId: id,
    newValue: data,
  });

  return updated;
}

export async function listAllMatrixScopes(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.getAllScopesByVersion(versionId);
}

// ── Question Editing ──────────────────────────────────────────────────

export async function updateMatrixQuestion(
  workspaceId: number,
  versionId: number,
  id: number,
  data: { code?: string; label?: string; description?: string; sortOrder?: number; isActive?: number },
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const updated = await repo.updateQuestion(id, versionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_question.update",
    entityType: "ps_matrix_question",
    entityId: id,
    newValue: data,
  });

  return updated;
}

export async function listAllMatrixQuestions(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.getAllQuestionsByVersion(versionId);
}

export async function reorderMatrixQuestions(
  workspaceId: number,
  versionId: number,
  orderedIds: number[],
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  await repo.updateQuestionSortOrders(versionId, orderedIds);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_question.reorder",
    entityType: "ps_matrix_question",
    entityId: versionId,
    newValue: { orderedIds },
  });

  return { success: true };
}

// ── Cell Editing ──────────────────────────────────────────────────────

export async function upsertMatrixCell(
  workspaceId: number,
  versionId: number,
  questionId: number,
  scopeId: number,
  weight: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const cell = await repo.upsertCell(versionId, questionId, scopeId, weight);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_cell.upsert",
    entityType: "ps_matrix_cell",
    entityId: cell.id,
    newValue: { questionId, scopeId, weight },
  });

  return cell;
}

export async function bulkUpsertMatrixCells(
  workspaceId: number,
  versionId: number,
  items: Array<{ questionId: number; scopeId: number; weight: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const results = await repo.upsertCellsBatch(versionId, items);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_cell.bulk_upsert",
    entityType: "ps_matrix_cell",
    entityId: versionId,
    newValue: { cellCount: results.length },
  });

  return results;
}

// ── Matrix Grid (for grid editor UI) ──────────────────────────────────

export async function getMatrixGrid(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const [scopes, questions, cells] = await Promise.all([
    repo.getAllScopesByVersion(versionId),
    repo.getAllQuestionsByVersion(versionId),
    repo.listCellsByVersion(versionId),
  ]);

  return { version, scopes, questions, cells };
}

// ── Import Operations ─────────────────────────────────────────────────

export async function previewMatrixImport(
  workspaceId: number,
  sourceType: MatrixImportSourceType,
  sourceName: string | undefined,
  payload: MatrixImportPayload,
  actorId: number,
) {
  return matrixImport.previewMatrixImport(workspaceId, sourceType, sourceName, payload, actorId);
}

export async function commitMatrixImport(
  workspaceId: number,
  importId: number,
  targetVersionId: number | undefined,
  newVersion: string | undefined,
  newLabel: string | undefined,
  actorId: number,
) {
  return matrixImport.commitMatrixImport(workspaceId, importId, targetVersionId, newVersion, newLabel, actorId);
}

export async function listMatrixImports(workspaceId: number) {
  return repo.listMatrixImports(workspaceId);
}

// ── Matrix Version by ID ──────────────────────────────────────────────

export async function getMatrixVersionById(workspaceId: number, id: number) {
  const version = await repo.getMatrixVersionById(workspaceId, id);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return version;
}

// ── Scope Matrix Profile ──────────────────────────────────────────────

export async function getScopeProfile(workspaceId: number, scopeId: number) {
  // Verify scope exists by checking the registry (scope → version → workspace)
  const profile = await repo.getScopeProfileByScopeId(scopeId);
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scope matrix profile not found" });
  }
  return profile;
}

export async function listScopeProfiles(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listScopeProfilesByVersion(versionId);
}

// ── Matrix Headers ────────────────────────────────────────────────────

export async function listMatrixHeaders(workspaceId: number, versionId: number) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listHeadersByVersion(versionId);
}

export async function listMatrixHeadersByType(
  workspaceId: number,
  versionId: number,
  headerType: string,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listHeadersByType(versionId, headerType);
}

export async function parseAndStoreHeaders(
  workspaceId: number,
  versionId: number,
  rawHeaders: string[],
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  // Use the header parsing engine
  const { parseHeaderRow } = await import("./ps.matrix-headers");
  const result = parseHeaderRow(rawHeaders);

  if (!result.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Header parsing failed: ${result.errors.join("; ")}`,
    });
  }

  // Clear existing headers for this version, then insert fresh
  await repo.deleteHeadersByVersion(versionId);

  const headerRows = result.headers.map((h) => ({
    versionId,
    headerKey: h.headerKey,
    headerLabel: h.headerLabel,
    headerType: h.headerType,
    isActive: 1,
    sortOrder: h.sortOrder,
  }));

  const created = await repo.createHeadersBatch(headerRows);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_headers.parse_and_store",
    entityType: "ps_scope_matrix_headers",
    entityId: versionId,
    newValue: {
      headerCount: created.length,
      typeMap: result.typeMap,
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_headers.parse_and_store",
    targetType: "ps_matrix_version",
    targetId: versionId,
  });

  return {
    headers: created,
    typeMap: result.typeMap,
    warnings: result.warnings,
  };
}

// ── Import Record Creation ────────────────────────────────────────────

export async function createMatrixImportRecord(
  input: CreateMatrixImportRecordInput,
  actorId: number,
) {
  const record = await repo.createMatrixImport({
    workspaceId: input.workspaceId,
    versionId: input.versionId ?? null,
    importType: input.importType,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sheetName: input.sheetName,
    totalRows: input.totalRows,
    importedRows: input.importedRows,
    skippedRows: input.skippedRows,
    rawPayloadJson: input.rawPayloadJson ?? null,
    importStatus: "pending",
    warningsJson: input.warningsJson ?? null,
    createdBy: actorId,
  });

  await logPsAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "matrix_import.create_record",
    entityType: "ps_matrix_import",
    entityId: record.id,
    newValue: {
      importType: input.importType,
      sourceType: input.sourceType,
      sheetName: input.sheetName,
      totalRows: input.totalRows,
    },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_import.create_record",
    targetType: "ps_matrix_import",
    targetId: record.id,
  });

  return record;
}

// ── Seed ──────────────────────────────────────────────────────────────

export async function seedScopeMatrix(workspaceId: number, actorId: number) {
  const { seedScopeMatrix: runSeed } = await import("./ps.seed");
  const result = await runSeed(workspaceId, actorId);

  await logPsAudit({
    workspaceId,
    actorId,
    action: "scope_matrix.seed",
    entityType: "ps_matrix_version",
    entityId: result.versionId,
    newValue: {
      version: result.version,
      scopesInserted: result.scopesInserted,
      profilesInserted: result.profilesInserted,
      importRecordId: result.importRecordId,
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "scope_matrix.seed",
    targetType: "ps_matrix_version",
    targetId: result.versionId,
  });

  return result;
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
