/**
 * PS Module — Validation Schemas (Zod)
 */

import { z } from "zod";

export const createSystemSchema = z.object({

  name: z.string().min(1, "System name is required").max(255),
  description: z.string().max(2000).optional(),
  systemType: z.string().min(1, "System type is required").max(100),
  lifecycleType: z.string().max(100).optional(),
  governanceProfile: z.string().max(100).optional(),
});

export const getSystemSchema = z.object({

  id: z.number().int().positive(),
});

export const listSystemsSchema = z.object({
  status: z.enum(["draft", "active", "archived"]).optional(),
}).optional().default({});

export const createWizardRunSchema = z.object({

  scenarioText: z.string().min(1, "Scenario text is required").max(5000),
  inputPayload: z.record(z.string(), z.unknown()).optional(),
  resultPayload: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(100).optional(),
  selectedSystemType: z.string().max(100).optional(),
  matrixVersion: z.string().max(50).optional(),
});

export const getWizardRunSchema = z.object({

  id: z.number().int().positive(),
});

export const listWizardRunsSchema = z.void();

// ── Resource Requests (Demand) ──────────────────────────────────────

export const createResourceRequestSchema = z.object({

  psSystemId: z.number().int().positive(),
  role: z.string().min(1, "Role is required").max(200),
  capabilityTags: z.array(z.string().max(100)).max(20).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  seniorityLevel: z.string().max(50).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
});

export const listResourceRequestsSchema = z.object({

  status: z.enum(["draft", "open", "partially_filled", "filled", "closed"]).optional(),
});

export const listResourceRequestsBySystemSchema = z.object({

  psSystemId: z.number().int().positive(),
});

export const updateResourceRequestStatusSchema = z.object({

  id: z.number().int().positive(),
  status: z.enum(["draft", "open", "partially_filled", "filled", "closed"]),
});

export const getDemandSummarySchema = z.object({

  psSystemId: z.number().int().positive(),
});

// ── Resource Assignments ──────────────────────────────────────────

const assignmentStatusEnum = z.enum([
  "proposed", "requested", "confirmed", "active", "rejected", "cancelled", "completed",
]);

const assigneeRefTypeEnum = z.enum([
  "person", "team", "org_unit", "external", "placeholder",
]);

const assignmentSourceEnum = z.enum([
  "wizard", "manual", "import", "future_hr_sync",
]);

export const createResourceAssignmentSchema = z.object({

  resourceRequestId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
  assignmentRole: z.string().min(1, "Assignment role is required").max(200),
  assigneeRefType: assigneeRefTypeEnum,
  assigneeRefId: z.string().max(200).optional(),
  assigneeDisplayName: z.string().max(300).optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  status: assignmentStatusEnum.optional(),
  source: assignmentSourceEnum.optional(),
  notes: z.string().max(2000).optional(),
});

export const updateResourceAssignmentSchema = z.object({

  id: z.number().int().positive(),
  assignmentRole: z.string().min(1).max(200).optional(),
  assigneeRefType: assigneeRefTypeEnum.optional(),
  assigneeRefId: z.string().max(200).optional(),
  assigneeDisplayName: z.string().max(300).optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateResourceAssignmentStatusSchema = z.object({

  id: z.number().int().positive(),
  status: assignmentStatusEnum,
});

export const listResourceAssignmentsSchema = z.object({

  status: assignmentStatusEnum.optional(),
});

export const listResourceAssignmentsByRequestSchema = z.object({

  resourceRequestId: z.number().int().positive(),
});

export const listResourceAssignmentsBySystemSchema = z.object({

  psSystemId: z.number().int().positive(),
});

export const deleteResourceAssignmentSchema = z.object({

  id: z.number().int().positive(),
});

export const getAssignmentSummarySchema = z.object({

  psSystemId: z.number().int().positive(),
});

// ── Monitoring ──────────────────────────────────────────────────────

export const getMonitoringSummarySchema = z.void();

// ── Matrix Engine ──────────────────────────────────────────────────

export const matrixVersionIdSchema = z.object({

  versionId: z.number().int().positive(),
});

export const createMatrixVersionSchema = z.object({

  version: z.string().min(1).max(50),
  label: z.string().min(1).max(255),
});

export const activateMatrixVersionSchema = z.object({

  id: z.number().int().positive(),
});

export const createMatrixScopeSchema = z.object({

  versionId: z.number().int().positive(),
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  family: z.string().max(100).optional(),
});

export const createMatrixScopesBatchSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    code: z.string().min(1).max(100),
    label: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    family: z.string().max(100).optional(),
  })).min(1).max(100),
});

