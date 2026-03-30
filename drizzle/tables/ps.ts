/**
 * PS (Projects System) Tables
 *
 * Foundation tables for the PS module:
 * - ps_systems: Defined project systems (not project instances)
 * - ps_wizard_runs: Wizard execution history
 * - ps_catalog_system_types: Reference catalog of system types
 * - ps_audit_log: PS-specific audit trail
 * - ps_resource_requests: Demand owned by PS
 * - ps_resource_assignments: Assignment-facing records linked to demand
 */

import {
  serial,
  varchar,
  text,
  integer,
  timestamp,
  json,
  pgTable,
  index,
  unique,
  numeric,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. PS Systems — Defined project systems
// ============================================================================

export const psSystems = pgTable("ps_systems", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemType: varchar("system_type", { length: 100 }).notNull(),
  lifecycleType: varchar("lifecycle_type", { length: 100 }),
  governanceProfile: varchar("governance_profile", { length: 100 }),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | archived
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("ps_systems_status_idx").on(table.status),
  typeIdx: index("ps_systems_type_idx").on(table.systemType),
  nameUniq: unique("ps_systems_name_uniq").on(table.name),
}));

export type PsSystem = typeof psSystems.$inferSelect;
export type InsertPsSystem = typeof psSystems.$inferInsert;

// ============================================================================
// 2. PS Wizard Runs — Wizard execution history
// ============================================================================

export const psWizardRuns = pgTable("ps_wizard_runs", {
  id: serial("id").primaryKey(),
  scenarioText: text("scenario_text").notNull(),
  inputPayload: json("input_payload").$type<Record<string, unknown>>(),
  resultPayload: json("result_payload").$type<Record<string, unknown>>(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  selectedSystemType: varchar("selected_system_type", { length: 100 }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("ps_wizard_runs_type_idx").on(table.selectedSystemType),
}));

export type PsWizardRun = typeof psWizardRuns.$inferSelect;
export type InsertPsWizardRun = typeof psWizardRuns.$inferInsert;

// ============================================================================
// 3. PS Catalog System Types — Reference catalog
// ============================================================================

export const psCatalogSystemTypes = pgTable("ps_catalog_system_types", {
  id: serial("id").primaryKey(),
  systemType: varchar("system_type", { length: 100 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  typeUniq: unique("ps_catalog_type_uniq").on(table.systemType),
}));

export type PsCatalogSystemType = typeof psCatalogSystemTypes.$inferSelect;
export type InsertPsCatalogSystemType = typeof psCatalogSystemTypes.$inferInsert;

// ============================================================================
// 4. PS Audit Log
// ============================================================================

export const psAuditLog = pgTable("ps_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  previousValue: json("previous_value").$type<Record<string, unknown>>(),
  newValue: json("new_value").$type<Record<string, unknown>>(),
  category: varchar("category", { length: 50 }).default("mutation"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  actionIdx: index("ps_audit_action_idx").on(table.action),
}));

export type PsAuditEntry = typeof psAuditLog.$inferSelect;
export type InsertPsAuditEntry = typeof psAuditLog.$inferInsert;

// ============================================================================
// 5. PS Resource Requests — Demand owned by PS
// ============================================================================

export const psResourceRequests = pgTable("ps_resource_requests", {
  id: serial("id").primaryKey(),
  psSystemId: integer("ps_system_id").notNull(),
  role: varchar("role", { length: 200 }).notNull(),
  capabilityTags: json("capability_tags").$type<string[]>().default([]),
  quantity: integer("quantity").notNull().default(1),
  seniorityLevel: varchar("seniority_level", { length: 50 }).default("mid"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  allocationPercentage: integer("allocation_percentage").default(100),
  status: varchar("status", { length: 30 }).default("draft").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  systemIdx: index("ps_resource_requests_system_idx").on(table.psSystemId),
  statusIdx: index("ps_resource_requests_status_idx").on(table.status),
}));

export type PsResourceRequest = typeof psResourceRequests.$inferSelect;
export type InsertPsResourceRequest = typeof psResourceRequests.$inferInsert;

// ============================================================================
// 6. PS Resource Assignments — Assignment-facing records linked to demand
// ============================================================================

export const psResourceAssignments = pgTable("ps_resource_assignments", {
  id: serial("id").primaryKey(),
  resourceRequestId: integer("resource_request_id").notNull(),
  psSystemId: integer("ps_system_id").notNull(),
  assignmentRole: varchar("assignment_role", { length: 200 }).notNull(),
  assigneeRefType: varchar("assignee_ref_type", { length: 50 }).notNull(), // person | team | org_unit | external | placeholder
  assigneeRefId: varchar("assignee_ref_id", { length: 200 }),
  assigneeDisplayName: varchar("assignee_display_name", { length: 300 }),
  allocationPercentage: integer("allocation_percentage").default(100),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 30 }).default("proposed").notNull(), // proposed | requested | confirmed | active | rejected | cancelled | completed
  source: varchar("source", { length: 50 }).default("manual").notNull(), // wizard | manual | import | future_hr_sync
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  requestIdx: index("ps_resource_assignments_request_idx").on(table.resourceRequestId),
  systemIdx: index("ps_resource_assignments_system_idx").on(table.psSystemId),
  statusIdx: index("ps_resource_assignments_status_idx").on(table.status),
}));

