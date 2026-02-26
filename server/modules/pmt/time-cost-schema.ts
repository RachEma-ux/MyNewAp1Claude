/**
 * PMT Engine — Time & Cost Schema
 * Activity types, time entries, cost entries, budgets
 */
import {
  serial, varchar, integer, boolean, real, timestamp, text, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { projects, tasks } from "./schema";

// pm_activity_types
export const pmActivityTypes = pgTable("pm_activity_types", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 100 }).notNull(),
  billable: boolean("billable").default(true),
  position: integer("position").notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_activity_types_ws").on(table.workspaceId),
}));
export type PmActivityType = typeof pmActivityTypes.$inferSelect;

// pm_time_entries
export const pmTimeEntries = pgTable("pm_time_entries", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").references(() => tasks.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  userId: integer("userId").notNull().references(() => users.id),
  activityTypeId: integer("activityTypeId").references(() => pmActivityTypes.id),
  hours: real("hours").notNull(),
  comment: text("comment"),
  spentOn: timestamp("spentOn").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_time_entries_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_time_entries_project").on(table.projectId),
  userIdx: index("idx_pm_time_entries_user").on(table.userId),
}));
export type PmTimeEntry = typeof pmTimeEntries.$inferSelect;

// pm_cost_entries
export const pmCostEntries = pgTable("pm_cost_entries", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").references(() => tasks.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  userId: integer("userId").notNull().references(() => users.id),
  units: real("units").notNull(),
  unitCost: real("unitCost").notNull(),
  comment: text("comment"),
  spentOn: timestamp("spentOn").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_cost_entries_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_cost_entries_project").on(table.projectId),
}));
export type PmCostEntry = typeof pmCostEntries.$inferSelect;

// pm_budgets
export const pmBudgets = pgTable("pm_budgets", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  plannedLabor: real("plannedLabor").default(0),
  plannedUnits: real("plannedUnits").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_budgets_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_budgets_project").on(table.projectId),
}));
export type PmBudget = typeof pmBudgets.$inferSelect;