export const createMatrixQuestionSchema = z.object({

  versionId: z.number().int().positive(),
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createMatrixQuestionsBatchSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    code: z.string().min(1).max(100),
    label: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })).min(1).max(200),
});

export const createMatrixCellsBatchSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    questionId: z.number().int().positive(),
    scopeId: z.number().int().positive(),
    weight: z.number().int(),
  })).min(1).max(5000),
});

export const evaluateMatrixSchema = z.object({

  answers: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
});

export const hasActiveMatrixSchema = z.void();

export const getActiveMatrixQuestionsSchema = z.void();

// ── Matrix Admin ──────────────────────────────────────────────────

export const getMatrixOverviewSchema = z.void();

export const duplicateMatrixVersionSchema = z.object({

  sourceVersionId: z.number().int().positive(),
  newVersion: z.string().min(1).max(50),
  newLabel: z.string().min(1).max(255),
});

export const archiveMatrixVersionSchema = z.object({

  id: z.number().int().positive(),
});

export const updateMatrixScopeSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
  code: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  family: z.string().max(100).optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export const updateMatrixQuestionSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
  code: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export const reorderMatrixQuestionsSchema = z.object({

  versionId: z.number().int().positive(),
  orderedIds: z.array(z.number().int().positive()).min(1).max(500),
});

export const upsertMatrixCellSchema = z.object({

  versionId: z.number().int().positive(),
  questionId: z.number().int().positive(),
  scopeId: z.number().int().positive(),
  weight: z.number().int(),
});

export const bulkUpsertMatrixCellsSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    questionId: z.number().int().positive(),
    scopeId: z.number().int().positive(),
    weight: z.number().int(),
  })).min(1).max(5000),
});

export const getMatrixValidationReportSchema = z.object({

  versionId: z.number().int().positive(),
});

export const previewMatrixImportSchema = z.object({

  sourceType: z.enum(["json", "excel", "manual"]).default("json"),
  sourceName: z.string().max(255).optional(),
  payload: z.object({
    scopes: z.array(z.object({
      code: z.string().min(1).max(100),
      label: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      family: z.string().max(100).optional(),
    })).min(1).max(200),
    questions: z.array(z.object({
      code: z.string().min(1).max(100),
      label: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
      sortOrder: z.number().int().min(0).optional(),
    })).min(1).max(500),
    cells: z.array(z.object({
      questionCode: z.string().min(1).max(100),
      scopeCode: z.string().min(1).max(100),
      weight: z.number().int(),
    })).min(1).max(10000),
    dimensions: z.array(z.object({
      dimensionKey: z.string().min(1).max(100),
      dimensionLabel: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      sortOrder: z.number().int().min(0).optional(),
      values: z.array(z.object({
        valueKey: z.string().min(1).max(100),
        valueLabel: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        sortOrder: z.number().int().min(0).optional(),
      })).min(1).max(100),
    })).optional(),
    questionPresentations: z.array(z.object({
      questionCode: z.string().min(1).max(100),
      presentationType: z.enum(["boolean", "select", "slider", "multi_select", "text"]),
      dimensionKey: z.string().max(100).optional(),
      configJson: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  }),
});

export const commitMatrixImportSchema = z.object({

  importId: z.number().int().positive(),
  targetVersionId: z.number().int().positive().optional(),
  newVersion: z.string().min(1).max(50).optional(),
  newLabel: z.string().min(1).max(255).optional(),
});

export const listMatrixImportsSchema = z.void();

// ── Scope Matrix Profile ──────────────────────────────────────────

export const getMatrixVersionByIdSchema = z.object({

  id: z.number().int().positive(),
});

export const getScopeProfileSchema = z.object({

  scopeId: z.number().int().positive(),
});

export const listScopeProfilesSchema = z.object({

  versionId: z.number().int().positive(),
});

export const createMatrixImportRecordSchema = z.object({

  versionId: z.number().int().positive().optional(),
  importType: z.enum(["scope_matrix", "scoring_matrix"]),
  sourceType: z.enum(["json", "excel", "manual"]).default("excel"),
  sourceName: z.string().min(1).max(255),
  sheetName: z.string().min(1).max(255),
  totalRows: z.number().int().min(0),
  importedRows: z.number().int().min(0),
  skippedRows: z.number().int().min(0),
  warningsJson: z.array(z.string()).optional(),
  rawPayloadJson: z.record(z.string(), z.unknown()).optional(),
});

// ── Matrix Headers ──────────────────────────────────────────────────

export const listMatrixHeadersSchema = z.object({

  versionId: z.number().int().positive(),
});

export const listMatrixHeadersByTypeSchema = z.object({

  versionId: z.number().int().positive(),
  headerType: z.enum(["Standard", "Method", "Framework", "Standards", "Methods", "Frameworks"]),
});

export const parseMatrixHeadersSchema = z.object({

  versionId: z.number().int().positive(),
  rawHeaders: z.array(z.string()).min(1).max(50),
});

// ── Seed ──────────────────────────────────────────────────────────────

export const seedScopeMatrixSchema = z.void();

// ── Dimensions ──────────────────────────────────────────────────────

export const listDimensionsSchema = z.object({

  versionId: z.number().int().positive(),
});

export const createDimensionSchema = z.object({

  versionId: z.number().int().positive(),
  dimensionKey: z.string().min(1).max(100),
  dimensionLabel: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createDimensionsBatchSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    dimensionKey: z.string().min(1).max(100),
    dimensionLabel: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).optional(),
    values: z.array(z.object({
      valueKey: z.string().min(1).max(100),
      valueLabel: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      sortOrder: z.number().int().min(0).optional(),
    })).optional(),
  })).min(1).max(50),
});

