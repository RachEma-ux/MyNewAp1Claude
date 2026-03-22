import { integer, serial, varchar, pgTable, text, timestamp, boolean, json } from "drizzle-orm/pg-core";

// ============================================================================
// User Management
// ============================================================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// Workspace System
// ============================================================================

// Routing profile type for workspace-level provider routing configuration
export interface RoutingProfile {
  defaultRoute: 'AUTO' | 'LOCAL_ONLY' | 'CLOUD_ALLOWED';
  dataSensitivity: 'LOW' | 'MED' | 'HIGH';
  qualityTier: 'FAST' | 'BALANCED' | 'BEST';
  fallback: { enabled: boolean; maxHops: number };
  pinnedProviderId?: number;
}

// Workspace lifecycle statuses
export const WORKSPACE_STATUSES = ["created", "configured", "active", "paused", "archived", "deleted"] as const;
export type WorkspaceStatus = typeof WORKSPACE_STATUSES[number];

// Workspace purpose types — what the workspace is organized around
export const WORKSPACE_PURPOSE_TYPES = ["goal", "mission", "project", "team", "strategy", "other"] as const;
export type WorkspacePurposeType = typeof WORKSPACE_PURPOSE_TYPES[number];

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).default("generic"),
  ownerId: integer("ownerId").notNull().references(() => users.id),

  // Workspace lifecycle status (SR-04)
  status: varchar("status", { length: 50 }).default("active").notNull(),

  // Workspace purpose (SR-05) — what this workspace is organized around
  purposeType: varchar("purposeType", { length: 50 }).default("other"),
  purposeRef: text("purposeRef"), // Optional reference to the purpose (project ID, goal name, etc.)

  // Workspace settings
  embeddingModel: varchar("embeddingModel", { length: 255 }).default("bge-small-en-v1.5"),
  chunkingStrategy: varchar("chunkingStrategy", { length: 50 }).default("semantic"),
  chunkSize: integer("chunkSize").default(512),
  chunkOverlap: integer("chunkOverlap").default(50),

  // Vector DB settings
  vectorDb: varchar("vectorDb", { length: 50 }).default("qdrant"),
  collectionName: varchar("collectionName", { length: 255 }),

  // Provider Routing Profile
  routingProfile: json("routingProfile").$type<RoutingProfile>(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  userId: integer("userId").notNull().references(() => users.id),
  role: varchar("role", { length: 50 }).default("viewer").notNull(),
  roleId: integer("roleId"),  // FK to workspace_roles — nullable for backwards compat
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;
