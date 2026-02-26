/**
 * PMT Engine — Config Schema
 * Statuses, types, and workflow transitions
 */

import {
  serial, varchar, integer, boolean, timestamp, pgTable, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../../drizzle/tables/users";

export const pmStatuses = pgTable("pm_statuses", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  isClosed: boolean("isClosed").default(false),
  isDefault: boolean("isDefault").default(false),
  position: integer("position").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_statuses_ws").on(table.workspaceId),
}));

export type PmStatus = typeof pmStatuses.$inferSelect;

export const pmTypes = pgTable("pm_types", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }),
  icon: varchar("icon", { length: 50 }),
  isDefault: boolean("isDefault").default(false),
  isMilestone: boolean("isMilestone").default(false),
  position: integer("position").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_types_ws").on(table.workspaceId),
}));

export type PmType = typeof pmTypes.$inferSelect;

export const pmWorkflows = pgTable("pm_workflows", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  typeId: integer("typeId").notNull().references(() => pmTypes.id),
  fromStatusId: integer("fromStatusId").notNull().references(() => pmStatuses.id),
  toStatusId: integer("toStatusId").notNull().references(() => pmStatuses.id),
  roleId: integer("roleId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_workflows_ws").on(table.workspaceId),
  uniqueTransition: uniqueIndex("idx_pm_workflows_unique").on(
    table.workspaceId, table.typeId, table.fromStatusId, table.toStatusId,
  ),
}));

export type PmWorkflow = typeof pmWorkflows.$inferSelect;
