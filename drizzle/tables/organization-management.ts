/**
 * Organization Management (OM) Tables
 *
 * OM owns the platform's formal organizational structure:
 * - Legal entities (companies, subsidiaries)
 * - Org units (departments, divisions, teams, business units)
 * - Jobs (role definitions with family/level)
 * - Positions (approved organizational seats)
 * - Reporting relationships (manager → position chain)
 * - Cost centers
 * - Authority chains (derived from structure)
 * - Structure versions (draft/publish/version model)
 *
 * OM ≠ HR: OM owns structure, HR owns people.
 * OM ≠ PM: OM owns authority, PM owns projects.
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  json,
  pgTable,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. Legal Entities — Companies, subsidiaries, holding structures
// ============================================================================

export const omLegalEntities = pgTable("om_legal_entities", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).default("company").notNull(), // company | subsidiary | branch | holding
  parentEntityId: integer("parent_entity_id"), // self-ref for holding structures
  country: varchar("country", { length: 100 }),
  registrationNumber: varchar("registration_number", { length: 100 }),
  legalStructure: varchar("legal_structure", { length: 50 }), // sole_proprietorship | partnership | llc | corporation
  taxElection: varchar("tax_election", { length: 50 }), // none | s_corp
  incorporationState: varchar("incorporation_state", { length: 100 }),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | dissolved
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_legal_entity_ws_idx").on(table.workspaceId),
  codeIdx: index("om_legal_entity_code_idx").on(table.code),
  statusIdx: index("om_legal_entity_status_idx").on(table.status),
  codeUniq: unique("om_legal_entity_code_uniq").on(table.workspaceId, table.code),
}));

export type OmLegalEntity = typeof omLegalEntities.$inferSelect;
export type InsertOmLegalEntity = typeof omLegalEntities.$inferInsert;

// ============================================================================
// 2. Org Units — Departments, divisions, teams, business units
// ============================================================================

export const omOrgUnits = pgTable("om_org_units", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).default("department").notNull(), // department | division | team | business_unit | group
  parentOrgUnitId: integer("parent_org_unit_id"), // self-ref for hierarchy
  legalEntityId: integer("legal_entity_id"), // FK to om_legal_entities
  costCenterId: integer("cost_center_id"), // FK to om_cost_centers
  managerPositionId: integer("manager_position_id"), // FK to om_positions — position that manages this unit
  level: integer("level").default(0).notNull(), // depth in hierarchy (0 = root)
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | frozen | archived
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_org_unit_ws_idx").on(table.workspaceId),
  parentIdx: index("om_org_unit_parent_idx").on(table.parentOrgUnitId),
  codeIdx: index("om_org_unit_code_idx").on(table.code),
  statusIdx: index("om_org_unit_status_idx").on(table.status),
  entityIdx: index("om_org_unit_entity_idx").on(table.legalEntityId),
  codeUniq: unique("om_org_unit_code_uniq").on(table.workspaceId, table.code),
}));

export type OmOrgUnit = typeof omOrgUnits.$inferSelect;
export type InsertOmOrgUnit = typeof omOrgUnits.$inferInsert;

// ============================================================================
// 3. Jobs — Role definitions with family/level classification
// ============================================================================

export const omJobs = pgTable("om_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  family: varchar("family", { length: 100 }), // e.g. Engineering, Finance, Operations
  level: varchar("level", { length: 50 }), // e.g. Junior, Senior, Lead, Director
  levelRank: integer("level_rank").default(0), // numeric rank for ordering
  description: text("description"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | deprecated | retired
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_job_ws_idx").on(table.workspaceId),
  codeIdx: index("om_job_code_idx").on(table.code),
  familyIdx: index("om_job_family_idx").on(table.family),
  statusIdx: index("om_job_status_idx").on(table.status),
  codeUniq: unique("om_job_code_uniq").on(table.workspaceId, table.code),
}));

export type OmJob = typeof omJobs.$inferSelect;
export type InsertOmJob = typeof omJobs.$inferInsert;

// ============================================================================
// 4. Positions — Approved organizational seats
// ============================================================================

export const omPositions = pgTable("om_positions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  positionCode: varchar("position_code", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  jobId: integer("job_id"), // FK to om_jobs
  orgUnitId: integer("org_unit_id"), // FK to om_org_units — exactly one org unit
  reportsToPositionId: integer("reports_to_position_id"), // self-ref for reporting chain
  legalEntityId: integer("legal_entity_id"), // FK to om_legal_entities
  costCenterId: integer("cost_center_id"), // FK to om_cost_centers
  budgeted: boolean("budgeted").default(true).notNull(),
  headcountLimit: integer("headcount_limit").default(1).notNull(),
  status: varchar("status", { length: 30 }).default("vacant").notNull(), // vacant | filled | frozen | temporary | closed
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_position_ws_idx").on(table.workspaceId),
  orgUnitIdx: index("om_position_org_unit_idx").on(table.orgUnitId),
  jobIdx: index("om_position_job_idx").on(table.jobId),
  statusIdx: index("om_position_status_idx").on(table.status),
  reportsIdx: index("om_position_reports_idx").on(table.reportsToPositionId),
  codeUniq: unique("om_position_code_uniq").on(table.workspaceId, table.positionCode),
}));

export type OmPosition = typeof omPositions.$inferSelect;
export type InsertOmPosition = typeof omPositions.$inferInsert;

// ============================================================================
// 5. Reporting Relationships — Explicit manager→position chain
// ============================================================================

export const omReportingRelationships = pgTable("om_reporting_relationships", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  positionId: integer("position_id").notNull(), // the position that reports
  reportsToPositionId: integer("reports_to_position_id").notNull(), // the manager position
  type: varchar("type", { length: 30 }).default("direct").notNull(), // direct | dotted | functional
  isPrimary: boolean("is_primary").default(true).notNull(),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_reporting_ws_idx").on(table.workspaceId),
  posIdx: index("om_reporting_pos_idx").on(table.positionId),
  reportsToIdx: index("om_reporting_to_idx").on(table.reportsToPositionId),
  statusIdx: index("om_reporting_status_idx").on(table.status),
  primaryUniq: unique("om_reporting_primary_uniq").on(table.positionId, table.type, table.isPrimary),
}));

export type OmReportingRelationship = typeof omReportingRelationships.$inferSelect;
export type InsertOmReportingRelationship = typeof omReportingRelationships.$inferInsert;

// ============================================================================
// 6. Cost Centers — Financial responsibility units
// ============================================================================

export const omCostCenters = pgTable("om_cost_centers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  legalEntityId: integer("legal_entity_id"), // FK to om_legal_entities
  parentCostCenterId: integer("parent_cost_center_id"), // self-ref for hierarchy
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | closed
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_cost_center_ws_idx").on(table.workspaceId),
  codeIdx: index("om_cost_center_code_idx").on(table.code),
  entityIdx: index("om_cost_center_entity_idx").on(table.legalEntityId),
  codeUniq: unique("om_cost_center_code_uniq").on(table.workspaceId, table.code),
}));

export type OmCostCenter = typeof omCostCenters.$inferSelect;
export type InsertOmCostCenter = typeof omCostCenters.$inferInsert;

// ============================================================================
// 7. Structure Versions — Draft/publish/version model for OM content
// ============================================================================

export const omStructureVersions = pgTable("om_structure_versions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | published | archived | superseded
  snapshot: json("snapshot").$type<Record<string, unknown>>(), // frozen structural snapshot at publish time
  alignmentMatrixVersionId: integer("alignment_matrix_version_id"),
  selectedStructureTypeId: integer("selected_structure_type_id"),
  publishedAt: timestamp("published_at"),
  publishedBy: integer("published_by"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_structure_version_ws_idx").on(table.workspaceId),
  statusIdx: index("om_structure_version_status_idx").on(table.status),
  versionUniq: unique("om_structure_version_uniq").on(table.workspaceId, table.versionNumber),
}));

export type OmStructureVersion = typeof omStructureVersions.$inferSelect;
export type InsertOmStructureVersion = typeof omStructureVersions.$inferInsert;

// ============================================================================
// 8. OM Audit Log — Dedicated audit trail for structural mutations
// ============================================================================

export const omAuditLog = pgTable("om_audit_log", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  actorId: integer("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // legal_entity | org_unit | job | position | reporting | cost_center | structure_version
  entityId: integer("entity_id"),
  previousValue: json("previous_value").$type<Record<string, unknown>>(),
  newValue: json("new_value").$type<Record<string, unknown>>(),
  category: varchar("category", { length: 30 }).default("mutation").notNull(), // mutation | status_change | authority | structure_publish
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_audit_ws_idx").on(table.workspaceId),
  entityTypeIdx: index("om_audit_entity_type_idx").on(table.entityType),
  actionIdx: index("om_audit_action_idx").on(table.action),
  actorIdx: index("om_audit_actor_idx").on(table.actorId),
  createdIdx: index("om_audit_created_idx").on(table.createdAt),
}));

export type OmAuditEntry = typeof omAuditLog.$inferSelect;
export type InsertOmAuditEntry = typeof omAuditLog.$inferInsert;

// ============================================================================
// 9. OM Organization Templates — Reusable structure blueprints
// ============================================================================

export const omOrgTemplates = pgTable("om_org_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  structureModel: varchar("structure_model", { length: 50 }).notNull(), // functional | divisional | matrix | flat | network
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(), // true = built-in, cannot be deleted
  snapshot: json("snapshot").$type<{
    legalEntity: { code: string; name: string; type: string };
    orgUnits: { code: string; name: string; type: string; parentIndex?: number }[];
    jobs: { code: string; title: string; family: string; level: string; levelRank: number }[];
    positions: { code: string; title: string; jobIndex?: number; orgUnitIndex?: number }[];
    reportingLines: { positionIndex: number; reportsToIndex: number; type: string }[];
    costCenters: { code: string; name: string }[];
    governanceNotes: string;
    decisionRights: string;
    escalationPath: string;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("om_template_model_idx").on(table.structureModel),
  nameUniq: unique("om_template_name_uniq").on(table.name),
}));

export type OmOrgTemplate = typeof omOrgTemplates.$inferSelect;
export type InsertOmOrgTemplate = typeof omOrgTemplates.$inferInsert;

// ============================================================================
// 10. Alignment Matrix Versions — Version the matrix master dataset
// ============================================================================

export const omAlignmentMatrixVersions = pgTable("om_alignment_matrix_versions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | archived | superseded
  description: text("description"),
  createdBy: integer("created_by"),
  publishedAt: timestamp("published_at"),
  publishedBy: integer("published_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_alignment_matrix_version_ws_idx").on(table.workspaceId),
  statusIdx: index("om_alignment_matrix_version_status_idx").on(table.status),
}));

export type OmAlignmentMatrixVersion = typeof omAlignmentMatrixVersions.$inferSelect;
export type InsertOmAlignmentMatrixVersion = typeof omAlignmentMatrixVersions.$inferInsert;

// ============================================================================
// 11. Alignment Types — Matrix column definitions (structure types)
// ============================================================================

export const omAlignmentTypes = pgTable("om_alignment_types", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  matrixVersionId: integer("matrix_version_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_alignment_type_ws_idx").on(table.workspaceId),
  matrixIdx: index("om_alignment_type_matrix_idx").on(table.matrixVersionId),
  uniqCode: unique("om_alignment_type_code_uniq").on(table.matrixVersionId, table.code),
}));

export type OmAlignmentType = typeof omAlignmentTypes.$inferSelect;
export type InsertOmAlignmentType = typeof omAlignmentTypes.$inferInsert;

// ============================================================================
// 12. Alignment Attributes — Matrix row definitions
// ============================================================================

export const omAlignmentAttributes = pgTable("om_alignment_attributes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  matrixVersionId: integer("matrix_version_id").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_alignment_attr_ws_idx").on(table.workspaceId),
  matrixIdx: index("om_alignment_attr_matrix_idx").on(table.matrixVersionId),
  uniqCode: unique("om_alignment_attr_code_uniq").on(table.matrixVersionId, table.code),
}));

export type OmAlignmentAttribute = typeof omAlignmentAttributes.$inferSelect;
export type InsertOmAlignmentAttribute = typeof omAlignmentAttributes.$inferInsert;

// ============================================================================
// 13. Alignment Cells — Type × Attribute intersection values
// ============================================================================

export const omAlignmentCells = pgTable("om_alignment_cells", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  matrixVersionId: integer("matrix_version_id").notNull(),
  typeId: integer("type_id").notNull(),
  attributeId: integer("attribute_id").notNull(),
  valueText: text("value_text").notNull(),
  valueCode: varchar("value_code", { length: 100 }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_alignment_cell_ws_idx").on(table.workspaceId),
  matrixIdx: index("om_alignment_cell_matrix_idx").on(table.matrixVersionId),
  typeIdx: index("om_alignment_cell_type_idx").on(table.typeId),
  attrIdx: index("om_alignment_cell_attr_idx").on(table.attributeId),
  uniqCell: unique("om_alignment_cell_uniq").on(table.matrixVersionId, table.typeId, table.attributeId),
}));

export type OmAlignmentCell = typeof omAlignmentCells.$inferSelect;
export type InsertOmAlignmentCell = typeof omAlignmentCells.$inferInsert;

// ============================================================================
// 14. Structure Alignment Selections — Wizard draft row selections
// ============================================================================

export const omStructureAlignmentSelections = pgTable("om_structure_alignment_selections", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  structureVersionId: integer("structure_version_id").notNull(),
  matrixVersionId: integer("matrix_version_id").notNull(),
  selectedTypeId: integer("selected_type_id").notNull(),
  attributeId: integer("attribute_id").notNull(),
  selectedValueText: text("selected_value_text").notNull(),
  source: varchar("source", { length: 30 }).default("matrix_default").notNull(), // matrix_default | manual_override
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("om_structure_alignment_sel_ws_idx").on(table.workspaceId),
  structureIdx: index("om_structure_alignment_sel_structure_idx").on(table.structureVersionId),
  matrixIdx: index("om_structure_alignment_sel_matrix_idx").on(table.matrixVersionId),
  attributeIdx: index("om_structure_alignment_sel_attr_idx").on(table.attributeId),
  uniqSelection: unique("om_structure_alignment_sel_uniq").on(table.structureVersionId, table.attributeId),
}));

export type OmStructureAlignmentSelection = typeof omStructureAlignmentSelections.$inferSelect;
export type InsertOmStructureAlignmentSelection = typeof omStructureAlignmentSelections.$inferInsert;