export const updateDimensionSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
  dimensionKey: z.string().min(1).max(100).optional(),
  dimensionLabel: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

// ── Dimension Values ────────────────────────────────────────────────

export const listDimensionValuesSchema = z.object({

  dimensionId: z.number().int().positive(),
});

export const createDimensionValueSchema = z.object({

  dimensionId: z.number().int().positive(),
  valueKey: z.string().min(1).max(100),
  valueLabel: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createDimensionValuesBatchSchema = z.object({

  dimensionId: z.number().int().positive(),
  items: z.array(z.object({
    valueKey: z.string().min(1).max(100),
    valueLabel: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })).min(1).max(100),
});

export const updateDimensionValueSchema = z.object({

  dimensionId: z.number().int().positive(),
  id: z.number().int().positive(),
  valueKey: z.string().min(1).max(100).optional(),
  valueLabel: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

// ── Question Presentations ──────────────────────────────────────────

export const getQuestionPresentationSchema = z.object({

  questionId: z.number().int().positive(),
});

export const listQuestionPresentationsSchema = z.object({

  versionId: z.number().int().positive(),
});

export const createQuestionPresentationSchema = z.object({

  questionId: z.number().int().positive(),
  presentationType: z.enum(["boolean", "select", "slider", "multi_select", "text"]),
  dimensionId: z.number().int().positive().optional(),
  configJson: z.record(z.string(), z.unknown()).optional(),
});

export const createQuestionPresentationsBatchSchema = z.object({

  versionId: z.number().int().positive(),
  items: z.array(z.object({
    questionId: z.number().int().positive(),
    presentationType: z.enum(["boolean", "select", "slider", "multi_select", "text"]),
    dimensionId: z.number().int().positive().optional(),
    configJson: z.record(z.string(), z.unknown()).optional(),
  })).min(1).max(500),
});

export const updateQuestionPresentationSchema = z.object({

  questionId: z.number().int().positive(),
  presentationType: z.enum(["boolean", "select", "slider", "multi_select", "text"]).optional(),
  dimensionId: z.number().int().positive().nullable().optional(),
  configJson: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

// ── Delete Operations ──────────────────────────────────────────────

export const deleteScopeSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const deleteQuestionSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const deleteDimensionSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const deleteDimensionValueSchema = z.object({

  dimensionId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const deleteCellSchema = z.object({

  versionId: z.number().int().positive(),
  id: z.number().int().positive(),
});

// ── Matrix Versioning ──────────────────────────────────────────────

export const deepValidateMatrixSchema = z.object({

  versionId: z.number().int().positive(),
});

export const safeActivateMatrixSchema = z.object({

  versionId: z.number().int().positive(),
});

export const rollbackMatrixSchema = z.void();

export const compareMatrixVersionsSchema = z.object({

  baseVersionId: z.number().int().positive(),
  targetVersionId: z.number().int().positive(),
});

// ── Wizard Accept ──────────────────────────────────────────────────

export const acceptWizardResultSchema = z.object({

  scenarioText: z.string().min(1).max(5000),
  projectName: z.string().min(1).max(255),
  selectedScopeCode: z.string().min(1).max(120),
  selectedScopeLabel: z.string().min(1).max(255),
  matrixVersion: z.string().min(1).max(50),
  answers: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
  confidence: z.number().min(0).max(100),
  overrideInfo: z.object({
    scopeCode: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }).nullable().optional(),
  inputPayload: z.record(z.string(), z.unknown()).optional(),
  resultPayload: z.record(z.string(), z.unknown()).optional(),
});

// ── Scope Template Mappings ──────────────────────────────────────────

export const createScopeTemplateMappingSchema = z.object({

  scopeCode: z.string().min(1).max(120),
  systemType: z.string().min(1).max(100),
  lifecycleType: z.string().max(100).optional(),
  governanceProfile: z.string().max(100).optional(),
  methodsJson: z.array(z.string().max(120)).max(20).optional(),
  frameworksJson: z.array(z.string().max(120)).max(20).optional(),
  workflowJson: z.object({
    phases: z.array(z.object({
      name: z.string().min(1).max(120),
      gateType: z.string().max(50).optional(),
      deliverables: z.array(z.string().max(200)).max(20).optional(),
    })).min(1).max(20),
    reviewCadence: z.string().max(50).optional(),
  }).optional(),
  demandTemplateJson: z.array(z.object({
    role: z.string().min(1).max(200),
    capabilityTags: z.array(z.string().max(100)).max(20),
    quantity: z.number().int().min(1).max(100),
    seniorityLevel: z.string().max(50),
  })).optional(),
});

export const listScopeTemplateMappingsSchema = z.void();

// ── Simulation ──────────────────────────────────────────────────────

export const runSimulationSchema = z.object({

  versionId: z.number().int().positive(),
  compareVersionId: z.number().int().positive().optional(),
  answers: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
});

export const listSimulationsSchema = z.void();

// ── Evaluation Cases ────────────────────────────────────────────────

export const createEvalCaseSchema = z.object({

  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  answersJson: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
  expectedScopeCode: z.string().min(1).max(120),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const getEvalCaseSchema = z.object({

  id: z.number().int().positive(),
});

export const listEvalCasesSchema = z.void();

export const updateEvalCaseSchema = z.object({

  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  answersJson: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
  expectedScopeCode: z.string().min(1).max(120).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isActive: z.number().int().min(0).max(1).optional(),
});

export const deleteEvalCaseSchema = z.object({

  id: z.number().int().positive(),
});

// ── Evaluation Suite ────────────────────────────────────────────────

export const runEvaluationSuiteSchema = z.object({

  versionId: z.number().int().positive(),
  caseIds: z.array(z.number().int().positive()).max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const listEvalRunsSchema = z.void();

export const getEvalRunSchema = z.object({

  id: z.number().int().positive(),
});

// ── Overrides ───────────────────────────────────────────────────────

export const overrideRecommendationSchema = z.object({

  wizardRunId: z.number().int().positive().optional(),
  recommendedScopeCode: z.string().min(1).max(120),
  overriddenScopeCode: z.string().min(1).max(120),
  reason: z.string().min(1).max(2000),
  recommendedConfidence: z.number().min(0).max(100).optional(),
  matrixVersion: z.string().max(50).optional(),
  answersJson: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
});

export const listOverridesSchema = z.void();

export const getOverridePatternsSchema = z.void();

// ── Classification ──────────────────────────────────────────────────

export const classifyScenarioSchema = z.object({

  scenarioText: z.string().min(1, "Scenario text is required").max(5000),
  dimensions: z.object({
    domain: z.enum(["software", "infrastructure", "business_process", "organizational_change", "construction", "research"]),
    orgLevel: z.enum(["team", "department", "program", "portfolio", "enterprise"]),
    criticality: z.enum(["low", "medium", "high", "critical"]),
    deliveryStyle: z.enum(["waterfall", "agile", "hybrid", "continuous", "phased"]),
    valueOrientation: z.enum(["cost_reduction", "revenue_growth", "compliance", "innovation", "efficiency", "customer_experience"]),
    lifecycleFocus: z.enum(["initiation", "planning", "execution", "monitoring", "closure", "product", "operations"]),
  }),
});