export type PsResourceAssignment = typeof psResourceAssignments.$inferSelect;
export type InsertPsResourceAssignment = typeof psResourceAssignments.$inferInsert;

// ============================================================================
// 7. PS Matrix Versions — Versioned classification matrices
// ============================================================================

export const psMatrixVersions = pgTable("ps_matrix_versions", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 50 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | archived
  sourceType: varchar("source_type", { length: 20 }), // excel | json | manual
  sourceName: varchar("source_name", { length: 255 }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  activatedAt: timestamp("activated_at"),
}, (table) => ({
  statusIdx: index("ps_matrix_versions_status_idx").on(table.status),
  versionUniq: unique("ps_matrix_versions_uniq").on(table.version),
}));

export type PsMatrixVersion = typeof psMatrixVersions.$inferSelect;
export type InsertPsMatrixVersion = typeof psMatrixVersions.$inferInsert;

// ============================================================================
// 8. PS Scope Registry — Scope targets per matrix version
// ============================================================================

export const psScopeRegistry = pgTable("ps_scope_registry", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  code: varchar("code", { length: 120 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  family: varchar("family", { length: 120 }),
  isActive: integer("is_active").default(1).notNull(), // 1=active, 0=inactive
  sourceRowNumber: integer("source_row_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("ps_scope_registry_version_idx").on(table.versionId),
  codeUniq: unique("ps_scope_registry_code_uniq").on(table.versionId, table.code),
}));

export type PsScopeRegistry = typeof psScopeRegistry.$inferSelect;
export type InsertPsScopeRegistry = typeof psScopeRegistry.$inferInsert;

// ============================================================================
// 9. PS Matrix Questions — Decision inputs per matrix version
// ============================================================================

export const psMatrixQuestions = pgTable("ps_matrix_questions", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  label: varchar("label", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: integer("is_active").default(1).notNull(),
}, (table) => ({
  versionIdx: index("ps_matrix_questions_version_idx").on(table.versionId),
  codeUniq: unique("ps_matrix_questions_code_uniq").on(table.versionId, table.code),
  sortIdx: index("ps_matrix_questions_sort_idx").on(table.versionId, table.sortOrder),
}));

export type PsMatrixQuestion = typeof psMatrixQuestions.$inferSelect;
export type InsertPsMatrixQuestion = typeof psMatrixQuestions.$inferInsert;

// ============================================================================
// 10. PS Matrix Cells — Weight matrix (question × scope)
// ============================================================================

export const psMatrixCells = pgTable("ps_matrix_cells", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  questionId: integer("question_id").notNull(),
  scopeId: integer("scope_id").notNull(),
  weight: integer("weight").notNull().default(0),
}, (table) => ({
  versionIdx: index("ps_matrix_cells_version_idx").on(table.versionId),
  questionIdx: index("ps_matrix_cells_question_idx").on(table.questionId),
  scopeIdx: index("ps_matrix_cells_scope_idx").on(table.scopeId),
  cellUniq: unique("ps_matrix_cells_uniq").on(table.versionId, table.questionId, table.scopeId),
}));

