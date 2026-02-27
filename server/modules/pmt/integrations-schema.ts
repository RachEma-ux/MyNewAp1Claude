/**
 * PMT Engine — Integration Schemas
 * Git references, templates, custom actions, notifications, webhooks
 */
import {
  serial, varchar, text, integer, boolean, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";
import { tasks } from "./schema";

// pm_git_references
export const pmGitReferences = pgTable("pm_git_references", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  workItemId: integer("workItemId").notNull().references(() => tasks.id),
  provider: varchar("provider", { length: 20 }).notNull(),
  refType: varchar("refType", { length: 20 }).notNull(),
  refId: varchar("refId", { length: 255 }).notNull(),
  refUrl: text("refUrl").notNull(),
  refTitle: text("refTitle"),
  refState: varchar("refState", { length: 30 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_git_references_ws").on(table.workspaceId),
  workItemIdx: index("idx_pm_git_references_work_item").on(table.workItemId),
}));
export type PmGitReference = typeof pmGitReferences.$inferSelect;

// pm_project_templates
export const pmProjectTemplates = pgTable("pm_project_templates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  templateData: json("templateData").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_project_templates_ws").on(table.workspaceId),
}));
export type PmProjectTemplate = typeof pmProjectTemplates.$inferSelect;

// pm_work_item_templates
export const pmWorkItemTemplates = pgTable("pm_work_item_templates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  templateData: json("templateData").notNull(),
  typeId: integer("typeId"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_work_item_templates_ws").on(table.workspaceId),
}));
export type PmWorkItemTemplate = typeof pmWorkItemTemplates.$inferSelect;

// pm_custom_actions
export const pmCustomActions = pgTable("pm_custom_actions", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  conditions: json("conditions").notNull(),
  changes: json("changes").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_custom_actions_ws").on(table.workspaceId),
}));
export type PmCustomAction = typeof pmCustomActions.$inferSelect;

// pm_notifications
export const pmNotifications = pgTable("pm_notifications", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  userId: integer("userId").notNull(),
  workItemId: integer("workItemId"),
  type: varchar("type", { length: 50 }).notNull(),
  message: text("message").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_notifications_ws").on(table.workspaceId),
  userIdx: index("idx_pm_notifications_user").on(table.userId),
}));
export type PmNotification = typeof pmNotifications.$inferSelect;

// pm_webhooks
export const pmWebhooks = pgTable("pm_webhooks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  events: json("events").notNull(),
  secret: varchar("secret", { length: 255 }),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pm_webhooks_ws").on(table.workspaceId),
}));
export type PmWebhook = typeof pmWebhooks.$inferSelect;
