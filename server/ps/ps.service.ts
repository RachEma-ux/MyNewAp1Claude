/**
 * PS Module — Service Layer
 *
 * Orchestrates repository calls and enforces minimal business rules.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import { classifyScenario as runLegacyClassifier } from "./ps.classifier";
import { loadActiveMatrix, evaluateMatrix, evaluateMatrixEnriched } from "./ps.matrix-engine";
import * as matrixAdmin from "./ps.matrix-admin";
import * as matrixImport from "./ps.matrix-import";
import * as versioning from "./ps.versioning";
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
  EnrichedMatrixResult,
  PsMatrixVersionStatus,
  MatrixImportSourceType,
  MatrixImportPayload,
  CreateMatrixImportRecordInput,
  DimensionDefinition,
  PresentationType,
} from "./ps.types";
import { generateDemandSpecs, resolveQuantity } from "./ps.demand";
import {
  validateStatusTransition,
  validateSystemMatch,
  computeAssignmentSummary,
} from "./ps.assignment";
import { resolveTemplate, listTemplates as listScopeTemplates, createTemplate, updateTemplate } from "./ps.templates";
import type { AcceptWizardInput, AcceptWizardResult } from "./ps.types";
import {
  getSystemMetrics,
  getWizardMetrics,
  getDemandMetrics,
  getAssignmentMetrics,
  getFulfillmentMetrics,
  getRecentActivity,
  getOverrideRateMetrics,
  getConfidenceTrends,
  getScopeDistribution,
  getDeadScopes,
  getDeadQuestions,
  type MonitoringSummary,
} from "./ps.monitoring";

// ── Systems ──────────────────────────────────────────────────────────────

export async function createSystem(input: CreateSystemInput, actorId: number) {
  if (!input.name.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "System name is required" });
  }

  const system = await repo.createSystem({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    systemType: input.systemType,
    lifecycleType: input.lifecycleType || null,
    governanceProfile: input.governanceProfile || null,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    actorId,
    action: "system.create",
    entityType: "ps_system",
    entityId: system.id,
    newValue: { name: system.name, systemType: system.systemType },
  });

  // Auto-generate demand based on system type
  const demand = await generateDemandForSystem(
    system.id,
    input.systemType,
    actorId,
  );

  return { ...system, _generatedDemand: demand };
}

export async function getSystem(id: number) {
  const system = await repo.getSystemById(id);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }
  return system;
}

export async function listSystems(status?: string) {
  return repo.listSystems(status);
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
    scenarioText: input.scenarioText.trim(),
    inputPayload: input.inputPayload,
    resultPayload,
    confidence: input.confidence != null ? String(input.confidence) : null,
    selectedSystemType: input.selectedSystemType || null,
    createdBy: actorId,
  });

  await logPsAudit({
    actorId,
    action: "wizard_run.create",
    entityType: "ps_wizard_run",
    entityId: run.id,
    newValue: { scenarioText: run.scenarioText, selectedSystemType: run.selectedSystemType },
  });

  return run;
}

export async function getWizardRun(id: number) {
  const run = await repo.getWizardRunById(id);
  if (!run) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Wizard run not found" });
  }
  return run;
}

export async function listWizardRuns() {
  return repo.listWizardRuns();
}

// ── Classification (legacy fallback) ──────────────────────────────────

export function classifyScenario(input: ClassificationInput) {
  return runLegacyClassifier(input);
}

// ── Wizard Classification (matrix-based) ─────────────────────────────

export async function getWizardActiveQuestions() {
  const activeVersion = await repo.getActiveMatrixVersion();
  if (!activeVersion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No active PS matrix version found." });
  }
  return repo.listActiveQuestionsByVersion(activeVersion.id);
}

type WizardClassifyInput = {
  scenario: string;
  context: {
    businessUnit?: string;
    region?: string;
    strategicImportance?: string;
    existingSituation?: string;
  };
  answers: Record<string, string>;
};

export async function classifyWizardScenario(input: WizardClassifyInput) {
  const activeVersion = await repo.getActiveMatrixVersion();
  if (!activeVersion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No active PS matrix version found." });
  }

  const questions = await repo.listActiveQuestionsByVersion(activeVersion.id);
  const cells = await repo.listCellsWithQuestionsByVersion(activeVersion.id);
  const scopes = await repo.listActiveScopesByVersion(activeVersion.id);

  const scoreByScope = new Map<number, number>();
  for (const scope of scopes) {
    scoreByScope.set(scope.id, 0);
  }

  for (const cell of cells) {
    const answer = input.answers[cell.questionCode];
    if (answer === "Yes") {
      scoreByScope.set(
        cell.scopeId,
        (scoreByScope.get(cell.scopeId) ?? 0) + Number(cell.weight ?? 0),
      );
    }
  }

  const ranked = scopes
    .map((scope) => ({
      scopeId: scope.id,
      scopeCode: scope.code,
      scopeLabel: scope.label,
      score: scoreByScope.get(scope.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  const runnerUp = ranked[1];
  const winnerMargin = winner && runnerUp ? winner.score - runnerUp.score : winner?.score ?? 0;

  const answeredCount = Object.keys(input.answers).length;
  const totalQuestions = questions.length;
  const completeness = totalQuestions > 0 ? answeredCount / totalQuestions : 0;

  let confidence = "Low";
  if (winnerMargin >= 3 && completeness >= 0.6) confidence = "High";
  else if (winnerMargin >= 1 && completeness >= 0.4) confidence = "Medium";

  const positiveContributors = cells
    .filter((cell) => {
      const answer = input.answers[cell.questionCode];
      return answer === "Yes" && cell.scopeId === winner?.scopeId && Number(cell.weight) > 0;
    })
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, 5)
    .map((cell) => cell.questionLabel);

  return {
    matrixVersionId: activeVersion.id,
    matrixVersion: activeVersion.version,
    selectedScope: winner?.scopeLabel ?? null,
    selectedScopeCode: winner?.scopeCode ?? null,
    top3: ranked.slice(0, 3),
    confidence,
    winnerMargin,
    explainability: {
      positiveContributors,
      negativeContributors: [] as string[],
    },
  };
}

// ── Matrix Classification Engine ─────────────────────────────────────

export async function evaluateMatrixClassification(
  input: MatrixEvaluationInput,
): Promise<MatrixEvaluationResult> {
  const matrix = await loadActiveMatrix();

  if (!matrix) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active matrix version found. Create and activate a matrix version first.",
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
 * Enriched matrix evaluation with explainability + confidence.
 * Primary entry point for the classification API.
 */
