/**
 * PS Module — tRPC Router
 *
 * Exposes PS systems CRUD, wizard runs, catalog, classification,
 * demand, assignment-facing flows, matrix classification engine,
 * and matrix admin/import operations for the Control Panel.
 */

import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import {
  createSystemSchema,
  getSystemSchema,
  listSystemsSchema,
  createWizardRunSchema,
  getWizardRunSchema,
  listWizardRunsSchema,
  classifyScenarioSchema,
  createResourceRequestSchema,
  listResourceRequestsSchema,
  listResourceRequestsBySystemSchema,
  updateResourceRequestStatusSchema,
  getDemandSummarySchema,
  getMonitoringSummarySchema,
  createResourceAssignmentSchema,
  updateResourceAssignmentSchema,
  updateResourceAssignmentStatusSchema,
  listResourceAssignmentsSchema,
  listResourceAssignmentsByRequestSchema,
  listResourceAssignmentsBySystemSchema,
  deleteResourceAssignmentSchema,
  getAssignmentSummarySchema,
  // Matrix schemas
  matrixVersionIdSchema,
  createMatrixVersionSchema,
  activateMatrixVersionSchema,
  createMatrixScopeSchema,
  createMatrixScopesBatchSchema,
  createMatrixQuestionSchema,
  createMatrixQuestionsBatchSchema,
  createMatrixCellsBatchSchema,
  evaluateMatrixSchema,
  hasActiveMatrixSchema,
  getActiveMatrixQuestionsSchema,
  // Matrix admin schemas
  getMatrixOverviewSchema,
  duplicateMatrixVersionSchema,
  archiveMatrixVersionSchema,
  updateMatrixScopeSchema,
  updateMatrixQuestionSchema,
  reorderMatrixQuestionsSchema,
  upsertMatrixCellSchema,
  bulkUpsertMatrixCellsSchema,
  getMatrixValidationReportSchema,
  previewMatrixImportSchema,
  commitMatrixImportSchema,
  listMatrixImportsSchema,
  // Scope profile schemas
  getMatrixVersionByIdSchema,
  getScopeProfileSchema,
  listScopeProfilesSchema,
  createMatrixImportRecordSchema,
  // Header schemas
  listMatrixHeadersSchema,
  listMatrixHeadersByTypeSchema,
  parseMatrixHeadersSchema,
  // Seed schema
  seedScopeMatrixSchema,
  // Dimension schemas
  listDimensionsSchema,
  createDimensionSchema,
  createDimensionsBatchSchema,
  updateDimensionSchema,
  // Dimension value schemas
  listDimensionValuesSchema,
  createDimensionValueSchema,
  createDimensionValuesBatchSchema,
  updateDimensionValueSchema,
  // Question presentation schemas
  getQuestionPresentationSchema,
  listQuestionPresentationsSchema,
  createQuestionPresentationSchema,
  createQuestionPresentationsBatchSchema,
  updateQuestionPresentationSchema,
} from "./ps.validation";
import * as service from "./ps.service";
import { loadActiveMatrix } from "./ps.matrix-engine";

const systemsRouter = router({
  create: governedProcedure
    .input(createSystemSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createSystem(input, ctx.user.id);
    }),

  get: protectedProcedure
    .input(getSystemSchema)
    .query(async ({ input }) => {
      return service.getSystem(input.workspaceId, input.id);
    }),

  list: protectedProcedure
    .input(listSystemsSchema)
    .query(async ({ input }) => {
      return service.listSystems(input.workspaceId, input.status);
    }),
});

const wizardRunsRouter = router({
  create: governedProcedure
    .input(createWizardRunSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createWizardRun(input, ctx.user.id);
    }),

  get: protectedProcedure
    .input(getWizardRunSchema)
    .query(async ({ input }) => {
      return service.getWizardRun(input.workspaceId, input.id);
    }),

  list: protectedProcedure
    .input(listWizardRunsSchema)
    .query(async ({ input }) => {
      return service.listWizardRuns(input.workspaceId);
    }),
});

