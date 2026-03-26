/**
 * PS Module — Matrix Admin Operations
 *
 * Version lifecycle, duplication, validation for activation.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import { logActivity } from "../modules/registry";
import type {
  MatrixOverview,
  MatrixValidationReport,
  MatrixValidationError,
} from "./ps.types";

// ── Matrix Overview ────────────────────────────────────────────────────

export async function getMatrixOverview(workspaceId: number): Promise<MatrixOverview> {
  const activeVersion = await repo.getActiveMatrixVersion(workspaceId);
  const allVersions = await repo.listMatrixVersions(workspaceId);

  let totalScopes = 0;
  let totalQuestions = 0;
  let totalCells = 0;

  if (activeVersion) {
    totalScopes = await repo.countActiveScopesByVersion(activeVersion.id);
    totalQuestions = await repo.countActiveQuestionsByVersion(activeVersion.id);
    totalCells = await repo.countCellsByVersion(activeVersion.id);
  }

  const lastImportAt = await repo.getLastImportDate(workspaceId);

  // Find last activation date across all versions
  let lastActivationAt: string | null = null;
  for (const v of allVersions) {
    if (v.activatedAt) {
      const ts = v.activatedAt instanceof Date ? v.activatedAt.toISOString() : String(v.activatedAt);
      if (!lastActivationAt || ts > lastActivationAt) {
        lastActivationAt = ts;
      }
    }
  }

  return {
    activeVersion: activeVersion
      ? {
          id: activeVersion.id,
          version: activeVersion.version,
          label: activeVersion.label,
          activatedAt: activeVersion.activatedAt
            ? (activeVersion.activatedAt instanceof Date
                ? activeVersion.activatedAt.toISOString()
                : String(activeVersion.activatedAt))
            : null,
        }
      : null,
    totalVersions: allVersions.length,
    totalScopes,
    totalQuestions,
    totalCells,
    lastImportAt,
    lastActivationAt,
  };
}

// ── Duplicate Matrix Version ─────────────────────────────────────────

export async function duplicateMatrixVersion(
  workspaceId: number,
  sourceVersionId: number,
  newVersion: string,
  newLabel: string,
  actorId: number,
) {
  const source = await repo.getMatrixVersionById(workspaceId, sourceVersionId);
  if (!source) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Source matrix version not found" });
  }

  // Create new draft version
  const created = await repo.createMatrixVersion({
    workspaceId,
    version: newVersion,
    label: newLabel,
    status: "draft",
    createdBy: actorId,
  });

  // Copy scopes
  const scopes = await repo.getAllScopesByVersion(sourceVersionId);
  const scopeIdMap = new Map<number, number>(); // old scope id → new scope id
  if (scopes.length > 0) {
    const scopeRows = scopes.map((s) => ({
      versionId: created.id,
      code: s.code,
      label: s.label,
      description: s.description,
      family: s.family,
      isActive: s.isActive,
    }));
    const newScopes = await repo.createScopesBatch(scopeRows);
    for (let i = 0; i < scopes.length; i++) {
      scopeIdMap.set(scopes[i].id, newScopes[i].id);
    }
  }

  // Copy questions
  const questions = await repo.getAllQuestionsByVersion(sourceVersionId);
  const questionIdMap = new Map<number, number>();
  if (questions.length > 0) {
    const questionRows = questions.map((q) => ({
      versionId: created.id,
      code: q.code,
      label: q.label,
      description: q.description,
      sortOrder: q.sortOrder,
      isActive: q.isActive,
    }));
    const newQuestions = await repo.createQuestionsBatch(questionRows);
    for (let i = 0; i < questions.length; i++) {
      questionIdMap.set(questions[i].id, newQuestions[i].id);
    }
  }

  // Copy cells with remapped IDs
  const cells = await repo.listCellsByVersion(sourceVersionId);
  if (cells.length > 0) {
    const cellRows = cells
      .filter((c) => questionIdMap.has(c.questionId) && scopeIdMap.has(c.scopeId))
      .map((c) => ({
        versionId: created.id,
        questionId: questionIdMap.get(c.questionId)!,
        scopeId: scopeIdMap.get(c.scopeId)!,
        weight: c.weight,
      }));
    if (cellRows.length > 0) {
      await repo.createCellsBatch(cellRows);
    }
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_version.duplicate",
    entityType: "ps_matrix_version",
    entityId: created.id,
    newValue: {
      sourceVersionId,
      newVersion,
      scopesCopied: scopes.length,
      questionsCopied: questions.length,
      cellsCopied: cells.length,
    },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_version.duplicate",
    targetType: "ps_matrix_version",
    targetId: created.id,
  });

  return created;
}

// ── Archive Matrix Version ────────────────────────────────────────────

export async function archiveMatrixVersion(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  const version = await repo.getMatrixVersionById(workspaceId, id);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }
  if (version.status === "active") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot archive the active version. Activate another version first.",
    });
  }

  const archived = await repo.archiveMatrixVersion(workspaceId, id);
  if (!archived) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    workspaceId,
    actorId,
    action: "matrix_version.archive",
    entityType: "ps_matrix_version",
    entityId: id,
    previousValue: { status: version.status },
    newValue: { status: "archived" },
  });
  await logActivity({
    workspaceId,
    moduleKey: "ps",
    actorId,
    action: "matrix_version.archive",
    targetType: "ps_matrix_version",
    targetId: id,
  });

  return archived;
}

// ── Validate Matrix Version ──────────────────────────────────────────

export async function validateMatrixVersion(
  workspaceId: number,
  versionId: number,
): Promise<MatrixValidationReport> {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const allScopes = await repo.getAllScopesByVersion(versionId);
  const allQuestions = await repo.getAllQuestionsByVersion(versionId);
  const cells = await repo.listCellsByVersion(versionId);

  const activeScopes = allScopes.filter((s) => s.isActive === 1);
  const activeQuestions = allQuestions.filter((q) => q.isActive === 1);

  const errors: MatrixValidationError[] = [];
  const warnings: string[] = [];

  // Check duplicate scope codes
  const scopeCodes = new Map<string, number>();
  for (const s of allScopes) {
    const prev = scopeCodes.get(s.code) ?? 0;
    scopeCodes.set(s.code, prev + 1);
  }
  for (const [code, cnt] of scopeCodes) {
    if (cnt > 1) {
      errors.push({
        type: "duplicate_scope_code",
        message: `Duplicate scope code: "${code}" (${cnt} occurrences)`,
        details: { code, count: cnt },
      });
    }
  }

  // Check duplicate question codes
  const questionCodes = new Map<string, number>();
  for (const q of allQuestions) {
    const prev = questionCodes.get(q.code) ?? 0;
    questionCodes.set(q.code, prev + 1);
  }
  for (const [code, cnt] of questionCodes) {
    if (cnt > 1) {
      errors.push({
        type: "duplicate_question_code",
        message: `Duplicate question code: "${code}" (${cnt} occurrences)`,
        details: { code, count: cnt },
      });
    }
  }

  // Check no active scopes
  if (activeScopes.length === 0) {
    errors.push({
      type: "no_active_scopes",
      message: "No active scopes. At least one active scope is required.",
    });
  }

  // Check no questions
  if (activeQuestions.length === 0) {
    errors.push({
      type: "no_questions",
      message: "No active questions. At least one active question is required.",
    });
  }

  // Check no cells
  if (cells.length === 0) {
    errors.push({
      type: "no_cells",
      message: "No matrix cells defined. At least one cell is required.",
    });
  }

  // Check for invalid weights
  for (const cell of cells) {
    if (!Number.isInteger(cell.weight)) {
      errors.push({
        type: "invalid_weight",
        message: `Non-integer weight for cell (question=${cell.questionId}, scope=${cell.scopeId})`,
        details: { questionId: cell.questionId, scopeId: cell.scopeId, weight: cell.weight },
      });
    }
  }

  // Check cell references valid question + scope in same version
  const validQuestionIds = new Set(allQuestions.map((q) => q.id));
  const validScopeIds = new Set(allScopes.map((s) => s.id));
  for (const cell of cells) {
    if (!validQuestionIds.has(cell.questionId)) {
      errors.push({
        type: "missing_cells",
        message: `Cell references non-existent question ID ${cell.questionId}`,
        details: { questionId: cell.questionId },
      });
    }
    if (!validScopeIds.has(cell.scopeId)) {
      errors.push({
        type: "missing_cells",
        message: `Cell references non-existent scope ID ${cell.scopeId}`,
        details: { scopeId: cell.scopeId },
      });
    }
  }

  // Coverage warning
  const expectedCells = activeScopes.length * activeQuestions.length;
  if (expectedCells > 0 && cells.length < expectedCells) {
    const missing = expectedCells - cells.length;
    warnings.push(`Matrix is ${Math.round((cells.length / expectedCells) * 100)}% complete. ${missing} cell(s) have no weight defined (will default to 0).`);
  }

  const coveragePercent = expectedCells > 0
    ? Math.round((cells.length / expectedCells) * 100)
    : 0;

  return {
    versionId,
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      scopeCount: allScopes.length,
      activeScopeCount: activeScopes.length,
      questionCount: allQuestions.length,
      activeQuestionCount: activeQuestions.length,
      cellCount: cells.length,
      expectedCellCount: expectedCells,
      coveragePercent,
    },
  };
}

// ── Activate with Validation ─────────────────────────────────────────

export async function activateMatrixVersionWithValidation(
  workspaceId: number,
  id: number,
  actorId: number,
) {
  const report = await validateMatrixVersion(workspaceId, id);
  if (!report.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot activate: ${report.errors.length} validation error(s). ${report.errors.map((e) => e.message).join("; ")}`,
    });
  }

  return repo.activateMatrixVersion(workspaceId, id);
}