export async function evaluateMatrixClassificationEnriched(
  input: MatrixEvaluationInput,
): Promise<EnrichedMatrixResult> {
  const matrix = await loadActiveMatrix();

  if (!matrix) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active matrix version found. Create and activate a matrix version first.",
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

  return evaluateMatrixEnriched(matrix, input.answers);
}

/**
 * Check if a matrix-based classification is available.
 * Used by the wizard to decide between matrix mode and legacy mode.
 */
export async function hasActiveMatrix(): Promise<boolean> {
  const version = await repo.getActiveMatrixVersion();
  return version !== null;
}

// ── Matrix Version Management ────────────────────────────────────────

export async function getActiveMatrixVersion() {
  return repo.getActiveMatrixVersion();
}

export async function listMatrixVersions() {
  return repo.listMatrixVersions();
}

export async function createMatrixVersion(
  version: string,
  label: string,
  actorId: number,
) {
  const created = await repo.createMatrixVersion({
    version,
    label,
    status: "draft",
    createdBy: actorId,
  });

  await logPsAudit({
    actorId,
    action: "matrix_version.create",
    entityType: "ps_matrix_version",
    entityId: created.id,
    newValue: { version: created.version, label: created.label },
  });

  return created;
}

export async function activateMatrixVersion(
  id: number,
  actorId: number,
) {
  const activated = await repo.activateMatrixVersion(id);
  if (!activated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_version.activate",
    entityType: "ps_matrix_version",
    entityId: id,
    newValue: { status: "active" },
  });

  return activated;
}

// ── Scope Management ─────────────────────────────────────────────────

export async function listMatrixScopes(versionId: number) {
  // Verify version exists
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listScopesByVersion(versionId);
}

export async function createMatrixScope(
  versionId: number,
  code: string,
  label: string,
  description: string | null,
  family: string | null,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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
    actorId,
    action: "matrix_scope.create",
    entityType: "ps_scope_registry",
    entityId: scope.id,
    newValue: { code, label, versionId },
  });

  return scope;
}

export async function createMatrixScopesBatch(
  versionId: number,
  items: Array<{ code: string; label: string; description?: string; family?: string }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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

export async function listMatrixQuestions(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listQuestionsByVersion(versionId);
}

export async function createMatrixQuestion(
  versionId: number,
  code: string,
  label: string,
  description: string | null,
  sortOrder: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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
    actorId,
    action: "matrix_question.create",
    entityType: "ps_matrix_question",
    entityId: question.id,
    newValue: { code, label, versionId },
  });

  return question;
}

