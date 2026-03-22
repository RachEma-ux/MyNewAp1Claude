/**
 * Workspace Module Bindings
 *
 * Each workspace can enable/disable platform engines (modules).
 * Module binding controls which engines are active per workspace.
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  json,
  pgTable,
  unique,
} from "drizzle-orm/pg-core";
import { workspaces } from "./users";

// ============================================================================
// Module Keys — must match server/modules/ directory names
// ============================================================================

export const MODULE_KEYS = ["pmt", "knowledge", "agents", "collaboration", "reporting"] as const;
export type ModuleKey = typeof MODULE_KEYS[number];

// ============================================================================
// Workspace Modules — per-workspace engine bindings
// ============================================================================

export const workspaceModules = pgTable("workspace_modules", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  moduleKey: varchar("moduleKey", { length: 50 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  mode: varchar("mode", { length: 50 }).default("standard").notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  uniqueWorkspaceModule: unique().on(table.workspaceId, table.moduleKey),
}));

export type WorkspaceModule = typeof workspaceModules.$inferSelect;
export type InsertWorkspaceModule = typeof workspaceModules.$inferInsert;

// ============================================================================
// Workspace Activity Log — cross-module audit trail
// ============================================================================

export const workspaceActivityLog = pgTable("workspace_activity_log", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  moduleKey: varchar("moduleKey", { length: 50 }),
  actorId: integer("actorId"),
  actorType: varchar("actorType", { length: 20 }).default("user"), // "user" | "agent" | "system"
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 50 }),
  targetId: integer("targetId"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceActivity = typeof workspaceActivityLog.$inferSelect;
export type InsertWorkspaceActivity = typeof workspaceActivityLog.$inferInsert;