export type PsMatrixCell = typeof psMatrixCells.$inferSelect;
export type InsertPsMatrixCell = typeof psMatrixCells.$inferInsert;

// ============================================================================
// 11. PS Matrix Imports — Import traceability
// ============================================================================

export const psMatrixImports = pgTable("ps_matrix_imports", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id"),
  importType: varchar("import_type", { length: 20 }), // scope_matrix | scoring_matrix
  sourceType: varchar("source_type", { length: 30 }).notNull(), // json | excel | manual
  sourceName: varchar("source_name", { length: 255 }),
  sheetName: varchar("sheet_name", { length: 255 }),
  rawPayloadJson: json("raw_payload_json").$type<Record<string, unknown>>(),
  importStatus: varchar("import_status", { length: 30 }).default("pending").notNull(), // pending | previewed | committed | failed
  totalRows: integer("total_rows").default(0),
  importedRows: integer("imported_rows").default(0),
  skippedRows: integer("skipped_rows").default(0),
  scopesCount: integer("scopes_count").default(0),
  questionsCount: integer("questions_count").default(0),
  cellsCount: integer("cells_count").default(0),
  warningsJson: json("warnings_json").$type<string[]>(),
  errorsJson: json("errors_json").$type<string[]>(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  committedAt: timestamp("committed_at"),
}, (table) => ({
  versionIdx: index("ps_matrix_imports_version_idx").on(table.versionId),
  statusIdx: index("ps_matrix_imports_status_idx").on(table.importStatus),
}));

export type PsMatrixImport = typeof psMatrixImports.$inferSelect;
export type InsertPsMatrixImport = typeof psMatrixImports.$inferInsert;

// ============================================================================
// 12. PS Scope Matrix Profile — Standards/methods/frameworks per scope
// ============================================================================

export const psScopeMatrixProfile = pgTable("ps_scope_matrix_profile", {
  id: serial("id").primaryKey(),
  scopeId: integer("scope_id").notNull(),
  // Standards (columns B–G from Excel)
  pmiValue: varchar("pmi_value", { length: 255 }),
  prince2Value: varchar("prince2_value", { length: 255 }),
  isoValue: varchar("iso_value", { length: 255 }),
  ipmaValue: varchar("ipma_value", { length: 255 }),
  cmmiValue: varchar("cmmi_value", { length: 255 }),
  aspiceValue: varchar("aspice_value", { length: 255 }),
  // Methods & Frameworks (columns H–L)
  leanMethodValue: varchar("lean_method_value", { length: 255 }),
  agileFrameworkValue: varchar("agile_framework_value", { length: 255 }),
  traditionalMethodValue: varchar("traditional_method_value", { length: 255 }),
  agileFrameworksValue: varchar("agile_frameworks_value", { length: 255 }),
  hybridMethodValue: varchar("hybrid_method_value", { length: 255 }),
  // Case scenario & selected outputs (columns M–O)
  caseScenario: text("case_scenario"),
  selectedStandards: varchar("selected_standards", { length: 255 }),
  selectedFrameworks: varchar("selected_frameworks", { length: 255 }),
  // Traceability
  rawRowJson: json("raw_row_json").$type<Record<string, unknown>>(),
  // Type classification map: header_key → type (Standard|Method|Framework|Standards|Methods|Frameworks)
  typeMapJson: json("type_map_json").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  scopeIdx: index("ps_scope_matrix_profile_scope_idx").on(table.scopeId),
  scopeUniq: unique("ps_scope_matrix_profile_scope_uniq").on(table.scopeId),
}));

