import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, decimal, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users, workspaces } from "./users";
import { models } from "./models";

// ============================================================================
// Agent System
// ============================================================================

// Type definitions for JSON fields
export interface AgentAnatomy {
  systemPrompt?: string;
  tools?: string[];
  capabilities?: Record<string, any>;
  [key: string]: any;
}

export interface AgentGovernance {
  proofBundle?: {
    agentHash: string;
    policyHash: string;
    signature: string;
    evaluatedAt: string;
  };
  policies?: Record<string, any>;
  restrictions?: Record<string, any>;
  [key: string]: any;
}

// Export enum types for frontend use
export const AgentMode = {
  SANDBOX: "sandbox" as const,
  GOVERNED: "governed" as const,
};
export type AgentMode = typeof AgentMode[keyof typeof AgentMode];

export const GovernanceStatus = {
  SANDBOX: "SANDBOX" as const,
  GOVERNED_VALID: "GOVERNED_VALID" as const,
  GOVERNED_RESTRICTED: "GOVERNED_RESTRICTED" as const,
  GOVERNED_INVALIDATED: "GOVERNED_INVALIDATED" as const,
};
export type GovernanceStatus = typeof GovernanceStatus[keyof typeof GovernanceStatus];

export const AgentRoleClass = {
  ASSISTANT: "assistant" as const,
  ANALYST: "analyst" as const,
  EXECUTOR: "executor" as const,
  MONITOR: "monitor" as const,
  COMPLIANCE: "compliance" as const,
  ANALYSIS: "analysis" as const,
  IDEATION: "ideation" as const,
};
export type AgentRoleClass = typeof AgentRoleClass[keyof typeof AgentRoleClass];

// ============================================================================
// Agent Governance System
// ============================================================================

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  createdBy: integer("createdBy").notNull().references(() => users.id),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tags: json("tags"), // string[]
  roleClass: varchar("roleClass", { length: 50 }).notNull(),

  // Lifecycle
  lifecycle: json("lifecycle"), // { state: 'draft'|'sandbox'|'governed'|'archived', version: number }
  status: varchar("status", { length: 50 }).notNull().default("draft"),

  // Configuration
  systemPrompt: text("systemPrompt").notNull(),
  modelId: varchar("modelId", { length: 255 }).notNull(), // Stores catalog model name (e.g., "gpt-4o"), not an integer FK
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.7"),

  // Capabilities & Limits
  capabilities: json("capabilities"), // { tools: string[], actions: string[], memory: {...} }
  limits: json("limits"), // { rateLimit: number, costLimit: number, executionTimeout: number }

  // Permissions
  hasDocumentAccess: boolean("hasDocumentAccess").default(false),
  hasToolAccess: boolean("hasToolAccess").default(false),
  allowedTools: json("allowedTools"), // string[]

  // Policy & Governance
  policyDigest: varchar("policyDigest", { length: 64 }),
  policySetHash: varchar("policySetHash", { length: 64 }),
  lockedFields: json("lockedFields"), // string[] - fields locked by policy

  // Metadata
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 50 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

