/**
 * Culture Values Tables
 *
 * Culture Values owns the enterprise values framework:
 * - Value sets (collections of values per workspace)
 * - Value definitions (individual values with type/category)
 * - Behavior models (expected behaviors per value)
 * - Non-negotiables (red-flag anti-patterns)
 * - Value translations (unit-level contextualization)
 * - Operationalization templates (reviews, onboarding, BARS, surveys)
 * - CV audit log
 *
 * Culture Values ≠ OM (CV owns values/behaviors, OM owns structure)
 * Culture Values ≠ HR (CV defines standards, HR applies them to people)
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  json,
  pgTable,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. Value Sets — Collections of values (one active per workspace)
// ============================================================================

export const cvValueSets = pgTable("cv_value_sets", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  version: integer("version").default(1).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | deprecated | archived
  publishedAt: timestamp("published_at"),
  publishedBy: integer("published_by"),
  createdBy: integer("created_by"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_value_set_ws_idx").on(table.workspaceId),
  statusIdx: index("cv_value_set_status_idx").on(table.status),
  versionUniq: unique("cv_value_set_version_uniq").on(table.workspaceId, table.version),
}));

export type CvValueSet = typeof cvValueSets.$inferSelect;
export type InsertCvValueSet = typeof cvValueSets.$inferInsert;

// ============================================================================
// 2. Value Definitions — Individual values (3–7 per set)
// ============================================================================

export const cvValueDefinitions = pgTable("cv_value_definitions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  valueSetId: integer("value_set_id").notNull(), // FK to cv_value_sets
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 30 }).default("core").notNull(), // core | aspirational | operational
  category: varchar("category", { length: 100 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  icon: varchar("icon", { length: 50 }),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | deprecated | archived
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_value_def_ws_idx").on(table.workspaceId),
  setIdx: index("cv_value_def_set_idx").on(table.valueSetId),
  codeUniq: unique("cv_value_def_code_uniq").on(table.workspaceId, table.valueSetId, table.code),
}));

export type CvValueDefinition = typeof cvValueDefinitions.$inferSelect;
export type InsertCvValueDefinition = typeof cvValueDefinitions.$inferInsert;

// ============================================================================
// 3. Behavior Models — Expected behaviors per value
// ============================================================================

export const cvBehaviorModels = pgTable("cv_behavior_models", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  valueDefinitionId: integer("value_definition_id").notNull(), // FK to cv_value_definitions
  behavior: text("behavior").notNull(),
  level: varchar("level", { length: 30 }).default("standard").notNull(), // standard | exemplary | minimum
  context: varchar("context", { length: 100 }), // e.g. "leadership", "individual_contributor", "team"
  sortOrder: integer("sort_order").default(0).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_behavior_ws_idx").on(table.workspaceId),
  valueIdx: index("cv_behavior_value_idx").on(table.valueDefinitionId),
}));

export type CvBehaviorModel = typeof cvBehaviorModels.$inferSelect;
export type InsertCvBehaviorModel = typeof cvBehaviorModels.$inferInsert;

// ============================================================================
// 4. Non-Negotiables — Red flags and anti-patterns
// ============================================================================

export const cvNonNegotiables = pgTable("cv_non_negotiables", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  valueDefinitionId: integer("value_definition_id").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 30 }).default("critical").notNull(), // critical | high | medium
  category: varchar("category", { length: 50 }).default("red_flag").notNull(), // red_flag | anti_pattern | violation
  sortOrder: integer("sort_order").default(0).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_nonneg_ws_idx").on(table.workspaceId),
  valueIdx: index("cv_nonneg_value_idx").on(table.valueDefinitionId),
}));

export type CvNonNegotiable = typeof cvNonNegotiables.$inferSelect;
export type InsertCvNonNegotiable = typeof cvNonNegotiables.$inferInsert;

// ============================================================================
// 5. Value Translations — Unit-level meaning contextualization
// ============================================================================

export const cvValueTranslations = pgTable("cv_value_translations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  valueDefinitionId: integer("value_definition_id").notNull(),
  unitType: varchar("unit_type", { length: 50 }).notNull(), // org_unit | team | department | role
  unitIdentifier: varchar("unit_identifier", { length: 200 }).notNull(),
  translation: text("translation").notNull(), // what this value means for this unit
  examples: json("examples").$type<string[]>(),
  sortOrder: integer("sort_order").default(0).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_translation_ws_idx").on(table.workspaceId),
  valueIdx: index("cv_translation_value_idx").on(table.valueDefinitionId),
  unitIdx: index("cv_translation_unit_idx").on(table.unitType, table.unitIdentifier),
}));

export type CvValueTranslation = typeof cvValueTranslations.$inferSelect;
export type InsertCvValueTranslation = typeof cvValueTranslations.$inferInsert;

// ============================================================================
// 6. Operationalization Templates — How values are measured/applied
// ============================================================================

export const cvOperationalization = pgTable("cv_operationalization", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  valueDefinitionId: integer("value_definition_id"),
  valueSetId: integer("value_set_id"),
  type: varchar("type", { length: 50 }).notNull(), // review_criteria | onboarding_checklist | bars_scale | survey_question | recognition_criteria
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  content: json("content").$type<Record<string, unknown>>(), // template-specific structure
  sortOrder: integer("sort_order").default(0).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_ops_ws_idx").on(table.workspaceId),
  valueIdx: index("cv_ops_value_idx").on(table.valueDefinitionId),
  setIdx: index("cv_ops_set_idx").on(table.valueSetId),
  typeIdx: index("cv_ops_type_idx").on(table.type),
}));

export type CvOperationalization = typeof cvOperationalization.$inferSelect;
export type InsertCvOperationalization = typeof cvOperationalization.$inferInsert;

// ============================================================================
// 7. CV Audit Log
// ============================================================================

export const cvAuditLog = pgTable("cv_audit_log", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  actorId: integer("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  previousValue: json("previous_value").$type<Record<string, unknown>>(),
  newValue: json("new_value").$type<Record<string, unknown>>(),
  category: varchar("category", { length: 30 }).default("mutation").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("cv_audit_ws_idx").on(table.workspaceId),
  entityTypeIdx: index("cv_audit_entity_type_idx").on(table.entityType),
  actionIdx: index("cv_audit_action_idx").on(table.action),
  actorIdx: index("cv_audit_actor_idx").on(table.actorId),
}));

export type CvAuditEntry = typeof cvAuditLog.$inferSelect;
export type InsertCvAuditEntry = typeof cvAuditLog.$inferInsert;