export type PsScopeMatrixProfile = typeof psScopeMatrixProfile.$inferSelect;
export type InsertPsScopeMatrixProfile = typeof psScopeMatrixProfile.$inferInsert;

// ============================================================================
// 13. PS Scope Matrix Headers — Normalized header definitions per version
// ============================================================================

export const psScopeMatrixHeaders = pgTable("ps_scope_matrix_headers", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  headerKey: varchar("header_key", { length: 120 }).notNull(),
  headerLabel: varchar("header_label", { length: 255 }).notNull(),
  headerType: varchar("header_type", { length: 50 }), // Standard | Method | Framework | Standards | Methods | Frameworks | null
  isActive: integer("is_active").default(1).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("ps_scope_matrix_headers_version_idx").on(table.versionId),
  keyUniq: unique("ps_scope_matrix_headers_key_uniq").on(table.versionId, table.headerKey),
  sortIdx: index("ps_scope_matrix_headers_sort_idx").on(table.versionId, table.sortOrder),
}));

export type PsScopeMatrixHeader = typeof psScopeMatrixHeaders.$inferSelect;
export type InsertPsScopeMatrixHeader = typeof psScopeMatrixHeaders.$inferInsert;

// ============================================================================
// 14. PS Dimensions — DB-driven classification dimensions (replaces hard-coded enums)
// ============================================================================

export const psDimensions = pgTable("ps_dimensions", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  dimensionKey: varchar("dimension_key", { length: 100 }).notNull(),
  dimensionLabel: varchar("dimension_label", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("ps_dimensions_version_idx").on(table.versionId),
  keyUniq: unique("ps_dimensions_key_uniq").on(table.versionId, table.dimensionKey),
  sortIdx: index("ps_dimensions_sort_idx").on(table.versionId, table.sortOrder),
}));

export type PsDimension = typeof psDimensions.$inferSelect;
export type InsertPsDimension = typeof psDimensions.$inferInsert;

// ============================================================================
// 15. PS Dimension Values — Enumerated values per dimension
// ============================================================================

export const psDimensionValues = pgTable("ps_dimension_values", {
  id: serial("id").primaryKey(),
  dimensionId: integer("dimension_id").notNull(),
  valueKey: varchar("value_key", { length: 100 }).notNull(),
  valueLabel: varchar("value_label", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  dimensionIdx: index("ps_dimension_values_dim_idx").on(table.dimensionId),
  keyUniq: unique("ps_dimension_values_key_uniq").on(table.dimensionId, table.valueKey),
  sortIdx: index("ps_dimension_values_sort_idx").on(table.dimensionId, table.sortOrder),
}));

export type PsDimensionValue = typeof psDimensionValues.$inferSelect;
export type InsertPsDimensionValue = typeof psDimensionValues.$inferInsert;

// ============================================================================
// 16. PS Matrix Question Presentations — UI metadata per question
// ============================================================================

export const psMatrixQuestionPresentations = pgTable("ps_matrix_question_presentations", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  presentationType: varchar("presentation_type", { length: 50 }).notNull(), // boolean | select | slider | multi_select
  dimensionId: integer("dimension_id"), // optional link to a dimension for select-type
  configJson: json("config_json").$type<Record<string, unknown>>(),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  questionIdx: index("ps_matrix_qp_question_idx").on(table.questionId),
  questionUniq: unique("ps_matrix_qp_question_uniq").on(table.questionId),
}));

export type PsMatrixQuestionPresentation = typeof psMatrixQuestionPresentations.$inferSelect;
export type InsertPsMatrixQuestionPresentation = typeof psMatrixQuestionPresentations.$inferInsert;

// ============================================================================
// 17. PS Scope Template Mappings — Scope → operational template
// ============================================================================

