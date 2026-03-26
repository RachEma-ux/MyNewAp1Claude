/**
 * PS Module — Matrix Import Pipeline
 *
 * Two-step import: preview (validate + summarize) → commit (persist into draft).
 * Import always targets a draft version, never the active version.
 */

import { TRPCError } from "@trpc/server";
import * as repo from "./ps.repository";
import { logPsAudit } from "./ps.audit";
import type {
  MatrixImportPayload,
  MatrixImportPreview,
  MatrixImportCommitResult,
  MatrixImportSourceType,
} from "./ps.types";

// ── Preview Import ─────────────────────────────────────────────────────

export async function previewMatrixImport(
  sourceType: MatrixImportSourceType,
  sourceName: string | undefined,
  payload: MatrixImportPayload,
  actorId: number,
): Promise<MatrixImportPreview> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate scope codes unique
  const scopeCodes = new Set<string>();
  for (const s of payload.scopes) {
    if (scopeCodes.has(s.code)) {
      errors.push(`Duplicate scope code in import: "${s.code}"`);
    }
    scopeCodes.add(s.code);
  }

  // Validate question codes unique
  const questionCodes = new Set<string>();
  for (const q of payload.questions) {
    if (questionCodes.has(q.code)) {
      errors.push(`Duplicate question code in import: "${q.code}"`);
    }
    questionCodes.add(q.code);
  }

  // Validate cell references
  for (const c of payload.cells) {
    if (!scopeCodes.has(c.scopeCode)) {
      errors.push(`Cell references unknown scope code: "${c.scopeCode}"`);
    }
    if (!questionCodes.has(c.questionCode)) {
      errors.push(`Cell references unknown question code: "${c.questionCode}"`);
    }
    if (!Number.isInteger(c.weight)) {
      errors.push(`Non-integer weight for cell (${c.questionCode} × ${c.scopeCode}): ${c.weight}`);
    }
  }

  // Validate dimensions if provided
  if (payload.dimensions && payload.dimensions.length > 0) {
    const dimKeys = new Set<string>();
    for (const dim of payload.dimensions) {
      if (dimKeys.has(dim.dimensionKey)) {
        errors.push(`Duplicate dimension key in import: "${dim.dimensionKey}"`);
      }
      dimKeys.add(dim.dimensionKey);

      // Validate value keys unique within dimension
      const valKeys = new Set<string>();
      for (const val of dim.values) {
        if (valKeys.has(val.valueKey)) {
          errors.push(`Duplicate value key "${val.valueKey}" in dimension "${dim.dimensionKey}"`);
        }
        valKeys.add(val.valueKey);
      }
      if (dim.values.length === 0) {
        warnings.push(`Dimension "${dim.dimensionKey}" has no values defined`);
      }
    }
  }

  // Validate question presentations if provided
  if (payload.questionPresentations && payload.questionPresentations.length > 0) {
    const validPresentationTypes = new Set(["boolean", "select", "slider", "multi_select", "text"]);
    const dimKeys = payload.dimensions ? new Set(payload.dimensions.map((d) => d.dimensionKey)) : new Set<string>();

    for (const pres of payload.questionPresentations) {
      if (!questionCodes.has(pres.questionCode)) {
        errors.push(`Question presentation references unknown question code: "${pres.questionCode}"`);
      }
      if (!validPresentationTypes.has(pres.presentationType)) {
        errors.push(`Invalid presentation type "${pres.presentationType}" for question "${pres.questionCode}"`);
      }
      if (pres.dimensionKey && !dimKeys.has(pres.dimensionKey)) {
        warnings.push(`Question presentation for "${pres.questionCode}" references dimension "${pres.dimensionKey}" not in this import`);
      }
    }
  }

  // Coverage warning
  const expectedCells = payload.scopes.length * payload.questions.length;
  if (payload.cells.length < expectedCells) {
    const missing = expectedCells - payload.cells.length;
    warnings.push(`${missing} cell(s) not defined. They will default to weight 0.`);
  }

  // Deduplicate errors
  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];

  // Save import record
  const imp = await repo.createMatrixImport({
    versionId: null,
    sourceType,
    sourceName: sourceName || null,
    rawPayloadJson: payload as unknown as Record<string, unknown>,
    importStatus: uniqueErrors.length > 0 ? "failed" : "previewed",
    scopesCount: payload.scopes.length,
    questionsCount: payload.questions.length,
    cellsCount: payload.cells.length,
    warningsJson: uniqueWarnings,
    errorsJson: uniqueErrors.length > 0 ? uniqueErrors : null,
    createdBy: actorId,
  });

  return {
    importId: imp.id,
    sourceType,
    scopesCount: payload.scopes.length,
    questionsCount: payload.questions.length,
    cellsCount: payload.cells.length,
    dimensionsCount: payload.dimensions?.length ?? 0,
    questionPresentationsCount: payload.questionPresentations?.length ?? 0,
    warnings: uniqueWarnings,
    errors: uniqueErrors,
    isValid: uniqueErrors.length === 0,
  };
}

// ── Commit Import ─────────────────────────────────────────────────────