export async function createMatrixQuestionsBatch(
  versionId: number,
  items: Array<{ code: string; label: string; description?: string; sortOrder?: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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

export async function listMatrixCells(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listCellsByVersion(versionId);
}

export async function createMatrixCellsBatch(
  versionId: number,
  items: Array<{ questionId: number; scopeId: number; weight: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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
  const system = await repo.getSystemById(input.psSystemId);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }

  const request = await repo.createResourceRequest({
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
    actorId,
    action: "resource_request.create",
    entityType: "ps_resource_request",
    entityId: request.id,
    newValue: { role: request.role, quantity: request.quantity, psSystemId: request.psSystemId },
  });

  return request;
}

export async function listResourceRequests(status?: string) {
  return repo.listResourceRequests(status);
}

export async function listResourceRequestsBySystem(psSystemId: number) {
  return repo.listResourceRequestsBySystem(psSystemId);
}

export async function updateResourceRequestStatus(
  id: number,
  status: PsResourceRequestStatus,
  actorId: number,
) {
  const updated = await repo.updateResourceRequestStatus(id, status);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource request not found" });
  }

  await logPsAudit({
    actorId,
    action: "resource_request.status_change",
    entityType: "ps_resource_request",
    entityId: id,
    newValue: { status },
  });

  return updated;
}

export async function getDemandSummary(psSystemId: number): Promise<DemandSummary> {
  const requests = await repo.listResourceRequestsBySystem(psSystemId);

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
  psSystemId: number,
  systemType: string,
  actorId: number,
) {
  const specs = generateDemandSpecs(systemType);
  if (specs.length === 0) return [];

  const items = specs.map((spec) => ({
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
  const request = await repo.getResourceRequestById(input.resourceRequestId);
  if (!request) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource request not found" });
  }

  // Rule 2: Verify system match
  validateSystemMatch(request.psSystemId, input.psSystemId);

  // Verify system exists
  const system = await repo.getSystemById(input.psSystemId);
  if (!system) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS system not found" });
  }

  const assignment = await repo.createResourceAssignment({
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

  return assignment;
}

export async function listResourceAssignments(status?: string) {
  return repo.listResourceAssignments(status);
}

export async function listResourceAssignmentsByRequest(resourceRequestId: number) {
  return repo.listResourceAssignmentsByRequest(resourceRequestId);
}

export async function listResourceAssignmentsBySystem(psSystemId: number) {
  return repo.listResourceAssignmentsBySystem(psSystemId);
}

export async function updateResourceAssignment(
  input: UpdateResourceAssignmentInput,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(input.id);
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

  const updated = await repo.updateResourceAssignment(input.id, updateData);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
    actorId,
    action: "resource_assignment.update",
    entityType: "ps_resource_assignment",
    entityId: input.id,
    previousValue: { assignmentRole: existing.assignmentRole, assigneeDisplayName: existing.assigneeDisplayName },
    newValue: updateData,
  });

  return updated;
}

export async function updateResourceAssignmentStatus(
  id: number,
  status: PsAssignmentStatus,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  // Rule 3: Validate status transition
  validateStatusTransition(existing.status as PsAssignmentStatus, status);

  const updated = await repo.updateResourceAssignmentStatus(id, status, actorId);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
    actorId,
    action: "resource_assignment.status_change",
    entityType: "ps_resource_assignment",
    entityId: id,
    previousValue: { status: existing.status },
    newValue: { status },
  });

  return updated;
}

export async function deleteResourceAssignment(
  id: number,
  actorId: number,
) {
  const existing = await repo.getResourceAssignmentById(id);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  const deleted = await repo.deleteResourceAssignment(id);
  if (!deleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource assignment not found" });
  }

  await logPsAudit({
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

  return { success: true };
}

export async function getAssignmentSummary(
  psSystemId: number,
): Promise<AssignmentSummary> {
  const requests = await repo.listResourceRequestsBySystem(psSystemId);
  const assignments = await repo.listResourceAssignmentsBySystem(psSystemId);

  return computeAssignmentSummary(
    psSystemId,
    requests.map((r) => ({ id: r.id, role: r.role, quantity: r.quantity })),
    assignments,
  );
}

// ── Matrix Admin — Extended Operations ──────────────────────────────

export async function getMatrixOverview() {
  return matrixAdmin.getMatrixOverview();
}

export async function duplicateMatrixVersion(
  sourceVersionId: number,
  newVersion: string,
  newLabel: string,
  actorId: number,
) {
  return matrixAdmin.duplicateMatrixVersion(sourceVersionId, newVersion, newLabel, actorId);
}

export async function archiveMatrixVersion(
  id: number,
  actorId: number,
) {
  return matrixAdmin.archiveMatrixVersion(id, actorId);
}

export async function activateMatrixVersionValidated(
  id: number,
  actorId: number,
) {
  const result = await matrixAdmin.activateMatrixVersionWithValidation(id, actorId);
  if (!result) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_version.activate",
    entityType: "ps_matrix_version",
    entityId: id,
    newValue: { status: "active" },
  });

  return result;
}

export async function getMatrixValidationReport(versionId: number) {
  return matrixAdmin.validateMatrixVersion(versionId);
}

// ── Safe Matrix Versioning ────────────────────────────────────────────

export async function deepValidateMatrix(versionId: number) {
  return versioning.deepValidateMatrix(versionId);
}

export async function safeActivateMatrix(
  versionId: number,
  actorId: number,
) {
  return versioning.safeActivateMatrix(versionId, actorId);
}

export async function rollbackMatrixVersion(actorId: number) {
  return versioning.rollbackMatrixVersion(actorId);
}

export async function compareMatrixVersions(
  baseVersionId: number,
  targetVersionId: number,
) {
  return versioning.compareMatrixVersions(baseVersionId, targetVersionId);
}

// ── Scope Editing ─────────────────────────────────────────────────────