export const psScopeTemplateMappings = pgTable("ps_scope_template_mappings", {
  id: serial("id").primaryKey(),
  scopeCode: varchar("scope_code", { length: 120 }).notNull(),
  systemType: varchar("system_type", { length: 100 }).notNull(),
  lifecycleType: varchar("lifecycle_type", { length: 100 }),
  governanceProfile: varchar("governance_profile", { length: 100 }),
  methodsJson: json("methods_json").$type<string[]>(),
  frameworksJson: json("frameworks_json").$type<string[]>(),
  workflowJson: json("workflow_json").$type<{
    phases: Array<{ name: string; gateType?: string; deliverables?: string[] }>;
    reviewCadence?: string;
  }>(),
  demandTemplateJson: json("demand_template_json").$type<Array<{
    role: string;
    capabilityTags: string[];
    quantity: number;
    seniorityLevel: string;
  }>>(),
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  scopeUniq: unique("ps_scope_template_scope_uniq").on(table.scopeCode),
}));

export type PsScopeTemplateMapping = typeof psScopeTemplateMappings.$inferSelect;
export type InsertPsScopeTemplateMapping = typeof psScopeTemplateMappings.$inferInsert;

// ============================================================================
// 18. PS Eval Cases — Benchmark test cases for matrix evaluation
// ============================================================================

export const psEvalCases = pgTable("ps_eval_cases", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  answersJson: json("answers_json").$type<Record<string, boolean | string | number>>().notNull(),
  expectedScopeCode: varchar("expected_scope_code", { length: 120 }).notNull(),
  tags: json("tags").$type<string[]>().default([]),
  isActive: integer("is_active").default(1).notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameUniq: unique("ps_eval_cases_name_uniq").on(table.name),
}));

export type PsEvalCase = typeof psEvalCases.$inferSelect;
export type InsertPsEvalCase = typeof psEvalCases.$inferInsert;

// ============================================================================
// 19. PS Eval Runs — Evaluation suite execution records
// ============================================================================

export const psEvalRuns = pgTable("ps_eval_runs", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  totalCases: integer("total_cases").notNull().default(0),
  passedCases: integer("passed_cases").notNull().default(0),
  failedCases: integer("failed_cases").notNull().default(0),
  passRate: numeric("pass_rate", { precision: 5, scale: 2 }),
  resultsJson: json("results_json").$type<Array<Record<string, unknown>>>(),
  status: varchar("status", { length: 30 }).default("completed").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("ps_eval_runs_version_idx").on(table.versionId),
}));

export type PsEvalRun = typeof psEvalRuns.$inferSelect;
export type InsertPsEvalRun = typeof psEvalRuns.$inferInsert;

// ============================================================================
// 20. PS Matrix Simulations — Simulation run records
// ============================================================================

export const psMatrixSimulations = pgTable("ps_matrix_simulations", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull(),
  compareVersionId: integer("compare_version_id"),
  answersJson: json("answers_json").$type<Record<string, boolean | string | number>>().notNull(),
  resultJson: json("result_json").$type<Record<string, unknown>>(),
  compareResultJson: json("compare_result_json").$type<Record<string, unknown>>(),
  diffSummary: text("diff_summary"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("ps_matrix_simulations_version_idx").on(table.versionId),
}));

export type PsMatrixSimulation = typeof psMatrixSimulations.$inferSelect;
export type InsertPsMatrixSimulation = typeof psMatrixSimulations.$inferInsert;

// ============================================================================
// 21. PS Wizard Overrides — User overrides of matrix recommendations
// ============================================================================

