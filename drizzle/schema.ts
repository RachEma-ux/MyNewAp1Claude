import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, uniqueIndex, index, decimal, pgEnum } from "drizzle-orm/pg-core";

/**
 * MyNewAppV1 Database Schema
 * 
 * This schema supports the complete local AI platform including:
 * - User management and authentication
 * - Workspace isolation and collaboration
 * - Model management and configuration
 * - Document ingestion and processing
 * - Agent definitions and orchestration
 * - Automation workflows and task scheduling
 */

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

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: integer("ownerId").notNull(),
  
  // Workspace settings
  embeddingModel: varchar("embeddingModel", { length: 255 }).default("bge-small-en-v1.5"),
  chunkingStrategy: varchar("chunkingStrategy", { length: 50 }).default("semantic"),
  chunkSize: integer("chunkSize").default(512),
  chunkOverlap: integer("chunkOverlap").default(50),
  
  // Vector DB settings
  vectorDb: varchar("vectorDb", { length: 50 }).default("qdrant"),
  collectionName: varchar("collectionName", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  role: varchar("role", { length: 50 }).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

// ============================================================================
// Model Management
// ============================================================================

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  modelType: varchar("modelType", { length: 50 }).notNull(),
  
  // Model metadata
  huggingFaceId: varchar("huggingFaceId", { length: 255 }),
  architecture: varchar("architecture", { length: 100 }),
  parameterCount: varchar("parameterCount", { length: 50 }),
  quantization: varchar("quantization", { length: 50 }),
  contextLength: integer("contextLength"),
  
  // File information
  fileSize: varchar("fileSize", { length: 50 }),
  filePath: text("filePath"),
  fileFormat: varchar("fileFormat", { length: 50 }).default("gguf"),
  
  // Status
  status: varchar("status", { length: 50 }).default("ready"),
  downloadProgress: integer("downloadProgress").default(0),
  
  // Performance metrics
  tokensPerSecond: integer("tokensPerSecond"),
  memoryUsageMb: integer("memoryUsageMb"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Model = typeof models.$inferSelect;
export type InsertModel = typeof models.$inferInsert;

export const modelConfigs = pgTable("model_configs", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),
  
  // Inference parameters
  temperature: varchar("temperature", { length: 10 }).default("0.7"),
  topP: varchar("topP", { length: 10 }).default("0.9"),
  topK: integer("topK").default(40),
  maxTokens: integer("maxTokens").default(2048),
  repeatPenalty: varchar("repeatPenalty", { length: 10 }).default("1.1"),
  
  // Advanced settings
  stopSequences: json("stopSequences"),
  systemPrompt: text("systemPrompt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

// ============================================================================
// Document Management
// ============================================================================

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  
  // File information
  filename: varchar("filename", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  
  // Processing status
  status: varchar("status", { length: 50 }).default("pending"),
  errorMessage: text("errorMessage"),
  
  // Metadata
  title: varchar("title", { length: 500 }),
  author: varchar("author", { length: 255 }),
  pageCount: integer("pageCount"),
  wordCount: integer("wordCount"),
  
  // Processing results
  chunkCount: integer("chunkCount").default(0),
  embeddingModel: varchar("embeddingModel", { length: 255 }),
  
  uploadedBy: integer("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("documentId").notNull(),
  
  // Chunk content
  content: text("content").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),
  
  // Metadata
  pageNumber: integer("pageNumber"),
  heading: varchar("heading", { length: 500 }),
  
  // Vector DB reference
  vectorId: varchar("vectorId", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;

// ============================================================================
// Agent System
// ============================================================================

// Old agents table removed - using new governance-focused agents table instead (see line 1423)

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

// Agent history tracking
export const agentHistory = pgTable("agent_history", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull(),
  
  // Event details
  eventType: varchar("eventType", { length: 50 }).notNull(),
  eventData: json("eventData"), // Store event-specific data
  
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

// Old promotion requests table removed - using new governance-focused promotionRequests instead

// Agent Protocols
export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Protocol content (markdown)
  content: text("content").notNull(),
  
  // Metadata
  version: integer("version").default(1),
  tags: json("tags"), // Array of tags for categorization
  
  // File info
  fileName: varchar("fileName", { length: 255 }),
  fileSize: integer("fileSize"), // in bytes
  
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = typeof protocols.$inferInsert;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  agentId: integer("agentId"),
  
  title: varchar("title", { length: 500 }),
  userId: integer("userId").notNull(),
  
  // Conversation settings
  modelId: integer("modelId"),
  temperature: varchar("temperature", { length: 10 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  
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

// ============================================================================
// Automation System
// ============================================================================

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // Owner of the workflow
  workspaceId: integer("workspaceId"), // Optional: can be linked to workspace
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // ReactFlow canvas data
  nodes: text("nodes").notNull(), // JSON string of ReactFlow nodes
  edges: text("edges").notNull(), // JSON string of ReactFlow edges
  
  // Trigger configuration (optional for manual workflows)
  triggerType: varchar("triggerType", { length: 50 }).default("manual"),
  triggerConfig: json("triggerConfig"),
  
  // Versioning
  schemaVersion: integer("schemaVersion").default(1).notNull(),
  publishedVersionId: integer("publishedVersionId"), // FK to workflow_versions
  draftData: json("draftData"), // Unpublished changes
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"),
  enabled: boolean("enabled").default(true),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 50 }),
  
  // Permissions
  permissions: json("permissions"), // { canEdit: [userId], canPublish: [userId], canExecute: [userId] }
  isPublic: boolean("isPublic").default(false), // Public workflows can be executed by anyone
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;

// Workflow Versions (immutable snapshots)
export const workflowVersions = pgTable("workflow_versions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull(), // FK to workflows
  version: integer("version").notNull(), // Incremental version number (1, 2, 3...)
  
  // Snapshot of workflow at publish time
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  nodes: text("nodes").notNull(), // JSON string
  edges: text("edges").notNull(), // JSON string
  schemaVersion: integer("schemaVersion").notNull(),
  
  // Trigger configuration snapshot
  triggerType: varchar("triggerType", { length: 50 }),
  triggerConfig: json("triggerConfig"),
  
  // Publishing metadata
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  publishedBy: integer("publishedBy").notNull(), // FK to users
  changeNotes: text("changeNotes"),
  status: varchar("status", { length: 50 }).default("published"),
});

// Workflow Executions (runtime execution tracking)
export const workflowExecutions = pgTable("workflow_executions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull(), // FK to workflows
  versionId: integer("versionId"), // FK to workflow_versions (null for draft executions)
  
  // Execution metadata
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"), // Duration in milliseconds
  
  // Trigger information
  triggerType: varchar("triggerType", { length: 50 }),
  triggerData: json("triggerData"), // Trigger payload/context
  
  // Execution context
  executedBy: integer("executedBy"), // FK to users (null for automated triggers)
  error: text("error"), // Error message if failed
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Workflow Execution Logs (step-by-step execution logs)
export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
  id: serial("id").primaryKey(),
  executionId: integer("executionId").notNull(), // FK to workflow_executions
  
  // Node/step information
  nodeId: varchar("nodeId", { length: 255 }).notNull(),
  nodeType: varchar("nodeType", { length: 100 }).notNull(), // trigger, action, etc.
  nodeLabel: varchar("nodeLabel", { length: 255 }),
  
  // Execution details
  status: varchar("status", { length: 50 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"), // Duration in milliseconds
  
  // Input/output data
  input: json("input"), // Input data for this step
  output: json("output"), // Output data from this step
  error: text("error"), // Error message if failed
  
  // Logging
  logLevel: varchar("logLevel", { length: 50 }).default("info"),
  message: text("message"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type InsertWorkflowVersion = typeof workflowVersions.$inferInsert;

// Simplified workflow type for creation
export type CreateWorkflowInput = {
  userId: number;
  name: string;
  description?: string;
  nodes: string;
  edges: string;
  workspaceId?: number;
};

export const workflowRuns = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull(),
  
  status: varchar("status", { length: 50 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  
  // Execution details
  triggerData: json("triggerData"),
  executionLog: json("executionLog"),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;

// ============================================================================
// Provider System (Provider Hub Integration)
// ============================================================================

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  
  // Provider status
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(50),
  
  // Configuration (API keys, endpoints, etc.)
  config: json("config").notNull(),
  
  // Cost tracking
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export const workspaceProviders = pgTable("workspace_providers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  providerId: integer("providerId").notNull(),
  
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(50),
  quotaTokensPerDay: integer("quotaTokensPerDay"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceProvider = typeof workspaceProviders.$inferSelect;
export type InsertWorkspaceProvider = typeof workspaceProviders.$inferInsert;

export const providerUsage = pgTable("provider_usage", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  providerId: integer("providerId").notNull(),
  
  modelName: varchar("modelName", { length: 255 }),
  tokensUsed: integer("tokensUsed").notNull(),
  cost: varchar("cost", { length: 20 }),
  latencyMs: integer("latencyMs"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProviderUsage = typeof providerUsage.$inferSelect;
export type InsertProviderUsage = typeof providerUsage.$inferInsert;

// Provider Health Monitoring
export const providerHealthChecks = pgTable("provider_health_checks", {
  id: serial("id").primaryKey(),
  providerId: integer("providerId").notNull(),
  
  status: varchar("status", { length: 50 }).notNull(),
  responseTimeMs: integer("responseTimeMs"),
  errorMessage: text("errorMessage"),
  
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type ProviderHealthCheck = typeof providerHealthChecks.$inferSelect;
export type InsertProviderHealthCheck = typeof providerHealthChecks.$inferInsert;

// Provider Performance Metrics
export const providerMetrics = pgTable("provider_metrics", {
  id: serial("id").primaryKey(),
  providerId: integer("providerId").notNull(),
  
  // Performance metrics
  avgLatencyMs: integer("avgLatencyMs"),
  p95LatencyMs: integer("p95LatencyMs"),
  p99LatencyMs: integer("p99LatencyMs"),
  tokensPerSecond: integer("tokensPerSecond"),
  
  // Reliability metrics
  successRate: varchar("successRate", { length: 10 }),
  errorRate: varchar("errorRate", { length: 10 }),
  uptime: varchar("uptime", { length: 10 }),
  
  // Usage metrics
  totalRequests: integer("totalRequests").default(0),
  totalTokens: integer("totalTokens").default(0),
  totalCost: varchar("totalCost", { length: 20 }),
  
  // Time period
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProviderMetric = typeof providerMetrics.$inferSelect;
export type InsertProviderMetric = typeof providerMetrics.$inferInsert;

// Model Downloads
export const modelDownloads = pgTable("model_downloads", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),
  
  // Download info
  sourceUrl: text("sourceUrl").notNull(),
  destinationPath: text("destinationPath"),
  fileSize: varchar("fileSize", { length: 50 }),
  
  // Progress tracking
  status: varchar("status", { length: 50 }).default("queued"),
  progress: integer("progress").default(0),
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }).default("0"),
  downloadSpeed: varchar("downloadSpeed", { length: 50 }),
  
  // Scheduling
  priority: integer("priority").default(0), // Higher number = higher priority
  scheduledFor: timestamp("scheduledFor"), // null = immediate, otherwise scheduled time
  bandwidthLimit: integer("bandwidthLimit"), // KB/s, null = unlimited
  
  // Error handling
  errorMessage: text("errorMessage"),
  retryCount: integer("retryCount").default(0),
  
  // Timestamps
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelDownload = typeof modelDownloads.$inferSelect;
export type InsertModelDownload = typeof modelDownloads.$inferInsert;

// Model Versions
export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(), // Links to catalog model
  
  // Version info
  version: varchar("version", { length: 50 }).notNull(), // e.g., "1.0", "1.1", "2.0-beta"
  releaseDate: timestamp("releaseDate"),
  
  // Model details
  sourceUrl: text("sourceUrl"),
  fileSize: varchar("fileSize", { length: 50 }),
  checksum: varchar("checksum", { length: 128 }), // SHA256 hash
  
  // Changelog
  changelog: text("changelog"), // Markdown-formatted release notes
  
  // Status
  isLatest: boolean("isLatest").default(false),
  isDeprecated: boolean("isDeprecated").default(false),
  
  // Metadata
  downloadCount: integer("downloadCount").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelVersion = typeof modelVersions.$inferSelect;
export type InsertModelVersion = typeof modelVersions.$inferInsert;

// Model Conversions
export const modelConversions = pgTable("model_conversions", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),
  
  // Conversion details
  sourceFormat: varchar("sourceFormat", { length: 50 }).notNull(),
  targetFormat: varchar("targetFormat", { length: 50 }).notNull(),
  quantization: varchar("quantization", { length: 50 }),
  
  // Files
  sourcePath: text("sourcePath").notNull(),
  outputPath: text("outputPath"),
  
  // Progress
  status: varchar("status", { length: 50 }).default("queued"),
  progress: integer("progress").default(0),
  
  // Results
  outputSize: varchar("outputSize", { length: 50 }),
  errorMessage: text("errorMessage"),
  
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelConversion = typeof modelConversions.$inferSelect;
export type InsertModelConversion = typeof modelConversions.$inferInsert;

// Download Analytics
export const downloadAnalytics = pgTable("download_analytics", {
  id: serial("id").primaryKey(),
  downloadId: integer("downloadId").notNull(),
  modelId: integer("modelId").notNull(),
  userId: integer("userId").notNull(),
  
  // Bandwidth metrics
  instantSpeed: varchar("instantSpeed", { length: 50 }), // KB/s at this measurement
  averageSpeed: varchar("averageSpeed", { length: 50 }), // KB/s average so far
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }),
  
  // Time metrics
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  elapsedSeconds: integer("elapsedSeconds").default(0),
  
  // Network info
  connectionType: varchar("connectionType", { length: 50 }), // wifi, ethernet, cellular
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DownloadAnalytic = typeof downloadAnalytics.$inferSelect;
export type InsertDownloadAnalytic = typeof downloadAnalytics.$inferInsert;

// ============================================================================
// Trigger & Action Registry (Compliance-Driven Extension System)
// ============================================================================

/**
 * Trigger Registry - Stores custom trigger type definitions
 * Implements 14-gate compliance protocol for trigger creation
 */
export const triggerRegistry = pgTable("trigger_registry", {
  id: serial("id").primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  
  // Gate 0: Classification & Intent
  classification: varchar("classification", { length: 50 }).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(),
  
  // Gate 2: Configuration Schema
  configSchema: json("configSchema").notNull(),
  configSchemaVersion: integer("configSchemaVersion").notNull().default(1),
  defaultConfig: json("defaultConfig"),
  
  // Gate 3: UX Safety
  uiRenderer: text("uiRenderer"),
  requiredFields: json("requiredFields"),
  unsafeOptions: json("unsafeOptions"),
  validationRules: json("validationRules"),
  samplePayload: json("samplePayload"),
  
  // Gate 4: Data Flow & Contracts
  inputContract: json("inputContract"),
  outputContract: json("outputContract").notNull(),
  outputTypes: json("outputTypes"),
  initialWorkflowSchema: json("initialWorkflowSchema"),
  
  // Gate 5: Execution Semantics
  executionMode: varchar("executionMode", { length: 50 }).notNull(),
  blockingBehavior: varchar("blockingBehavior", { length: 50 }).notNull(),
  retryPolicy: json("retryPolicy"),
  timeoutPolicy: json("timeoutPolicy"),
  failureHandling: json("failureHandling"),
  stateTier: varchar("stateTier", { length: 50 }).notNull(),
  maxStateSize: integer("maxStateSize"),
  concurrentIsolation: text("concurrentIsolation"),
  
  // Gate 6: Error Propagation
  compensationStrategy: text("compensationStrategy"),
  workflowFailureHandler: json("workflowFailureHandler"),
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }),
  
  // Gate 7: Security & Governance
  requiredPermissions: json("requiredPermissions"),
  riskLevel: varchar("riskLevel", { length: 50 }).notNull(),
  preExecutionPolicies: json("preExecutionPolicies"),
  secretFields: json("secretFields"),
  
  // Gate 8: Multi-Tenancy
  tenantScoped: boolean("tenantScoped").notNull().default(true),
  tenantIsolation: text("tenantIsolation"),
  
  // Gate 9: Observability
  metricsConfig: json("metricsConfig"),
  logFields: json("logFields"),
  errorClassification: json("errorClassification"),
  
  // Gate 10: Performance & Cost
  performanceProfile: varchar("performanceProfile", { length: 50 }).notNull(),
  latencySLA: json("latencySLA"),
  throughputExpectation: integer("throughputExpectation"),
  degradationBehavior: text("degradationBehavior"),
  rateLimits: json("rateLimits"),
  costQuotas: json("costQuotas"),
  backpressureStrategy: text("backpressureStrategy"),
  
  // Gate 11: Documentation
  purposeDoc: text("purposeDoc").notNull(),
  useCases: json("useCases"),
  failureModes: json("failureModes"),
  securityConsiderations: text("securityConsiderations"),
  examples: json("examples"),
  
  // Gate 12: Testing & Simulation
  testCoverage: json("testCoverage"),
  dryRunSupported: boolean("dryRunSupported").notNull().default(false),
  simulationConfig: json("simulationConfig"),
  
  // Gate 13: Lifecycle Management
  deprecationNotice: text("deprecationNotice"),
  migrationPath: text("migrationPath"),
  replacementTypeId: varchar("replacementTypeId", { length: 100 }),
  
  // Gate 14: Composition & Modularity
  subWorkflowSupport: boolean("subWorkflowSupport").notNull().default(false),
  maxNestingDepth: integer("maxNestingDepth").default(5),
  variableScopingRules: text("variableScopingRules"),
  failureBubblingRules: text("failureBubblingRules"),
  
  // Runtime handler
  handlerCode: text("handlerCode"),
  handlerType: varchar("handlerType", { length: 50 }).notNull(),
  handlerEndpoint: varchar("handlerEndpoint", { length: 500 }),
  
  // Capability flags
  requiresNetwork: boolean("requiresNetwork").notNull().default(false),
  requiresSecrets: boolean("requiresSecrets").notNull().default(false),
  hasSideEffects: boolean("hasSideEffects").notNull().default(false),
  hasCost: boolean("hasCost").notNull().default(false),
  
  // Approval & Status
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  
  // Compliance validation
  criticalViolations: integer("criticalViolations").notNull().default(0),
  majorIssues: integer("majorIssues").notNull().default(0),
  complianceScore: integer("complianceScore"),
  lastValidated: timestamp("lastValidated"),
  
  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TriggerRegistryEntry = typeof triggerRegistry.$inferSelect;
export type InsertTriggerRegistryEntry = typeof triggerRegistry.$inferInsert;

/**
 * Action Registry - Stores custom action type definitions
 */
export const actionRegistry = pgTable("action_registry", {
  id: serial("id").primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  
  // Gate 0: Classification & Intent
  classification: varchar("classification", { length: 50 }).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(),
  sideEffects: json("sideEffects").notNull(),
  
  // All other gates (same structure as trigger registry)
  configSchema: json("configSchema").notNull(),
  configSchemaVersion: integer("configSchemaVersion").notNull().default(1),
  defaultConfig: json("defaultConfig"),
  uiRenderer: text("uiRenderer"),
  requiredFields: json("requiredFields"),
  unsafeOptions: json("unsafeOptions"),
  validationRules: json("validationRules"),
  retryBehaviorVisible: boolean("retryBehaviorVisible").notNull().default(true),
  timeoutBehaviorVisible: boolean("timeoutBehaviorVisible").notNull().default(true),
  failureBehaviorVisible: boolean("failureBehaviorVisible").notNull().default(true),
  inputContract: json("inputContract").notNull(),
  outputContract: json("outputContract").notNull(),
  outputTypes: json("outputTypes"),
  noGlobalMutation: boolean("noGlobalMutation").notNull().default(true),
  executionMode: varchar("executionMode", { length: 50 }).notNull(),
  blockingBehavior: varchar("blockingBehavior", { length: 50 }).notNull(),
  retryPolicy: json("retryPolicy"),
  timeoutPolicy: json("timeoutPolicy"),
  failureHandling: json("failureHandling"),
  stateTier: varchar("stateTier", { length: 50 }).notNull(),
  maxStateSize: integer("maxStateSize"),
  concurrentIsolation: text("concurrentIsolation"),
  compensationStrategy: text("compensationStrategy").notNull(),
  compensationAutomation: json("compensationAutomation"),
  workflowFailureHandler: json("workflowFailureHandler"),
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }),
  partialRollbackPaths: json("partialRollbackPaths"),
  requiredPermissions: json("requiredPermissions"),
  riskLevel: varchar("riskLevel", { length: 50 }).notNull(),
  preExecutionPolicies: json("preExecutionPolicies"),
  secretFields: json("secretFields"),
  promptVariableSanitization: json("promptVariableSanitization"),
  tokenCap: integer("tokenCap"),
  costCap: integer("costCap"),
  outputSchema: json("outputSchema"),
  confidenceScoreExposed: boolean("confidenceScoreExposed").default(false),
  highRiskDefinition: json("highRiskDefinition"),
  humanInLoopRequired: boolean("humanInLoopRequired").default(false),
  tenantScoped: boolean("tenantScoped").notNull().default(true),
  tenantIsolation: text("tenantIsolation"),
  metricsConfig: json("metricsConfig"),
  logFields: json("logFields"),
  errorClassification: json("errorClassification"),
  performanceProfile: varchar("performanceProfile", { length: 50 }).notNull(),
  latencySLA: json("latencySLA"),
  throughputExpectation: integer("throughputExpectation"),
  degradationBehavior: text("degradationBehavior"),
  rateLimits: json("rateLimits"),
  costQuotas: json("costQuotas"),
  backpressureStrategy: text("backpressureStrategy"),
  purposeDoc: text("purposeDoc").notNull(),
  useCases: json("useCases"),
  failureModes: json("failureModes"),
  securityConsiderations: text("securityConsiderations"),
  examples: json("examples"),
  testCoverage: json("testCoverage"),
  dryRunSupported: boolean("dryRunSupported").notNull().default(false),
  simulationConfig: json("simulationConfig"),
  deprecationNotice: text("deprecationNotice"),
  migrationPath: text("migrationPath"),
  replacementTypeId: varchar("replacementTypeId", { length: 100 }),
  subWorkflowSupport: boolean("subWorkflowSupport").notNull().default(false),
  maxNestingDepth: integer("maxNestingDepth").default(5),
  variableScopingRules: text("variableScopingRules"),
  failureBubblingRules: text("failureBubblingRules"),
  handlerCode: text("handlerCode"),
  handlerType: varchar("handlerType", { length: 50 }).notNull(),
  handlerEndpoint: varchar("handlerEndpoint", { length: 500 }),
  requiresNetwork: boolean("requiresNetwork").notNull().default(false),
  requiresSecrets: boolean("requiresSecrets").notNull().default(false),
  hasSideEffects: boolean("hasSideEffects").notNull().default(false),
  hasCost: boolean("hasCost").notNull().default(false),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  criticalViolations: integer("criticalViolations").notNull().default(0),
  majorIssues: integer("majorIssues").notNull().default(0),
  complianceScore: integer("complianceScore"),
  lastValidated: timestamp("lastValidated"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ActionRegistryEntry = typeof actionRegistry.$inferSelect;
export type InsertActionRegistryEntry = typeof actionRegistry.$inferInsert;

// Model Shares
export const modelShares = pgTable("model_shares", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  
  // Storage info
  storagePath: text("storagePath").notNull(), // S3 path or local path
  fileSize: varchar("fileSize", { length: 50 }),
  checksum: varchar("checksum", { length: 128 }), // SHA256 hash for deduplication
  
  // Reference counting
  referenceCount: integer("referenceCount").default(1).notNull(),
  
  // Sharing scope
  shareScope: varchar("shareScope", { length: 50 }).default("user"),
  ownerId: integer("ownerId").notNull(), // Original uploader/downloader
  
  // Metadata
  lastAccessedAt: timestamp("lastAccessedAt").defaultNow(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ModelShare = typeof modelShares.$inferSelect;
export type InsertModelShare = typeof modelShares.$inferInsert;

// Model Share References
export const modelShareReferences = pgTable("model_share_references", {
  id: serial("id").primaryKey(),
  shareId: integer("shareId").notNull(),
  
  // Reference owner
  userId: integer("userId"),
  workspaceId: integer("workspaceId"),
  
  // Access tracking
  lastUsedAt: timestamp("lastUsedAt").defaultNow(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelShareReference = typeof modelShareReferences.$inferSelect;
export type InsertModelShareReference = typeof modelShareReferences.$inferInsert;

// Model Benchmarks
export const modelBenchmarks = pgTable("model_benchmarks", {
  id: serial("id").primaryKey(),
  modelId: integer("modelId").notNull(),
  
  // Benchmark type
  benchmarkType: varchar("benchmarkType", { length: 50 }).notNull(),
  benchmarkName: varchar("benchmarkName", { length: 255 }).notNull(),
  
  // Results
  score: varchar("score", { length: 50 }),
  tokensPerSecond: integer("tokensPerSecond"),
  memoryUsageMb: integer("memoryUsageMb"),
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),
  
  // Metadata
  metadata: json("metadata"),
  
  runBy: integer("runBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelBenchmark = typeof modelBenchmarks.$inferSelect;
export type InsertModelBenchmark = typeof modelBenchmarks.$inferInsert;

// Hardware Detection
export const hardwareProfiles = pgTable("hardware_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  
  // CPU info
  cpuModel: varchar("cpuModel", { length: 255 }),
  cpuCores: integer("cpuCores"),
  cpuThreads: integer("cpuThreads"),
  
  // GPU info
  gpuModel: varchar("gpuModel", { length: 255 }),
  gpuVram: integer("gpuVram"),
  gpuDriver: varchar("gpuDriver", { length: 100 }),
  gpuComputeCapability: varchar("gpuComputeCapability", { length: 50 }),
  
  // Memory
  totalRamMb: integer("totalRamMb"),
  availableRamMb: integer("availableRamMb"),
  
  // Capabilities
  supportsCuda: boolean("supportsCuda").default(false),
  supportsRocm: boolean("supportsRocm").default(false),
  supportsMetal: boolean("supportsMetal").default(false),
  
  // Score
  performanceScore: integer("performanceScore"),
  
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type HardwareProfile = typeof hardwareProfiles.$inferSelect;
export type InsertHardwareProfile = typeof hardwareProfiles.$inferInsert;

// ============================================================================
// Plugin System
// ============================================================================

export const plugins = pgTable("plugins", {
  id: serial("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).notNull(),
  
  // Plugin metadata
  author: varchar("author", { length: 255 }),
  runtime: varchar("runtime", { length: 50 }).notNull(),
  entryPoint: varchar("entryPoint", { length: 500 }).notNull(),
  
  // Permissions
  permissions: json("permissions").notNull(),
  
  // Status
  enabled: boolean("enabled").default(true),
  verified: boolean("verified").default(false),
  
  installedBy: integer("installedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = typeof plugins.$inferInsert;

// ============================================================================
// Knowledge Packs
// ============================================================================

export const knowledgePacks = pgTable("knowledge_packs", {
  id: serial("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  
  // Pack metadata
  version: varchar("version", { length: 50 }).notNull(),
  documentCount: integer("documentCount").default(0),
  totalSize: integer("totalSize").default(0),
  
  // Pack data
  packData: json("packData").notNull(),
  
  createdBy: integer("createdBy").notNull(),
  isPublic: boolean("isPublic").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KnowledgePack = typeof knowledgePacks.$inferSelect;
export type InsertKnowledgePack = typeof knowledgePacks.$inferInsert;

// ============================================================================
// System Settings
// ============================================================================

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  
  settingKey: varchar("settingKey", { length: 255 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  settingType: varchar("settingType", { length: 50 }).notNull(),
  
  description: text("description"),
  
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ============================================================================
// Secrets Management
// ============================================================================

export const secrets = pgTable("secrets", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  encryptedValue: text("encryptedValue").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  uniqueUserKey: uniqueIndex("unique_user_key").on(table.userId, table.key),
  userIdIdx: index("idx_userId").on(table.userId),
}));

export type Secret = typeof secrets.$inferSelect;
export type InsertSecret = typeof secrets.$inferInsert;


// ============================================================================
// Workflow Templates
// ============================================================================

export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  
  // Template workflow structure (JSON)
  workflowDefinition: json("workflowDefinition").notNull(),
  
  // Metadata
  icon: varchar("icon", { length: 50 }),
  tags: json("tags").$type<string[]>(),
  usageCount: integer("usageCount").default(0),
  
  // Visibility
  isPublic: boolean("isPublic").default(true),
  createdBy: integer("createdBy").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("idx_category").on(table.category),
  createdByIdx: index("idx_createdBy").on(table.createdBy),
}));

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;


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
  
  // Invalidated agents (agentId -> reason mapping)
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
// WCP (Workflow Composition Protocol) Workflows
// ============================================================================

export const wcpWorkflows = pgTable("wcp_workflows", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // Owner of the workflow
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // ReactFlow canvas data (visual representation)
  nodes: text("nodes").notNull(), // JSON string of ReactFlow nodes
  edges: text("edges").notNull(), // JSON string of ReactFlow edges
  
  // WCP bytecode (compiled workflow specification)
  wcpBytecode: text("wcpBytecode"), // JSON string of WCP-compliant bytecode
  
  // Status
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  
  // Execution tracking
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WCPWorkflow = typeof wcpWorkflows.$inferSelect;
export type InsertWCPWorkflow = typeof wcpWorkflows.$inferInsert;

// WCP Workflow Executions
export const wcpExecutions = pgTable("wcp_executions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull(), // FK to wcp_workflows
  
  workflowName: varchar("workflowName", { length: 255 }).notNull(),
  
  // Execution metadata
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"), // Duration in seconds
  
  // Execution details
  executionLog: json("executionLog"), // Step-by-step execution logs
  errorMessage: text("errorMessage"),
  
  // Trigger information
  triggerType: varchar("triggerType", { length: 50 }).default("manual"),
  triggerData: json("triggerData"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WCPExecution = typeof wcpExecutions.$inferSelect;
export type InsertWCPExecution = typeof wcpExecutions.$inferInsert;


// ============================================================================
// Agent Governance System
// ============================================================================

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  createdBy: integer("createdBy").notNull(),
  
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
  modelId: varchar("modelId", { length: 255 }).notNull(),
  temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.7"),
  
  // Capabilities & Limits
  capabilities: json("capabilities"), // { tools: string[], actions: string[], memory: {...} }
  limits: json("limits"), // { rateLimit: number, costLimit: number, executionTimeout: number }
  
  // Permissions
  hasDocumentAccess: boolean("hasDocumentAccess").default(false),
  hasToolAccess: boolean("hasToolAccess").default(false),
  allowedTools: json("allowedTools"), // string[]
  
  // Policy & Governance
  policyDigest: varchar("policyDigest", { length: 64 }), // SHA256 hash of applied policies
  policySetHash: varchar("policySetHash", { length: 64 }), // Hash of effective policy set
  lockedFields: json("lockedFields"), // string[] - fields locked by policy
  
  // Metadata
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 50 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

// Agent versions for audit trail and rollback
export const agentVersions = pgTable("agentVersions", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull(),
  
  // Version metadata
  version: integer("version").notNull(),
  createdBy: integer("createdBy").notNull(),
  changeNotes: text("changeNotes"),
  
  // Full snapshot
  agentSnapshot: json("agentSnapshot").notNull(), // Complete agent config at this version
  
  // Policy state at this version
  policyDigest: varchar("policyDigest", { length: 64 }),
  policySetHash: varchar("policySetHash", { length: 64 }),
  
  // Promotion reference
  promotionRequestId: integer("promotionRequestId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = typeof agentVersions.$inferInsert;

// Promotion requests (human-in-the-loop approvals)
export const promotionRequests = pgTable("promotionRequests", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull(),
  
  // Request metadata
  requestedBy: integer("requestedBy").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  
  // Diff information
  diffHash: varchar("diffHash", { length: 64 }),
  diffSnapshot: json("diffSnapshot"), // Structured diff output
  baselineVersion: integer("baselineVersion"),
  proposedVersion: integer("proposedVersion"),
  
  // Policy validation
  validationSnapshot: json("validationSnapshot"), // Policy validation result at request time
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
  
  actor: integer("actor"), // User ID
  details: json("details"), // Event-specific data
  
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

// Policy reload history (for hot-reload + cosign verification)
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
  impactSnapshot: json("impactSnapshot"), // { compliant: [], impacted_soft: [], impacted_hard: [] }
  
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

// Incidents (promotion freeze)
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  
  // Freeze scope
  frozenEnvironments: json("frozenEnvironments"), // string[] - 'sandbox', 'governed', etc
  
  // Lifecycle
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdBy: integer("createdBy").notNull(),
  resolvedBy: integer("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;


// ============================================================================
// Policy Management
// ============================================================================

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  createdBy: integer("createdBy").notNull(),
  
  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).default("1.0"),
  
  // Policy content
  content: json("content").notNull(), // Full policy JSON
  hash: varchar("hash", { length: 64 }).notNull(), // SHA256 hash for change detection
  
  // Status
  isActive: boolean("isActive").default(false),
  isTemplate: boolean("isTemplate").default(false),
  
  // Metadata
  rules: json("rules"), // Extracted rules for quick evaluation
  appliedToAgents: integer("appliedToAgents").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;

export const policyTemplates = pgTable("policyTemplates", {
  id: serial("id").primaryKey(),
  
  // Identity
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("custom"),
  
  // Template content
  content: json("content").notNull(), // Full policy template JSON
  rules: json("rules"), // Extracted rules
  
  // Metadata
  version: varchar("version", { length: 50 }).default("1.0"),
  isDefault: boolean("isDefault").default(false),
  usageCount: integer("usageCount").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type InsertPolicyTemplate = typeof policyTemplates.$inferInsert;

// ============================================================================
// Key Rotation System
// ============================================================================

/**
 * Service Certificates - for TLS/mTLS communication
 * Tracks all service certificates and their rotation history
 */
export const serviceCertificates = pgTable("service_certificates", {
  id: serial("id").primaryKey(),
  
  // Certificate metadata
  serviceName: varchar("serviceName", { length: 255 }).notNull(), // e.g., "api-gateway", "auth-service"
  certificateType: varchar("certificateType", { length: 50 }).notNull(),
  
  // Certificate content (PEM format)
  certificate: text("certificate").notNull(),
  privateKey: text("privateKey").notNull(),
  publicKey: text("publicKey"),
  
  // Certificate details
  subject: varchar("subject", { length: 500 }),
  issuer: varchar("issuer", { length: 500 }),
  serialNumber: varchar("serialNumber", { length: 255 }),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull().unique(), // SHA-256 fingerprint
  
  // Validity period
  issuedAt: timestamp("issuedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(),
  isActive: boolean("isActive").default(false), // Current active certificate
  
  // Rotation tracking
  rotationId: integer("rotationId"), // FK to key_rotations
  previousCertificateId: integer("previousCertificateId"), // FK to previous cert (for overlap tracking)
  overlapStartsAt: timestamp("overlapStartsAt"), // When old+new both valid
  overlapEndsAt: timestamp("overlapEndsAt"), // When to retire old cert
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ServiceCertificate = typeof serviceCertificates.$inferSelect;
export type InsertServiceCertificate = typeof serviceCertificates.$inferInsert;

/**
 * Attestation Keys - for signing and verifying agent attestations
 * Tracks public/private key pairs used for attestation verification
 */
export const attestationKeys = pgTable("attestation_keys", {
  id: serial("id").primaryKey(),
  
  // Key metadata
  keyName: varchar("keyName", { length: 255 }).notNull(), // e.g., "attestation-key-prod-v1"
  keyType: varchar("keyType", { length: 50 }).default("ed25519").notNull(),
  keySize: integer("keySize"), // 2048, 4096 for RSA; 256, 384, 521 for ECDSA; null for Ed25519
  
  // Key content (PEM format)
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey"), // Only set for keys we own; null for external keys
  
  // Key details
  keyId: varchar("keyId", { length: 255 }).notNull().unique(), // JWK kid or similar identifier
  thumbprint: varchar("thumbprint", { length: 255 }).notNull().unique(), // SHA-256 thumbprint
  
  // Validity period
  generatedAt: timestamp("generatedAt").notNull(),
  expiresAt: timestamp("expiresAt"),
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(),
  isActive: boolean("isActive").default(false), // Current active key for signing
  
  // Rotation tracking
  rotationId: integer("rotationId"), // FK to key_rotations
  previousKeyId: integer("previousKeyId"), // FK to previous key (for overlap tracking)
  overlapStartsAt: timestamp("overlapStartsAt"), // When old+new both valid
  overlapEndsAt: timestamp("overlapEndsAt"), // When to retire old key
  
  // Usage tracking
  usageCount: integer("usageCount").default(0), // Number of attestations signed
  lastUsedAt: timestamp("lastUsedAt"),
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AttestationKey = typeof attestationKeys.$inferSelect;
export type InsertAttestationKey = typeof attestationKeys.$inferInsert;

/**
 * Key Rotations - tracks rotation events and their status
 * Central audit log for all key rotation operations
 */
export const keyRotations = pgTable("key_rotations", {
  id: serial("id").primaryKey(),
  
  // Rotation metadata
  rotationType: varchar("rotationType", { length: 50 }).notNull(),
  targetName: varchar("targetName", { length: 255 }).notNull(), // Service name or key name
  
  // Rotation status
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  
  // Rotation timeline
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  
  // Old and new keys/certs
  oldKeyId: integer("oldKeyId"), // FK to previous key/cert
  newKeyId: integer("newKeyId"), // FK to new key/cert
  
  // Overlap window
  overlapStartsAt: timestamp("overlapStartsAt"),
  overlapEndsAt: timestamp("overlapEndsAt"),
  
  // Execution details
  initiatedBy: integer("initiatedBy"), // FK to users
  reason: varchar("reason", { length: 500 }), // "scheduled", "manual", "emergency", "compromise"
  
  // Error tracking
  error: text("error"), // Error message if failed
  rollbackReason: text("rollbackReason"), // Reason for rollback if rolled back
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotation = typeof keyRotations.$inferSelect;
export type InsertKeyRotation = typeof keyRotations.$inferInsert;

/**
 * Key Rotation Audit Log - detailed audit trail for compliance
 * Tracks all actions taken during key rotation for audit purposes
 */
export const keyRotationAuditLogs = pgTable("key_rotation_audit_logs", {
  id: serial("id").primaryKey(),
  
  // Reference to rotation
  rotationId: integer("rotationId").notNull(), // FK to key_rotations
  
  // Action details
  action: varchar("action", { length: 100 }).notNull(), // "key_generated", "key_deployed", "overlap_started", "old_key_revoked", etc.
  actionType: varchar("actionType", { length: 50 }).notNull(),
  
  // Actor information
  performedBy: integer("performedBy"), // FK to users (null for system actions)
  performedBySystem: boolean("performedBySystem").default(false), // Whether action was system-initiated
  
  // Details
  details: json("details"), // Structured details about the action
  status: varchar("status", { length: 50 }).notNull(),
  message: text("message"),
  
  // Verification
  verificationStatus: varchar("verificationStatus", { length: 50 }),
  verificationDetails: json("verificationDetails"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KeyRotationAuditLog = typeof keyRotationAuditLogs.$inferSelect;
export type InsertKeyRotationAuditLog = typeof keyRotationAuditLogs.$inferInsert;

/**
 * Key Rotation Policies - configuration for automatic rotation
 * Defines when and how keys should be rotated
 */
export const keyRotationPolicies = pgTable("key_rotation_policies", {
  id: serial("id").primaryKey(),
  
  // Policy metadata
  policyName: varchar("policyName", { length: 255 }).notNull(),
  description: text("description"),
  
  // Target
  targetType: varchar("targetType", { length: 50 }).notNull(),
  targetName: varchar("targetName", { length: 255 }), // Specific service/key name, or null for all
  
  // Rotation schedule
  rotationIntervalDays: integer("rotationIntervalDays").notNull(), // Rotate every N days
  rotationIntervalHours: integer("rotationIntervalHours"), // Or every N hours (for frequent rotation)
  daysBeforeExpiry: integer("daysBeforeExpiry"), // Rotate this many days before expiry
  
  // Overlap window
  overlapWindowDays: integer("overlapWindowDays").default(7), // Days to keep old+new valid
  
  // Execution
  autoRotate: boolean("autoRotate").default(true), // Automatically rotate on schedule
  requireApproval: boolean("requireApproval").default(false), // Require manual approval
  notifyBefore: integer("notifyBefore"), // Notify N days before rotation
  
  // Status
  isActive: boolean("isActive").default(true),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotationPolicy = typeof keyRotationPolicies.$inferSelect;
export type InsertKeyRotationPolicy = typeof keyRotationPolicies.$inferInsert;

/**
 * Key Rotation Schedules - tracks scheduled rotations
 * Upcoming rotation events based on policies
 */
export const keyRotationSchedules = pgTable("key_rotation_schedules", {
  id: serial("id").primaryKey(),
  
  // References
  policyId: integer("policyId").notNull(), // FK to key_rotation_policies
  rotationId: integer("rotationId"), // FK to key_rotations (null until rotation starts)
  
  // Schedule
  scheduledAt: timestamp("scheduledAt").notNull(),
  reason: varchar("reason", { length: 255 }), // "policy", "expiry", "manual", "emergency"
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotationSchedule = typeof keyRotationSchedules.$inferSelect;
export type InsertKeyRotationSchedule = typeof keyRotationSchedules.$inferInsert;

// ============================================================================
// LLM Control Plane & Registry
// ============================================================================

/**
 * LLMs - Canonical registry of all LLM identities
 * Each LLM represents a unique AI model configuration in the system
 */
export const llms = pgTable("llms", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Classification
  role: varchar("role", { length: 50 }).notNull(),
  ownerTeam: varchar("ownerTeam", { length: 255 }),

  // Status
  archived: boolean("archived").default(false),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_llm_name").on(table.name),
  roleIdx: index("idx_llm_role").on(table.role),
}));

export type LLM = typeof llms.$inferSelect;
export type InsertLLM = typeof llms.$inferInsert;

/**
 * LLM Versions - Immutable, versioned LLM configurations
 * Each version is a complete snapshot with policy validation and attestation contract
 */
export const llmVersions = pgTable("llm_versions", {
  id: serial("id").primaryKey(),
  llmId: integer("llmId").notNull(),

  // Versioning
  version: integer("version").notNull(),
  environment: varchar("environment", { length: 50 }).notNull().default("sandbox"),

  // Configuration (complete LLM config as JSON)
  config: json("config").notNull(), // { runtime, provider, model, params, etc. }
  configHash: varchar("configHash", { length: 64 }).notNull(), // SHA256 of config

  // Policy validation
  policyBundleRef: varchar("policyBundleRef", { length: 512 }), // OCI reference to policy bundle
  policyHash: varchar("policyHash", { length: 64 }), // SHA256 of policy bundle
  policyDecision: varchar("policyDecision", { length: 50 }).default("pass"),
  policyViolations: json("policyViolations"), // Array of violation objects

  // Attestation contract
  attestationContract: json("attestationContract"), // Required runtime fingerprint
  attestationStatus: varchar("attestationStatus", { length: 50 }).default("pending"),

  // Runtime state
  driftStatus: varchar("driftStatus", { length: 50 }).default("none"),
  callable: boolean("callable").default(false), // Can this version be dispatched?

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  // Change tracking
  changeNotes: text("changeNotes"),
  promotionRequestId: integer("promotionRequestId"), // FK if created via promotion
}, (table) => ({
  llmIdIdx: index("idx_llm_version_llm_id").on(table.llmId),
  environmentIdx: index("idx_llm_version_env").on(table.environment),
  callableIdx: index("idx_llm_version_callable").on(table.callable),
  uniqueLlmVersion: uniqueIndex("unique_llm_version").on(table.llmId, table.version),
}));

export type LLMVersion = typeof llmVersions.$inferSelect;
export type InsertLLMVersion = typeof llmVersions.$inferInsert;

/**
 * LLM Promotions - Promotion requests between environments
 * Gate-based workflow with simulation, approval, and execution
 */
export const llmPromotions = pgTable("llm_promotions", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Promotion details
  fromEnvironment: varchar("fromEnvironment", { length: 50 }).notNull(),
  toEnvironment: varchar("toEnvironment", { length: 50 }).notNull(),

  // Status
  status: varchar("status", { length: 50 }).notNull().default("pending"),

  // Simulation results
  simulationResults: json("simulationResults"), // Policy check, compatibility, cost estimate
  simulatedAt: timestamp("simulatedAt"),

  // Approval workflow
  requestedBy: integer("requestedBy").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),

  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalComment: text("approvalComment"),

  rejectedBy: integer("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),

  // Execution
  executedAt: timestamp("executedAt"),
  executionError: text("executionError"),
  newVersionId: integer("newVersionId"), // FK to created llm_version in target environment

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  llmVersionIdx: index("idx_promotion_version").on(table.llmVersionId),
  statusIdx: index("idx_promotion_status").on(table.status),
}));

export type LLMPromotion = typeof llmPromotions.$inferSelect;
export type InsertLLMPromotion = typeof llmPromotions.$inferInsert;

/**
 * LLM Attestations - Runtime attestation evidence
 * Continuous trust verification through runtime attestation
 */
export const llmAttestations = pgTable("llm_attestations", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Attestation status
  status: varchar("status", { length: 50 }).notNull(),

  // Evidence payload
  evidence: json("evidence").notNull(), // Runtime-provided attestation evidence
  evidenceHash: varchar("evidenceHash", { length: 64 }),

  // Verification details
  imageDigest: varchar("imageDigest", { length: 255 }),
  configHash: varchar("configHash", { length: 64 }),
  workloadIdentity: varchar("workloadIdentity", { length: 512 }), // SPIFFE ID or similar

  // Timestamps
  submittedAt: timestamp("submittedAt").notNull(),
  verifiedAt: timestamp("verifiedAt"),
  expiresAt: timestamp("expiresAt"),

  // Revocation
  revokedAt: timestamp("revokedAt"),
  revokedBy: integer("revokedBy"),
  revocationReason: text("revocationReason"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  llmVersionIdx: index("idx_attestation_version").on(table.llmVersionId),
  statusIdx: index("idx_attestation_status").on(table.status),
}));

export type LLMAttestation = typeof llmAttestations.$inferSelect;
export type InsertLLMAttestation = typeof llmAttestations.$inferInsert;

/**
 * LLM Drift Events - Runtime drift detection results
 * Tracks when actual runtime diverges from declared config
 */
export const llmDriftEvents = pgTable("llm_drift_events", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Drift classification
  severity: varchar("severity", { length: 50 }).notNull(),
  signal: varchar("signal", { length: 255 }).notNull(), // "image_digest_mismatch", "config_mutation", etc.

  // Drift details
  expected: json("expected").notNull(), // Expected state
  observed: json("observed").notNull(), // Observed state

  // Response
  responseAction: varchar("responseAction", { length: 50 }),
  responseTaken: boolean("responseTaken").default(false),

  // Timestamps
  detectedAt: timestamp("detectedAt").notNull(),
  resolvedAt: timestamp("resolvedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  llmVersionIdx: index("idx_drift_version").on(table.llmVersionId),
  severityIdx: index("idx_drift_severity").on(table.severity),
}));

export type LLMDriftEvent = typeof llmDriftEvents.$inferSelect;
export type InsertLLMDriftEvent = typeof llmDriftEvents.$inferInsert;

/**
 * LLM Audit Events - Complete audit trail
 * Immutable, signed record of all LLM lifecycle events
 */
export const llmAuditEvents = pgTable("llm_audit_events", {
  id: serial("id").primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(), // "llm.wizard.started", "llm.version.created", etc.

  // References
  llmId: integer("llmId"),
  llmVersionId: integer("llmVersionId"),
  promotionId: integer("promotionId"),

  // Actor
  actor: integer("actor"), // User ID
  actorType: varchar("actorType", { length: 50 }).default("user"),

  // Event payload
  payload: json("payload").notNull(), // Event-specific data

  // Trust chain
  configHash: varchar("configHash", { length: 64 }),
  policyHash: varchar("policyHash", { length: 64 }),
  eventSignature: text("eventSignature"), // Cryptographic signature of event

  // Environment context
  environment: varchar("environment", { length: 50 }),

  // Timestamps
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  eventTypeIdx: index("idx_audit_event_type").on(table.eventType),
  llmIdIdx: index("idx_audit_llm_id").on(table.llmId),
  timestampIdx: index("idx_audit_timestamp").on(table.timestamp),
}));

export type LLMAuditEvent = typeof llmAuditEvents.$inferSelect;
export type InsertLLMAuditEvent = typeof llmAuditEvents.$inferInsert;

// ============================================================================
// LLM Creation & Training Pipeline
// ============================================================================

/**
 * LLM Creation Projects - Tracks complete LLM creation/training projects
 * Follows the "COMPLETE LLM CREATION GUIDE" methodology
 */
export const llmCreationProjects = pgTable("llm_creation_projects", {
  id: serial("id").primaryKey(),

  // Project identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Path selection (from guide)
  path: varchar("path", { length: 10 }).notNull(), // "PATH_A" (fine-tune) or "PATH_B" (pre-train)

  // Target specification (Phase 0 from guide)
  target: json("target").notNull(), // { useCase, deployment, maxModelSize, contextLength, allowedData }

  // Base model selection (Phase 1 from guide)
  baseModel: json("baseModel"), // { name, ollamaTag, hfRepo, size, license, context, rationale }

  // Status tracking
  status: varchar("status", { length: 50 }).notNull().default("draft"), // draft, dataset_prep, training, evaluation, quantization, deployed, failed, archived
  currentPhase: varchar("currentPhase", { length: 50 }), // phase_0_planning, phase_1_base_model, phase_2_dataset, phase_3_sft, etc.
  progress: integer("progress").default(0), // 0-100 percentage

  // Results & outputs
  finalModelPath: varchar("finalModelPath", { length: 512 }),
  ollamaModelName: varchar("ollamaModelName", { length: 255 }),
  deploymentStatus: varchar("deploymentStatus", { length: 50 }),

  // Linked LLM (once deployed)
  llmId: integer("llmId"), // FK to llms table

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  nameIdx: index("idx_creation_project_name").on(table.name),
  statusIdx: index("idx_creation_project_status").on(table.status),
  createdByIdx: index("idx_creation_project_creator").on(table.createdBy),
}));

export type LLMCreationProject = typeof llmCreationProjects.$inferSelect;
export type InsertLLMCreationProject = typeof llmCreationProjects.$inferInsert;

/**
 * LLM Datasets - Stores dataset metadata for training
 * Covers SFT, DPO, and Eval datasets from guide
 */
export const llmDatasets = pgTable("llm_datasets", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(), // FK to llm_creation_projects

  // Dataset identity
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // "sft", "dpo", "eval", "pretrain"

  // Source & content
  source: varchar("source", { length: 50 }), // "upload", "synthetic", "public", "mixed"
  format: varchar("format", { length: 50 }).notNull(), // "jsonl", "csv", "parquet"
  filePath: varchar("filePath", { length: 512 }), // Storage path
  fileSize: bigint("fileSize", { mode: "number" }), // Bytes

  // Statistics
  recordCount: integer("recordCount"),
  tokenCount: bigint("tokenCount", { mode: "number" }),
  stats: json("stats"), // { avgLength, vocabSize, languageDistribution, etc. }

  // Quality metrics
  qualityScore: numeric("qualityScore", { precision: 5, scale: 2 }),
  qualityChecks: json("qualityChecks"), // { deduplication, pii_removal, format_validation, etc. }

  // Processing status
  status: varchar("status", { length: 50 }).default("pending"), // pending, processing, ready, failed
  processingLogs: text("processingLogs"),

  // Validation
  validated: boolean("validated").default(false),
  validationErrors: json("validationErrors"),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("idx_dataset_project").on(table.projectId),
  typeIdx: index("idx_dataset_type").on(table.type),
  statusIdx: index("idx_dataset_status").on(table.status),
}));

export type LLMDataset = typeof llmDatasets.$inferSelect;
export type InsertLLMDataset = typeof llmDatasets.$inferInsert;

/**
 * LLM Training Runs - Tracks individual training jobs
 * Covers SFT, DPO, Tool Tuning, and Pre-training
 */
export const llmTrainingRuns = pgTable("llm_training_runs", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(), // FK to llm_creation_projects

  // Training type (from guide phases)
  trainingType: varchar("trainingType", { length: 50 }).notNull(), // "sft", "dpo", "tool_tuning", "pretrain"
  phase: varchar("phase", { length: 50 }), // "phase_3_sft", "phase_4_dpo", "phase_5_tools"

  // Configuration
  config: json("config").notNull(), // Complete training config (hyperparameters, model, dataset refs)
  configHash: varchar("configHash", { length: 64 }),

  // Dataset references
  datasetIds: json("datasetIds"), // Array of dataset IDs used

  // Training framework
  framework: varchar("framework", { length: 50 }), // "huggingface", "deepspeed", "megatron", "ollama"
  accelerator: varchar("accelerator", { length: 50 }), // "cpu", "cuda", "tpu"

  // Status tracking
  status: varchar("status", { length: 50 }).default("pending"), // pending, running, completed, failed, cancelled
  progress: integer("progress").default(0), // 0-100
  currentStep: integer("currentStep"),
  totalSteps: integer("totalSteps"),

  // Metrics
  metrics: json("metrics"), // Training loss, validation loss, accuracy, etc.
  finalLoss: numeric("finalLoss", { precision: 10, scale: 6 }),

  // Resources
  gpuHours: numeric("gpuHours", { precision: 10, scale: 2 }),
  estimatedCost: numeric("estimatedCost", { precision: 10, scale: 2 }),
  actualCost: numeric("actualCost", { precision: 10, scale: 2 }),

  // Outputs
  checkpointPath: varchar("checkpointPath", { length: 512 }),
  loraAdapterPath: varchar("loraAdapterPath", { length: 512 }),
  logs: text("logs"),

  // Timestamps
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  failedAt: timestamp("failedAt"),
  errorMessage: text("errorMessage"),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("idx_training_run_project").on(table.projectId),
  statusIdx: index("idx_training_run_status").on(table.status),
  typeIdx: index("idx_training_run_type").on(table.trainingType),
}));

export type LLMTrainingRun = typeof llmTrainingRuns.$inferSelect;
export type InsertLLMTrainingRun = typeof llmTrainingRuns.$inferInsert;

/**
 * LLM Evaluations - Stores evaluation results
 * Phase 6 from guide - benchmarking and quality checks
 */
export const llmEvaluations = pgTable("llm_evaluations", {
  id: serial("id").primaryKey(),

  // Project & run references
  projectId: integer("projectId").notNull(), // FK to llm_creation_projects
  trainingRunId: integer("trainingRunId"), // FK to llm_training_runs (if evaluating a training output)

  // Evaluation target
  modelPath: varchar("modelPath", { length: 512 }), // Path to model being evaluated
  modelType: varchar("modelType", { length: 50 }), // "base", "sft", "dpo", "quantized"

  // Evaluation configuration
  evalDatasetId: integer("evalDatasetId"), // FK to llm_datasets
  benchmarks: json("benchmarks"), // Array of benchmark names run

  // Results
  results: json("results").notNull(), // Complete evaluation results
  overallScore: numeric("overallScore", { precision: 5, scale: 2 }),

  // Metrics (from guide Phase 6)
  taskAccuracy: numeric("taskAccuracy", { precision: 5, scale: 2 }),
  formatCorrectness: numeric("formatCorrectness", { precision: 5, scale: 2 }),
  refusalCorrectness: numeric("refusalCorrectness", { precision: 5, scale: 2 }),
  latency: integer("latency"), // ms per response
  throughput: numeric("throughput", { precision: 10, scale: 2 }), // tokens/second

  // Comparison baseline
  baselineEvalId: integer("baselineEvalId"), // FK to compare against
  improvement: numeric("improvement", { precision: 5, scale: 2 }), // % improvement over baseline

  // Status
  status: varchar("status", { length: 50 }).default("pending"),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  projectIdIdx: index("idx_evaluation_project").on(table.projectId),
  trainingRunIdIdx: index("idx_evaluation_run").on(table.trainingRunId),
  statusIdx: index("idx_evaluation_status").on(table.status),
}));

export type LLMEvaluation = typeof llmEvaluations.$inferSelect;
export type InsertLLMEvaluation = typeof llmEvaluations.$inferInsert;

/**
 * LLM Quantizations - Tracks model quantization/conversion
 * Phase 7 from guide - GGUF conversion and optimization
 */
export const llmQuantizations = pgTable("llm_quantizations", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(), // FK to llm_creation_projects
  sourceTrainingRunId: integer("sourceTrainingRunId"), // FK to llm_training_runs

  // Source model
  sourceModelPath: varchar("sourceModelPath", { length: 512 }).notNull(),

  // Quantization config
  quantizationType: varchar("quantizationType", { length: 50 }).notNull(), // "Q4_K_M", "Q5_K_M", "Q8_0", "Q2_K", "f16"
  method: varchar("method", { length: 50 }), // "llama.cpp", "gptq", "awq"

  // Output
  outputPath: varchar("outputPath", { length: 512 }),
  outputFormat: varchar("outputFormat", { length: 50 }), // "gguf", "safetensors"
  fileSize: bigint("fileSize", { mode: "number" }), // Bytes

  // Quality comparison
  accuracyDrop: numeric("accuracyDrop", { precision: 5, scale: 2 }), // % drop from full precision
  compressionRatio: numeric("compressionRatio", { precision: 5, scale: 2 }),

  // Performance
  inferenceSpeedup: numeric("inferenceSpeedup", { precision: 5, scale: 2 }),
  memoryReduction: numeric("memoryReduction", { precision: 5, scale: 2 }),

  // Status
  status: varchar("status", { length: 50 }).default("pending"),
  logs: text("logs"),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  projectIdIdx: index("idx_quantization_project").on(table.projectId),
  statusIdx: index("idx_quantization_status").on(table.status),
}));

export type LLMQuantization = typeof llmQuantizations.$inferSelect;
export type InsertLLMQuantization = typeof llmQuantizations.$inferInsert;

/**
 * LLM Creation Audit Trail - Detailed audit log for creation pipeline
 * Extends general audit with creation-specific events
 */
export const llmCreationAuditEvents = pgTable("llm_creation_audit_events", {
  id: serial("id").primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(), // "project.created", "dataset.uploaded", "training.started", etc.

  // References
  projectId: integer("projectId"),
  datasetId: integer("datasetId"),
  trainingRunId: integer("trainingRunId"),
  evaluationId: integer("evaluationId"),
  quantizationId: integer("quantizationId"),

  // Actor
  actor: integer("actor"), // User ID
  actorType: varchar("actorType", { length: 50 }).default("user"), // user, system, automation

  // Event details
  phase: varchar("phase", { length: 50 }), // Which phase of the guide
  action: varchar("action", { length: 100 }), // Specific action taken
  payload: json("payload").notNull(), // Event-specific data

  // Outcome
  status: varchar("status", { length: 50 }), // "success", "failure", "warning"
  errorMessage: text("errorMessage"),

  // Timestamps
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  eventTypeIdx: index("idx_creation_audit_type").on(table.eventType),
  projectIdIdx: index("idx_creation_audit_project").on(table.projectId),
  timestampIdx: index("idx_creation_audit_timestamp").on(table.timestamp),
  actorIdx: index("idx_creation_audit_actor").on(table.actor),
}));

export type LLMCreationAuditEvent = typeof llmCreationAuditEvents.$inferSelect;
export type InsertLLMCreationAuditEvent = typeof llmCreationAuditEvents.$inferInsert;