// Agent history tracking
export const agentHistory = pgTable("agent_history", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull().references(() => agents.id),

  // Event details
  eventType: varchar("eventType", { length: 50 }).notNull(),
  eventData: json("eventData"),

  // Status tracking
  oldStatus: varchar("oldStatus", { length: 50 }),
  newStatus: varchar("newStatus", { length: 50 }),

  // Actor information
  actorId: integer("actorId"),
  actorName: varchar("actorName", { length: 255 }),

  // Additional context
  description: text("description"),
  metadata: json("metadata"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentHistory = typeof agentHistory.$inferSelect;
export type InsertAgentHistory = typeof agentHistory.$inferInsert;

// Agent versions for audit trail and rollback
export const agentVersions = pgTable("agentVersions", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull().references(() => agents.id),

  // Version metadata
  version: integer("version").notNull(),
  createdBy: integer("createdBy").notNull().references(() => users.id),
  changeNotes: text("changeNotes"),

  // Full snapshot
  agentSnapshot: json("agentSnapshot").notNull(),

  // Policy state at this version
  policyDigest: varchar("policyDigest", { length: 64 }),
  policySetHash: varchar("policySetHash", { length: 64 }),

  // Promotion reference
  promotionRequestId: integer("promotionRequestId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = typeof agentVersions.$inferInsert;

// Agent Protocols
export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Protocol content (markdown)
  content: text("content").notNull(),

  // Metadata
  version: integer("version").default(1),
  tags: json("tags"),

  // File info
  fileName: varchar("fileName", { length: 255 }),
  fileSize: integer("fileSize"),

  createdBy: integer("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = typeof protocols.$inferInsert;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  agentId: integer("agentId").references(() => agents.id),

  title: varchar("title", { length: 500 }),
  userId: integer("userId").notNull().references(() => users.id),

  // Conversation settings
  modelId: integer("modelId").references(() => models.id), // FK to models.id (integer), distinct from agents.modelId (varchar)
  temperature: varchar("temperature", { length: 10 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull().references(() => conversations.id),

  role: varchar("role", { length: 50 }).notNull(),
  content: text("content").notNull(),

  // Metadata
  tokenCount: integer("tokenCount"),
  retrievedChunks: json("retrievedChunks"),
  toolCalls: json("toolCalls"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// Promotion requests (human-in-the-loop approvals)
export const promotionRequests = pgTable("promotionRequests", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull().references(() => agents.id),

  // Request metadata
  requestedBy: integer("requestedBy").notNull().references(() => users.id),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  approvers: json("approvers"),
  notes: text("notes"),

  // Diff information
  diffHash: varchar("diffHash", { length: 64 }),
  diffSnapshot: json("diffSnapshot"),
  baselineVersion: integer("baselineVersion"),
  proposedVersion: integer("proposedVersion"),

  // Policy validation
  validationSnapshot: json("validationSnapshot"),
  policyDigest: varchar("policyDigest", { length: 64 }),

  // Approval workflow
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalComment: text("approvalComment"),

  rejectedBy: integer("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),

  // Execution
  executedAt: timestamp("executedAt"),
  executionError: text("executionError"),

  // SLA & Escalation
  slaDeadline: timestamp("slaDeadline"),
  escalatedAt: timestamp("escalatedAt"),
  escalationCount: integer("escalationCount").default(0),

  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PromotionRequest = typeof promotionRequests.$inferSelect;
export type InsertPromotionRequest = typeof promotionRequests.$inferInsert;

// Promotion timeline events (audit trail)
export const promotionEvents = pgTable("promotionEvents", {
  id: serial("id").primaryKey(),
  promotionRequestId: integer("promotionRequestId").notNull(),

  eventType: varchar("eventType", [
    "created",
    "validated",
    "policy_warning",
    "policy_denied",
    "submitted_for_approval",
    "approved",
    "rejected",
    "escalated",
    "executed",
    "cancelled"
  ]).notNull(),

  actor: integer("actor"),
  details: json("details"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PromotionEvent = typeof promotionEvents.$inferSelect;
export type InsertPromotionEvent = typeof promotionEvents.$inferInsert;

// Policy exceptions (time-bound, auditable)
export const policyExceptions = pgTable("policyExceptions", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull(),

  // Exception details
  policyId: varchar("policyId", { length: 255 }).notNull(),
  scope: varchar("scope", { length: 50 }).notNull(),
  reason: text("reason").notNull(),

  // Approval
  requestedBy: integer("requestedBy").notNull(),
  approvedBy: integer("approvedBy"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),

  // Expiry
  expiresAt: timestamp("expiresAt").notNull(),
  approvedAt: timestamp("approvedAt"),
  revokedAt: timestamp("revokedAt"),
  revokedBy: integer("revokedBy"),

  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PolicyException = typeof policyExceptions.$inferSelect;
export type InsertPolicyException = typeof policyExceptions.$inferInsert;

// Policy reload history
export const policyReloads = pgTable("policyReloads", {
  id: serial("id").primaryKey(),

  // Reload metadata
  initiatedBy: integer("initiatedBy").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),

  // OCI reference & verification
  ociRef: varchar("ociRef", { length: 512 }).notNull(),
  digest: varchar("digest", { length: 64 }).notNull(),
  cosignVerified: boolean("cosignVerified").default(false),

  // Impact analysis
  impactSnapshot: json("impactSnapshot"),

  // Rollback
  previousDigest: varchar("previousDigest", { length: 64 }),
  rolledBackAt: timestamp("rolledBackAt"),
  rolledBackBy: integer("rolledBackBy"),
  rollbackReason: text("rollbackReason"),

  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  activatedAt: timestamp("activatedAt"),
});

export type PolicyReload = typeof policyReloads.$inferSelect;
export type InsertPolicyReload = typeof policyReloads.$inferInsert;

// ============================================================================
// Agent Governance Module
// ============================================================================

export const agentProofs = pgTable("agent_proofs", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull(),

  // Policy decision
  policyDecision: varchar("policyDecision", { length: 50 }).notNull(),
  policyHash: varchar("policyHash", { length: 255 }).notNull(),
  specHash: varchar("specHash", { length: 255 }).notNull(),

  // Signature
  authority: varchar("authority", { length: 255 }).notNull(),
  signedAt: timestamp("signedAt").notNull(),
  signature: text("signature").notNull(),

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  agentIdx: index("idx_agent").on(table.agentId),
  policyHashIdx: index("idx_policy_hash").on(table.policyHash),
}));

export type AgentProof = typeof agentProofs.$inferSelect;
export type InsertAgentProof = typeof agentProofs.$inferInsert;

export const policyVersions = pgTable("policy_versions", {
  id: serial("id").primaryKey(),
  policySet: varchar("policySet", { length: 255 }).notNull(),
  version: varchar("version", { length: 50 }).notNull(),

  // Policy bundle (JSON - OPA bundle)
  bundle: json("bundle").notNull(),
  policyHash: varchar("policyHash", { length: 255 }).notNull(),

  // Revoked signers list
  revokedSigners: json("revokedSigners").$type<string[]>().default([]),

  // Invalidated agents
  invalidatedAgents: json("invalidatedAgents").$type<Record<string, { reason: string; at: string }>>().default({}),

  // Metadata
  loadedAt: timestamp("loadedAt").notNull(),
  loadedBy: integer("loadedBy").notNull(),
  isCurrent: boolean("isCurrent").default(false),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  policySetIdx: index("idx_policy_set").on(table.policySet),
  currentIdx: index("idx_current").on(table.isCurrent),
  uniquePolicyVersion: uniqueIndex("unique_policy_version").on(table.policySet, table.version),
}));

export type PolicyVersion = typeof policyVersions.$inferSelect;
export type InsertPolicyVersion = typeof policyVersions.$inferInsert;

// ============================================================================
// Governance Audit Logs
// ============================================================================

export const governanceAuditLogs = pgTable("governance_audit_logs", {
  id: serial("id").primaryKey(),

  code: varchar("code", { length: 100 }).notNull(),

  // Context
  agentId: integer("agentId"),
  workspaceId: varchar("workspaceId", { length: 255 }),
  actorId: varchar("actorId", { length: 255 }),

  // Decision
  decision: varchar("decision", { length: 20 }),
  reason: text("reason"),

  // Additional data
  details: json("details"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("idx_gov_audit_code").on(table.code),
  agentIdx: index("idx_gov_audit_agent").on(table.agentId),
  createdAtIdx: index("idx_gov_audit_created").on(table.createdAt),
}));

export type GovernanceAuditLog = typeof governanceAuditLogs.$inferSelect;
export type InsertGovernanceAuditLog = typeof governanceAuditLogs.$inferInsert;
