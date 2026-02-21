import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, index } from "drizzle-orm/pg-core";
import { users, workspaces } from "./users";

// ============================================================================
// Automation System
// ============================================================================

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  workspaceId: integer("workspaceId").references(() => workspaces.id),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // ReactFlow canvas data
  nodes: text("nodes").notNull(),
  edges: text("edges").notNull(),

  // Trigger configuration
  triggerType: varchar("triggerType", { length: 50 }).default("manual"),
  triggerConfig: json("triggerConfig"),

  // Versioning
  schemaVersion: integer("schemaVersion").default(1).notNull(),
  publishedVersionId: integer("publishedVersionId"),
  draftData: json("draftData"),

  // Status
  status: varchar("status", { length: 50 }).default("draft"),
  enabled: boolean("enabled").default(true),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 50 }),

  // Permissions
  permissions: json("permissions"),
  isPublic: boolean("isPublic").default(false),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;

// Workflow Versions (immutable snapshots)
export const workflowVersions = pgTable("workflow_versions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull().references(() => workflows.id),
  version: integer("version").notNull(),

  // Snapshot of workflow at publish time
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  nodes: text("nodes").notNull(),
  edges: text("edges").notNull(),
  schemaVersion: integer("schemaVersion").notNull(),

  // Trigger configuration snapshot
  triggerType: varchar("triggerType", { length: 50 }),
  triggerConfig: json("triggerConfig"),

  // Publishing metadata
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  publishedBy: integer("publishedBy").notNull().references(() => users.id),
  changeNotes: text("changeNotes"),
  status: varchar("status", { length: 50 }).default("published"),
});

// Workflow Executions
export const workflowExecutions = pgTable("workflow_executions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflowId").notNull().references(() => workflows.id),
  versionId: integer("versionId").references(() => workflowVersions.id),

  // Execution metadata
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"),

  // Trigger information
  triggerType: varchar("triggerType", { length: 50 }),
  triggerData: json("triggerData"),

  // Execution context
  executedBy: integer("executedBy"),
  error: text("error"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Workflow Execution Logs
export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
  id: serial("id").primaryKey(),
  executionId: integer("executionId").notNull().references(() => workflowExecutions.id),

  // Node/step information
  nodeId: varchar("nodeId", { length: 255 }).notNull(),
  nodeType: varchar("nodeType", { length: 100 }).notNull(),
  nodeLabel: varchar("nodeLabel", { length: 255 }),

  // Execution details
  status: varchar("status", { length: 50 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"),

  // Input/output data
  input: json("input"),
  output: json("output"),
  error: text("error"),

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

// ============================================================================
// Trigger & Action Registry
// ============================================================================

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

  // All other gates
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

// ============================================================================
// WCP (Workflow Composition Protocol) Workflows
// ============================================================================

export const wcpWorkflows = pgTable("wcp_workflows", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // ReactFlow canvas data
  nodes: text("nodes").notNull(),
  edges: text("edges").notNull(),

  // WCP bytecode
  wcpBytecode: text("wcpBytecode"),

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
  workflowId: integer("workflowId").notNull(),

  workflowName: varchar("workflowName", { length: 255 }).notNull(),

  // Execution metadata
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: integer("duration"),

  // Execution details
  executionLog: json("executionLog"),
  errorMessage: text("errorMessage"),

  // Trigger information
  triggerType: varchar("triggerType", { length: 50 }).default("manual"),
  triggerData: json("triggerData"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WCPExecution = typeof wcpExecutions.$inferSelect;
export type InsertWCPExecution = typeof wcpExecutions.$inferInsert;

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
