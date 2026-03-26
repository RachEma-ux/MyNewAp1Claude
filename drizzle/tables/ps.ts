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
  workspaceId: integer("workspace_id").notNull(),
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
  wsIdx: index("ps_systems_ws_idx").on(table.workspaceId),
  statusIdx: index("ps_systems_status_idx").on(table.status),
  typeIdx: index("ps_systems_type_idx").on(table.systemType),
  nameUniq: unique("ps_systems_name_uniq").on(table.workspaceId, table.name),
}));

export type PsSystem = typeof psSystems.$inferSelect;
export type InsertPsSystem = typeof psSystems.$inferInsert;

// ============================================================================
// 2. PS Wizard Runs — Wizard execution history
// ============================================================================

export const psWizardRuns = pgTable("ps_wizard_runs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  scenarioText: text("scenario_text").notNull(),
  inputPayload: json("input_payload").$type<Record<string, unknown>>(),
  resultPayload: json("result_payload").$type<Record<string, unknown>>(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  selectedSystemType: varchar("selected_system_type", { length: 100 }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("ps_wizard_runs_ws_idx").on(table.workspaceId),
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
  workspaceId: integer("workspace_id"),
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
  wsIdx: index("ps_audit_ws_idx").on(table.workspaceId),
  actionIdx: index("ps_audit_action_idx").on(table.action),
}));

export type PsAuditEntry = typeof psAuditLog.$inferSelect;
export type InsertPsAuditEntry = typeof psAuditLog.$inferInsert;

// ============================================================================
// 5. PS Resource Requests — Demand owned by PS
// ============================================================================

export const psResourceRequests = pgTable("ps_resource_requests", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
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
  wsIdx: index("ps_resource_requests_ws_idx").on(table.workspaceId),
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
  workspaceId: integer("workspace_id").notNull(),
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
  wsIdx: index("ps_resource_assignments_ws_idx").on(table.workspaceId),
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
  workspaceId: integer("workspace_id").notNull(),
  version: varchar("version", { length: 50 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | archived
  sourceType: varchar("source_type", { length: 20 }), // excel | json | manual
  sourceName: varchar("source_name", { length: 255 }),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  activatedAt: timestamp("activated_at"),
}, (table) => ({
  wsIdx: index("ps_matrix_versions_ws_idx").on(table.workspaceId),
  statusIdx: index("ps_matrix_versions_status_idx").on(table.status),
  versionUniq: unique("ps_matrix_versions_uniq").on(table.workspaceId, table.version),
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
  workspaceId: integer("workspace_id").notNull(),
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
  wsIdx: index("ps_matrix_imports_ws_idx").on(table.workspaceId),
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