export const psWizardOverrides = pgTable("ps_wizard_overrides", {
  id: serial("id").primaryKey(),
  wizardRunId: integer("wizard_run_id"),
  recommendedScopeCode: varchar("recommended_scope_code", { length: 120 }).notNull(),
  overriddenScopeCode: varchar("overridden_scope_code", { length: 120 }).notNull(),
  reason: text("reason").notNull(),
  recommendedConfidence: numeric("recommended_confidence", { precision: 5, scale: 2 }),
  matrixVersion: varchar("matrix_version", { length: 50 }),
  answersJson: json("answers_json").$type<Record<string, boolean | string | number>>(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  wizardRunIdx: index("ps_wizard_overrides_run_idx").on(table.wizardRunId),
  recommendedIdx: index("ps_wizard_overrides_recommended_idx").on(table.recommendedScopeCode),
  overriddenIdx: index("ps_wizard_overrides_overridden_idx").on(table.overriddenScopeCode),
}));

export type PsWizardOverride = typeof psWizardOverrides.$inferSelect;
export type InsertPsWizardOverride = typeof psWizardOverrides.$inferInsert;

// ============================================================================
// 22. PS Projects — Formal project artifacts produced by the PS Wizard
// ============================================================================

export const psProjects = pgTable("ps_projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  scenario: text("scenario").notNull(),
  contextJson: json("context_json").$type<Record<string, string>>().default({}),
  selectedScopeCode: varchar("selected_scope_code", { length: 120 }).notNull(),
  topScopesJson: json("top_scopes_json").$type<Array<{ scopeCode: string; scopeLabel: string; score: number }>>().default([]),
  confidence: varchar("confidence", { length: 30 }),
  explainabilityJson: json("explainability_json").$type<{ positiveContributors: string[]; negativeContributors: string[] }>(),
  matrixVersionId: integer("matrix_version_id"),
  templateBundleJson: json("template_bundle_json").$type<Record<string, unknown>>(),
  wizardRunId: integer("wizard_run_id"),
  status: varchar("status", { length: 30 }).default("DRAFT").notNull(), // DRAFT | SUBMITTED | VALIDATED | REJECTED | PUBLISHED | SENT_TO_PM
  /** Admin validation note (approve/reject reason) */
  validationNote: text("validation_note"),
  /** Who validated (approved/rejected) this project */
  validatedBy: integer("validated_by"),
  /** When the validation decision was made */
  validatedAt: timestamp("validated_at"),
  /** PM Central project ID after handoff */
  pmProjectId: integer("pm_project_id"),
  /** Override reason when user overrides recommendation or creates under low confidence */
  overrideReason: text("override_reason"),
  /** Winner margin from scoring (top score minus second score) */
  winnerMargin: numeric("winner_margin", { precision: 10, scale: 2 }),
  /** Confidence gate result: HIGH | MEDIUM | LOW */
  confidenceGateResult: varchar("confidence_gate_result", { length: 20 }),
  /** KPI targets captured at project creation */
  kpiTargetsJson: json("kpi_targets_json").$type<{
    expectedCostSavings?: string;
    expectedTimeReductionPercent?: string;
    expectedRevenueImpact?: string;
    expectedDeliveryTimelineWeeks?: string;
    primarySuccessMetric?: string;
  }>(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("ps_projects_status_idx").on(table.status),
  scopeIdx: index("ps_projects_scope_idx").on(table.selectedScopeCode),
  nameUniq: unique("ps_projects_name_uniq").on(table.name),
}));

export type PsProject = typeof psProjects.$inferSelect;
export type InsertPsProject = typeof psProjects.$inferInsert;

// ============================================================================
// 23. PS Feedback — Execution feedback linked to PS + PM projects
// ============================================================================

export const psFeedback = pgTable("ps_feedback", {
  id: serial("id").primaryKey(),
  psProjectId: integer("ps_project_id").notNull(),
  pmProjectId: integer("pm_project_id"),
  outcome: varchar("outcome", { length: 100 }).notNull(), // success | partial | failed | cancelled
  driftFlag: integer("drift_flag").default(0).notNull(), // 0=no drift, 1=drift detected
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  psProjectIdx: index("ps_feedback_ps_project_idx").on(table.psProjectId),
  pmProjectIdx: index("ps_feedback_pm_project_idx").on(table.pmProjectId),
  outcomeIdx: index("ps_feedback_outcome_idx").on(table.outcome),
}));