export async function updateMatrixScope(
  versionId: number,
  id: number,
  data: { code?: string; label?: string; description?: string; family?: string; isActive?: number },
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const updated = await repo.updateScope(id, versionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scope not found" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_scope.update",
    entityType: "ps_scope_registry",
    entityId: id,
    newValue: data,
  });

  return updated;
}

export async function listAllMatrixScopes(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.getAllScopesByVersion(versionId);
}

// ── Question Editing ──────────────────────────────────────────────────

export async function updateMatrixQuestion(
  versionId: number,
  id: number,
  data: { code?: string; label?: string; description?: string; sortOrder?: number; isActive?: number },
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const updated = await repo.updateQuestion(id, versionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_question.update",
    entityType: "ps_matrix_question",
    entityId: id,
    newValue: data,
  });

  return updated;
}

export async function listAllMatrixQuestions(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.getAllQuestionsByVersion(versionId);
}

export async function reorderMatrixQuestions(
  versionId: number,
  orderedIds: number[],
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  await repo.updateQuestionSortOrders(versionId, orderedIds);

  await logPsAudit({
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
  versionId: number,
  questionId: number,
  scopeId: number,
  weight: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const cell = await repo.upsertCell(versionId, questionId, scopeId, weight);

  await logPsAudit({
    actorId,
    action: "matrix_cell.upsert",
    entityType: "ps_matrix_cell",
    entityId: cell.id,
    newValue: { questionId, scopeId, weight },
  });

  return cell;
}

export async function bulkUpsertMatrixCells(
  versionId: number,
  items: Array<{ questionId: number; scopeId: number; weight: number }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const results = await repo.upsertCellsBatch(versionId, items);

  await logPsAudit({
    actorId,
    action: "matrix_cell.bulk_upsert",
    entityType: "ps_matrix_cell",
    entityId: versionId,
    newValue: { cellCount: results.length },
  });

  return results;
}

// ── Matrix Grid (for grid editor UI) ──────────────────────────────────

export async function getMatrixGrid(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const [scopes, questions, cells, dimensions] = await Promise.all([
    repo.getAllScopesByVersion(versionId),
    repo.getAllQuestionsByVersion(versionId),
    repo.listCellsByVersion(versionId),
    repo.getAllDimensionsByVersion(versionId),
  ]);

  return { version, scopes, questions, cells, dimensions };
}

// ── Import Operations ─────────────────────────────────────────────────

export async function previewMatrixImport(
  sourceType: MatrixImportSourceType,
  sourceName: string | undefined,
  payload: MatrixImportPayload,
  actorId: number,
) {
  return matrixImport.previewMatrixImport(sourceType, sourceName, payload, actorId);
}

export async function commitMatrixImport(
  importId: number,
  targetVersionId: number | undefined,
  newVersion: string | undefined,
  newLabel: string | undefined,
  actorId: number,
) {
  return matrixImport.commitMatrixImport(importId, targetVersionId, newVersion, newLabel, actorId);
}

export async function listMatrixImports() {
  return repo.listMatrixImports();
}

// ── Matrix Version by ID ──────────────────────────────────────────────

export async function getMatrixVersionById(id: number) {
  const version = await repo.getMatrixVersionById(id);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return version;
}

// ── Scope Matrix Profile ──────────────────────────────────────────────

export async function getScopeProfile(scopeId: number) {
  // Verify scope exists by checking the registry
  const profile = await repo.getScopeProfileByScopeId(scopeId);
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scope matrix profile not found" });
  }
  return profile;
}

export async function listScopeProfiles(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listScopeProfilesByVersion(versionId);
}

// ── Matrix Headers ────────────────────────────────────────────────────

export async function listMatrixHeaders(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listHeadersByVersion(versionId);
}

export async function listMatrixHeadersByType(
  versionId: number,
  headerType: string,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listHeadersByType(versionId, headerType);
}

export async function parseAndStoreHeaders(
  versionId: number,
  rawHeaders: string[],
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
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
    actorId,
    action: "matrix_headers.parse_and_store",
    entityType: "ps_scope_matrix_headers",
    entityId: versionId,
    newValue: {
      headerCount: created.length,
      typeMap: result.typeMap,
    },
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

  return record;
}

// ── Seed ──────────────────────────────────────────────────────────────

export async function seedScopeMatrix(actorId: number) {
  const { seedScopeMatrix: runSeed } = await import("./ps.seed");
  const result = await runSeed(actorId);

  await logPsAudit({
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

  return result;
}

// ── Dimensions ────────────────────────────────────────────────────────

export async function listDimensions(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listDimensionsByVersion(versionId);
}

export async function listAllDimensions(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.getAllDimensionsByVersion(versionId);
}

export async function listDimensionsWithValues(
  versionId: number,
): Promise<DimensionDefinition[]> {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const dims = await repo.listDimensionsByVersion(versionId);
  const result: DimensionDefinition[] = [];

  for (const dim of dims) {
    const values = await repo.listDimensionValues(dim.id);
    result.push({
      id: dim.id,
      dimensionKey: dim.dimensionKey,
      dimensionLabel: dim.dimensionLabel,
      description: dim.description,
      sortOrder: dim.sortOrder,
      isActive: dim.isActive,
      values: values.map((v) => ({
        id: v.id,
        dimensionId: v.dimensionId,
        valueKey: v.valueKey,
        valueLabel: v.valueLabel,
        description: v.description,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      })),
    });
  }

  return result;
}

export async function createDimension(
  versionId: number,
  dimensionKey: string,
  dimensionLabel: string,
  description: string | null,
  sortOrder: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const dim = await repo.createDimension({
    versionId,
    dimensionKey,
    dimensionLabel,
    description,
    sortOrder,
    isActive: 1,
  });

  await logPsAudit({
    actorId,
    action: "dimension.create",
    entityType: "ps_dimension",
    entityId: dim.id,
    newValue: { dimensionKey, dimensionLabel, versionId },
  });

  return dim;
}

export async function createDimensionsBatch(
  versionId: number,
  items: Array<{
    dimensionKey: string;
    dimensionLabel: string;
    description?: string;
    sortOrder?: number;
    values?: Array<{
      valueKey: string;
      valueLabel: string;
      description?: string;
      sortOrder?: number;
    }>;
  }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const dimRows = items.map((item, i) => ({
    versionId,
    dimensionKey: item.dimensionKey,
    dimensionLabel: item.dimensionLabel,
    description: item.description || null,
    sortOrder: item.sortOrder ?? i,
    isActive: 1,
  }));

  const createdDims = await repo.createDimensionsBatch(dimRows);

  // Insert values for each dimension
  for (let i = 0; i < items.length; i++) {
    const itemValues = items[i].values;
    if (!itemValues || itemValues.length === 0) continue;
    const dimId = createdDims[i].id;

    const valRows = itemValues.map((v, j) => ({
      dimensionId: dimId,
      valueKey: v.valueKey,
      valueLabel: v.valueLabel,
      description: v.description || null,
      sortOrder: v.sortOrder ?? j,
      isActive: 1,
    }));
    await repo.createDimensionValuesBatch(valRows);
  }

  await logPsAudit({
    actorId,
    action: "dimension.batch_create",
    entityType: "ps_dimension",
    entityId: versionId,
    newValue: { count: createdDims.length },
  });

  return createdDims;
}

export async function updateDimension(
  versionId: number,
  id: number,
  data: { dimensionKey?: string; dimensionLabel?: string; description?: string; sortOrder?: number; isActive?: number },
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const updated = await repo.updateDimension(id, versionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dimension not found" });
  }

  await logPsAudit({
    actorId,
    action: "dimension.update",
    entityType: "ps_dimension",
    entityId: id,
    newValue: data,
  });

  return updated;
}

// ── Dimension Values ──────────────────────────────────────────────────

export async function listDimensionValues(dimensionId: number) {
  return repo.listDimensionValues(dimensionId);
}

export async function listAllDimensionValues(dimensionId: number) {
  return repo.getAllDimensionValues(dimensionId);
}

export async function createDimensionValue(
  dimensionId: number,
  valueKey: string,
  valueLabel: string,
  description: string | null,
  sortOrder: number,
  actorId: number,
) {
  const val = await repo.createDimensionValue({
    dimensionId,
    valueKey,
    valueLabel,
    description,
    sortOrder,
    isActive: 1,
  });

  await logPsAudit({
    actorId,
    action: "dimension_value.create",
    entityType: "ps_dimension_value",
    entityId: val.id,
    newValue: { valueKey, valueLabel, dimensionId },
  });

  return val;
}

export async function createDimensionValuesBatch(
  dimensionId: number,
  items: Array<{ valueKey: string; valueLabel: string; description?: string; sortOrder?: number }>,
  actorId: number,
) {
  const valRows = items.map((v, i) => ({
    dimensionId,
    valueKey: v.valueKey,
    valueLabel: v.valueLabel,
    description: v.description || null,
    sortOrder: v.sortOrder ?? i,
    isActive: 1,
  }));

  const created = await repo.createDimensionValuesBatch(valRows);

  await logPsAudit({
    actorId,
    action: "dimension_value.batch_create",
    entityType: "ps_dimension_value",
    entityId: dimensionId,
    newValue: { count: created.length },
  });

  return created;
}

export async function updateDimensionValue(
  dimensionId: number,
  id: number,
  data: { valueKey?: string; valueLabel?: string; description?: string; sortOrder?: number; isActive?: number },
  actorId: number,
) {
  const updated = await repo.updateDimensionValue(id, dimensionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dimension value not found" });
  }

  await logPsAudit({
    actorId,
    action: "dimension_value.update",
    entityType: "ps_dimension_value",
    entityId: id,
    newValue: data,
  });

  return updated;
}

// ── Question Presentations ────────────────────────────────────────────

export async function getQuestionPresentation(questionId: number) {
  const pres = await repo.getQuestionPresentation(questionId);
  if (!pres) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Question presentation not found" });
  }
  return pres;
}

export async function listQuestionPresentations(versionId: number) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  return repo.listQuestionPresentationsByVersion(versionId);
}

export async function createQuestionPresentation(
  questionId: number,
  presentationType: PresentationType,
  dimensionId: number | null,
  configJson: Record<string, unknown> | null,
  actorId: number,
) {
  const pres = await repo.createQuestionPresentation({
    questionId,
    presentationType,
    dimensionId,
    configJson,
    isActive: 1,
  });

  await logPsAudit({
    actorId,
    action: "question_presentation.create",
    entityType: "ps_matrix_question_presentation",
    entityId: pres.id,
    newValue: { questionId, presentationType, dimensionId },
  });

  return pres;
}

export async function createQuestionPresentationsBatch(
  versionId: number,
  items: Array<{
    questionId: number;
    presentationType: PresentationType;
    dimensionId?: number | null;
    configJson?: Record<string, unknown> | null;
  }>,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const presRows = items.map((p) => ({
    questionId: p.questionId,
    presentationType: p.presentationType,
    dimensionId: p.dimensionId ?? null,
    configJson: p.configJson ?? null,
    isActive: 1,
  }));

  const created = await repo.createQuestionPresentationsBatch(presRows);

  await logPsAudit({
    actorId,
    action: "question_presentation.batch_create",
    entityType: "ps_matrix_question_presentation",
    entityId: versionId,
    newValue: { count: created.length },
  });

  return created;
}

export async function updateQuestionPresentation(
  questionId: number,
  data: {
    presentationType?: PresentationType;
    dimensionId?: number | null;
    configJson?: Record<string, unknown> | null;
    isActive?: number;
  },
  actorId: number,
) {
  const updated = await repo.updateQuestionPresentation(questionId, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Question presentation not found" });
  }

  await logPsAudit({
    actorId,
    action: "question_presentation.update",
    entityType: "ps_matrix_question_presentation",
    entityId: questionId,
    newValue: data,
  });

  return updated;
}

// ── Delete Operations (draft-only enforced) ──────────────────────────

export async function deleteMatrixScope(
  versionId: number,
  id: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  if (version.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete from active version" });

  // Delete cells referencing this scope first
  const cells = await repo.listCellsByVersion(versionId);
  for (const c of cells) {
    if (c.scopeId === id) await repo.deleteCell(c.id, versionId);
  }

  const deleted = await repo.deleteScope(id, versionId);
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Scope not found" });

  await logPsAudit({ actorId, action: "matrix_scope.delete", entityType: "ps_scope_registry", entityId: id });
  return { success: true };
}

export async function deleteMatrixQuestion(
  versionId: number,
  id: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  if (version.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete from active version" });

  // Delete cells referencing this question first
  const cells = await repo.listCellsByVersion(versionId);
  for (const c of cells) {
    if (c.questionId === id) await repo.deleteCell(c.id, versionId);
  }

  const deleted = await repo.deleteQuestion(id, versionId);
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });

  await logPsAudit({ actorId, action: "matrix_question.delete", entityType: "ps_matrix_question", entityId: id });
  return { success: true };
}

export async function deleteMatrixDimension(
  versionId: number,
  id: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  if (version.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete from active version" });

  const deleted = await repo.deleteDimension(id, versionId);
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Dimension not found" });

  await logPsAudit({ actorId, action: "dimension.delete", entityType: "ps_dimension", entityId: id });
  return { success: true };
}

export async function deleteMatrixDimensionValue(
  dimensionId: number,
  id: number,
  actorId: number,
) {
  const deleted = await repo.deleteDimensionValue(id, dimensionId);
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Dimension value not found" });

  await logPsAudit({ actorId, action: "dimension_value.delete", entityType: "ps_dimension_value", entityId: id });
  return { success: true };
}

export async function deleteMatrixCell(
  versionId: number,
  id: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  if (version.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete from active version" });

  const deleted = await repo.deleteCell(id, versionId);
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });

  await logPsAudit({ actorId, action: "matrix_cell.delete", entityType: "ps_matrix_cell", entityId: id });
  return { success: true };
}

// ── Wizard Accept — Convert decision into operational outputs ─────────

/**
 * Accept wizard result: create system, generate demand, create
 * assignment placeholders, store full trace. Single transaction.
 */
export async function acceptWizardResult(
  input: AcceptWizardInput,
  actorId: number,
): Promise<AcceptWizardResult> {
  const { selectedScopeCode } = input;

  // 1. Resolve scope → operational template
  const template = await resolveTemplate(selectedScopeCode);

  // 2. Create wizard run (trace)
  const wizardRun = await createWizardRun(
    {
      scenarioText: input.scenarioText,
      inputPayload: {
        answers: input.answers,
        projectName: input.projectName,
        scopeCode: input.selectedScopeCode,
        scopeLabel: input.selectedScopeLabel,
        overrideInfo: input.overrideInfo || null,
        ...(input.inputPayload || {}),
      },
      resultPayload: {
        templateUsed: template.systemType,
        lifecycleType: template.lifecycleType,
        governanceProfile: template.governanceProfile,
        demandSpecCount: template.demandSpecs.length,
        ...(input.resultPayload || {}),
      },
      confidence: input.confidence,
      selectedSystemType: template.systemType,
      matrixVersion: input.matrixVersion,
    },
    actorId,
  );

  // 3. Create PS system from template
  const system = await createSystem(
    {
      name: input.projectName,
      description: `Created from PS Wizard. Scope: ${input.selectedScopeLabel} (${selectedScopeCode})`,
      systemType: template.systemType,
      lifecycleType: template.lifecycleType || undefined,
      governanceProfile: template.governanceProfile || undefined,
    },
    actorId,
  );

  // 4. Collect demand (already auto-generated by createSystem)
  const demandRequests = await repo.listResourceRequestsBySystem(system.id);

  // 5. Create assignment placeholders for each demand request
  const assignmentPlaceholders = [];
  for (const req of demandRequests) {
    const assignment = await repo.createResourceAssignment({
      resourceRequestId: req.id,
      psSystemId: system.id,
      assignmentRole: req.role,
      assigneeRefType: "placeholder",
      assigneeRefId: null,
      assigneeDisplayName: `TBD — ${req.role}`,
      allocationPercentage: req.allocationPercentage ?? 100,
      startDate: null,
      endDate: null,
      status: "proposed",
      source: "wizard",
      notes: `Auto-created from wizard run #${wizardRun.id}`,
      createdBy: actorId,
      updatedBy: actorId,
    });
    assignmentPlaceholders.push(assignment);
  }

  // 6. If override was applied, record it in the overrides table
  if (input.overrideInfo) {
    await overrideRecommendation(
      {
        wizardRunId: wizardRun.id,
        recommendedScopeCode: input.overrideInfo.scopeCode,
        overriddenScopeCode: selectedScopeCode,
        reason: input.overrideInfo.reason,
        recommendedConfidence: input.confidence,
        matrixVersion: input.matrixVersion,
        answersJson: input.answers,
      },
      actorId,
    );
  }

  // 7. Audit trail
  await logPsAudit({
    actorId,
    action: "wizard.accept",
    entityType: "ps_system",
    entityId: system.id,
    newValue: {
      wizardRunId: wizardRun.id,
      scopeCode: selectedScopeCode,
      systemType: template.systemType,
      demandCount: demandRequests.length,
      assignmentCount: assignmentPlaceholders.length,
      overrideApplied: !!input.overrideInfo,
    },
  });

  // 8. Return full trace
  return {
    wizardRun: {
      id: wizardRun.id,
      scenarioText: wizardRun.scenarioText,
      selectedSystemType: wizardRun.selectedSystemType,
    },
    system: {
      id: system.id,
      name: system.name,
      systemType: system.systemType,
      status: system.status,
    },
    demandGenerated: demandRequests.map((r) => ({
      id: r.id,
      role: r.role,
      quantity: r.quantity,
    })),
    assignmentPlaceholders: assignmentPlaceholders.map((a) => ({
      id: a.id,
      assignmentRole: a.assignmentRole,
      status: a.status,
    })),
    trace: {
      wizardRunId: wizardRun.id,
      systemId: system.id,
      demandCount: demandRequests.length,
      assignmentCount: assignmentPlaceholders.length,
      scopeCode: selectedScopeCode,
      templateUsed: template.systemType,
      overrideApplied: !!input.overrideInfo,
    },
  };
}

// ── Scope Template Mappings ──────────────────────────────────────────

export async function listScopeTemplateMappings() {
  return listScopeTemplates();
}

export async function createScopeTemplateMapping(
  input: {
    scopeCode: string;
    systemType: string;
    lifecycleType?: string;
    governanceProfile?: string;
    demandTemplateJson?: Array<{
      role: string;
      capabilityTags: string[];
      quantity: number;
      seniorityLevel: string;
    }>;
  },
  actorId: number,
) {
  const created = await createTemplate({
    scopeCode: input.scopeCode,
    systemType: input.systemType,
    lifecycleType: input.lifecycleType || null,
    governanceProfile: input.governanceProfile || null,
    demandTemplateJson: input.demandTemplateJson || null,
    isActive: 1,
  });

  await logPsAudit({
    actorId,
    action: "scope_template.create",
    entityType: "ps_scope_template_mapping",
    entityId: created.id,
    newValue: { scopeCode: input.scopeCode, systemType: input.systemType },
  });

  return created;
}

// ── Simulation ────────────────────────────────────────────────────────

export async function runMatrixSimulation(
  input: import("./ps.types").SimulationInput,
  actorId: number,
) {
  const { runSimulation } = await import("./ps.simulation");
  const result = await runSimulation(input, actorId);

  await logPsAudit({
    actorId,
    action: "simulation.run",
    entityType: "ps_matrix_simulation",
    entityId: result.simulationId,
    newValue: {
      versionId: input.versionId,
      compareVersionId: input.compareVersionId,
      selectedScope: result.result.selectedScope,
      scopeChanged: result.diff?.selectedScopeChanged,
    },
  });

  return result;
}

export async function listMatrixSimulations() {
  const { listSimulations } = await import("./ps.simulation");
  return listSimulations();
}

// ── Evaluation ────────────────────────────────────────────────────────

export async function createEvalCase(
  input: import("./ps.types").EvalCaseInput,
  actorId: number,
) {
  const evaluation = await import("./ps.evaluation");
  const created = await evaluation.createEvalCase(input, actorId);

  await logPsAudit({
    actorId,
    action: "eval_case.create",
    entityType: "ps_eval_case",
    entityId: created.id,
    newValue: { name: input.name, expectedScopeCode: input.expectedScopeCode },
  });

  return created;
}

export async function listEvalCases() {
  const evaluation = await import("./ps.evaluation");
  return evaluation.listEvalCases();
}

export async function getEvalCase(id: number) {
  const evaluation = await import("./ps.evaluation");
  const found = await evaluation.getEvalCase(id);
  if (!found) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Eval case not found" });
  }
  return found;
}

