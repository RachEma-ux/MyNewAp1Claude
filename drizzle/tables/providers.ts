import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, decimal, index, pgEnum } from "drizzle-orm/pg-core";
import { workspaces } from "./users";

// ============================================================================
// Provider System (Provider Hub Integration)
// ============================================================================

// Provider capability types
export type ProviderCapability = 'chat' | 'embeddings' | 'tools' | 'vision' | 'json_mode' | 'streaming';
export type ProviderPolicyTag = 'no_egress' | 'pii_safe' | 'gpu_required' | 'hipaa_compliant' | 'gdpr_compliant';
export type ProviderKind = 'local' | 'cloud' | 'hybrid';
export type CostTier = 'free' | 'low' | 'medium' | 'high';

export interface ProviderLimits {
  maxContext?: number;
  maxOutput?: number;
  rateLimit?: number;
  costTier?: CostTier;
}

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),

  // Provider status
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(50),

  // Configuration
  config: json("config").notNull(),

  // Cost tracking
  costPer1kTokens: varchar("costPer1kTokens", { length: 20 }),

  // Provider Routing Fields
  kind: varchar("kind", { length: 20 }).default("cloud").$type<ProviderKind>(),
  capabilities: json("capabilities").$type<ProviderCapability[]>(),
  policyTags: json("policyTags").$type<ProviderPolicyTag[]>(),
  limits: json("limits").$type<ProviderLimits>(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type InsertProvider = typeof providers.$inferInsert;

export const workspaceProviders = pgTable("workspace_providers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  providerId: integer("providerId").notNull().references(() => providers.id),

  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(50),
  quotaTokensPerDay: integer("quotaTokensPerDay"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceProvider = typeof workspaceProviders.$inferSelect;
export type InsertWorkspaceProvider = typeof workspaceProviders.$inferInsert;

export const providerUsage = pgTable("provider_usage", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  providerId: integer("providerId").notNull().references(() => providers.id),

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
  providerId: integer("providerId").notNull().references(() => providers.id),

  status: varchar("status", { length: 50 }).notNull(),
  responseTimeMs: integer("responseTimeMs"),
  errorMessage: text("errorMessage"),

  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type ProviderHealthCheck = typeof providerHealthChecks.$inferSelect;
export type InsertProviderHealthCheck = typeof providerHealthChecks.$inferInsert;

// Routing Audit Log
export const routingAuditLogs = pgTable("routing_audit_logs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").references(() => workspaces.id),
  requestId: varchar("requestId", { length: 64 }).notNull(),

  // Routing decision
  primaryProviderId: integer("primaryProviderId").notNull().references(() => providers.id),
  actualProviderId: integer("actualProviderId").notNull().references(() => providers.id),
  routeTaken: varchar("routeTaken", { length: 50 }).notNull(),

  // Audit info
  auditReasons: json("auditReasons").$type<string[]>(),
  policySnapshot: json("policySnapshot"),

  // Metrics
  latencyMs: integer("latencyMs"),
  tokensUsed: integer("tokensUsed"),
  estimatedCost: varchar("estimatedCost", { length: 20 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RoutingAuditLog = typeof routingAuditLogs.$inferSelect;
export type InsertRoutingAuditLog = typeof routingAuditLogs.$inferInsert;

// Provider Performance Metrics
export const providerMetrics = pgTable("provider_metrics", {
  id: serial("id").primaryKey(),
  providerId: integer("providerId").notNull().references(() => providers.id),

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

// ============================================================================
// Provider Connections & PAT Authentication (Governed)
// ============================================================================

export type ProviderConnectionStatus =
  | "draft"
  | "validated"
  | "active"
  | "failed"
  | "disabled"
  | "rotated";

export const providerConnections = pgTable("provider_connections", {
  id: serial("id").primaryKey(),
  providerId: integer("providerId").notNull(),
  workspaceId: integer("workspaceId").notNull().references(() => workspaces.id),
  baseUrl: text("baseUrl").notNull(),
  lifecycleStatus: varchar("lifecycleStatus", { length: 30 }).default("draft").notNull().$type<ProviderConnectionStatus>(),
  healthStatus: varchar("healthStatus", { length: 30 }),
  lastHealthCheck: timestamp("lastHealthCheck"),
  secretVersion: integer("secretVersion").default(1).notNull(),
  capabilities: json("capabilities").$type<string[]>(),
  modelCount: integer("modelCount"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("idx_pconn_workspace").on(table.workspaceId),
  providerIdx: index("idx_pconn_provider").on(table.providerId),
  statusIdx: index("idx_pconn_status").on(table.lifecycleStatus),
}));

export type ProviderConnection = typeof providerConnections.$inferSelect;
export type InsertProviderConnection = typeof providerConnections.$inferInsert;

export const providerSecrets = pgTable("provider_secrets", {
  id: serial("id").primaryKey(),
  connectionId: integer("connectionId").notNull().references(() => providerConnections.id, { onDelete: "cascade" }),
  encryptedPat: text("encryptedPat").notNull(),
  keyVersion: integer("keyVersion").default(1).notNull(),
  rotatedFrom: integer("rotatedFrom"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("idx_psecret_connection").on(table.connectionId),
}));

export type ProviderSecret = typeof providerSecrets.$inferSelect;
export type InsertProviderSecret = typeof providerSecrets.$inferInsert;

export type ProviderAuditAction =
  | "CONNECTION_CREATED"
  | "CONNECTION_TESTED"
  | "CONNECTION_ACTIVATED"
  | "CONNECTION_FAILED"
  | "CONNECTION_DISABLED"
  | "SECRET_ROTATED"
  | "HEALTH_CHECK_OK"
  | "HEALTH_CHECK_FAILED";

export const providerAuditLog = pgTable("provider_audit_log", {
  id: serial("id").primaryKey(),
  connectionId: integer("connectionId").notNull().references(() => providerConnections.id),
  action: varchar("action", { length: 50 }).notNull().$type<ProviderAuditAction>(),
  actor: integer("actor").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("idx_paudit_connection").on(table.connectionId),
  actionIdx: index("idx_paudit_action").on(table.action),
  timestampIdx: index("idx_paudit_timestamp").on(table.createdAt),
}));

export type ProviderAuditLogEntry = typeof providerAuditLog.$inferSelect;
export type InsertProviderAuditLogEntry = typeof providerAuditLog.$inferInsert;

// ============================================================================
// Provider Discovery Ops
// ============================================================================

export const discoveryAttemptStatusEnum = pgEnum("discovery_attempt_status", [
  "ok", "partial", "failed",
]);

export const discoveryFailureReasonEnum = pgEnum("discovery_failure_reason", [
  "INVALID_URL", "SSRF_BLOCKED", "DNS_FAILED", "FETCH_TIMEOUT",
  "FETCH_TOO_LARGE", "FETCH_HTTP_ERROR", "PARSE_FAILED",
  "NO_METADATA_FOUND", "NO_CANDIDATES", "PROBE_ALL_FAILED",
]);

export const providerDiscoveryEvents = pgTable("provider_discovery_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  actorId: integer("actorId"),
  domain: text("domain").notNull(),
  normalizedUrl: text("normalizedUrl"),
  status: varchar("status", { length: 20 }).notNull().$type<"ok" | "partial" | "failed">(),
  failureReason: varchar("failureReason", { length: 50 }).$type<string>(),
  bestUrl: text("bestUrl"),
  candidateCount: integer("candidateCount").default(0),
  probeSummary: json("probeSummary").$type<Array<{ url: string; path: string; status: number | null; probeType: string }>>(),
  warnings: json("warnings").$type<string[]>(),
  debug: json("debug").$type<Record<string, unknown>>(),
}, (table) => ({
  domainIdx: index("idx_pde_domain").on(table.domain),
  createdAtIdx: index("idx_pde_created_at").on(table.createdAt),
  domainCreatedAtIdx: index("idx_pde_domain_created_at").on(table.domain, table.createdAt),
  statusIdx: index("idx_pde_status").on(table.status),
}));

export type ProviderDiscoveryEvent = typeof providerDiscoveryEvents.$inferSelect;
export type InsertProviderDiscoveryEvent = typeof providerDiscoveryEvents.$inferInsert;

export const candidateStatusEnum = pgEnum("candidate_status", [
  "OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED",
]);

export const rejectCategoryEnum = pgEnum("reject_category", [
  "NOT_A_PROVIDER", "TOO_NICHE", "DUPLICATE_OF_EXISTING",
  "TEMPORARY_OUTAGE", "NEEDS_MANUAL_CONNECT_ONLY",
  "SECURITY_POLICY_BLOCK", "OTHER",
]);

export const registryPromotionCandidates = pgTable("registry_promotion_candidates", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  status: varchar("status", { length: 20 }).default("OPEN").notNull().$type<"OPEN" | "IN_REVIEW" | "ACCEPTED" | "REJECTED">(),

  firstDetectedAt: timestamp("firstDetectedAt").defaultNow().notNull(),
  lastDetectedAt: timestamp("lastDetectedAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),

  // Trigger signals
  triggerType: varchar("triggerType", { length: 50 }),
  attemptsTotal: integer("attemptsTotal").default(0).notNull(),
  attemptsFailed: integer("attemptsFailed").default(0).notNull(),
  bestUrlNullRate: decimal("bestUrlNullRate", { precision: 5, scale: 4 }).default("0"),

  // Review
  reviewedBy: integer("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),

  // Rejection
  rejectedBy: integer("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  rejectCategory: varchar("rejectCategory", { length: 50 }),
  rejectNotes: text("rejectNotes"),
  rejectSnapshot: json("rejectSnapshot").$type<Record<string, unknown>>(),

  // Acceptance
  acceptedBy: integer("acceptedBy"),
  acceptedAt: timestamp("acceptedAt"),
  patchId: integer("patchId"),

  // Draft registry entry
  draftRegistryEntry: json("draftRegistryEntry").$type<Record<string, unknown>>(),

  // Cooldown / reopen
  attemptsSinceReject: integer("attemptsSinceReject").default(0).notNull(),
  autoReopenedAt: timestamp("autoReopenedAt"),
  autoReopenReason: varchar("autoReopenReason", { length: 30 }),
  autoReopenEvidence: json("autoReopenEvidence").$type<Record<string, unknown>>(),
}, (table) => ({
  statusIdx: index("idx_rpc_status").on(table.status),
  lastSeenIdx: index("idx_rpc_last_seen").on(table.lastSeenAt),
  domainIdx: index("idx_rpc_domain").on(table.domain),
  statusLastSeenIdx: index("idx_rpc_status_last_seen").on(table.status, table.lastSeenAt),
}));

export type RegistryPromotionCandidate = typeof registryPromotionCandidates.$inferSelect;
export type InsertRegistryPromotionCandidate = typeof registryPromotionCandidates.$inferInsert;

export const patchArtifactStatusEnum = pgEnum("patch_artifact_status", [
  "PROPOSED", "MERGED", "ABANDONED",
]);

export const registryPatchArtifacts = pgTable("registry_patch_artifacts", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: integer("createdBy").notNull(),
  sourceDomain: text("sourceDomain").notNull(),
  status: varchar("status", { length: 20 }).default("PROPOSED").notNull().$type<"PROPOSED" | "MERGED" | "ABANDONED">(),
  draftRegistryEntry: json("draftRegistryEntry").notNull().$type<Record<string, unknown>>(),
  notes: text("notes"),
  linkedPrUrl: text("linkedPrUrl"),
}, (table) => ({
  domainIdx: index("idx_rpa_source_domain").on(table.sourceDomain),
  statusIdx: index("idx_rpa_status").on(table.status),
  createdAtIdx: index("idx_rpa_created_at").on(table.createdAt),
}));

export type RegistryPatchArtifact = typeof registryPatchArtifacts.$inferSelect;
export type InsertRegistryPatchArtifact = typeof registryPatchArtifacts.$inferInsert;
