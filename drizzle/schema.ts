import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, uniqueIndex, index, decimal } from "drizzle-orm/mysql-core";

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

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// Workspace System
// ============================================================================

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: int("ownerId").notNull(),
  
  // Workspace settings
  embeddingModel: varchar("embeddingModel", { length: 255 }).default("bge-small-en-v1.5"),
  chunkingStrategy: mysqlEnum("chunkingStrategy", ["semantic", "fixed", "recursive"]).default("semantic"),
  chunkSize: int("chunkSize").default(512),
  chunkOverlap: int("chunkOverlap").default(50),
  
  // Vector DB settings
  vectorDb: mysqlEnum("vectorDb", ["qdrant", "milvus"]).default("qdrant"),
  collectionName: varchar("collectionName", { length: 255 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "editor", "viewer"]).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

// ============================================================================
// Model Management
// ============================================================================

export const models = mysqlTable("models", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  modelType: mysqlEnum("modelType", ["llm", "embedding", "reranker"]).notNull(),
  
  // Model metadata
  huggingFaceId: varchar("huggingFaceId", { length: 255 }),
  architecture: varchar("architecture", { length: 100 }),
  parameterCount: varchar("parameterCount", { length: 50 }),
  quantization: varchar("quantization", { length: 50 }),
  contextLength: int("contextLength"),
  
  // File information
  fileSize: varchar("fileSize", { length: 50 }),
  filePath: text("filePath"),
  fileFormat: varchar("fileFormat", { length: 50 }).default("gguf"),
  
  // Status
  status: mysqlEnum("status", ["downloading", "converting", "ready", "error"]).default("ready"),
  downloadProgress: int("downloadProgress").default(0),
  
  // Performance metrics
  tokensPerSecond: int("tokensPerSecond"),
  memoryUsageMb: int("memoryUsageMb"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Model = typeof models.$inferSelect;
export type InsertModel = typeof models.$inferInsert;

export const modelConfigs = mysqlTable("model_configs", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  userId: int("userId").notNull(),
  
  // Inference parameters
  temperature: varchar("temperature", { length: 10 }).default("0.7"),
  topP: varchar("topP", { length: 10 }).default("0.9"),
  topK: int("topK").default(40),
  maxTokens: int("maxTokens").default(2048),
  repeatPenalty: varchar("repeatPenalty", { length: 10 }).default("1.1"),
  
  // Advanced settings
  stopSequences: json("stopSequences"),
  systemPrompt: text("systemPrompt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

// ============================================================================
// Document Management
// ============================================================================

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  
  // File information
  filename: varchar("filename", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSize: int("fileSize").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  
  // Processing status
  status: mysqlEnum("status", ["pending", "processing", "completed", "error"]).default("pending"),
  errorMessage: text("errorMessage"),
  
  // Metadata
  title: varchar("title", { length: 500 }),
  author: varchar("author", { length: 255 }),
  pageCount: int("pageCount"),
  wordCount: int("wordCount"),
  
  // Processing results
  chunkCount: int("chunkCount").default(0),
  embeddingModel: varchar("embeddingModel", { length: 255 }),
  
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

export const documentChunks = mysqlTable("document_chunks", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  
  // Chunk content
  content: text("content").notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  
  // Metadata
  pageNumber: int("pageNumber"),
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
export const agentHistory = mysqlTable("agent_history", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  
  // Event details
  eventType: mysqlEnum("eventType", ["created", "promoted", "policy_changed", "status_updated", "modified", "deleted"]).notNull(),
  eventData: json("eventData"), // Store event-specific data
  
  // Status tracking
  oldStatus: varchar("oldStatus", { length: 50 }),
  newStatus: varchar("newStatus", { length: 50 }),
  
  // Actor information
  actorId: int("actorId"),
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
export const protocols = mysqlTable("protocols", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Protocol content (markdown)
  content: text("content").notNull(),
  
  // Metadata
  version: int("version").default(1),
  tags: json("tags"), // Array of tags for categorization
  
  // File info
  fileName: varchar("fileName", { length: 255 }),
  fileSize: int("fileSize"), // in bytes
  
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = typeof protocols.$inferInsert;

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  agentId: int("agentId"),
  
  title: varchar("title", { length: 500 }),
  userId: int("userId").notNull(),
  
  // Conversation settings
  modelId: int("modelId"),
  temperature: varchar("temperature", { length: 10 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  
  // Metadata
  tokenCount: int("tokenCount"),
  retrievedChunks: json("retrievedChunks"),
  toolCalls: json("toolCalls"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ============================================================================
// Automation System
// ============================================================================

export const workflows = mysqlTable("workflows", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Owner of the workflow
  workspaceId: int("workspaceId"), // Optional: can be linked to workspace
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // ReactFlow canvas data
  nodes: text("nodes").notNull(), // JSON string of ReactFlow nodes
  edges: text("edges").notNull(), // JSON string of ReactFlow edges
  
  // Trigger configuration (optional for manual workflows)
  triggerType: mysqlEnum("triggerType", ["time", "event", "webhook", "manual"]).default("manual"),
  triggerConfig: json("triggerConfig"),
  
  // Versioning
  schemaVersion: int("schemaVersion").default(1).notNull(),
  publishedVersionId: int("publishedVersionId"), // FK to workflow_versions
  draftData: json("draftData"), // Unpublished changes
  
  // Status
  status: mysqlEnum("status", ["draft", "validated", "published", "active", "paused", "archived", "deleted"]).default("draft"),
  enabled: boolean("enabled").default(true),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "error", "running"]),
  
  // Permissions
  permissions: json("permissions"), // { canEdit: [userId], canPublish: [userId], canExecute: [userId] }
  isPublic: boolean("isPublic").default(false), // Public workflows can be executed by anyone
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;

// Workflow Versions (immutable snapshots)
export const workflowVersions = mysqlTable("workflow_versions", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(), // FK to workflows
  version: int("version").notNull(), // Incremental version number (1, 2, 3...)
  
  // Snapshot of workflow at publish time
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  nodes: text("nodes").notNull(), // JSON string
  edges: text("edges").notNull(), // JSON string
  schemaVersion: int("schemaVersion").notNull(),
  
  // Trigger configuration snapshot
  triggerType: mysqlEnum("triggerType", ["time", "event", "webhook", "manual"]),
  triggerConfig: json("triggerConfig"),
  
  // Publishing metadata
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  publishedBy: int("publishedBy").notNull(), // FK to users
  changeNotes: text("changeNotes"),
  status: mysqlEnum("status", ["published", "archived"]).default("published"),
});

// Workflow Executions (runtime execution tracking)
export const workflowExecutions = mysqlTable("workflow_executions", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(), // FK to workflows
  versionId: int("versionId"), // FK to workflow_versions (null for draft executions)
  
  // Execution metadata
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: int("duration"), // Duration in milliseconds
  
  // Trigger information
  triggerType: mysqlEnum("triggerType", ["time", "event", "webhook", "manual"]),
  triggerData: json("triggerData"), // Trigger payload/context
  
  // Execution context
  executedBy: int("executedBy"), // FK to users (null for automated triggers)
  error: text("error"), // Error message if failed
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Workflow Execution Logs (step-by-step execution logs)
export const workflowExecutionLogs = mysqlTable("workflow_execution_logs", {
  id: int("id").autoincrement().primaryKey(),
  executionId: int("executionId").notNull(), // FK to workflow_executions
  
  // Node/step information
  nodeId: varchar("nodeId", { length: 255 }).notNull(),
  nodeType: varchar("nodeType", { length: 100 }).notNull(), // trigger, action, etc.
  nodeLabel: varchar("nodeLabel", { length: 255 }),
  
  // Execution details
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "skipped"]).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: int("duration"), // Duration in milliseconds
  
  // Input/output data
  input: json("input"), // Input data for this step
  output: json("output"), // Output data from this step
  error: text("error"), // Error message if failed
  
  // Logging
  logLevel: mysqlEnum("logLevel", ["debug", "info", "warn", "error"]).default("info"),
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

export const workflowRuns = mysqlTable("workflow_runs", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  
  status: mysqlEnum("status", ["running", "success", "error"]).notNull(),
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

export const providers = mysqlTable("providers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["local-llamacpp", "local-ollama", "openai", "anthropic", "google", "custom"]).notNull(),
  
  // Provider status
  enabled: boolean("enabled").default(true),
  priority: int("priority").default(50),
  
  // Configuration (API keys, endpoints, etc.)
  config: json("config").notNull(),
  
  // Cost tracking
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export const workspaceProviders = mysqlTable("workspace_providers", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  providerId: int("providerId").notNull(),
  
  enabled: boolean("enabled").default(true),
  priority: int("priority").default(50),
  quotaTokensPerDay: int("quotaTokensPerDay"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceProvider = typeof workspaceProviders.$inferSelect;
export type InsertWorkspaceProvider = typeof workspaceProviders.$inferInsert;

export const providerUsage = mysqlTable("provider_usage", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  providerId: int("providerId").notNull(),
  
  modelName: varchar("modelName", { length: 255 }),
  tokensUsed: int("tokensUsed").notNull(),
  cost: varchar("cost", { length: 20 }),
  latencyMs: int("latencyMs"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProviderUsage = typeof providerUsage.$inferSelect;
export type InsertProviderUsage = typeof providerUsage.$inferInsert;

// Provider Health Monitoring
export const providerHealthChecks = mysqlTable("provider_health_checks", {
  id: int("id").autoincrement().primaryKey(),
  providerId: int("providerId").notNull(),
  
  status: mysqlEnum("status", ["healthy", "degraded", "down"]).notNull(),
  responseTimeMs: int("responseTimeMs"),
  errorMessage: text("errorMessage"),
  
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type ProviderHealthCheck = typeof providerHealthChecks.$inferSelect;
export type InsertProviderHealthCheck = typeof providerHealthChecks.$inferInsert;

// Provider Performance Metrics
export const providerMetrics = mysqlTable("provider_metrics", {
  id: int("id").autoincrement().primaryKey(),
  providerId: int("providerId").notNull(),
  
  // Performance metrics
  avgLatencyMs: int("avgLatencyMs"),
  p95LatencyMs: int("p95LatencyMs"),
  p99LatencyMs: int("p99LatencyMs"),
  tokensPerSecond: int("tokensPerSecond"),
  
  // Reliability metrics
  successRate: varchar("successRate", { length: 10 }),
  errorRate: varchar("errorRate", { length: 10 }),
  uptime: varchar("uptime", { length: 10 }),
  
  // Usage metrics
  totalRequests: int("totalRequests").default(0),
  totalTokens: int("totalTokens").default(0),
  totalCost: varchar("totalCost", { length: 20 }),
  
  // Time period
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProviderMetric = typeof providerMetrics.$inferSelect;
export type InsertProviderMetric = typeof providerMetrics.$inferInsert;

// Model Downloads
export const modelDownloads = mysqlTable("model_downloads", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  userId: int("userId").notNull(),
  
  // Download info
  sourceUrl: text("sourceUrl").notNull(),
  destinationPath: text("destinationPath"),
  fileSize: varchar("fileSize", { length: 50 }),
  
  // Progress tracking
  status: mysqlEnum("status", ["queued", "downloading", "paused", "completed", "failed"]).default("queued"),
  progress: int("progress").default(0),
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }).default("0"),
  downloadSpeed: varchar("downloadSpeed", { length: 50 }),
  
  // Scheduling
  priority: int("priority").default(0), // Higher number = higher priority
  scheduledFor: timestamp("scheduledFor"), // null = immediate, otherwise scheduled time
  bandwidthLimit: int("bandwidthLimit"), // KB/s, null = unlimited
  
  // Error handling
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0),
  
  // Timestamps
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelDownload = typeof modelDownloads.$inferSelect;
export type InsertModelDownload = typeof modelDownloads.$inferInsert;

// Model Versions
export const modelVersions = mysqlTable("model_versions", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(), // Links to catalog model
  
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
  downloadCount: int("downloadCount").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelVersion = typeof modelVersions.$inferSelect;
export type InsertModelVersion = typeof modelVersions.$inferInsert;

// Model Conversions
export const modelConversions = mysqlTable("model_conversions", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  userId: int("userId").notNull(),
  
  // Conversion details
  sourceFormat: varchar("sourceFormat", { length: 50 }).notNull(),
  targetFormat: varchar("targetFormat", { length: 50 }).notNull(),
  quantization: varchar("quantization", { length: 50 }),
  
  // Files
  sourcePath: text("sourcePath").notNull(),
  outputPath: text("outputPath"),
  
  // Progress
  status: mysqlEnum("status", ["queued", "converting", "completed", "failed"]).default("queued"),
  progress: int("progress").default(0),
  
  // Results
  outputSize: varchar("outputSize", { length: 50 }),
  errorMessage: text("errorMessage"),
  
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelConversion = typeof modelConversions.$inferSelect;
export type InsertModelConversion = typeof modelConversions.$inferInsert;

// Download Analytics
export const downloadAnalytics = mysqlTable("download_analytics", {
  id: int("id").autoincrement().primaryKey(),
  downloadId: int("downloadId").notNull(),
  modelId: int("modelId").notNull(),
  userId: int("userId").notNull(),
  
  // Bandwidth metrics
  instantSpeed: varchar("instantSpeed", { length: 50 }), // KB/s at this measurement
  averageSpeed: varchar("averageSpeed", { length: 50 }), // KB/s average so far
  bytesDownloaded: varchar("bytesDownloaded", { length: 50 }),
  
  // Time metrics
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  elapsedSeconds: int("elapsedSeconds").default(0),
  
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
export const triggerRegistry = mysqlTable("trigger_registry", {
  id: int("id").autoincrement().primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", ["time", "event", "data", "user", "system", "integration"]).notNull(),
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  
  // Gate 0: Classification & Intent
  classification: mysqlEnum("classification", ["external", "time-based", "manual"]).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(),
  
  // Gate 2: Configuration Schema
  configSchema: json("configSchema").notNull(),
  configSchemaVersion: int("configSchemaVersion").notNull().default(1),
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
  executionMode: mysqlEnum("executionMode", ["sync", "async"]).notNull(),
  blockingBehavior: mysqlEnum("blockingBehavior", ["blocking", "non-blocking"]).notNull(),
  retryPolicy: json("retryPolicy"),
  timeoutPolicy: json("timeoutPolicy"),
  failureHandling: json("failureHandling"),
  stateTier: mysqlEnum("stateTier", ["ephemeral", "durable"]).notNull(),
  maxStateSize: int("maxStateSize"),
  concurrentIsolation: text("concurrentIsolation"),
  
  // Gate 6: Error Propagation
  compensationStrategy: text("compensationStrategy"),
  workflowFailureHandler: json("workflowFailureHandler"),
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }),
  
  // Gate 7: Security & Governance
  requiredPermissions: json("requiredPermissions"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull(),
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
  performanceProfile: mysqlEnum("performanceProfile", ["light", "standard", "heavy"]).notNull(),
  latencySLA: json("latencySLA"),
  throughputExpectation: int("throughputExpectation"),
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
  maxNestingDepth: int("maxNestingDepth").default(5),
  variableScopingRules: text("variableScopingRules"),
  failureBubblingRules: text("failureBubblingRules"),
  
  // Runtime handler
  handlerCode: text("handlerCode"),
  handlerType: mysqlEnum("handlerType", ["inline", "external", "webhook"]).notNull(),
  handlerEndpoint: varchar("handlerEndpoint", { length: 500 }),
  
  // Capability flags
  requiresNetwork: boolean("requiresNetwork").notNull().default(false),
  requiresSecrets: boolean("requiresSecrets").notNull().default(false),
  hasSideEffects: boolean("hasSideEffects").notNull().default(false),
  hasCost: boolean("hasCost").notNull().default(false),
  
  // Approval & Status
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "rejected", "deprecated"]).notNull().default("draft"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  
  // Compliance validation
  criticalViolations: int("criticalViolations").notNull().default(0),
  majorIssues: int("majorIssues").notNull().default(0),
  complianceScore: int("complianceScore"),
  lastValidated: timestamp("lastValidated"),
  
  // Metadata
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TriggerRegistryEntry = typeof triggerRegistry.$inferSelect;
export type InsertTriggerRegistryEntry = typeof triggerRegistry.$inferInsert;

/**
 * Action Registry - Stores custom action type definitions
 */
export const actionRegistry = mysqlTable("action_registry", {
  id: int("id").autoincrement().primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", ["control", "logic", "communication", "integration", "data", "file", "ai", "human", "security", "observability", "system", "custom"]).notNull(),
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  
  // Gate 0: Classification & Intent
  classification: mysqlEnum("classification", ["side-effecting", "transformational", "control-flow", "ai-agent"]).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(),
  sideEffects: json("sideEffects").notNull(),
  
  // All other gates (same structure as trigger registry)
  configSchema: json("configSchema").notNull(),
  configSchemaVersion: int("configSchemaVersion").notNull().default(1),
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
  executionMode: mysqlEnum("executionMode", ["sync", "async"]).notNull(),
  blockingBehavior: mysqlEnum("blockingBehavior", ["blocking", "non-blocking"]).notNull(),
  retryPolicy: json("retryPolicy"),
  timeoutPolicy: json("timeoutPolicy"),
  failureHandling: json("failureHandling"),
  stateTier: mysqlEnum("stateTier", ["ephemeral", "durable"]).notNull(),
  maxStateSize: int("maxStateSize"),
  concurrentIsolation: text("concurrentIsolation"),
  compensationStrategy: text("compensationStrategy").notNull(),
  compensationAutomation: json("compensationAutomation"),
  workflowFailureHandler: json("workflowFailureHandler"),
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }),
  partialRollbackPaths: json("partialRollbackPaths"),
  requiredPermissions: json("requiredPermissions"),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).notNull(),
  preExecutionPolicies: json("preExecutionPolicies"),
  secretFields: json("secretFields"),
  promptVariableSanitization: json("promptVariableSanitization"),
  tokenCap: int("tokenCap"),
  costCap: int("costCap"),
  outputSchema: json("outputSchema"),
  confidenceScoreExposed: boolean("confidenceScoreExposed").default(false),
  highRiskDefinition: json("highRiskDefinition"),
  humanInLoopRequired: boolean("humanInLoopRequired").default(false),
  tenantScoped: boolean("tenantScoped").notNull().default(true),
  tenantIsolation: text("tenantIsolation"),
  metricsConfig: json("metricsConfig"),
  logFields: json("logFields"),
  errorClassification: json("errorClassification"),
  performanceProfile: mysqlEnum("performanceProfile", ["light", "standard", "heavy"]).notNull(),
  latencySLA: json("latencySLA"),
  throughputExpectation: int("throughputExpectation"),
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
  maxNestingDepth: int("maxNestingDepth").default(5),
  variableScopingRules: text("variableScopingRules"),
  failureBubblingRules: text("failureBubblingRules"),
  handlerCode: text("handlerCode"),
  handlerType: mysqlEnum("handlerType", ["inline", "external", "api"]).notNull(),
  handlerEndpoint: varchar("handlerEndpoint", { length: 500 }),
  requiresNetwork: boolean("requiresNetwork").notNull().default(false),
  requiresSecrets: boolean("requiresSecrets").notNull().default(false),
  hasSideEffects: boolean("hasSideEffects").notNull().default(false),
  hasCost: boolean("hasCost").notNull().default(false),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "rejected", "deprecated"]).notNull().default("draft"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  criticalViolations: int("criticalViolations").notNull().default(0),
  majorIssues: int("majorIssues").notNull().default(0),
  complianceScore: int("complianceScore"),
  lastValidated: timestamp("lastValidated"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActionRegistryEntry = typeof actionRegistry.$inferSelect;
export type InsertActionRegistryEntry = typeof actionRegistry.$inferInsert;

// Model Shares
export const modelShares = mysqlTable("model_shares", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  
  // Storage info
  storagePath: text("storagePath").notNull(), // S3 path or local path
  fileSize: varchar("fileSize", { length: 50 }),
  checksum: varchar("checksum", { length: 128 }), // SHA256 hash for deduplication
  
  // Reference counting
  referenceCount: int("referenceCount").default(1).notNull(),
  
  // Sharing scope
  shareScope: mysqlEnum("shareScope", ["user", "workspace", "global"]).default("user"),
  ownerId: int("ownerId").notNull(), // Original uploader/downloader
  
  // Metadata
  lastAccessedAt: timestamp("lastAccessedAt").defaultNow(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelShare = typeof modelShares.$inferSelect;
export type InsertModelShare = typeof modelShares.$inferInsert;

// Model Share References
export const modelShareReferences = mysqlTable("model_share_references", {
  id: int("id").autoincrement().primaryKey(),
  shareId: int("shareId").notNull(),
  
  // Reference owner
  userId: int("userId"),
  workspaceId: int("workspaceId"),
  
  // Access tracking
  lastUsedAt: timestamp("lastUsedAt").defaultNow(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelShareReference = typeof modelShareReferences.$inferSelect;
export type InsertModelShareReference = typeof modelShareReferences.$inferInsert;

// Model Benchmarks
export const modelBenchmarks = mysqlTable("model_benchmarks", {
  id: int("id").autoincrement().primaryKey(),
  modelId: int("modelId").notNull(),
  
  // Benchmark type
  benchmarkType: mysqlEnum("benchmarkType", ["speed", "quality", "memory", "cost"]).notNull(),
  benchmarkName: varchar("benchmarkName", { length: 255 }).notNull(),
  
  // Results
  score: varchar("score", { length: 50 }),
  tokensPerSecond: int("tokensPerSecond"),
  memoryUsageMb: int("memoryUsageMb"),
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),
  
  // Metadata
  metadata: json("metadata"),
  
  runBy: int("runBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelBenchmark = typeof modelBenchmarks.$inferSelect;
export type InsertModelBenchmark = typeof modelBenchmarks.$inferInsert;

// Hardware Detection
export const hardwareProfiles = mysqlTable("hardware_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // CPU info
  cpuModel: varchar("cpuModel", { length: 255 }),
  cpuCores: int("cpuCores"),
  cpuThreads: int("cpuThreads"),
  
  // GPU info
  gpuModel: varchar("gpuModel", { length: 255 }),
  gpuVram: int("gpuVram"),
  gpuDriver: varchar("gpuDriver", { length: 100 }),
  gpuComputeCapability: varchar("gpuComputeCapability", { length: 50 }),
  
  // Memory
  totalRamMb: int("totalRamMb"),
  availableRamMb: int("availableRamMb"),
  
  // Capabilities
  supportsCuda: boolean("supportsCuda").default(false),
  supportsRocm: boolean("supportsRocm").default(false),
  supportsMetal: boolean("supportsMetal").default(false),
  
  // Score
  performanceScore: int("performanceScore"),
  
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HardwareProfile = typeof hardwareProfiles.$inferSelect;
export type InsertHardwareProfile = typeof hardwareProfiles.$inferInsert;

// ============================================================================
// Plugin System
// ============================================================================

export const plugins = mysqlTable("plugins", {
  id: int("id").autoincrement().primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).notNull(),
  
  // Plugin metadata
  author: varchar("author", { length: 255 }),
  runtime: mysqlEnum("runtime", ["python", "node"]).notNull(),
  entryPoint: varchar("entryPoint", { length: 500 }).notNull(),
  
  // Permissions
  permissions: json("permissions").notNull(),
  
  // Status
  enabled: boolean("enabled").default(true),
  verified: boolean("verified").default(false),
  
  installedBy: int("installedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = typeof plugins.$inferInsert;

// ============================================================================
// Knowledge Packs
// ============================================================================

export const knowledgePacks = mysqlTable("knowledge_packs", {
  id: int("id").autoincrement().primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  
  // Pack metadata
  version: varchar("version", { length: 50 }).notNull(),
  documentCount: int("documentCount").default(0),
  totalSize: int("totalSize").default(0),
  
  // Pack data
  packData: json("packData").notNull(),
  
  createdBy: int("createdBy").notNull(),
  isPublic: boolean("isPublic").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KnowledgePack = typeof knowledgePacks.$inferSelect;
export type InsertKnowledgePack = typeof knowledgePacks.$inferInsert;

// ============================================================================
// System Settings
// ============================================================================

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  
  settingKey: varchar("settingKey", { length: 255 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  settingType: mysqlEnum("settingType", ["string", "number", "boolean", "json"]).notNull(),
  
  description: text("description"),
  
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ============================================================================
// Secrets Management
// ============================================================================

export const secrets = mysqlTable("secrets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  encryptedValue: text("encryptedValue").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  uniqueUserKey: uniqueIndex("unique_user_key").on(table.userId, table.key),
  userIdIdx: index("idx_userId").on(table.userId),
}));

export type Secret = typeof secrets.$inferSelect;
export type InsertSecret = typeof secrets.$inferInsert;


// ============================================================================
// Workflow Templates
// ============================================================================

export const workflowTemplates = mysqlTable("workflow_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["productivity", "data", "communication", "monitoring"]).notNull(),
  
  // Template workflow structure (JSON)
  workflowDefinition: json("workflowDefinition").notNull(),
  
  // Metadata
  icon: varchar("icon", { length: 50 }),
  tags: json("tags").$type<string[]>(),
  usageCount: int("usageCount").default(0),
  
  // Visibility
  isPublic: boolean("isPublic").default(true),
  createdBy: int("createdBy").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  categoryIdx: index("idx_category").on(table.category),
  createdByIdx: index("idx_createdBy").on(table.createdBy),
}));

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;


// ============================================================================
// Agent Governance Module
// ============================================================================

export const agentProofs = mysqlTable("agent_proofs", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  
  // Policy decision
  policyDecision: mysqlEnum("policyDecision", ["PASS", "FAIL"]).notNull(),
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

export const policyVersions = mysqlTable("policy_versions", {
  id: int("id").autoincrement().primaryKey(),
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
  loadedBy: int("loadedBy").notNull(),
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

export const wcpWorkflows = mysqlTable("wcp_workflows", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Owner of the workflow
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // ReactFlow canvas data (visual representation)
  nodes: text("nodes").notNull(), // JSON string of ReactFlow nodes
  edges: text("edges").notNull(), // JSON string of ReactFlow edges
  
  // WCP bytecode (compiled workflow specification)
  wcpBytecode: text("wcpBytecode"), // JSON string of WCP-compliant bytecode
  
  // Status
  status: mysqlEnum("status", ["draft", "active", "paused", "archived", "deleted"]).default("draft").notNull(),
  
  // Execution tracking
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["completed", "failed", "running"]),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WCPWorkflow = typeof wcpWorkflows.$inferSelect;
export type InsertWCPWorkflow = typeof wcpWorkflows.$inferInsert;

// WCP Workflow Executions
export const wcpExecutions = mysqlTable("wcp_executions", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(), // FK to wcp_workflows
  
  workflowName: varchar("workflowName", { length: 255 }).notNull(),
  
  // Execution metadata
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: int("duration"), // Duration in seconds
  
  // Execution details
  executionLog: json("executionLog"), // Step-by-step execution logs
  errorMessage: text("errorMessage"),
  
  // Trigger information
  triggerType: mysqlEnum("triggerType", ["time", "event", "webhook", "manual"]).default("manual"),
  triggerData: json("triggerData"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WCPExecution = typeof wcpExecutions.$inferSelect;
export type InsertWCPExecution = typeof wcpExecutions.$inferInsert;


// ============================================================================
// Agent Governance System
// ============================================================================

export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  createdBy: int("createdBy").notNull(),
  
  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tags: json("tags"), // string[]
  roleClass: mysqlEnum("roleClass", ["assistant", "analyst", "support", "reviewer", "automator", "monitor", "custom"]).notNull(),
  
  // Lifecycle
  lifecycle: json("lifecycle"), // { state: 'draft'|'sandbox'|'governed'|'archived', version: number }
  status: mysqlEnum("status", ["draft", "sandbox", "governed", "archived"]).notNull().default("draft"),
  
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
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "error", "pending"]),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

// Agent versions for audit trail and rollback
export const agentVersions = mysqlTable("agentVersions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  
  // Version metadata
  version: int("version").notNull(),
  createdBy: int("createdBy").notNull(),
  changeNotes: text("changeNotes"),
  
  // Full snapshot
  agentSnapshot: json("agentSnapshot").notNull(), // Complete agent config at this version
  
  // Policy state at this version
  policyDigest: varchar("policyDigest", { length: 64 }),
  policySetHash: varchar("policySetHash", { length: 64 }),
  
  // Promotion reference
  promotionRequestId: int("promotionRequestId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = typeof agentVersions.$inferInsert;

// Promotion requests (human-in-the-loop approvals)
export const promotionRequests = mysqlTable("promotionRequests", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  
  // Request metadata
  requestedBy: int("requestedBy").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "executed", "cancelled"]).notNull().default("pending"),
  
  // Diff information
  diffHash: varchar("diffHash", { length: 64 }),
  diffSnapshot: json("diffSnapshot"), // Structured diff output
  baselineVersion: int("baselineVersion"),
  proposedVersion: int("proposedVersion"),
  
  // Policy validation
  validationSnapshot: json("validationSnapshot"), // Policy validation result at request time
  policyDigest: varchar("policyDigest", { length: 64 }),
  
  // Approval workflow
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalComment: text("approvalComment"),
  
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  
  // Execution
  executedAt: timestamp("executedAt"),
  executionError: text("executionError"),
  
  // SLA & Escalation
  slaDeadline: timestamp("slaDeadline"),
  escalatedAt: timestamp("escalatedAt"),
  escalationCount: int("escalationCount").default(0),
  
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PromotionRequest = typeof promotionRequests.$inferSelect;
export type InsertPromotionRequest = typeof promotionRequests.$inferInsert;

// Promotion timeline events (audit trail)
export const promotionEvents = mysqlTable("promotionEvents", {
  id: int("id").autoincrement().primaryKey(),
  promotionRequestId: int("promotionRequestId").notNull(),
  
  eventType: mysqlEnum("eventType", [
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
  
  actor: int("actor"), // User ID
  details: json("details"), // Event-specific data
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PromotionEvent = typeof promotionEvents.$inferSelect;
export type InsertPromotionEvent = typeof promotionEvents.$inferInsert;

// Policy exceptions (time-bound, auditable)
export const policyExceptions = mysqlTable("policyExceptions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  
  // Exception details
  policyId: varchar("policyId", { length: 255 }).notNull(),
  scope: mysqlEnum("scope", ["agent", "workflow", "action", "tool"]).notNull(),
  reason: text("reason").notNull(),
  
  // Approval
  requestedBy: int("requestedBy").notNull(),
  approvedBy: int("approvedBy"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "expired", "revoked"]).notNull().default("pending"),
  
  // Expiry
  expiresAt: timestamp("expiresAt").notNull(),
  approvedAt: timestamp("approvedAt"),
  revokedAt: timestamp("revokedAt"),
  revokedBy: int("revokedBy"),
  
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PolicyException = typeof policyExceptions.$inferSelect;
export type InsertPolicyException = typeof policyExceptions.$inferInsert;

// Policy reload history (for hot-reload + cosign verification)
export const policyReloads = mysqlTable("policyReloads", {
  id: int("id").autoincrement().primaryKey(),
  
  // Reload metadata
  initiatedBy: int("initiatedBy").notNull(),
  status: mysqlEnum("status", ["pending", "validating", "canary", "active", "rolled_back", "failed"]).notNull().default("pending"),
  
  // OCI reference & verification
  ociRef: varchar("ociRef", { length: 512 }).notNull(),
  digest: varchar("digest", { length: 64 }).notNull(),
  cosignVerified: boolean("cosignVerified").default(false),
  
  // Impact analysis
  impactSnapshot: json("impactSnapshot"), // { compliant: [], impacted_soft: [], impacted_hard: [] }
  
  // Rollback
  previousDigest: varchar("previousDigest", { length: 64 }),
  rolledBackAt: timestamp("rolledBackAt"),
  rolledBackBy: int("rolledBackBy"),
  rollbackReason: text("rollbackReason"),
  
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  activatedAt: timestamp("activatedAt"),
});

export type PolicyReload = typeof policyReloads.$inferSelect;
export type InsertPolicyReload = typeof policyReloads.$inferInsert;

// Incidents (promotion freeze)
export const incidents = mysqlTable("incidents", {
  id: int("id").autoincrement().primaryKey(),
  
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  
  // Freeze scope
  frozenEnvironments: json("frozenEnvironments"), // string[] - 'sandbox', 'governed', etc
  
  // Lifecycle
  status: mysqlEnum("status", ["active", "resolved", "archived"]).notNull().default("active"),
  createdBy: int("createdBy").notNull(),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;


// ============================================================================
// Policy Management
// ============================================================================

export const policies = mysqlTable("policies", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  createdBy: int("createdBy").notNull(),
  
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
  appliedToAgents: int("appliedToAgents").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;

export const policyTemplates = mysqlTable("policyTemplates", {
  id: int("id").autoincrement().primaryKey(),
  
  // Identity
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  category: mysqlEnum("category", ["strict", "standard", "permissive", "custom"]).default("custom"),
  
  // Template content
  content: json("content").notNull(), // Full policy template JSON
  rules: json("rules"), // Extracted rules
  
  // Metadata
  version: varchar("version", { length: 50 }).default("1.0"),
  isDefault: boolean("isDefault").default(false),
  usageCount: int("usageCount").default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
export const serviceCertificates = mysqlTable("service_certificates", {
  id: int("id").autoincrement().primaryKey(),
  
  // Certificate metadata
  serviceName: varchar("serviceName", { length: 255 }).notNull(), // e.g., "api-gateway", "auth-service"
  certificateType: mysqlEnum("certificateType", ["tls", "mtls", "signing"]).notNull(),
  
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
  status: mysqlEnum("status", ["active", "staging", "expired", "revoked"]).default("active").notNull(),
  isActive: boolean("isActive").default(false), // Current active certificate
  
  // Rotation tracking
  rotationId: int("rotationId"), // FK to key_rotations
  previousCertificateId: int("previousCertificateId"), // FK to previous cert (for overlap tracking)
  overlapStartsAt: timestamp("overlapStartsAt"), // When old+new both valid
  overlapEndsAt: timestamp("overlapEndsAt"), // When to retire old cert
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ServiceCertificate = typeof serviceCertificates.$inferSelect;
export type InsertServiceCertificate = typeof serviceCertificates.$inferInsert;

/**
 * Attestation Keys - for signing and verifying agent attestations
 * Tracks public/private key pairs used for attestation verification
 */
export const attestationKeys = mysqlTable("attestation_keys", {
  id: int("id").autoincrement().primaryKey(),
  
  // Key metadata
  keyName: varchar("keyName", { length: 255 }).notNull(), // e.g., "attestation-key-prod-v1"
  keyType: mysqlEnum("keyType", ["rsa", "ecdsa", "ed25519"]).default("ed25519").notNull(),
  keySize: int("keySize"), // 2048, 4096 for RSA; 256, 384, 521 for ECDSA; null for Ed25519
  
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
  status: mysqlEnum("status", ["active", "staging", "deprecated", "revoked"]).default("active").notNull(),
  isActive: boolean("isActive").default(false), // Current active key for signing
  
  // Rotation tracking
  rotationId: int("rotationId"), // FK to key_rotations
  previousKeyId: int("previousKeyId"), // FK to previous key (for overlap tracking)
  overlapStartsAt: timestamp("overlapStartsAt"), // When old+new both valid
  overlapEndsAt: timestamp("overlapEndsAt"), // When to retire old key
  
  // Usage tracking
  usageCount: int("usageCount").default(0), // Number of attestations signed
  lastUsedAt: timestamp("lastUsedAt"),
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AttestationKey = typeof attestationKeys.$inferSelect;
export type InsertAttestationKey = typeof attestationKeys.$inferInsert;

/**
 * Key Rotations - tracks rotation events and their status
 * Central audit log for all key rotation operations
 */
export const keyRotations = mysqlTable("key_rotations", {
  id: int("id").autoincrement().primaryKey(),
  
  // Rotation metadata
  rotationType: mysqlEnum("rotationType", ["service_cert", "attestation_key"]).notNull(),
  targetName: varchar("targetName", { length: 255 }).notNull(), // Service name or key name
  
  // Rotation status
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed", "rolled_back"]).default("pending").notNull(),
  
  // Rotation timeline
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  
  // Old and new keys/certs
  oldKeyId: int("oldKeyId"), // FK to previous key/cert
  newKeyId: int("newKeyId"), // FK to new key/cert
  
  // Overlap window
  overlapStartsAt: timestamp("overlapStartsAt"),
  overlapEndsAt: timestamp("overlapEndsAt"),
  
  // Execution details
  initiatedBy: int("initiatedBy"), // FK to users
  reason: varchar("reason", { length: 500 }), // "scheduled", "manual", "emergency", "compromise"
  
  // Error tracking
  error: text("error"), // Error message if failed
  rollbackReason: text("rollbackReason"), // Reason for rollback if rolled back
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KeyRotation = typeof keyRotations.$inferSelect;
export type InsertKeyRotation = typeof keyRotations.$inferInsert;

/**
 * Key Rotation Audit Log - detailed audit trail for compliance
 * Tracks all actions taken during key rotation for audit purposes
 */
export const keyRotationAuditLogs = mysqlTable("key_rotation_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Reference to rotation
  rotationId: int("rotationId").notNull(), // FK to key_rotations
  
  // Action details
  action: varchar("action", { length: 100 }).notNull(), // "key_generated", "key_deployed", "overlap_started", "old_key_revoked", etc.
  actionType: mysqlEnum("actionType", ["generate", "deploy", "validate", "activate", "deactivate", "revoke", "archive"]).notNull(),
  
  // Actor information
  performedBy: int("performedBy"), // FK to users (null for system actions)
  performedBySystem: boolean("performedBySystem").default(false), // Whether action was system-initiated
  
  // Details
  details: json("details"), // Structured details about the action
  status: mysqlEnum("status", ["success", "failure", "warning"]).notNull(),
  message: text("message"),
  
  // Verification
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "failed"]),
  verificationDetails: json("verificationDetails"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KeyRotationAuditLog = typeof keyRotationAuditLogs.$inferSelect;
export type InsertKeyRotationAuditLog = typeof keyRotationAuditLogs.$inferInsert;

/**
 * Key Rotation Policies - configuration for automatic rotation
 * Defines when and how keys should be rotated
 */
export const keyRotationPolicies = mysqlTable("key_rotation_policies", {
  id: int("id").autoincrement().primaryKey(),
  
  // Policy metadata
  policyName: varchar("policyName", { length: 255 }).notNull(),
  description: text("description"),
  
  // Target
  targetType: mysqlEnum("targetType", ["service_cert", "attestation_key", "all"]).notNull(),
  targetName: varchar("targetName", { length: 255 }), // Specific service/key name, or null for all
  
  // Rotation schedule
  rotationIntervalDays: int("rotationIntervalDays").notNull(), // Rotate every N days
  rotationIntervalHours: int("rotationIntervalHours"), // Or every N hours (for frequent rotation)
  daysBeforeExpiry: int("daysBeforeExpiry"), // Rotate this many days before expiry
  
  // Overlap window
  overlapWindowDays: int("overlapWindowDays").default(7), // Days to keep old+new valid
  
  // Execution
  autoRotate: boolean("autoRotate").default(true), // Automatically rotate on schedule
  requireApproval: boolean("requireApproval").default(false), // Require manual approval
  notifyBefore: int("notifyBefore"), // Notify N days before rotation
  
  // Status
  isActive: boolean("isActive").default(true),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KeyRotationPolicy = typeof keyRotationPolicies.$inferSelect;
export type InsertKeyRotationPolicy = typeof keyRotationPolicies.$inferInsert;

/**
 * Key Rotation Schedules - tracks scheduled rotations
 * Upcoming rotation events based on policies
 */
export const keyRotationSchedules = mysqlTable("key_rotation_schedules", {
  id: int("id").autoincrement().primaryKey(),
  
  // References
  policyId: int("policyId").notNull(), // FK to key_rotation_policies
  rotationId: int("rotationId"), // FK to key_rotations (null until rotation starts)
  
  // Schedule
  scheduledAt: timestamp("scheduledAt").notNull(),
  reason: varchar("reason", { length: 255 }), // "policy", "expiry", "manual", "emergency"
  
  // Status
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "skipped", "failed"]).default("pending").notNull(),
  
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
export const llms = mysqlTable("llms", {
  id: int("id").autoincrement().primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Classification
  role: mysqlEnum("role", ["planner", "executor", "router", "guard", "observer", "embedder"]).notNull(),
  ownerTeam: varchar("ownerTeam", { length: 255 }),

  // Status
  archived: boolean("archived").default(false),

  // Metadata
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
export const llmVersions = mysqlTable("llm_versions", {
  id: int("id").autoincrement().primaryKey(),
  llmId: int("llmId").notNull(),

  // Versioning
  version: int("version").notNull(),
  environment: mysqlEnum("environment", ["sandbox", "governed", "production"]).notNull().default("sandbox"),

  // Configuration (complete LLM config as JSON)
  config: json("config").notNull(), // { runtime, provider, model, params, etc. }
  configHash: varchar("configHash", { length: 64 }).notNull(), // SHA256 of config

  // Policy validation
  policyBundleRef: varchar("policyBundleRef", { length: 512 }), // OCI reference to policy bundle
  policyHash: varchar("policyHash", { length: 64 }), // SHA256 of policy bundle
  policyDecision: mysqlEnum("policyDecision", ["pass", "warn", "deny"]).default("pass"),
  policyViolations: json("policyViolations"), // Array of violation objects

  // Attestation contract
  attestationContract: json("attestationContract"), // Required runtime fingerprint
  attestationStatus: mysqlEnum("attestationStatus", ["pending", "attested", "stale", "failed", "revoked"]).default("pending"),

  // Runtime state
  driftStatus: mysqlEnum("driftStatus", ["none", "benign", "suspicious", "critical"]).default("none"),
  callable: boolean("callable").default(false), // Can this version be dispatched?

  // Metadata
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  // Change tracking
  changeNotes: text("changeNotes"),
  promotionRequestId: int("promotionRequestId"), // FK if created via promotion
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
export const llmPromotions = mysqlTable("llm_promotions", {
  id: int("id").autoincrement().primaryKey(),
  llmVersionId: int("llmVersionId").notNull(),

  // Promotion details
  fromEnvironment: mysqlEnum("fromEnvironment", ["sandbox", "governed", "production"]).notNull(),
  toEnvironment: mysqlEnum("toEnvironment", ["sandbox", "governed", "production"]).notNull(),

  // Status
  status: mysqlEnum("status", ["pending", "simulated", "approved", "rejected", "executed", "failed"]).notNull().default("pending"),

  // Simulation results
  simulationResults: json("simulationResults"), // Policy check, compatibility, cost estimate
  simulatedAt: timestamp("simulatedAt"),

  // Approval workflow
  requestedBy: int("requestedBy").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),

  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalComment: text("approvalComment"),

  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),

  // Execution
  executedAt: timestamp("executedAt"),
  executionError: text("executionError"),
  newVersionId: int("newVersionId"), // FK to created llm_version in target environment

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
export const llmAttestations = mysqlTable("llm_attestations", {
  id: int("id").autoincrement().primaryKey(),
  llmVersionId: int("llmVersionId").notNull(),

  // Attestation status
  status: mysqlEnum("status", ["attested", "stale", "failed", "revoked"]).notNull(),

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
  revokedBy: int("revokedBy"),
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
export const llmDriftEvents = mysqlTable("llm_drift_events", {
  id: int("id").autoincrement().primaryKey(),
  llmVersionId: int("llmVersionId").notNull(),

  // Drift classification
  severity: mysqlEnum("severity", ["benign", "suspicious", "critical"]).notNull(),
  signal: varchar("signal", { length: 255 }).notNull(), // "image_digest_mismatch", "config_mutation", etc.

  // Drift details
  expected: json("expected").notNull(), // Expected state
  observed: json("observed").notNull(), // Observed state

  // Response
  responseAction: mysqlEnum("responseAction", ["warn", "block_new", "immediate_revoke"]),
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
export const llmAuditEvents = mysqlTable("llm_audit_events", {
  id: int("id").autoincrement().primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(), // "llm.wizard.started", "llm.version.created", etc.

  // References
  llmId: int("llmId"),
  llmVersionId: int("llmVersionId"),
  promotionId: int("promotionId"),

  // Actor
  actor: int("actor"), // User ID
  actorType: mysqlEnum("actorType", ["user", "system"]).default("user"),

  // Event payload
  payload: json("payload").notNull(), // Event-specific data

  // Trust chain
  configHash: varchar("configHash", { length: 64 }),
  policyHash: varchar("policyHash", { length: 64 }),
  eventSignature: text("eventSignature"), // Cryptographic signature of event

  // Environment context
  environment: mysqlEnum("environment", ["sandbox", "governed", "production"]),

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