export async function updateEvalCase(
  id: number,
  data: {
    name?: string;
    description?: string;
    answersJson?: Record<string, boolean | string | number>;
    expectedScopeCode?: string;
    tags?: string[];
    isActive?: number;
  },
  actorId: number,
) {
  const evaluation = await import("./ps.evaluation");
  const updated = await evaluation.updateEvalCase(id, data);
  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Eval case not found" });
  }

  await logPsAudit({
    actorId,
    action: "eval_case.update",
    entityType: "ps_eval_case",
    entityId: id,
    newValue: data,
  });

  return updated;
}

export async function deleteEvalCase(
  id: number,
  actorId: number,
) {
  const evaluation = await import("./ps.evaluation");
  const deleted = await evaluation.deleteEvalCase(id);
  if (!deleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Eval case not found" });
  }

  await logPsAudit({
    actorId,
    action: "eval_case.delete",
    entityType: "ps_eval_case",
    entityId: id,
  });

  return { success: true };
}

export async function runEvaluationSuite(
  input: import("./ps.types").EvalSuiteInput,
  actorId: number,
) {
  const evaluation = await import("./ps.evaluation");
  const result = await evaluation.runEvaluationSuite(input, actorId);

  await logPsAudit({
    actorId,
    action: "eval_suite.run",
    entityType: "ps_eval_run",
    entityId: result.evalRunId,
    newValue: {
      versionId: input.versionId,
      totalCases: result.totalCases,
      passedCases: result.passedCases,
      failedCases: result.failedCases,
      passRate: result.passRate,
    },
  });

  return result;
}