const demandRouter = router({
  create: governedProcedure
    .input(createResourceRequestSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createResourceRequest(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(listResourceRequestsSchema)
    .query(async ({ input }) => {
      return service.listResourceRequests(input.workspaceId, input.status);
    }),

  listBySystem: protectedProcedure
    .input(listResourceRequestsBySystemSchema)
    .query(async ({ input }) => {
      return service.listResourceRequestsBySystem(input.workspaceId, input.psSystemId);
    }),

  updateStatus: governedProcedure
    .input(updateResourceRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateResourceRequestStatus(
        input.workspaceId,
        input.id,
        input.status,
        ctx.user.id,
      );
    }),

  summary: protectedProcedure
    .input(getDemandSummarySchema)
    .query(async ({ input }) => {
      return service.getDemandSummary(input.workspaceId, input.psSystemId);
    }),

  generateForSystem: governedProcedure
    .input(getDemandSummarySchema)
    .mutation(async ({ ctx, input }) => {
      const system = await service.getSystem(input.workspaceId, input.psSystemId);
      return service.generateDemandForSystem(
        input.workspaceId,
        input.psSystemId,
        system.systemType,
        ctx.user.id,
      );
    }),
});

const assignmentsRouter = router({
  create: governedProcedure
    .input(createResourceAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createResourceAssignment(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(listResourceAssignmentsSchema)
    .query(async ({ input }) => {
      return service.listResourceAssignments(input.workspaceId, input.status);
    }),

  listByRequest: protectedProcedure
    .input(listResourceAssignmentsByRequestSchema)
    .query(async ({ input }) => {
      return service.listResourceAssignmentsByRequest(input.workspaceId, input.resourceRequestId);
    }),

  listBySystem: protectedProcedure
    .input(listResourceAssignmentsBySystemSchema)
    .query(async ({ input }) => {
      return service.listResourceAssignmentsBySystem(input.workspaceId, input.psSystemId);
    }),

  update: governedProcedure
    .input(updateResourceAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateResourceAssignment(input, ctx.user.id);
    }),

  updateStatus: governedProcedure
    .input(updateResourceAssignmentStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateResourceAssignmentStatus(
        input.workspaceId,
        input.id,
        input.status,
        ctx.user.id,
      );
    }),

  delete: governedProcedure
    .input(deleteResourceAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteResourceAssignment(input.workspaceId, input.id, ctx.user.id);
    }),

  summary: protectedProcedure
    .input(getAssignmentSummarySchema)
    .query(async ({ input }) => {
      return service.getAssignmentSummary(input.workspaceId, input.psSystemId);
    }),
});

// ── Matrix Classification Engine + Admin Router ───────────────────────

