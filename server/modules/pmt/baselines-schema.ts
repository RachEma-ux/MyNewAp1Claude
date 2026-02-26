/**
 * PMT Engine — Baselines Schema
 * Snapshot capture of project state for comparison
 */

import {
  serial, varchar, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { projects } from "./schema";

export const pmBaselines = pgTable("pm_baselines", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  snapshot: json("snapshot").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_baselines_ws").on(table.workspaceId),
  projectIdx: index("idx_pm_baselines_project").on(table.projectId),
}));

export type PmBaseline = typeof pmBaselines.$inferSelect;
