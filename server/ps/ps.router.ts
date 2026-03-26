/**
 * PS Module — tRPC Router
 *
 * Exposes PS systems CRUD, wizard runs, catalog, classification,
 * demand, assignment-facing flows, matrix classification engine,
 * and matrix admin/import operations for the Control Panel.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import {
  createSystemSchema,
  getSystemSchema,
  listSystemsSchema,
  createWizardRunSchema,
  getWizardRunSchema,
  listWizardRunsSchema,
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
  // Matrix versioning schemas
  deepValidateMatrixSchema,
  safeActivateMatrixSchema,
  rollbackMatrixSchema,
  compareMatrixVersionsSchema,
  // Accept wizard result schema
  acceptWizardResultSchema,
  // Scope template mapping schemas
  createScopeTemplateMappingSchema,
  listScopeTemplateMappingsSchema,
  // Simulation schemas
  runSimulationSchema,
  listSimulationsSchema,
  // Evaluation schemas
  createEvalCaseSchema,
  getEvalCaseSchema,
  listEvalCasesSchema,
  updateEvalCaseSchema,
  deleteEvalCaseSchema,
  runEvaluationSuiteSchema,
  listEvalRunsSchema,
  getEvalRunSchema,
  // Override schemas
  overrideRecommendationSchema,
  listOverridesSchema,
  getOverridePatternsSchema,
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
  // Delete schemas
  deleteScopeSchema,
  deleteQuestionSchema,
  deleteDimensionSchema,
  deleteDimensionValueSchema,
  deleteCellSchema,
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
      return service.getSystem(input.id);
    }),

  list: protectedProcedure
    .input(listSystemsSchema)
    .query(async ({ input }) => {
      return service.listSystems(input.status);
    }),
});

const wizardRunsRouter = router({
  create: governedProcedure
    .input(createWizardRunSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createWizardRun(input, ctx.user.id);
    }),

  accept: governedProcedure
    .input(acceptWizardResultSchema)
    .mutation(async ({ ctx, input }) => {
      return service.acceptWizardResult(input, ctx.user.id);
    }),

  get: protectedProcedure
    .input(getWizardRunSchema)
    .query(async ({ input }) => {
      return service.getWizardRun(input.id);
    }),

  list: protectedProcedure
    .input(listWizardRunsSchema)
    .query(async ({ input }) => {
      return service.listWizardRuns();
    }),
});

const templatesRouter = router({
  list: protectedProcedure
    .input(listScopeTemplateMappingsSchema)
    .query(async ({ input }) => {
      return service.listScopeTemplateMappings();
    }),

  create: governedProcedure
    .input(createScopeTemplateMappingSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createScopeTemplateMapping(input, ctx.user.id);
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
      return service.listResourceRequests(input.status);
    }),

  listBySystem: protectedProcedure
    .input(listResourceRequestsBySystemSchema)
    .query(async ({ input }) => {
      return service.listResourceRequestsBySystem(input.psSystemId);
    }),

  updateStatus: governedProcedure
    .input(updateResourceRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return service.updateResourceRequestStatus(
        input.id,
        input.status,
        ctx.user.id,
      );
    }),

  summary: protectedProcedure
    .input(getDemandSummarySchema)
    .query(async ({ input }) => {
      return service.getDemandSummary(input.psSystemId);
    }),

  generateForSystem: governedProcedure
    .input(getDemandSummarySchema)
    .mutation(async ({ ctx, input }) => {
      const system = await service.getSystem(input.psSystemId);
      return service.generateDemandForSystem(
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
      return service.listResourceAssignments(input.status);
    }),

  listByRequest: protectedProcedure
    .input(listResourceAssignmentsByRequestSchema)
    .query(async ({ input }) => {
      return service.listResourceAssignmentsByRequest(input.resourceRequestId);
    }),

  listBySystem: protectedProcedure
    .input(listResourceAssignmentsBySystemSchema)
    .query(async ({ input }) => {
      return service.listResourceAssignmentsBySystem(input.psSystemId);
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
        input.id,
        input.status,
        ctx.user.id,
      );
    }),

  delete: governedProcedure
    .input(deleteResourceAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteResourceAssignment(input.id, ctx.user.id);
    }),

  summary: protectedProcedure
    .input(getAssignmentSummarySchema)
    .query(async ({ input }) => {
      return service.getAssignmentSummary(input.psSystemId);
    }),
});

// ── Matrix Classification Engine + Admin Router ───────────────────────

const matrixRouter = router({
  // ── Existing runtime endpoints (preserved for PS Wizard) ──────────

  getActiveVersion: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return service.getActiveMatrixVersion();
    }),

  listVersions: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return service.listMatrixVersions();
    }),

  createVersion: governedProcedure
    .input(createMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixVersion(
        input.version,
        input.label,
        ctx.user.id,
      );
    }),

  activateVersion: governedProcedure
    .input(activateMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.activateMatrixVersionValidated(input.id, ctx.user.id);
    }),

  getScopes: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixScopes(input.versionId);
    }),

  createScope: governedProcedure
    .input(createMatrixScopeSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixScope(
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
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  getQuestions: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixQuestions(input.versionId);
    }),

  createQuestion: governedProcedure
    .input(createMatrixQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixQuestion(
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
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  getCells: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listMatrixCells(input.versionId);
    }),

  createCellsBatch: governedProcedure
    .input(createMatrixCellsBatchSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createMatrixCellsBatch(
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

  evaluateEnriched: protectedProcedure
    .input(evaluateMatrixSchema)
    .query(async ({ input }) => {
      return service.evaluateMatrixClassificationEnriched(input);
    }),

  hasActive: protectedProcedure
    .input(hasActiveMatrixSchema)
    .query(async ({ input }) => {
      return { available: await service.hasActiveMatrix() };
    }),

  getActiveQuestions: protectedProcedure
    .input(getActiveMatrixQuestionsSchema)
    .query(async ({ input }) => {
      const matrix = await loadActiveMatrix();
      if (!matrix) return { available: false as const, questions: [], scopes: [], dimensions: [], version: null };
      return {
        available: true as const,
        questions: matrix.questions,
        scopes: matrix.scopes,
        dimensions: matrix.dimensions,
        version: matrix.version,
      };
    }),

  // ── Get version by ID ───────────────────────────────────────────────

  getVersion: protectedProcedure
    .input(getMatrixVersionByIdSchema)
    .query(async ({ input }) => {
      return service.getMatrixVersionById(input.id);
    }),

  // ── Scope Matrix Profile endpoints ─────────────────────────────────

  getScopeProfile: protectedProcedure
    .input(getScopeProfileSchema)
    .query(async ({ input }) => {
      return service.getScopeProfile(input.scopeId);
    }),

  listScopeProfiles: protectedProcedure
    .input(listScopeProfilesSchema)
    .query(async ({ input }) => {
      return service.listScopeProfiles(input.versionId);
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
      return service.listMatrixHeaders(input.versionId);
    }),

  listHeadersByType: protectedProcedure
    .input(listMatrixHeadersByTypeSchema)
    .query(async ({ input }) => {
      return service.listMatrixHeadersByType(input.versionId, input.headerType);
    }),

  parseHeaders: governedProcedure
    .input(parseMatrixHeadersSchema)
    .mutation(async ({ ctx, input }) => {
      return service.parseAndStoreHeaders(
        input.versionId,
        input.rawHeaders,
        ctx.user.id,
      );
    }),

  // ── Seed endpoint ───────────────────────────────────────────────────

  seedScopeMatrix: governedProcedure
    .input(seedScopeMatrixSchema)
    .mutation(async ({ ctx, input }) => {
      return service.seedScopeMatrix(ctx.user.id);
    }),

  // ── Control Panel Admin endpoints ─────────────────────────────────

  getOverview: protectedProcedure
    .input(getMatrixOverviewSchema)
    .query(async ({ input }) => {
      return service.getMatrixOverview();
    }),

  duplicateVersion: governedProcedure
    .input(duplicateMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.duplicateMatrixVersion(
        input.sourceVersionId,
        input.newVersion,
        input.newLabel,
        ctx.user.id,
      );
    }),

  archiveVersion: governedProcedure
    .input(archiveMatrixVersionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.archiveMatrixVersion(input.id, ctx.user.id);
    }),

  getValidationReport: protectedProcedure
    .input(getMatrixValidationReportSchema)
    .query(async ({ input }) => {
      return service.getMatrixValidationReport(input.versionId);
    }),

  // ── Safe Matrix Versioning ──────────────────────────────────────────

  deepValidate: protectedProcedure
    .input(deepValidateMatrixSchema)
    .query(async ({ input }) => {
      return service.deepValidateMatrix(input.versionId);
    }),

  safeActivate: governedProcedure
    .input(safeActivateMatrixSchema)
    .mutation(async ({ ctx, input }) => {
      return service.safeActivateMatrix(input.versionId, ctx.user.id);
    }),

  rollback: governedProcedure
    .input(rollbackMatrixSchema)
    .mutation(async ({ ctx, input }) => {
      return service.rollbackMatrixVersion(ctx.user.id);
    }),

  compareVersions: protectedProcedure
    .input(compareMatrixVersionsSchema)
    .query(async ({ input }) => {
      return service.compareMatrixVersions(
        input.baseVersionId,
        input.targetVersionId,
      );
    }),

  // Admin scope operations (include inactive)
  getAllScopes: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listAllMatrixScopes(input.versionId);
    }),

  updateScope: governedProcedure
    .input(updateMatrixScopeSchema)
    .mutation(async ({ ctx, input }) => {
      const { versionId, id, ...data } = input;
      return service.updateMatrixScope(versionId, id, data, ctx.user.id);
    }),

  // Admin question operations (include inactive)
  getAllQuestions: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.listAllMatrixQuestions(input.versionId);
    }),

  updateQuestion: governedProcedure
    .input(updateMatrixQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const { versionId, id, ...data } = input;
      return service.updateMatrixQuestion(versionId, id, data, ctx.user.id);
    }),

  reorderQuestions: governedProcedure
    .input(reorderMatrixQuestionsSchema)
    .mutation(async ({ ctx, input }) => {
      return service.reorderMatrixQuestions(
        input.versionId,
        input.orderedIds,
        ctx.user.id,
      );
    }),

  // Grid editor
  getGrid: protectedProcedure
    .input(matrixVersionIdSchema)
    .query(async ({ input }) => {
      return service.getMatrixGrid(input.versionId);
    }),

  upsertCell: governedProcedure
    .input(upsertMatrixCellSchema)
    .mutation(async ({ ctx, input }) => {
      return service.upsertMatrixCell(
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
      return service.listMatrixImports();
    }),

  // ── Dimensions ─────────────────────────────────────────────────────

  listDimensions: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listDimensions(input.versionId);
    }),

  listAllDimensions: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listAllDimensions(input.versionId);
    }),

  listDimensionsWithValues: protectedProcedure
    .input(listDimensionsSchema)
    .query(async ({ input }) => {
      return service.listDimensionsWithValues(input.versionId);
    }),

  createDimension: governedProcedure
    .input(createDimensionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimension(
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
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateDimension: governedProcedure
    .input(updateDimensionSchema)
    .mutation(async ({ ctx, input }) => {
      const { versionId, id, ...data } = input;
      return service.updateDimension(versionId, id, data, ctx.user.id);
    }),

  // ── Dimension Values ───────────────────────────────────────────────

  listDimensionValues: protectedProcedure
    .input(listDimensionValuesSchema)
    .query(async ({ input }) => {
      return service.listDimensionValues(input.dimensionId);
    }),

  listAllDimensionValues: protectedProcedure
    .input(listDimensionValuesSchema)
    .query(async ({ input }) => {
      return service.listAllDimensionValues(input.dimensionId);
    }),

  createDimensionValue: governedProcedure
    .input(createDimensionValueSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createDimensionValue(
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
        input.dimensionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateDimensionValue: governedProcedure
    .input(updateDimensionValueSchema)
    .mutation(async ({ ctx, input }) => {
      const { dimensionId, id, ...data } = input;
      return service.updateDimensionValue(dimensionId, id, data, ctx.user.id);
    }),

  // ── Question Presentations ─────────────────────────────────────────

  getQuestionPresentation: protectedProcedure
    .input(getQuestionPresentationSchema)
    .query(async ({ input }) => {
      return service.getQuestionPresentation(input.questionId);
    }),

  listQuestionPresentations: protectedProcedure
    .input(listQuestionPresentationsSchema)
    .query(async ({ input }) => {
      return service.listQuestionPresentations(input.versionId);
    }),

  createQuestionPresentation: governedProcedure
    .input(createQuestionPresentationSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createQuestionPresentation(
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
        input.versionId,
        input.items,
        ctx.user.id,
      );
    }),

  updateQuestionPresentation: governedProcedure
    .input(updateQuestionPresentationSchema)
    .mutation(async ({ ctx, input }) => {
      const { questionId, ...data } = input;
      return service.updateQuestionPresentation(questionId, data, ctx.user.id);
    }),

  // ── Delete Operations (draft-only) ──────────────────────────────────

  deleteScope: governedProcedure
    .input(deleteScopeSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteMatrixScope(input.versionId, input.id, ctx.user.id);
    }),

  deleteQuestion: governedProcedure
    .input(deleteQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteMatrixQuestion(input.versionId, input.id, ctx.user.id);
    }),

  deleteDimension: governedProcedure
    .input(deleteDimensionSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteMatrixDimension(input.versionId, input.id, ctx.user.id);
    }),

  deleteDimensionValue: governedProcedure
    .input(deleteDimensionValueSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteMatrixDimensionValue(input.dimensionId, input.id, ctx.user.id);
    }),

  deleteCell: governedProcedure
    .input(deleteCellSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteMatrixCell(input.versionId, input.id, ctx.user.id);
    }),
});

// ── Simulation Router ──────────────────────────────────────────────────

const simulationRouter = router({
  run: governedProcedure
    .input(runSimulationSchema)
    .mutation(async ({ ctx, input }) => {
      return service.runMatrixSimulation(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(listSimulationsSchema)
    .query(async ({ input }) => {
      return service.listMatrixSimulations();
    }),
});

// ── Evaluation Router ─────────────────────────────────────────────────

const evaluationRouter = router({
  createCase: governedProcedure
    .input(createEvalCaseSchema)
    .mutation(async ({ ctx, input }) => {
      return service.createEvalCase(input, ctx.user.id);
    }),

  getCase: protectedProcedure
    .input(getEvalCaseSchema)
    .query(async ({ input }) => {
      return service.getEvalCase(input.id);
    }),

  listCases: protectedProcedure
    .input(listEvalCasesSchema)
    .query(async ({ input }) => {
      return service.listEvalCases();
    }),

  updateCase: governedProcedure
    .input(updateEvalCaseSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return service.updateEvalCase(id, data, ctx.user.id);
    }),

  deleteCase: governedProcedure
    .input(deleteEvalCaseSchema)
    .mutation(async ({ ctx, input }) => {
      return service.deleteEvalCase(input.id, ctx.user.id);
    }),

  runSuite: governedProcedure
    .input(runEvaluationSuiteSchema)
    .mutation(async ({ ctx, input }) => {
      return service.runEvaluationSuite(input, ctx.user.id);
    }),

  listRuns: protectedProcedure
    .input(listEvalRunsSchema)
    .query(async ({ input }) => {
      return service.listEvalRuns();
    }),

  getRun: protectedProcedure
    .input(getEvalRunSchema)
    .query(async ({ input }) => {
      return service.getEvalRun(input.id);
    }),
});

// ── Overrides Router ──────────────────────────────────────────────────

const overridesRouter = router({
  record: governedProcedure
    .input(overrideRecommendationSchema)
    .mutation(async ({ ctx, input }) => {
      return service.overrideRecommendation(input, ctx.user.id);
    }),

  list: protectedProcedure
    .input(listOverridesSchema)
    .query(async ({ input }) => {
      return service.listOverrides();
    }),

  patterns: protectedProcedure
    .input(getOverridePatternsSchema)
    .query(async ({ input }) => {
      return service.getOverridePatterns();
    }),
});

export const psRouter = router({
  systems: systemsRouter,
  wizardRuns: wizardRunsRouter,
  demand: demandRouter,
  assignments: assignmentsRouter,
  templates: templatesRouter,
  matrix: matrixRouter,
  simulation: simulationRouter,
  evaluation: evaluationRouter,
  overrides: overridesRouter,

  getActiveQuestions: protectedProcedure
    .input(z.void())
    .query(async () => {
      return service.getWizardActiveQuestions();
    }),

  classifyScenario: protectedProcedure
    .input(z.object({
      scenario: z.string().min(1),
      context: z.object({
        businessUnit: z.string().optional().default(""),
        region: z.string().optional().default(""),
        strategicImportance: z.string().optional().default(""),
        existingSituation: z.string().optional().default(""),
      }),
      answers: z.record(z.string(), z.string()).default({}),
    }))
    .mutation(async ({ input }) => {
      return service.classifyWizardScenario(input);
    }),

  catalog: protectedProcedure
    .query(async () => {
      return service.getCatalog();
    }),

  getMonitoringSummary: protectedProcedure
    .input(getMonitoringSummarySchema)
    .query(async ({ input }) => {
      return service.getMonitoringSummary();
    }),
});
