import { mysqlTable, int, varchar, text, json, timestamp, boolean, mysqlEnum } from "drizzle-orm/mysql-core";

/**
 * Trigger Registry - Stores custom trigger type definitions
 * Implements 14-gate compliance protocol for trigger creation
 */
export const triggerRegistry = mysqlTable("trigger_registry", {
  id: int("id").autoincrement().primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(), // Stable unique identifier (e.g., "email-received", "slack-mention")
  name: varchar("name", { length: 255 }).notNull(), // Human-readable name
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // Palette category
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(), // e.g., "1.2.3"
  icon: varchar("icon", { length: 50 }), // Lucide icon name
  
  // Gate 0: Classification & Intent
  classification: mysqlEnum("classification", ["external", "time-based", "manual"]).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(), // What initiates it
  
  // Gate 2: Configuration Schema
  configSchema: json("configSchema").notNull(), // JSON Schema for configuration
  configSchemaVersion: int("configSchemaVersion").notNull().default(1),
  defaultConfig: json("defaultConfig"), // Default configuration values
  
  // Gate 3: UX Safety
  uiRenderer: text("uiRenderer"), // React component code or config
  requiredFields: json("requiredFields"), // Array of required field names
  unsafeOptions: json("unsafeOptions"), // Array of options marked as unsafe
  validationRules: json("validationRules"), // Inline validation rules
  samplePayload: json("samplePayload"), // Sample trigger payload for external triggers
  
  // Gate 4: Data Flow & Contracts
  inputContract: json("inputContract"), // Input schema (for manual triggers)
  outputContract: json("outputContract").notNull(), // Output schema (workflow initial state)
  outputTypes: json("outputTypes"), // Typed output fields
  initialWorkflowSchema: json("initialWorkflowSchema"), // Initial workflow input schema
  
  // Gate 5: Execution Semantics
  executionMode: mysqlEnum("executionMode", ["sync", "async"]).notNull(),
  blockingBehavior: mysqlEnum("blockingBehavior", ["blocking", "non-blocking"]).notNull(),
  retryPolicy: json("retryPolicy"), // { maxRetries, backoff, retryableErrors }
  timeoutPolicy: json("timeoutPolicy"), // { timeoutMs, onTimeout }
  failureHandling: json("failureHandling"), // { strategy, fallback }
  stateTier: mysqlEnum("stateTier", ["ephemeral", "durable"]).notNull(),
  maxStateSize: int("maxStateSize"), // Max state size in bytes
  concurrentIsolation: text("concurrentIsolation"), // Documentation of concurrent run isolation
  
  // Gate 6: Error Propagation & Compensation
  compensationStrategy: text("compensationStrategy"), // Documentation of compensation
  workflowFailureHandler: json("workflowFailureHandler"), // Failure handler config
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }), // Field name for idempotency key
  
  // Gate 7: Security & Governance
  requiredPermissions: json("requiredPermissions"), // Array of required permissions
  riskLevel: mysqlEnum("riskLevel", ["safe", "restricted", "privileged"]).notNull(),
  preExecutionPolicies: json("preExecutionPolicies"), // Array of policy checks
  secretFields: json("secretFields"), // Fields that contain secrets (stored as references)
  
  // Gate 8: Multi-Tenancy
  tenantScoped: boolean("tenantScoped").notNull().default(true),
  tenantIsolation: text("tenantIsolation"), // Documentation of tenant isolation
  
  // Gate 9: Observability
  metricsConfig: json("metricsConfig"), // Metrics to expose
  logFields: json("logFields"), // Required log fields
  errorClassification: json("errorClassification"), // Error classes and codes
  
  // Gate 10: Performance & Cost
  performanceProfile: mysqlEnum("performanceProfile", ["light", "standard", "heavy"]).notNull(),
  latencySLA: json("latencySLA"), // { p50, p95, p99 } in ms
  throughputExpectation: int("throughputExpectation"), // Expected throughput per second
  degradationBehavior: text("degradationBehavior"),
  rateLimits: json("rateLimits"), // { perTenant, perAction }
  costQuotas: json("costQuotas"), // Cost limits
  backpressureStrategy: text("backpressureStrategy"),
  
  // Gate 11: Documentation
  purposeDoc: text("purposeDoc").notNull(),
  useCases: json("useCases"), // Array of use case descriptions
  failureModes: json("failureModes"), // Array of failure mode descriptions
  securityConsiderations: text("securityConsiderations"),
  examples: json("examples"), // Array of example configurations
  
  // Gate 12: Testing & Simulation
  testCoverage: json("testCoverage"), // Test results summary
  dryRunSupported: boolean("dryRunSupported").notNull().default(false),
  simulationConfig: json("simulationConfig"), // Dry-run configuration
  
  // Gate 13: Lifecycle Management
  deprecationNotice: text("deprecationNotice"), // Deprecation warning if applicable
  migrationPath: text("migrationPath"), // Migration instructions
  replacementTypeId: varchar("replacementTypeId", { length: 100 }), // Replacement trigger type
  
  // Gate 14: Composition & Modularity
  subWorkflowSupport: boolean("subWorkflowSupport").notNull().default(false),
  maxNestingDepth: int("maxNestingDepth").default(5),
  variableScopingRules: text("variableScopingRules"),
  failureBubblingRules: text("failureBubblingRules"),
  
  // Runtime handler
  handlerCode: text("handlerCode"), // JavaScript/TypeScript code for runtime handler
  handlerType: mysqlEnum("handlerType", ["inline", "external", "webhook"]).notNull(),
  handlerEndpoint: varchar("handlerEndpoint", { length: 500 }), // For external handlers
  
  // Capability flags
  requiresNetwork: boolean("requiresNetwork").notNull().default(false),
  requiresSecrets: boolean("requiresSecrets").notNull().default(false),
  hasSideEffects: boolean("hasSideEffects").notNull().default(false),
  hasCost: boolean("hasCost").notNull().default(false),
  
  // Approval & Status
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "rejected", "deprecated"]).notNull().default("draft"),
  approvedBy: int("approvedBy"), // FK to users (admin who approved)
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  
  // Compliance validation
  criticalViolations: int("criticalViolations").notNull().default(0),
  majorIssues: int("majorIssues").notNull().default(0),
  complianceScore: int("complianceScore"), // 0-100 score
  lastValidated: timestamp("lastValidated"),
  
  // Metadata
  createdBy: int("createdBy").notNull(), // FK to users (admin who created)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TriggerRegistryEntry = typeof triggerRegistry.$inferSelect;
