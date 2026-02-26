/**
 * PMT Engine — Comments Schema
 * Threaded comments on work items
 */

import {
  serial, varchar, text, integer, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { tasks } from "./schema";

export const pmComments = pgTable("pm_comments", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").notNull().references(() => tasks.id),
  parentId: integer("parentId"),
  authorId: integer("authorId").references(() => users.id),
  authorType: varchar("authorType", { length: 20 }).default("human"),
  content: text("content").notNull(),
  mentions: json("mentions").$type<number[]>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  workItemIdx: index("idx_pm_comments_work_item").on(table.workItemId),
  wsIdx: index("idx_pm_comments_ws").on(table.workspaceId),
  parentIdx: index("idx_pm_comments_parent").on(table.parentId),
}));

export type PmComment = typeof pmComments.$inferSelect;