const matrixRouter = router({
  // ── Existing runtime endpoints (preserved for PS Wizard) ──────────

  getActiveVersion: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return service.getActiveMatrixVersion(input.workspaceId);
    }),

  listVersions: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return service.listMatrixVersions(input.workspaceId);
    }),

  createVersion: governedProcedure
    .input(createMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixVersion(
        input.workspaceId,
        input.version,
        input.label,
        ctx.user.id,
      );
    }),

  activateVersion: governedProcedure
    .input(activateMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.activateMatrixVersionValidated(input.workspaceId, input.id, ctx.user.id);
    }),

  getScopes: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixScopes(input.workspaceId, input.versionId);
    }),

  createScope: governedProcedure
    .input(createMatrixScopeSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixScope(
        input.workspaceId,
        input.versionId,
        input.code,
        input.label,
        input.description || null,
        input.family || null,
        ctx.user.id,
      );
    }),

  createScopesBatch: governedProcedure
    .input(createMatrixScopesBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixScopesBatch(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  getQuestions: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixQuestions(input.workspaceId, input.versionId);
    }),

  createQuestion: governedProcedure
    .input(createMatrixQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixQuestion(
        input.workspaceId,
        input.versionId,
        input.code,
        input.label,
        input.description || null,
        input.sortOrder ?? 0,
        ctx.user.id,
      );
    }),

  createQuestionsBatch: governedProcedure
    .input(createMatrixQuestionsBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixQuestionsBatch(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  getCells: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixCells(input.workspaceId, input.versionId);
    }),

  createCellsBatch: governedProcedure
    .input(createMatrixCellsBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixCellsBatch(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  evaluate: protectedProcedure
    .input(evaluateMatrixSchema)
    .query(async ({ input }) => {
      return service.evaluateMatrixClassification(input);
    }),

  hasActive: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return { available: await service.hasActiveMatrix(input.workspaceId) };
    }),

  getActiveQuestions: protectedProcedure
    .input(getActiveMatrixQuestionsSchema)
    .query(async ({ input }) => {
      const matrix = await loadActiveMatrix(input.workspaceId);
      if (!matrix) return { available: false as const, questions: [], scopes: [], version: null };
      return {
        available: true as const,
        questions: matrix.questions,
        scopes: matrix.scopes,
        version: matrix.version,
      };
    }),

  // ── Get version by ID ───────────────────────────────────────────────

  getVersion: protectedProcedure
    .input(getMatrixVersionByIdSchema)
    .query(async ({ input }) => {
      return service.getMatrixVersionById(input.workspaceId, input.id);
    }),

  // ── Scope Matrix Profile endpoints ─────────────────────────────────

  getScopeProfile: protectedProcedure
    .input(getScopeProfileSchema)
    .query(async ({ input }) => {
      return service.getScopeProfile(input.workspaceId, input.scopeId);
    }),

  listScopeProfiles: protectedProcedure
    .input(listScopeProfilesSchema)
    .query(async ({ input }) => {
      return service.listScopeProfiles(input.workspaceId, input.versionId);
    }),

  // ── Import record creation ─────────────────────────────────────────

  createImportRecord: governedProcedure
    .input(createMatrixImportRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixImportRecord(input, ctx.user.id);
    }),

  // ── Matrix Header endpoints ────────────────────────────────────────

  listHeaders: protectedProcedure
    .input(listMatrixHeadersSchema)
    .query(async ({ input }) => {
      return service.listMatrixHeaders(input.workspaceId, input.versionId);
    }),

  listHeadersByType: protectedProcedure
    .input(listMatrixHeadersByTypeSchema)
    .query(async ({ input }) => {
      return service.listMatrixHeadersByType(input.workspaceId, input.versionId, input.headerType);
    }),

  parseHeaders: governedProcedure
    .input(parseMatrixHeadersSchema)
    .mutation(async ({ ctx, input }) => {
      return service.parseAndStoreHeaders(
        input.workspaceId,
        input.versionId,
        input.rawHeaders,
        ctx.user.id,
      );
    }),

  // ── Seed endpoint ───────────────────────────────────────────────────

  seedScopeMatrix: governedProcedure
    .input(seedScopeMatrixSchema)
    .mutation(async ({ ctx, input }) => {
      return service.seedScopeMatrix(input.workspaceId, ctx.user.id);
    }),

  // ── Control Panel Admin endpoints ─────────────────────────────────

  getOverview: protectedProcedure
    .input(getMatrixOverviewSchema)
    .query(async ({ input }) => {
      return service.getMatrixOverview(input.workspaceId);
    }),

  duplicateVersion: governedProcedure
    .input(duplicateMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.duplicateMatrixVersion(
        input.workspaceId,
        input.sourceVersionId,
        input.newVersion,
        input.newLabel,
        ctx.user.id,
      );
    }),

  archiveVersion: governedProcedure
    .input(archiveMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.archiveMatrixVersion(input.workspaceId, input.id, ctx.user.id);
    }),

  getValidationReport: protectedProcedure
    .input(getMatrixValidationReportSchema)
    .query(async ({ input }) => {
      return service.getMatrixValidationReport(input.workspaceId, input.versionId);
    }),

  // Admin scope operations (include inactive)
  getAllScopes: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listAllMatrixScopes(input.workspaceId, input.versionId);
    }),

  updateScope: governedProcedure
    .input(updateMatrixScopeSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, versionId, id, ...data } = input;
      return service.updateMatrixScope(workspaceId, versionId, id, data, ctx.user.id);
    }),

  // Admin question operations (include inactive)
  getAllQuestions: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listAllMatrixQuestions(input.workspaceId, input.versionId);
    }),

  updateQuestion: governedProcedure
    .input(updateMatrixQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, versionId, id, ...data } = input;
      return service.updateMatrixQuestion(workspaceId, versionId, id, data, ctx.user.id);
    }),

  reorderQuestions: governedProcedure
    .input(reorderMatrixQuestionsSchema)
    .mutation(async ({ ctx, input }) => {
      return service.reorderMatrixQuestions(
        input.workspaceId,
        input.versionId,
        input.orderedIds,
        ctx.user.id,
      );
    }),

  // Grid editor
  getGrid: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.getMatrixGrid(input.workspaceId, input.versionId);
    }),

  upsertCell: governedProcedure
    .input(upsertMatrixCellSchema)
    .mutation(async ({ ctx, input }) => {
      return service.upsertMatrixCell(
        input.workspaceId,
        input.versionId,
        input.questionId,
        input.scopeId,
        input.weight,
        ctx.user.id,
      );
    }),

  bulkUpsertCells: governedProcedure
    .input(bulkUpsertMatrixCellsSchema)
    .mutation(async ({ ctx, input }) => {
      return service.bulkUpsertMatrixCells(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  // Import
  previewImport: governedProcedure
    .input(previewMatrixImportSchema)
    .mutation(async ({ ctx, input }) => {
      return service.previewMatrixImport(
        input.workspaceId,
        input.sourceType,
        input.sourceName,
        input.payload,
        ctx.user.id,
      );
    }),

  commitImport: governedProcedure
    .input(commitMatrixImportSchema)
    .mutation(async ({ ctx, input }) => {
      return service.commitMatrixImport(
        input.workspaceId,
        input.importId,
        input.targetVersionId,
        input.newVersion,
        input.newLabel,
        ctx.user.id,
      );
    }),

  listImports: protectedProcedure
    .input(listMatrixImportsSchema)
    .query(async ({ input }) => {
      return service.listMatrixImports(input.workspaceId);
    }),

  // ── Dimensions ─────────────────────────────────────────────────────

  listDimensions: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listDimensions(input.workspaceId, input.versionId);
    }),

  listAllDimensions: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listAllDimensions(input.workspaceId, input.versionId);
    }),

  listDimensionsWithValues: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listDimensionsWithValues(input.workspaceId, input.versionId);
    }),

  createDimension: governedProcedure
    .input(createDimensionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimension(
        input.workspaceId,
        input.versionId,
        input.dimensionKey,
        input.dimensionLabel,
        input.description || null,
        input.sortOrder ?? 0,
        ctx.user.id,
      );
    }),

  createDimensionsBatch: governedProcedure
    .input(createDimensionsBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimensionsBatch(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateDimension: governedProcedure
    .input(updateDimensionSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, versionId, id, ...data } = input;
      return service.updateDimension(workspaceId, versionId, id, data, ctx.user.id);
    }),

  // ── Dimension Values ───────────────────────────────────────────────

  listDimensionValues: protectedProcedure
    .input(listDimensionValuesSchema)
    .query(async ({ input }) => {
      return service.listDimensionValues(input.workspaceId, input.dimensionId);
    }),

  listAllDimensionValues: protectedProcedure
    .input(listDimensionValuesSchema)
    .query(async ({ input }) => {
      return service.listAllDimensionValues(input.workspaceId, input.dimensionId);
    }),

  createDimensionValue: governedProcedure
    .input(createDimensionValueSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimensionValue(
        input.workspaceId,
        input.dimensionId,
        input.valueKey,
        input.valueLabel,
        input.description || null,
        input.sortOrder ?? 0,
        ctx.user.id,
      );
    }),

  createDimensionValuesBatch: governedProcedure
    .input(createDimensionValuesBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimensionValuesBatch(
        input.workspaceId,
        input.dimensionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateDimensionValue: governedProcedure
    .input(updateDimensionValueSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, dimensionId, id, ...data } = input;
      return service.updateDimensionValue(workspaceId, dimensionId, id, data, ctx.user.id);
    }),

  // ── Question Presentations ─────────────────────────────────────────

  getQuestionPresentation: protectedProcedure
    .input(getQuestionPresentationSchema)
    .query(async ({ input }) => {
      return service.getQuestionPresentation(input.workspaceId, input.questionId);
    }),

  listQuestionPresentations: protectedProcedure
    .input(listQuestionPresentationsSchema)
    .query(async ({ input }) => {
      return service.listQuestionPresentations(input.workspaceId, input.versionId);
    }),

  createQuestionPresentation: governedProcedure
    .input(createQuestionPresentationSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createQuestionPresentation(
        input.workspaceId,
        input.questionId,
        input.presentationType,
        input.dimensionId ?? null,
        input.configJson ?? null,
        ctx.user.id,
      );
    }),

  createQuestionPresentationsBatch: governedProcedure
    .input(createQuestionPresentationsBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createQuestionPresentationsBatch(
        input.workspaceId,
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateQuestionPresentation: governedProcedure
    .input(updateQuestionPresentationSchema)
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, questionId, ...data } = input;
      return service.updateQuestionPresentation(workspaceId, questionId, data, ctx.user.id);
    }),
});

export const psRouter = router({
  systems: systemsRouter,
  wizardRuns: wizardRunsRouter,
  demand: demandRouter,
  assignments: assignmentsRouter,
  matrix: matrixRouter,

  classifyScenario: protectedProcedure
    .input(classifyScenarioSchema)
    .query(({ input }) => {
      return service.classifyScenario({
        scenarioText: input.scenarioText,
        dimensions: input.dimensions,
      });
    }),

  catalog: protectedProcedure
    .query(async () => {
      return service.getCatalog();
    }),

  getMonitoringSummary: protectedProcedure
    .input(getMonitoringSummarySchema)
    .query(async ({ input }) => {
      return service.getMonitoringSummary(input.workspaceId);
    }),
});