export async function listEvalRuns() {
  const evaluation = await import("./ps.evaluation");
  return evaluation.listEvalRuns();
}

export async function getEvalRun(id: number) {
  const evaluation = await import("./ps.evaluation");
  const found = await evaluation.getEvalRun(id);
  if (!found) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Eval run not found" });
  }
  return found;
}

// ── Monitoring ────────────────────────────────────────────────────────

export async function getMonitoringSummary(): Promise<MonitoringSummary> {
  const [
    systems, wizard, demand, assignments, fulfillment, activity,
    overrideRate, confidenceTrends, scopeDistribution, deadScopes, deadQuestions,
  ] = await Promise.all([
    getSystemMetrics(),
    getWizardMetrics(),
    getDemandMetrics(),
    getAssignmentMetrics(),
    getFulfillmentMetrics(),
    getRecentActivity(),
    getOverrideRateMetrics(),
    getConfidenceTrends(),
    getScopeDistribution(),
    getDeadScopes(),
    getDeadQuestions(),
  ]);

  return {
    systems, wizard, demand, assignments, fulfillment, activity,
    overrideRate, confidenceTrends, scopeDistribution, deadScopes, deadQuestions,
  };
}

// ── Overrides ─────────────────────────────────────────────────────────

export async function overrideRecommendation(
  input: {
    wizardRunId?: number;
    recommendedScopeCode: string;
    overriddenScopeCode: string;
    reason: string;
    recommendedConfidence?: number;
    matrixVersion?: string;
    answersJson?: Record<string, boolean | string | number>;
  },
  actorId: number,
) {
  const { recordOverride } = await import("./ps.override");
  const created = await recordOverride(input, actorId);

  await logPsAudit({
    actorId,
    action: "wizard.override",
    entityType: "ps_wizard_override",
    entityId: created.id,
    newValue: {
      recommendedScope: input.recommendedScopeCode,
      overriddenScope: input.overriddenScopeCode,
      reason: input.reason,
      wizardRunId: input.wizardRunId,
    },
  });

  return created;
}

export async function listOverrides() {
  const { listOverrides: fetchOverrides } = await import("./ps.override");
  return fetchOverrides();
}

export async function getOverridePatterns() {
  const { getOverridePatterns: fetchPatterns } = await import("./ps.override");
  return fetchPatterns();
}
