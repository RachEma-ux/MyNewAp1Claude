import { integer, serial, varchar, pgTable, text, timestamp, boolean, json, uniqueIndex, index } from "drizzle-orm/pg-core";

// ============================================================================
// Catalog Management
// ============================================================================

export const catalogEntries = pgTable("catalog_entries", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  description: text("description"),

  // Type: provider or model
  entryType: varchar("entryType", { length: 50 }).notNull(),

  // Taxonomy classification
  category: varchar("category", { length: 100 }),
  subCategory: varchar("subCategory", { length: 100 }),
  capabilities: json("capabilities").$type<string[]>(),

  // Scope
  scope: varchar("scope", { length: 50 }).default("app").notNull(),

  // Status
  status: varchar("status", { length: 50 }).default("draft").notNull(),

  // Authority
  origin: varchar("origin", { length: 50 }).default("admin").notNull(),
  reviewState: varchar("reviewState", { length: 50 }).default("approved").notNull(),
  approvedBy: integer("approvedBy"),
  approvedAt: timestamp("approvedAt"),

  // Provider reference
  providerId: integer("providerId"),

  // Configuration blob
  config: json("config").$type<Record<string, unknown>>(),

  // Tags
  tags: json("tags").$type<string[]>(),

  // Validation state
  lastValidatedAt: timestamp("lastValidatedAt"),
  validationStatus: varchar("validationStatus", { length: 50 }),
  validationErrors: json("validationErrors").$type<string[]>(),

  // Metadata
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_catalog_entry_name").on(table.name),
  entryTypeIdx: index("idx_catalog_entry_type").on(table.entryType),
  statusIdx: index("idx_catalog_entry_status").on(table.status),
  scopeIdx: index("idx_catalog_entry_scope").on(table.scope),
}));

export type CatalogEntry = typeof catalogEntries.$inferSelect;
export type InsertCatalogEntry = typeof catalogEntries.$inferInsert;

export const catalogEntryVersions = pgTable("catalog_entry_versions", {
  id: serial("id").primaryKey(),
  catalogEntryId: integer("catalogEntryId").notNull(),

  // Version number
  version: integer("version").notNull(),

  // Frozen config snapshot
  config: json("config").notNull(),
  configHash: varchar("configHash", { length: 64 }).notNull(),

  // Change tracking
  changeNotes: text("changeNotes"),
  changedBy: integer("changedBy").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  entryIdx: index("idx_catalog_version_entry").on(table.catalogEntryId),
  uniqueVersion: uniqueIndex("unique_catalog_entry_version").on(table.catalogEntryId, table.version),
}));

export type CatalogEntryVersion = typeof catalogEntryVersions.$inferSelect;
export type InsertCatalogEntryVersion = typeof catalogEntryVersions.$inferInsert;

export const publishBundles = pgTable("publish_bundles", {
  id: serial("id").primaryKey(),
  catalogEntryId: integer("catalogEntryId").notNull(),

  // Version label
  versionLabel: varchar("versionLabel", { length: 50 }).notNull(),

  // Immutable frozen snapshot
  snapshot: json("snapshot").notNull(),
  snapshotHash: varchar("snapshotHash", { length: 64 }).notNull(),

  // Publishing metadata
  status: varchar("status", { length: 50 }).default("active").notNull(),
  publishedBy: integer("publishedBy").notNull(),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),

  // Policy gate results
  policyDecision: varchar("policyDecision", { length: 50 }),
  policyViolations: json("policyViolations"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  entryIdx: index("idx_publish_bundle_entry").on(table.catalogEntryId),
  statusIdx: index("idx_publish_bundle_status").on(table.status),
  uniqueLabel: uniqueIndex("unique_publish_version").on(table.catalogEntryId, table.versionLabel),
}));

export type PublishBundle = typeof publishBundles.$inferSelect;
export type InsertPublishBundle = typeof publishBundles.$inferInsert;

export const catalogAuditEvents = pgTable("catalog_audit_events", {
  id: serial("id").primaryKey(),

  // Event classification
  eventType: varchar("eventType", { length: 100 }).notNull(),

  // References
  catalogEntryId: integer("catalogEntryId"),
  publishBundleId: integer("publishBundleId"),

  // Actor
  actor: integer("actor"),
  actorType: varchar("actorType", { length: 50 }).default("user"),

  // Event payload
  payload: json("payload").notNull(),

  // Timestamps
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  eventTypeIdx: index("idx_catalog_audit_type").on(table.eventType),
  entryIdx: index("idx_catalog_audit_entry").on(table.catalogEntryId),
  timestampIdx: index("idx_catalog_audit_timestamp").on(table.timestamp),
}));

