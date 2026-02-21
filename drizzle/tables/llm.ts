import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, numeric, bigint, uniqueIndex, index } from "drizzle-orm/pg-core";

// ============================================================================
// LLM Control Plane & Registry
// ============================================================================

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

export const llmVersions = pgTable("llm_versions", {
  id: serial("id").primaryKey(),
  llmId: integer("llmId").notNull(),

  // Versioning
  version: integer("version").notNull(),
  environment: varchar("environment", { length: 50 }).notNull().default("sandbox"),

  // Configuration
  config: json("config").notNull(),
  configHash: varchar("configHash", { length: 64 }).notNull(),

  // Policy validation
  policyBundleRef: varchar("policyBundleRef", { length: 512 }),
  policyHash: varchar("policyHash", { length: 64 }),
  policyDecision: varchar("policyDecision", { length: 50 }).default("pass"),
  policyViolations: json("policyViolations"),

  // Attestation contract
  attestationContract: json("attestationContract"),
  attestationStatus: varchar("attestationStatus", { length: 50 }).default("pending"),

  // Runtime state
  driftStatus: varchar("driftStatus", { length: 50 }).default("none"),
  callable: boolean("callable").default(false),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),

  // Change tracking
  changeNotes: text("changeNotes"),
  promotionRequestId: integer("promotionRequestId"),
}, (table) => ({
  llmIdIdx: index("idx_llm_version_llm_id").on(table.llmId),
  environmentIdx: index("idx_llm_version_env").on(table.environment),
  callableIdx: index("idx_llm_version_callable").on(table.callable),
  uniqueLlmVersion: uniqueIndex("unique_llm_version").on(table.llmId, table.version),
}));

export type LLMVersion = typeof llmVersions.$inferSelect;
export type InsertLLMVersion = typeof llmVersions.$inferInsert;

export const llmPromotions = pgTable("llm_promotions", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Promotion details
  fromEnvironment: varchar("fromEnvironment", { length: 50 }).notNull(),
  toEnvironment: varchar("toEnvironment", { length: 50 }).notNull(),

  // Status
  status: varchar("status", { length: 50 }).notNull().default("pending"),

  // Simulation results
  simulationResults: json("simulationResults"),
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
  newVersionId: integer("newVersionId"),

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  llmVersionIdx: index("idx_promotion_version").on(table.llmVersionId),
  statusIdx: index("idx_promotion_status").on(table.status),
}));

export type LLMPromotion = typeof llmPromotions.$inferSelect;
export type InsertLLMPromotion = typeof llmPromotions.$inferInsert;

