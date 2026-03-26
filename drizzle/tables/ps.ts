/**
 * PS (Projects System) Tables
 *
 * Foundation tables for the PS module:
 * - ps_systems: Defined project systems (not project instances)
 * - ps_wizard_runs: Wizard execution history
 * - ps_catalog_system_types: Reference catalog of system types
 * - ps_audit_log: PS-specific audit trail
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
