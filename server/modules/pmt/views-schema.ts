/**
 * PMT Engine — Saved Views Schema
 * Configurable views (table, kanban, gantt, calendar, timeline)
 */

import {
  serial, varchar, integer, boolean, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { projects } from "./schema";

export const pmSavedViews = pgTable("pm_saved_views", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  viewType: varchar("viewType", { length: 20 }).notNull(),
  config: json("config").notNull(),
  isDefault: boolean("isDefault").default(false),
  isPublic: boolean("isPublic").default(true),
  ownerId: integer("ownerId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_saved_views_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_saved_views_project").on(table.projectId),
}));

export type PmSavedView = typeof pmSavedViews.$inferSelect;
