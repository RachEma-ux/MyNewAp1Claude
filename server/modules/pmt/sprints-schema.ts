/**
 * PMT Engine — Sprints Schema
 * Sprint planning and tracking
 */

import {
  serial, varchar, integer, timestamp, text, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces } from "../../../drizzle/tables/users";
import { projects } from "./schema";

export const pmSprints = pgTable("pm_sprints", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  goal: text("goal"),
  status: varchar("status", { length: 20 }).default("planning"),  // planning, active, closed
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  velocity: integer("velocity"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_sprints_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_sprints_project").on(table.projectId),
}));

export type PmSprint = typeof pmSprints.$inferSelect;
