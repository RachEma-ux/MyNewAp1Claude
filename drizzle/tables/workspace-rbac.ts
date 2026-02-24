/**
 * Workspace RBAC Tables — Capability-Based Access Control
 *
 * Tables:
 *   - capabilities: Global capability catalog (e.g. "chat.send", "agents.promote")
 *   - workspace_roles: Per-workspace role definitions (system + custom)
 *   - workspace_role_capabilities: Maps roles → capabilities with optional constraints
 *   - workspace_principal_capabilities: Per-user capability overrides (grant/deny)
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
import { workspaces, users } from "./users";

// ============================================================================
// Capabilities — Global catalog of granular permissions
// ============================================================================

export const capabilities = pgTable("capabilities", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Capability = typeof capabilities.$inferSelect;
export type InsertCapability = typeof capabilities.$inferInsert;

// ============================================================================
// Workspace Roles — Per-workspace role definitions
// ============================================================================

export const workspaceRoles = pgTable("workspace_roles", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isSystem: boolean("isSystem").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uniqueWorkspaceRole: unique().on(table.workspaceId, table.name),
}));

export type WorkspaceRole = typeof workspaceRoles.$inferSelect;
export type InsertWorkspaceRole = typeof workspaceRoles.$inferInsert;

// ============================================================================
// Role → Capability Mappings
// ============================================================================

export const workspaceRoleCapabilities = pgTable("workspace_role_capabilities", {
  id: serial("id").primaryKey(),
  roleId: integer("roleId").notNull().references(() => workspaceRoles.id),
  capabilityId: integer("capabilityId").notNull().references(() => capabilities.id),
  scope: varchar("scope", { length: 50 }).default("workspace").notNull(),
  constraints: json("constraints").$type<Record<string, unknown> | null>(),
}, (table) => ({
  uniqueRoleCapability: unique().on(table.roleId, table.capabilityId),
}));

export type WorkspaceRoleCapability = typeof workspaceRoleCapabilities.$inferSelect;
export type InsertWorkspaceRoleCapability = typeof workspaceRoleCapabilities.$inferInsert;

// ============================================================================
// Principal (User) → Capability Overrides
// ============================================================================

export const workspacePrincipalCapabilities = pgTable("workspace_principal_capabilities", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  userId: integer("userId").notNull().references(() => users.id),
  capabilityId: integer("capabilityId").notNull().references(() => capabilities.id),
  effect: varchar("effect", { length: 10 }).notNull(), // 'grant' or 'deny'
  constraints: json("constraints").$type<Record<string, unknown> | null>(),
}, (table) => ({
  uniquePrincipalCapability: unique().on(table.workspaceId, table.userId, table.capabilityId),
}));

export type WorkspacePrincipalCapability = typeof workspacePrincipalCapabilities.$inferSelect;
export type InsertWorkspacePrincipalCapability = typeof workspacePrincipalCapabilities.$inferInsert;
