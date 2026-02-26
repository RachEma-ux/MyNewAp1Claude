/**
 * PMT Engine — Versions Schema
 * Project version / release tracking
 */

import {
  serial, varchar, text, integer, timestamp, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../../drizzle/tables/users";
import { projects } from "./schema";

export const pmVersions = pgTable("pm_versions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 30 }).default("open"),
  startDate: timestamp("startDate"),
  dueDate: timestamp("dueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_versions_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_versions_project").on(table.projectId),
}));

export type PmVersion = typeof pmVersions.$inferSelect;
