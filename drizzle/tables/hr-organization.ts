/**
 * HR Organization Tables — Org Units, Job Families, Job Levels, Positions
 *
 * Organization backbone for the HR module.
 * OrgUnit = department/division, Position = approved seat in the org.
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgTable,
  index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";

// ============================================================================
// HR Org Units — Departments, divisions, teams
// ============================================================================

export const hrOrgUnits = pgTable("hr_org_units", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).default("department").notNull(), // department | division | team | business_unit
  parentOrgUnitId: integer("parent_org_unit_id"), // self-ref
  managerWorkerId: integer("manager_worker_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parentIdx: index("hr_org_parent_idx").on(table.parentOrgUnitId),
  codeIdx: index("hr_org_code_idx").on(table.code),
  tenantIdx: index("hr_org_tenant_idx").on(table.tenantId),
}));

export type HrOrgUnit = typeof hrOrgUnits.$inferSelect;
export type InsertHrOrgUnit = typeof hrOrgUnits.$inferInsert;

// ============================================================================
// HR Job Families — Grouping of related positions
// ============================================================================

export const hrJobFamilies = pgTable("hr_job_families", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HrJobFamily = typeof hrJobFamilies.$inferSelect;
export type InsertHrJobFamily = typeof hrJobFamilies.$inferInsert;

// ============================================================================
// HR Job Levels — Seniority/grade levels
// ============================================================================

export const hrJobLevels = pgTable("hr_job_levels", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  rank: integer("rank").default(0).notNull(), // sort order
  status: varchar("status", { length: 30 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HrJobLevel = typeof hrJobLevels.$inferSelect;
export type InsertHrJobLevel = typeof hrJobLevels.$inferInsert;

// ============================================================================
// HR Positions — Approved organizational seats
// ============================================================================

export const hrPositions = pgTable("hr_positions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  positionCode: varchar("position_code", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  jobFamilyId: integer("job_family_id").references(() => hrJobFamilies.id),
  jobLevelId: integer("job_level_id").references(() => hrJobLevels.id),
  orgUnitId: integer("org_unit_id").references(() => hrOrgUnits.id),
  reportsToPositionId: integer("reports_to_position_id"), // self-ref
  budgeted: boolean("budgeted").default(true).notNull(),
  filled: boolean("filled").default(false).notNull(),
  headcountLimit: integer("headcount_limit").default(1).notNull(),
  status: varchar("status", { length: 30 }).default("open").notNull(), // open | filled | frozen | closed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgUnitIdx: index("hr_position_org_idx").on(table.orgUnitId),
  codeIdx: index("hr_position_code_idx").on(table.positionCode),
  statusIdx: index("hr_position_status_idx").on(table.status),
}));

export type HrPosition = typeof hrPositions.$inferSelect;
export type InsertHrPosition = typeof hrPositions.$inferInsert;
