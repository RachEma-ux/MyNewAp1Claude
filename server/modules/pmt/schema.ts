/**
 * PMT Engine — Database Schema
 * Project Management: projects, tasks, task_dependencies
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { workspaces, users } from "../../../drizzle/tables/users";

export const projects = pgTable("pmt_projects", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  ownerId: integer("ownerId").references(() => users.id),
  riskLevel: varchar("riskLevel", { length: 20 }).default("low"),
  governanceStage: varchar("governanceStage", { length: 50 }),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  startDate: timestamp("startDate"),
  targetDate: timestamp("targetDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pmt_projects_ws").on(table.workspaceId),
}));

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export const tasks = pgTable("pmt_tasks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("todo").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  assigneeId: integer("assigneeId").references(() => users.id),
  assigneeType: varchar("assigneeType", { length: 20 }).default("human"), // human | ai
  riskLevel: varchar("riskLevel", { length: 20 }).default("low"),
  confidenceScore: integer("confidenceScore"), // AI confidence 0-100
  governanceStage: varchar("governanceStage", { length: 50 }),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  wsIdx: index("idx_pmt_tasks_ws").on(table.workspaceId),
  projectIdx: index("idx_pmt_tasks_project").on(table.projectId),
  statusIdx: index("idx_pmt_tasks_status").on(table.status),
}));

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export const taskDependencies = pgTable("pmt_task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("taskId").notNull().references(() => tasks.id),
  dependsOnId: integer("dependsOnId").notNull().references(() => tasks.id),
  type: varchar("type", { length: 20 }).default("blocks").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskDependency = typeof taskDependencies.$inferSelect;
