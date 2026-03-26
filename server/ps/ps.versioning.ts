/**
 * PS Module — Safe Matrix Versioning
 *
 * Handles the matrix version lifecycle: deep validation, safe activation
 * (block invalid), rollback to previous, and version comparison (diff).
 */

import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import {
  psScopeTemplateMappings,
  psMatrixVersions,
} from "../../drizzle/tables/ps";
import type {
  MatrixValidationReport,
  MatrixValidationError,
  VersionComparison,
  VersionComparisonItem,
  RollbackResult,
} from "./ps.types";

// ── Deep Validation ────────────────────────────────────────────────────

/**
 * Enhanced validation that extends the base checks with:
 * - Orphan cell references (cells pointing to non-existent questions/scopes)
 * - Orphan template mappings (scope templates referencing codes not in this version)
 * - Weight range sanity checks
 */
export async function deepValidateMatrix(
  versionId: number,
): Promise<MatrixValidationReport> {
  const version = await repo.getMatrixVersionById(versionId);
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  const allScopes = await repo.getAllScopesByVersion(versionId);
  const allQuestions = await repo.getAllQuestionsByVersion(versionId);
  const cells = await repo.listCellsByVersion(versionId);
  const dimensionCount = await repo.countDimensionsByVersion(versionId);

  const activeScopes = allScopes.filter((s) => s.isActive === 1);
  const activeQuestions = allQuestions.filter((q) => q.isActive === 1);

  const errors: MatrixValidationError[] = [];
  const warnings: string[] = [];

  // ── Duplicate scope codes ──────────────────────────────────────────
  const scopeCodes = new Map<string, number>();
  for (const s of allScopes) {
    scopeCodes.set(s.code, (scopeCodes.get(s.code) ?? 0) + 1);
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

  // ── Duplicate question codes ───────────────────────────────────────
  const questionCodes = new Map<string, number>();
  for (const q of allQuestions) {
    questionCodes.set(q.code, (questionCodes.get(q.code) ?? 0) + 1);
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

  // ── Structural minimums ────────────────────────────────────────────
  if (activeScopes.length === 0) {
    errors.push({
      type: "no_active_scopes",
      message: "No active scopes. At least one active scope is required.",
    });
  }

  if (activeQuestions.length === 0) {
    errors.push({
      type: "no_questions",
      message: "No active questions. At least one active question is required.",
    });
  }

  if (cells.length === 0 && activeScopes.length > 0 && activeQuestions.length > 0) {
    errors.push({
      type: "no_cells",
      message: "No matrix cells defined. At least one cell is required.",
    });
  }

  // ── Invalid weights ────────────────────────────────────────────────
  for (const cell of cells) {
    if (!Number.isInteger(cell.weight)) {
      errors.push({
        type: "invalid_weight",
        message: `Non-integer weight for cell (question=${cell.questionId}, scope=${cell.scopeId}): ${cell.weight}`,
        details: { questionId: cell.questionId, scopeId: cell.scopeId, weight: cell.weight },
      });
    }
  }

  // ── Orphan cell references ─────────────────────────────────────────
  const validQuestionIds = new Set(allQuestions.map((q) => q.id));
  const validScopeIds = new Set(allScopes.map((s) => s.id));

  for (const cell of cells) {
    if (!validQuestionIds.has(cell.questionId)) {
      errors.push({
        type: "orphan_cell",
        message: `Cell references non-existent question ID ${cell.questionId} in version ${versionId}`,
        details: { cellId: cell.id, questionId: cell.questionId },
      });
    }
    if (!validScopeIds.has(cell.scopeId)) {
      errors.push({
        type: "orphan_cell",
        message: `Cell references non-existent scope ID ${cell.scopeId} in version ${versionId}`,
        details: { cellId: cell.id, scopeId: cell.scopeId },
      });
    }
  }

  // ── Orphan template mappings ───────────────────────────────────────
  const db = getDb();
  if (db) {
    const templates = await db.select().from(psScopeTemplateMappings)
      .where(and(
        eq(psScopeTemplateMappings.isActive, 1),
      ));
    const activeScopeCodes = new Set(activeScopes.map((s) => s.code));
    for (const tmpl of templates) {
      if (!activeScopeCodes.has(tmpl.scopeCode)) {
        warnings.push(
          `Template mapping for scope "${tmpl.scopeCode}" → system type "${tmpl.systemType}" has no matching active scope in version ${version.version}`,
        );
      }
    }
  }

  // ── Missing cells (coverage) ───────────────────────────────────────
  const expectedCells = activeScopes.length * activeQuestions.length;
  const activeScopeIds = new Set(activeScopes.map((s) => s.id));
  const activeQuestionIds = new Set(activeQuestions.map((q) => q.id));
  const cellKeys = new Set(cells.map((c) => `${c.questionId}:${c.scopeId}`));

  let missingCellCount = 0;
  for (const qId of activeQuestionIds) {
    for (const sId of activeScopeIds) {
      if (!cellKeys.has(`${qId}:${sId}`)) {
        missingCellCount++;
      }
    }
  }

  if (missingCellCount > 0 && expectedCells > 0) {
    const pct = Math.round(((expectedCells - missingCellCount) / expectedCells) * 100);
    warnings.push(
      `Matrix is ${pct}% complete. ${missingCellCount} cell(s) have no weight defined (will default to 0).`,
    );
  }

  // ── Weight distribution warnings ───────────────────────────────────
  if (cells.length > 0) {
    const allZero = cells.every((c) => c.weight === 0);
    if (allZero) {
      warnings.push("All cell weights are 0. The matrix will produce identical scores for all scopes.");
    }
    const hasNegative = cells.some((c) => c.weight < 0);
    if (hasNegative) {
      warnings.push("Some cells have negative weights. Verify this is intentional.");
    }
  }

  const coveragePercent = expectedCells > 0
    ? Math.round(((expectedCells - missingCellCount) / expectedCells) * 100)
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

// ── Safe Activation ────────────────────────────────────────────────────

/**
 * Validate first, activate only if valid. Returns the activated version
 * or throws with full validation report.
 */
export async function safeActivateMatrix(
  versionId: number,
  actorId: number,
) {
  const report = await deepValidateMatrix(versionId);
  if (!report.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot activate: ${report.errors.length} validation error(s). ${report.errors.map((e) => e.message).join("; ")}`,
    });
  }

  const activated = await repo.activateMatrixVersion(versionId);
  if (!activated) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_version.safe_activate",
    entityType: "ps_matrix_version",
    entityId: versionId,
    newValue: {
      status: "active",
      validationStats: report.stats,
      warningCount: report.warnings.length,
    },
  });

  return { version: activated, validation: report };
}

// ── Rollback ───────────────────────────────────────────────────────────

/**
 * Rollback: deactivate the current active version and re-activate the
 * most recently archived version that was previously active.
 */
export async function rollbackMatrixVersion(
  actorId: number,
): Promise<RollbackResult> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  // Find current active version
  const currentActive = await repo.getActiveMatrixVersion();
  if (!currentActive) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No active matrix version to rollback from.",
    });
  }

  // Find the most recently activated archived version (the one that was active before)
  const [previousVersion] = await db.select().from(psMatrixVersions)
    .where(and(
      eq(psMatrixVersions.status, "archived"),
    ))
    .orderBy(desc(psMatrixVersions.activatedAt))
    .limit(1);

  if (!previousVersion) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No previously archived version found to rollback to.",
    });
  }

  // Validate the target version before rollback
  const report = await deepValidateMatrix(previousVersion.id);
  if (!report.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot rollback: target version "${previousVersion.version}" has ${report.errors.length} validation error(s). ${report.errors.map((e) => e.message).join("; ")}`,
    });
  }

  // Archive current active
  await repo.archiveMatrixVersion(currentActive.id);

  // Re-activate previous version
  const reactivated = await repo.activateMatrixVersion(previousVersion.id);
  if (!reactivated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to reactivate previous version" });
  }

  await logPsAudit({
    actorId,
    action: "matrix_version.rollback",
    entityType: "ps_matrix_version",
    entityId: previousVersion.id,
    previousValue: { activeVersionId: currentActive.id, activeVersion: currentActive.version },
    newValue: { restoredVersionId: previousVersion.id, restoredVersion: previousVersion.version },
  });

  return {
    previousVersionId: previousVersion.id,
    previousVersion: previousVersion.version,
    rolledBackFromId: currentActive.id,
    rolledBackFromVersion: currentActive.version,
  };
}

// ── Compare Versions ───────────────────────────────────────────────────

/**
 * Compare two matrix versions and produce a structured diff.
 */
export async function compareMatrixVersions(
  baseVersionId: number,
  targetVersionId: number,
): Promise<VersionComparison> {
  const baseVersion = await repo.getMatrixVersionById(baseVersionId);
  if (!baseVersion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Base matrix version not found" });
  }
  const targetVersion = await repo.getMatrixVersionById(targetVersionId);
  if (!targetVersion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Target matrix version not found" });
  }

  // Load data for both versions
  const [baseScopes, targetScopes] = await Promise.all([
    repo.getAllScopesByVersion(baseVersionId),
    repo.getAllScopesByVersion(targetVersionId),
  ]);
  const [baseQuestions, targetQuestions] = await Promise.all([
    repo.getAllQuestionsByVersion(baseVersionId),
    repo.getAllQuestionsByVersion(targetVersionId),
  ]);
  const [baseCells, targetCells] = await Promise.all([
    repo.listCellsByVersion(baseVersionId),
    repo.listCellsByVersion(targetVersionId),
  ]);
  const [baseDimensions, targetDimensions] = await Promise.all([
    repo.getAllDimensionsByVersion(baseVersionId),
    repo.getAllDimensionsByVersion(targetVersionId),
  ]);

  // ── Scope diff ──────────────────────────────────────────────────────
  const baseScopeMap = new Map(baseScopes.map((s) => [s.code, s]));
  const targetScopeMap = new Map(targetScopes.map((s) => [s.code, s]));

  const scopeAdded: VersionComparisonItem[] = [];
  const scopeRemoved: VersionComparisonItem[] = [];
  const scopeChanged: VersionComparisonItem[] = [];
  let scopeUnchanged = 0;

  for (const [code, s] of targetScopeMap) {
    if (!baseScopeMap.has(code)) {
      scopeAdded.push({ code, label: s.label, status: "added" });
    } else {
      const base = baseScopeMap.get(code)!;
      if (base.label !== s.label || base.family !== s.family || base.isActive !== s.isActive) {
        scopeChanged.push({
          code,
          label: s.label,
          status: "changed",
          oldValue: base.label,
          newValue: s.label,
        });
      } else {
        scopeUnchanged++;
      }
    }
  }
  for (const [code, s] of baseScopeMap) {
    if (!targetScopeMap.has(code)) {
      scopeRemoved.push({ code, label: s.label, status: "removed" });
    }
  }

  // ── Question diff ───────────────────────────────────────────────────
  const baseQuestionMap = new Map(baseQuestions.map((q) => [q.code, q]));
  const targetQuestionMap = new Map(targetQuestions.map((q) => [q.code, q]));

  const questionAdded: VersionComparisonItem[] = [];
  const questionRemoved: VersionComparisonItem[] = [];
  const questionChanged: VersionComparisonItem[] = [];
  let questionUnchanged = 0;

  for (const [code, q] of targetQuestionMap) {
    if (!baseQuestionMap.has(code)) {
      questionAdded.push({ code, label: q.label, status: "added" });
    } else {
      const base = baseQuestionMap.get(code)!;
      if (base.label !== q.label || base.sortOrder !== q.sortOrder || base.isActive !== q.isActive) {
        questionChanged.push({
          code,
          label: q.label,
          status: "changed",
          oldValue: base.label,
          newValue: q.label,
        });
      } else {
        questionUnchanged++;
      }
    }
  }
  for (const [code, q] of baseQuestionMap) {
    if (!targetQuestionMap.has(code)) {
      questionRemoved.push({ code, label: q.label, status: "removed" });
    }
  }

  // ── Cell diff (by question_code:scope_code key) ─────────────────────
  function cellKey(
    questionId: number,
    scopeId: number,
    questionMap: Map<number, string>,
    scopeMap: Map<number, string>,
  ): string | null {
    const qCode = questionMap.get(questionId);
    const sCode = scopeMap.get(scopeId);
    if (!qCode || !sCode) return null;
    return `${qCode}:${sCode}`;
  }

  const baseQIdToCode = new Map(baseQuestions.map((q) => [q.id, q.code]));
  const baseSIdToCode = new Map(baseScopes.map((s) => [s.id, s.code]));
  const targetQIdToCode = new Map(targetQuestions.map((q) => [q.id, q.code]));
  const targetSIdToCode = new Map(targetScopes.map((s) => [s.id, s.code]));

  const baseCellMap = new Map<string, number>();
  for (const c of baseCells) {
    const key = cellKey(c.questionId, c.scopeId, baseQIdToCode, baseSIdToCode);
    if (key) baseCellMap.set(key, c.weight);
  }

  const targetCellMap = new Map<string, number>();
  for (const c of targetCells) {
    const key = cellKey(c.questionId, c.scopeId, targetQIdToCode, targetSIdToCode);
    if (key) targetCellMap.set(key, c.weight);
  }

  let cellsAdded = 0;
  let cellsRemoved = 0;
  let cellsWeightChanged = 0;
  let cellsUnchanged = 0;

  for (const [key, weight] of targetCellMap) {
    if (!baseCellMap.has(key)) {
      cellsAdded++;
    } else if (baseCellMap.get(key) !== weight) {
      cellsWeightChanged++;
    } else {
      cellsUnchanged++;
    }
  }
  for (const key of baseCellMap.keys()) {
    if (!targetCellMap.has(key)) {
      cellsRemoved++;
    }
  }

  // ── Dimension diff ──────────────────────────────────────────────────
  const baseDimMap = new Map(baseDimensions.map((d) => [d.dimensionKey, d]));
  const targetDimMap = new Map(targetDimensions.map((d) => [d.dimensionKey, d]));

  const dimAdded: VersionComparisonItem[] = [];
  const dimRemoved: VersionComparisonItem[] = [];
  let dimUnchanged = 0;

  for (const [key, d] of targetDimMap) {
    if (!baseDimMap.has(key)) {
      dimAdded.push({ code: key, label: d.dimensionLabel, status: "added" });
    } else {
      dimUnchanged++;
    }
  }
  for (const [key, d] of baseDimMap) {
    if (!targetDimMap.has(key)) {
      dimRemoved.push({ code: key, label: d.dimensionLabel, status: "removed" });
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const changes: string[] = [];
  if (scopeAdded.length) changes.push(`+${scopeAdded.length} scopes`);
  if (scopeRemoved.length) changes.push(`-${scopeRemoved.length} scopes`);
  if (scopeChanged.length) changes.push(`~${scopeChanged.length} scopes modified`);
  if (questionAdded.length) changes.push(`+${questionAdded.length} questions`);
  if (questionRemoved.length) changes.push(`-${questionRemoved.length} questions`);
  if (questionChanged.length) changes.push(`~${questionChanged.length} questions modified`);
  if (cellsAdded) changes.push(`+${cellsAdded} cells`);
  if (cellsRemoved) changes.push(`-${cellsRemoved} cells`);
  if (cellsWeightChanged) changes.push(`~${cellsWeightChanged} weights changed`);
  if (dimAdded.length) changes.push(`+${dimAdded.length} dimensions`);
  if (dimRemoved.length) changes.push(`-${dimRemoved.length} dimensions`);

  const summary = changes.length > 0
    ? `${baseVersion.version} → ${targetVersion.version}: ${changes.join(", ")}`
    : `${baseVersion.version} → ${targetVersion.version}: no differences`;

  return {
    baseVersionId,
    baseVersion: baseVersion.version,
    targetVersionId,
    targetVersion: targetVersion.version,
    scopes: { added: scopeAdded, removed: scopeRemoved, changed: scopeChanged, unchanged: scopeUnchanged },
    questions: { added: questionAdded, removed: questionRemoved, changed: questionChanged, unchanged: questionUnchanged },
    cells: { added: cellsAdded, removed: cellsRemoved, weightChanged: cellsWeightChanged, unchanged: cellsUnchanged },
    dimensions: { added: dimAdded, removed: dimRemoved, unchanged: dimUnchanged },
    summary,
  };
}