export type PsFeedback = typeof psFeedback.$inferSelect;
export type InsertPsFeedback = typeof psFeedback.$inferInsert;

// ============================================================================
// 24. PS Ideations — Pre-project intake & concept lab records
// ============================================================================

export const psIdeations = pgTable("ps_ideations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).default("manual").notNull(), // manual | import | template | ai
  workflowVersion: varchar("workflow_version", { length: 20 }).default("1.0").notNull(),
  lifecycleStatus: varchar("lifecycle_status", { length: 50 }).default("draft").notNull(), // draft | in_exploration | screening | concept_selected | ready_for_wizard | deferred | rejected | converted
  currentStepKey: varchar("current_step_key", { length: 50 }).default("context").notNull(),
  selectedIdeaId: integer("selected_idea_id"),
  problemStatementSnapshot: text("problem_statement_snapshot"),
  opportunityStatementSnapshot: text("opportunity_statement_snapshot"),
  guidingQuestionSnapshot: text("guiding_question_snapshot"),
  selectedConceptSummary: text("selected_concept_summary"),
  rationaleSummary: text("rationale_summary"),
  feasibilityScore: varchar("feasibility_score", { length: 20 }), // High | Medium | Low
  riskLevel: varchar("risk_level", { length: 20 }), // low | medium | high | critical
  summaryGeneratedText: text("summary_generated_text"),
  summaryOverrideText: text("summary_override_text"),
  readinessSnapshotJson: json("readiness_snapshot_json").$type<Record<string, unknown>>(),
  conversionProjectId: integer("conversion_project_id"),
  createdBy: integer("created_by").notNull(),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  readyAt: timestamp("ready_at"),
  convertedAt: timestamp("converted_at"),
}, (table) => ({
  wsStatusIdx: index("ps_ideations_ws_status_idx").on(table.workspaceId, table.lifecycleStatus),
  wsCreatedIdx: index("ps_ideations_ws_created_idx").on(table.workspaceId, table.createdAt),
  conversionIdx: index("ps_ideations_conversion_idx").on(table.conversionProjectId),
}));

export type PsIdeation = typeof psIdeations.$inferSelect;
export type InsertPsIdeation = typeof psIdeations.$inferInsert;

// ============================================================================
// 25. PS Ideation Steps — Step state tracking for the 11-step workflow
// ============================================================================

export const psIdeationSteps = pgTable("ps_ideation_steps", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  stepKey: varchar("step_key", { length: 50 }).notNull(),
  stepOrder: integer("step_order").notNull(),
  stepStatus: varchar("step_status", { length: 30 }).default("not_started").notNull(), // not_started | in_progress | complete | blocked
  payloadJson: json("payload_json").$type<Record<string, unknown>>(),
  lastSavedAt: timestamp("last_saved_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  ideationIdx: index("ps_ideation_steps_ideation_idx").on(table.ideationId),
  stepUniq: unique("ps_ideation_steps_uniq").on(table.ideationId, table.stepKey),
}));

export type PsIdeationStep = typeof psIdeationSteps.$inferSelect;
export type InsertPsIdeationStep = typeof psIdeationSteps.$inferInsert;

// ============================================================================
// 26. PS Ideation Ideas — Raw idea pool
// ============================================================================

export const psIdeationIdeas = pgTable("ps_ideation_ideas", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sourceType: varchar("source_type", { length: 50 }).default("brainstorm"), // brainstorm | ai | import | reference
  themeId: integer("theme_id"),
  rankOrder: integer("rank_order").default(0),
  isShortlisted: integer("is_shortlisted").default(0).notNull(), // 0=no, 1=yes
  isSelected: integer("is_selected").default(0).notNull(), // 0=no, 1=yes (exactly one)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_ideas_ideation_idx").on(table.ideationId),
  themeIdx: index("ps_ideation_ideas_theme_idx").on(table.themeId),
}));

