/**
 * PMT Engine — Attachments Schema
 * File attachments on work items
 */

import {
  serial, varchar, text, integer, timestamp, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { tasks } from "./schema";

export const pmAttachments = pgTable("pm_attachments", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").notNull().references(() => tasks.id),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  storagePath: text("storagePath").notNull(),
  uploadedBy: integer("uploadedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workItemIdx: index("idx_pm_attachments_work_item").on(table.workItemId),
  wsIdx: index("idx_pm_attachments_ws").on(table.workspaceId),
}));

export type PmAttachment = typeof pmAttachments.$inferSelect;