export async function commitMatrixImport(
  importId: number,
  targetVersionId: number | undefined,
  newVersion: string | undefined,
  newLabel: string | undefined,
  actorId: number,
): Promise<MatrixImportCommitResult> {
  // Load import record
  const imp = await repo.getMatrixImportById(importId);
  if (!imp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Import record not found" });
  }
  if (imp.importStatus !== "previewed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Import status is "${imp.importStatus}". Only "previewed" imports can be committed.`,
    });
  }

  // Parse payload
  const payload = imp.rawPayloadJson as unknown as MatrixImportPayload;
  if (!payload?.scopes || !payload?.questions || !payload?.cells) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Import payload is malformed" });
  }

  // Determine target version
  let versionId: number;
  if (targetVersionId) {
    const version = await repo.getMatrixVersionById(targetVersionId);
    if (!version) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Target version not found" });
    }
    if (version.status === "active") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot import directly into the active version. Use a draft version.",
      });
    }
    versionId = targetVersionId;

    // Clear existing data in target version before importing
    await repo.deleteQuestionPresentationsByVersion(versionId);
    await repo.deleteCellsByVersion(versionId);
    await repo.deleteQuestionsByVersion(versionId);
    await repo.deleteScopesByVersion(versionId);
    await repo.deleteDimensionsByVersion(versionId);
  } else if (newVersion && newLabel) {
    // Create new draft version
    const created = await repo.createMatrixVersion({
      version: newVersion,
      label: newLabel,
      status: "draft",
      createdBy: actorId,
    });
    versionId = created.id;
  } else {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Either targetVersionId or newVersion+newLabel must be provided",
    });
  }

  // Insert scopes
  const scopeRows = payload.scopes.map((s) => ({
    versionId,
    code: s.code,
    label: s.label,
    description: s.description || null,
    family: s.family || null,
    isActive: 1,
  }));
  const createdScopes = await repo.createScopesBatch(scopeRows);
  const scopeCodeToId = new Map<string, number>();
  for (const s of createdScopes) {
    scopeCodeToId.set(s.code, s.id);
  }

  // Insert questions
  const questionRows = payload.questions.map((q, i) => ({
    versionId,
    code: q.code,
    label: q.label,
    description: q.description || null,
    sortOrder: q.sortOrder ?? i,
    isActive: 1,
  }));
  const createdQuestions = await repo.createQuestionsBatch(questionRows);
  const questionCodeToId = new Map<string, number>();
  for (const q of createdQuestions) {
    questionCodeToId.set(q.code, q.id);
  }

  // Insert cells
  const cellRows = payload.cells
    .filter((c) => questionCodeToId.has(c.questionCode) && scopeCodeToId.has(c.scopeCode))
    .map((c) => ({
      versionId,
      questionId: questionCodeToId.get(c.questionCode)!,
      scopeId: scopeCodeToId.get(c.scopeCode)!,
      weight: c.weight,
    }));
  if (cellRows.length > 0) {
    await repo.createCellsBatch(cellRows);
  }

  // Insert dimensions + values if provided
  let dimensionsCreated = 0;
  let dimensionValuesCreated = 0;
  const dimensionKeyToId = new Map<string, number>();

  if (payload.dimensions && payload.dimensions.length > 0) {
    const dimRows = payload.dimensions.map((d, i) => ({
      versionId,
      dimensionKey: d.dimensionKey,
      dimensionLabel: d.dimensionLabel,
      description: d.description || null,
      sortOrder: d.sortOrder ?? i,
      isActive: 1,
    }));
    const createdDims = await repo.createDimensionsBatch(dimRows);
    dimensionsCreated = createdDims.length;

    for (const dim of createdDims) {
      dimensionKeyToId.set(dim.dimensionKey, dim.id);
    }

    // Insert values for each dimension
    for (const dimDef of payload.dimensions) {
      const dimId = dimensionKeyToId.get(dimDef.dimensionKey);
      if (!dimId || !dimDef.values || dimDef.values.length === 0) continue;

      const valRows = dimDef.values.map((v, i) => ({
        dimensionId: dimId,
        valueKey: v.valueKey,
        valueLabel: v.valueLabel,
        description: v.description || null,
        sortOrder: v.sortOrder ?? i,
        isActive: 1,
      }));
      const createdVals = await repo.createDimensionValuesBatch(valRows);
      dimensionValuesCreated += createdVals.length;
    }
  }

  // Insert question presentations if provided
  let presentationsCreated = 0;
  if (payload.questionPresentations && payload.questionPresentations.length > 0) {
    const presRows = payload.questionPresentations
      .filter((p) => questionCodeToId.has(p.questionCode))
      .map((p) => ({
        questionId: questionCodeToId.get(p.questionCode)!,
        presentationType: p.presentationType,
        dimensionId: p.dimensionKey ? (dimensionKeyToId.get(p.dimensionKey) ?? null) : null,
        configJson: p.configJson || null,
        isActive: 1,
      }));
    if (presRows.length > 0) {
      const createdPres = await repo.createQuestionPresentationsBatch(presRows);
      presentationsCreated = createdPres.length;
    }
  }

  // Update import record
  await repo.updateMatrixImport(importId, {
    versionId,
    importStatus: "committed",
    committedAt: new Date(),
  });

  // Audit
  await logPsAudit({
    actorId,
    action: "matrix_import.commit",
    entityType: "ps_matrix_import",
    entityId: importId,
    newValue: {
      versionId,
      scopesCreated: createdScopes.length,
      questionsCreated: createdQuestions.length,
      cellsCreated: cellRows.length,
      dimensionsCreated,
      dimensionValuesCreated,
      presentationsCreated,
    },
  });

  return {
    importId,
    versionId,
    scopesCreated: createdScopes.length,
    questionsCreated: createdQuestions.length,
    cellsCreated: cellRows.length,
    dimensionsCreated,
    dimensionValuesCreated,
    presentationsCreated,
  };
}