export type PsIdeationIdea = typeof psIdeationIdeas.$inferSelect;
export type InsertPsIdeationIdea = typeof psIdeationIdeas.$inferInsert;

// ============================================================================
// 27. PS Ideation Themes — Idea clustering groups
// ============================================================================

export const psIdeationThemes = pgTable("ps_ideation_themes", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  patternNotes: text("pattern_notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_themes_ideation_idx").on(table.ideationId),
}));

export type PsIdeationTheme = typeof psIdeationThemes.$inferSelect;
export type InsertPsIdeationTheme = typeof psIdeationThemes.$inferInsert;

// ============================================================================
// 28. PS Ideation Screening Scores — Per-idea scoring
// ============================================================================

export const psIdeationScreeningScores = pgTable("ps_ideation_screening_scores", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  ideaId: integer("idea_id").notNull(),
  criterionKey: varchar("criterion_key", { length: 100 }).notNull(),
  score: integer("score").notNull(),
  note: text("note"),
  scoredBy: integer("scored_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_screening_ideation_idx").on(table.ideationId),
  criterionUniq: unique("ps_ideation_screening_uniq").on(table.ideationId, table.ideaId, table.criterionKey),
}));

export type PsIdeationScreeningScore = typeof psIdeationScreeningScores.$inferSelect;
export type InsertPsIdeationScreeningScore = typeof psIdeationScreeningScores.$inferInsert;

// ============================================================================
// 29. PS Ideation Scenarios — What-if scenario exploration
// ============================================================================

export const psIdeationScenarios = pgTable("ps_ideation_scenarios", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  ideaId: integer("idea_id").notNull(),
  adoptionHighText: text("adoption_high_text"),
  adoptionLowText: text("adoption_low_text"),
  costIncreaseText: text("cost_increase_text"),
  competitorReactionText: text("competitor_reaction_text"),
  technologyLimitText: text("technology_limit_text"),
  insightsText: text("insights_text"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_scenarios_ideation_idx").on(table.ideationId),
  ideaIdx: index("ps_ideation_scenarios_idea_idx").on(table.ideaId),
}));

export type PsIdeationScenario = typeof psIdeationScenarios.$inferSelect;
export type InsertPsIdeationScenario = typeof psIdeationScenarios.$inferInsert;

// ============================================================================
// 30. PS Ideation Feasibility Checks — Quick feasibility validation
// ============================================================================

export const psIdeationFeasibilityChecks = pgTable("ps_ideation_feasibility_checks", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  ideaId: integer("idea_id").notNull(),
  testPerformed: text("test_performed").notNull(),
  finding1: text("finding_1"),
  finding2: text("finding_2"),
  feasibilityRating: varchar("feasibility_rating", { length: 20 }).notNull(), // High | Medium | Low
  confidence: varchar("confidence", { length: 20 }),
  evidenceRef: text("evidence_ref"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_feasibility_ideation_idx").on(table.ideationId),
  ideaIdx: index("ps_ideation_feasibility_idea_idx").on(table.ideaId),
}));

export type PsIdeationFeasibilityCheck = typeof psIdeationFeasibilityChecks.$inferSelect;
export type InsertPsIdeationFeasibilityCheck = typeof psIdeationFeasibilityChecks.$inferInsert;

// ============================================================================
// 31. PS Ideation Activity — Structured audit events
// ============================================================================

export const psIdeationActivity = pgTable("ps_ideation_activity", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payloadJson: json("payload_json").$type<Record<string, unknown>>(),
  actorId: integer("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_activity_ideation_idx").on(table.ideationId),
  eventIdx: index("ps_ideation_activity_event_idx").on(table.eventType),
}));

export type PsIdeationActivity = typeof psIdeationActivity.$inferSelect;
export type InsertPsIdeationActivity = typeof psIdeationActivity.$inferInsert;
