import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  content: json("content").notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),

  // Status
  isActive: boolean("isActive").default(false),
  isTemplate: boolean("isTemplate").default(false),

  // Metadata
  rules: json("rules"),
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
  content: json("content").notNull(),
  rules: json("rules"),

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
// Incidents (promotion freeze)
// ============================================================================

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),

  // Freeze scope
  frozenEnvironments: json("frozenEnvironments"),

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
// Key Rotation System
// ============================================================================

export const serviceCertificates = pgTable("service_certificates", {
  id: serial("id").primaryKey(),

  // Certificate metadata
  serviceName: varchar("serviceName", { length: 255 }).notNull(),
  certificateType: varchar("certificateType", { length: 50 }).notNull(),

  // Certificate content (PEM format)
  certificate: text("certificate").notNull(),
  privateKey: text("privateKey").notNull(),
  publicKey: text("publicKey"),

  // Certificate details
  subject: varchar("subject", { length: 500 }),
  issuer: varchar("issuer", { length: 500 }),
  serialNumber: varchar("serialNumber", { length: 255 }),
  fingerprint: varchar("fingerprint", { length: 255 }).notNull().unique(),

  // Validity period
  issuedAt: timestamp("issuedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),

  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(),
  isActive: boolean("isActive").default(false),

  // Rotation tracking
  rotationId: integer("rotationId"),
  previousCertificateId: integer("previousCertificateId"),
  overlapStartsAt: timestamp("overlapStartsAt"),
  overlapEndsAt: timestamp("overlapEndsAt"),

  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ServiceCertificate = typeof serviceCertificates.$inferSelect;
export type InsertServiceCertificate = typeof serviceCertificates.$inferInsert;

export const attestationKeys = pgTable("attestation_keys", {
  id: serial("id").primaryKey(),

  // Key metadata
  keyName: varchar("keyName", { length: 255 }).notNull(),
  keyType: varchar("keyType", { length: 50 }).default("ed25519").notNull(),
  keySize: integer("keySize"),

  // Key content (PEM format)
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey"),

  // Key details
  keyId: varchar("keyId", { length: 255 }).notNull().unique(),
  thumbprint: varchar("thumbprint", { length: 255 }).notNull().unique(),

  // Validity period
  generatedAt: timestamp("generatedAt").notNull(),
  expiresAt: timestamp("expiresAt"),

  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(),
  isActive: boolean("isActive").default(false),

  // Rotation tracking
  rotationId: integer("rotationId"),
  previousKeyId: integer("previousKeyId"),
  overlapStartsAt: timestamp("overlapStartsAt"),
  overlapEndsAt: timestamp("overlapEndsAt"),

  // Usage tracking
  usageCount: integer("usageCount").default(0),
  lastUsedAt: timestamp("lastUsedAt"),

  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AttestationKey = typeof attestationKeys.$inferSelect;
export type InsertAttestationKey = typeof attestationKeys.$inferInsert;

export const keyRotations = pgTable("key_rotations", {
  id: serial("id").primaryKey(),

  // Rotation metadata
  rotationType: varchar("rotationType", { length: 50 }).notNull(),
  targetName: varchar("targetName", { length: 255 }).notNull(),

  // Rotation status
  status: varchar("status", { length: 50 }).default("pending").notNull(),

  // Rotation timeline
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),

  // Old and new keys/certs
  oldKeyId: integer("oldKeyId"),
  newKeyId: integer("newKeyId"),

  // Overlap window
  overlapStartsAt: timestamp("overlapStartsAt"),
  overlapEndsAt: timestamp("overlapEndsAt"),

  // Execution details
  initiatedBy: integer("initiatedBy"),
  reason: varchar("reason", { length: 500 }),

  // Error tracking
  error: text("error"),
  rollbackReason: text("rollbackReason"),

  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotation = typeof keyRotations.$inferSelect;
export type InsertKeyRotation = typeof keyRotations.$inferInsert;

export const keyRotationAuditLogs = pgTable("key_rotation_audit_logs", {
  id: serial("id").primaryKey(),

  // Reference to rotation
  rotationId: integer("rotationId").notNull(),

  // Action details
  action: varchar("action", { length: 100 }).notNull(),
  actionType: varchar("actionType", { length: 50 }).notNull(),

  // Actor information
  performedBy: integer("performedBy"),
  performedBySystem: boolean("performedBySystem").default(false),

  // Details
  details: json("details"),
  status: varchar("status", { length: 50 }).notNull(),
  message: text("message"),

  // Verification
  verificationStatus: varchar("verificationStatus", { length: 50 }),
  verificationDetails: json("verificationDetails"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KeyRotationAuditLog = typeof keyRotationAuditLogs.$inferSelect;
export type InsertKeyRotationAuditLog = typeof keyRotationAuditLogs.$inferInsert;

export const keyRotationPolicies = pgTable("key_rotation_policies", {
  id: serial("id").primaryKey(),

  // Policy metadata
  policyName: varchar("policyName", { length: 255 }).notNull(),
  description: text("description"),

  // Target
  targetType: varchar("targetType", { length: 50 }).notNull(),
  targetName: varchar("targetName", { length: 255 }),

  // Rotation schedule
  rotationIntervalDays: integer("rotationIntervalDays").notNull(),
  rotationIntervalHours: integer("rotationIntervalHours"),
  daysBeforeExpiry: integer("daysBeforeExpiry"),

  // Overlap window
  overlapWindowDays: integer("overlapWindowDays").default(7),

  // Execution
  autoRotate: boolean("autoRotate").default(true),
  requireApproval: boolean("requireApproval").default(false),
  notifyBefore: integer("notifyBefore"),

  // Status
  isActive: boolean("isActive").default(true),

  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotationPolicy = typeof keyRotationPolicies.$inferSelect;
export type InsertKeyRotationPolicy = typeof keyRotationPolicies.$inferInsert;

export const keyRotationSchedules = pgTable("key_rotation_schedules", {
  id: serial("id").primaryKey(),

  // References
  policyId: integer("policyId").notNull(),
  rotationId: integer("rotationId"),

  // Schedule
  scheduledAt: timestamp("scheduledAt").notNull(),
  reason: varchar("reason", { length: 255 }),

  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(),

  // Metadata
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type KeyRotationSchedule = typeof keyRotationSchedules.$inferSelect;
export type InsertKeyRotationSchedule = typeof keyRotationSchedules.$inferInsert;