export const llmAttestations = pgTable("llm_attestations", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Attestation status
  status: varchar("status", { length: 50 }).notNull(),

  // Evidence payload
  evidence: json("evidence").notNull(),
  evidenceHash: varchar("evidenceHash", { length: 64 }),

  // Verification details
  imageDigest: varchar("imageDigest", { length: 255 }),
  configHash: varchar("configHash", { length: 64 }),
  workloadIdentity: varchar("workloadIdentity", { length: 512 }),

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

export const llmDriftEvents = pgTable("llm_drift_events", {
  id: serial("id").primaryKey(),
  llmVersionId: integer("llmVersionId").notNull(),

  // Drift classification
  severity: varchar("severity", { length: 50 }).notNull(),
  signal: varchar("signal", { length: 255 }).notNull(),

  // Drift details
  expected: json("expected").notNull(),
  observed: json("observed").notNull(),

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

export const llmAuditEvents = pgTable("llm_audit_events", {
  id: serial("id").primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(),

  // References
  llmId: integer("llmId"),
  llmVersionId: integer("llmVersionId"),
  promotionId: integer("promotionId"),

  // Actor
  actor: integer("actor"),
  actorType: varchar("actorType", { length: 50 }).default("user"),

  // Event payload
  payload: json("payload").notNull(),

  // Trust chain
  configHash: varchar("configHash", { length: 64 }),
  policyHash: varchar("policyHash", { length: 64 }),
  eventSignature: text("eventSignature"),

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

export const llmCreationProjects = pgTable("llm_creation_projects", {
  id: serial("id").primaryKey(),

  // Project identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // Path selection
  path: varchar("path", { length: 10 }).notNull(),

  // Target specification
  target: json("target").notNull(),

  // Base model selection
  baseModel: json("baseModel"),

  // Status tracking
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  currentPhase: varchar("currentPhase", { length: 50 }),
  progress: integer("progress").default(0),

  // Results & outputs
  finalModelPath: varchar("finalModelPath", { length: 512 }),
  ollamaModelName: varchar("ollamaModelName", { length: 255 }),
  deploymentStatus: varchar("deploymentStatus", { length: 50 }),

  // Linked LLM
  llmId: integer("llmId"),

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

export const llmDatasets = pgTable("llm_datasets", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(),

  // Dataset identity
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),

  // Source & content
  source: varchar("source", { length: 50 }),
  format: varchar("format", { length: 50 }).notNull(),
  filePath: varchar("filePath", { length: 512 }),
  fileSize: bigint("fileSize", { mode: "number" }),

  // Statistics
  recordCount: integer("recordCount"),
  tokenCount: bigint("tokenCount", { mode: "number" }),
  stats: json("stats"),

  // Quality metrics
  qualityScore: numeric("qualityScore", { precision: 5, scale: 2 }),
  qualityChecks: json("qualityChecks"),

  // Processing status
  status: varchar("status", { length: 50 }).default("pending"),
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

export const llmTrainingRuns = pgTable("llm_training_runs", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(),

  // Training type
  trainingType: varchar("trainingType", { length: 50 }).notNull(),
  phase: varchar("phase", { length: 50 }),

  // Configuration
  config: json("config").notNull(),
  configHash: varchar("configHash", { length: 64 }),

  // Dataset references
  datasetIds: json("datasetIds"),

  // Training framework
  framework: varchar("framework", { length: 50 }),
  accelerator: varchar("accelerator", { length: 50 }),

  // Status tracking
  status: varchar("status", { length: 50 }).default("pending"),
  progress: integer("progress").default(0),
  currentStep: integer("currentStep"),
  totalSteps: integer("totalSteps"),

  // Metrics
  metrics: json("metrics"),
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

export const llmEvaluations = pgTable("llm_evaluations", {
  id: serial("id").primaryKey(),

  // Project & run references
  projectId: integer("projectId").notNull(),
  trainingRunId: integer("trainingRunId"),

  // Evaluation target
  modelPath: varchar("modelPath", { length: 512 }),
  modelType: varchar("modelType", { length: 50 }),

  // Evaluation configuration
  evalDatasetId: integer("evalDatasetId"),
  benchmarks: json("benchmarks"),

  // Results
  results: json("results").notNull(),
  overallScore: numeric("overallScore", { precision: 5, scale: 2 }),

  // Metrics
  taskAccuracy: numeric("taskAccuracy", { precision: 5, scale: 2 }),
  formatCorrectness: numeric("formatCorrectness", { precision: 5, scale: 2 }),
  refusalCorrectness: numeric("refusalCorrectness", { precision: 5, scale: 2 }),
  latency: integer("latency"),
  throughput: numeric("throughput", { precision: 10, scale: 2 }),

  // Comparison baseline
  baselineEvalId: integer("baselineEvalId"),
  improvement: numeric("improvement", { precision: 5, scale: 2 }),

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

export const llmQuantizations = pgTable("llm_quantizations", {
  id: serial("id").primaryKey(),

  // Project reference
  projectId: integer("projectId").notNull(),
  sourceTrainingRunId: integer("sourceTrainingRunId"),

  // Source model
  sourceModelPath: varchar("sourceModelPath", { length: 512 }).notNull(),

  // Quantization config
  quantizationType: varchar("quantizationType", { length: 50 }).notNull(),
  method: varchar("method", { length: 50 }),

  // Output
  outputPath: varchar("outputPath", { length: 512 }),
  outputFormat: varchar("outputFormat", { length: 50 }),
  fileSize: bigint("fileSize", { mode: "number" }),

  // Quality comparison
  accuracyDrop: numeric("accuracyDrop", { precision: 5, scale: 2 }),
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

export const llmCreationAuditEvents = pgTable("llm_creation_audit_events", {
  id: serial("id").primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(),

  // References
  projectId: integer("projectId"),
  datasetId: integer("datasetId"),
  trainingRunId: integer("trainingRunId"),
  evaluationId: integer("evaluationId"),
  quantizationId: integer("quantizationId"),

  // Actor
  actor: integer("actor"),
  actorType: varchar("actorType", { length: 50 }).default("user"),

  // Event details
  phase: varchar("phase", { length: 50 }),
  action: varchar("action", { length: 100 }),
  payload: json("payload").notNull(),

  // Outcome
  status: varchar("status", { length: 50 }),
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