export type InsertTriggerRegistryEntry = typeof triggerRegistry.$inferInsert;

/**
 * Action Registry - Stores custom action type definitions
 * Similar structure to trigger registry but for actions
 */
export const actionRegistry = mysqlTable("action_registry", {
  id: int("id").autoincrement().primaryKey(),
  
  // Gate 1: Registry & Identity
  typeId: varchar("typeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  semanticVersion: varchar("semanticVersion", { length: 20 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  
  // Gate 0: Classification & Intent
  classification: mysqlEnum("classification", ["side-effecting", "transformational", "control-flow", "ai-agent"]).notNull(),
  isDeterministic: boolean("isDeterministic").notNull(),
  isIdempotent: boolean("isIdempotent").notNull(),
  safeByDefault: boolean("safeByDefault").notNull().default(true),
  intentDoc: text("intentDoc").notNull(), // What side effects it causes
  sideEffects: json("sideEffects").notNull(), // Array of side effect descriptions
  
  // Gate 2: Configuration Schema
  configSchema: json("configSchema").notNull(),
  configSchemaVersion: int("configSchemaVersion").notNull().default(1),
  defaultConfig: json("defaultConfig"),
  
  // Gate 3: UX Safety
  uiRenderer: text("uiRenderer"),
  requiredFields: json("requiredFields"),
  unsafeOptions: json("unsafeOptions"),
  validationRules: json("validationRules"),
  retryBehaviorVisible: boolean("retryBehaviorVisible").notNull().default(true),
  timeoutBehaviorVisible: boolean("timeoutBehaviorVisible").notNull().default(true),
  failureBehaviorVisible: boolean("failureBehaviorVisible").notNull().default(true),
  
  // Gate 4: Data Flow & Contracts
  inputContract: json("inputContract").notNull(),
  outputContract: json("outputContract").notNull(),
  outputTypes: json("outputTypes"),
  noGlobalMutation: boolean("noGlobalMutation").notNull().default(true),
  
  // Gate 5: Execution Semantics
  executionMode: mysqlEnum("executionMode", ["sync", "async"]).notNull(),
  blockingBehavior: mysqlEnum("blockingBehavior", ["blocking", "non-blocking"]).notNull(),
  retryPolicy: json("retryPolicy"),
  timeoutPolicy: json("timeoutPolicy"),
  failureHandling: json("failureHandling"),
  stateTier: mysqlEnum("stateTier", ["ephemeral", "durable"]).notNull(),
  maxStateSize: int("maxStateSize"),
  concurrentIsolation: text("concurrentIsolation"),
  
  // Gate 6: Error Propagation & Compensation
  compensationStrategy: text("compensationStrategy").notNull(), // MANDATORY for side-effecting actions
  compensationAutomation: json("compensationAutomation"), // Optional automation config
  workflowFailureHandler: json("workflowFailureHandler"),
  idempotencyKeyField: varchar("idempotencyKeyField", { length: 100 }),
  partialRollbackPaths: json("partialRollbackPaths"),
  
  // Gate 7: Security & Governance
  requiredPermissions: json("requiredPermissions"),
  riskLevel: mysqlEnum("riskLevel", ["safe", "restricted", "privileged"]).notNull(),
  preExecutionPolicies: json("preExecutionPolicies"),
  secretFields: json("secretFields"),
  
  // AI-specific controls (for ai-agent classification)
  promptVariableSanitization: json("promptVariableSanitization"),
  tokenCap: int("tokenCap"),
  costCap: int("costCap"), // Cost cap in cents
  outputSchema: json("outputSchema"),
  confidenceScoreExposed: boolean("confidenceScoreExposed").default(false),
  highRiskDefinition: json("highRiskDefinition"), // MANDATORY for AI actions
  humanInLoopRequired: boolean("humanInLoopRequired").default(false),
  
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
  handlerType: mysqlEnum("handlerType", ["inline", "external", "api"]).notNull(),
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

export type ActionRegistryEntry = typeof actionRegistry.$inferSelect;
export type InsertActionRegistryEntry = typeof actionRegistry.$inferInsert;
