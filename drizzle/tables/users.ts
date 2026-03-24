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

// Workspace lifecycle statuses — canonical 9-status lifecycle
export const WORKSPACE_STATUSES = [
  "draft",
  "ready_for_review",
  "under_review",
  "approved",
  "published",
  "active",
  "rejected",
  "archived",
  "deleted",
] as const;
export type WorkspaceStatus = typeof WORKSPACE_STATUSES[number];

// Legacy status mapping (for migration compatibility)
export const LEGACY_STATUS_MAP: Record<string, WorkspaceStatus> = {
  created: "draft",
  configured: "ready_for_review",
  active: "active",
  paused: "archived",
  archived: "archived",
  deleted: "deleted",
};

// Workspace purpose types — what the workspace is organized around
// Governance-first spec: Goal, Mission, Project, Team Activity, Research Effort, Operational Function
export const WORKSPACE_PURPOSE_TYPES = [
  "goal", "mission", "project", "team", "research", "operational", "strategy", "other",
] as const;
export type WorkspacePurposeType = typeof WORKSPACE_PURPOSE_TYPES[number];

// Workspace anchor types — structural organizing factor
export const WORKSPACE_ANCHOR_TYPES = [
  "per_project", "per_employee_role", "per_hr_position", "per_company_entity",
  "per_activity", "per_custom_factor", "per_app_module", "per_function",
] as const;
export type WorkspaceAnchorType = typeof WORKSPACE_ANCHOR_TYPES[number];

// WizardMeta — governance-first wizard intake data stored as JSON
export interface WizardMeta {
  // Purpose (Step 2)
  purposeStatement?: string;
  // Anchor (Step 3)
  anchorType?: WorkspaceAnchorType;
  // Scope Details (Step 4) — dynamic based on anchorType
  anchorRef?: string;
  anchorLabel?: string;
  anchorMeta?: Record<string, unknown>;
  // Team (Step 5) — human participants from HR Directory
  team?: {
    owner?: { workerId: number; displayName: string };
    managers?: Array<{ workerId: number; displayName: string }>;
    members?: Array<{ workerId: number; displayName: string }>;
    viewers?: Array<{ workerId: number; displayName: string }>;
  };
  // Activities (Step 6)
  activities?: {
    primaryType?: string;
    secondaryTypes?: string[];
    operatingMode?: string;
    executionStyle?: string;
    collaborationIntensity?: string;
  };
  // Needs (Step 7) — structured declarative needs
  needs?: {
    permissions?: string[];
    information?: string[];
    tools?: string[];
    agents?: string[];
    resources?: string[];
    visibility?: string[];
    context?: string[];
  };
  // Configuration (Step 8) — admin phase
  configuration?: {
    enabledModules?: string[];
    routingProfile?: string;
    resourceProfile?: string;
    capabilityBundles?: string[];
    shellVisibility?: string;
    publicationConstraints?: string;
    runtimeDefaults?: Record<string, unknown>;
  };
  // Wizard progress tracking
  lastCompletedStep?: number;
  wizardPhase?: "manager" | "admin" | "governance";
}

// Shell configuration — manager-defined participant visibility
export interface WorkspaceShellConfig {
  sidebar: {
    showIdentity: boolean;
    showPurpose: boolean;
    showMission: boolean;
    showCurrentWork: boolean;
    showActivityLog: boolean;
    showAlerts: boolean;
    showQuickActions: boolean;
    showGuide: boolean;
    showHealth: boolean;
  };
  toolbar: {
    visibleItems: string[];
    priorityItems: string[];
  };
  quickActions: string[];
  alertsEnabled: boolean;
  missionEmphasis: string | null;
  participantVisibility: Record<string, {
    sidebarSections: string[];
    toolbarItems: string[];
    canSeeAlerts: boolean;
  }>;
}

// Resource profile (optional accountable resource allocation)
export interface ResourceProfile {
  budgetLimit?: number;
  computeQuota?: number;
  storageQuota?: number;
  apiCallQuota?: number;
  currency?: string;
}

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).default("generic"),
  ownerId: integer("ownerId").notNull().references(() => users.id),

  // Workspace lifecycle status — canonical 9-status model
  status: varchar("status", { length: 50 }).default("draft").notNull(),

  // Workspace purpose — what this workspace is organized around
  purposeType: varchar("purposeType", { length: 50 }).default("other"),
  purposeStatement: text("purposeStatement"),
  purposeRef: text("purposeRef"),

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

  // Resource Profile (optional accountable resource allocation)
  resourceProfile: json("resourceProfile").$type<ResourceProfile>(),

  // Shell Configuration — manager-defined visibility and emphasis
  shellConfig: json("shellConfig").$type<WorkspaceShellConfig>(),

  // Governance-first wizard intake metadata (anchor, scope, activities, needs, config)
  wizardMeta: json("wizardMeta").$type<WizardMeta>(),

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

// ============================================================================
// Workspace Crew — AI participant bindings (distinct from Team/human members)
// ============================================================================

export const workspaceCrew = pgTable("workspace_crew", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  agentId: integer("agentId").notNull(),
  agentName: varchar("agentName", { length: 255 }).notNull(),
  participantType: varchar("participantType", { length: 50 }).default("agent").notNull(),
  role: varchar("role", { length: 50 }).default("executor").notNull(),
  note: text("note"),
  capabilities: json("capabilities").$type<string[]>(),
  constraints: json("constraints").$type<Record<string, unknown>>(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WorkspaceCrew = typeof workspaceCrew.$inferSelect;
export type InsertWorkspaceCrew = typeof workspaceCrew.$inferInsert;