export type CatalogAuditEvent = typeof catalogAuditEvents.$inferSelect;
export type InsertCatalogAuditEvent = typeof catalogAuditEvents.$inferInsert;

// ============================================================================
// Taxonomy
// ============================================================================

export const taxonomyNodes = pgTable("taxonomy_nodes", {
  id: serial("id").primaryKey(),
  parentId: integer("parentId").references((): any => taxonomyNodes.id),
  entryType: varchar("entryType", { length: 50 }).notNull(),
  level: varchar("level", { length: 20 }).notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sortOrder").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  uniqueKey: uniqueIndex("idx_taxonomy_node_unique").on(table.entryType, table.parentId, table.key),
  typeLevelIdx: index("idx_taxonomy_type_level").on(table.entryType, table.level),
  parentIdx: index("idx_taxonomy_parent").on(table.parentId),
}));

export type TaxonomyNode = typeof taxonomyNodes.$inferSelect;
export type InsertTaxonomyNode = typeof taxonomyNodes.$inferInsert;

export const taxonomyInferenceRules = pgTable("taxonomy_inference_rules", {
  id: serial("id").primaryKey(),
  sourceNodeId: integer("sourceNodeId").references(() => taxonomyNodes.id).notNull(),
  suggestedNodeId: integer("suggestedNodeId").references(() => taxonomyNodes.id).notNull(),
  confidence: varchar("confidence", { length: 10 }).default("medium"),
  description: text("description"),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaxonomyInferenceRule = typeof taxonomyInferenceRules.$inferSelect;
export type InsertTaxonomyInferenceRule = typeof taxonomyInferenceRules.$inferInsert;

export const catalogEntryClassifications = pgTable("catalog_entry_classifications", {
  id: serial("id").primaryKey(),
  catalogEntryId: integer("catalogEntryId").references(() => catalogEntries.id).notNull(),
  taxonomyNodeId: integer("taxonomyNodeId").references(() => taxonomyNodes.id).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uniqueClassification: uniqueIndex("idx_classification_unique").on(table.catalogEntryId, table.taxonomyNodeId),
  entryIdx: index("idx_classification_entry").on(table.catalogEntryId),
  nodeIdx: index("idx_classification_node").on(table.taxonomyNodeId),
}));

export type CatalogEntryClassification = typeof catalogEntryClassifications.$inferSelect;
export type InsertCatalogEntryClassification = typeof catalogEntryClassifications.$inferInsert;

// ============================================================================
// Catalog Import & Discovery System
// ============================================================================

export const importSessions = pgTable("import_sessions", {
  id: text("id").primaryKey(),
  userId: integer("userId").notNull(),
  method: varchar("method", { length: 50 }).notNull(),
  sourceRef: text("sourceRef").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  version: integer("version").default(1).notNull(),
  summary: json("summary"),
  error: text("error"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_import_session_status").on(table.status),
  expiresIdx: index("idx_import_session_expires").on(table.expiresAt),
}));

export type ImportSessionDB = typeof importSessions.$inferSelect;
export type InsertImportSession = typeof importSessions.$inferInsert;

export const importPreviewRows = pgTable("import_preview_rows", {
  id: serial("id").primaryKey(),
  sessionId: text("sessionId").notNull(),
  tempId: text("tempId").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 100 }).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  duplicateStatus: varchar("duplicateStatus", { length: 50 }).default("new").notNull(),
  riskLevel: varchar("riskLevel", { length: 20 }).default("low").notNull(),
  validationIssues: json("validationIssues").$type<Array<{ field: string; message: string; severity: string }>>(),
}, (table) => ({
  sessionIdx: index("idx_import_preview_session").on(table.sessionId),
}));

export type ImportPreviewRowDB = typeof importPreviewRows.$inferSelect;
export type InsertImportPreviewRow = typeof importPreviewRows.$inferInsert;

export const importAuditLogs = pgTable("import_audit_logs", {
  id: serial("id").primaryKey(),
  sessionId: text("sessionId"),
  userId: integer("userId"),
  method: varchar("method", { length: 50 }),
  sourceRef: text("sourceRef"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  previewCount: integer("previewCount").default(0),
  selectedCount: integer("selectedCount").default(0),
  createdCount: integer("createdCount").default(0),
  skippedCount: integer("skippedCount").default(0),
  conflictOverrides: integer("conflictOverrides").default(0),
  highRiskCount: integer("highRiskCount").default(0),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
}, (table) => ({
  sessionIdx: index("idx_import_audit_session").on(table.sessionId),
  timestampIdx: index("idx_import_audit_timestamp").on(table.timestamp),
}));

export type ImportAuditLog = typeof importAuditLogs.$inferSelect;
export type InsertImportAuditLog = typeof importAuditLogs.$inferInsert;
