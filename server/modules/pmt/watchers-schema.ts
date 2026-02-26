/**
 * PMT Engine — Watchers Schema
 * Users watching work items for notifications
 */

import {
  serial, integer, timestamp, pgTable, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { tasks } from "./schema";

export const pmWatchers = pgTable("pm_watchers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").notNull().references(() => tasks.id),
  userId: integer("userId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workItemIdx: index("idx_pm_watchers_work_item").on(table.workItemId),
  wsIdx: index("idx_pm_watchers_ws").on(table.workspaceId),
  uniqueWatcher: uniqueIndex("idx_pm_watchers_unique").on(table.workItemId, table.userId),
}));

export type PmWatcher = typeof pmWatchers.$inferSelect;
