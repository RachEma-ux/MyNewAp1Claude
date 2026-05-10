/**
 * Agent Studio Native Graph Workspace — Projection sync + migration tables.
 *
 * Phase 0.5 / Phase 1.7 enabling tables. ASDB-resident.
 *
 * ADRs:
 *   - agent-studio-graph-projection-sync.md
 *   - agent-studio-existing-data-migration-projection-plan.md
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

// ============================================================================
// Migration jobs (one-shot existing-data → projection)
// ============================================================================

export const agsMigrationJobs = pgTable(
  "ags_migration_jobs",
  {
    id: serial("id").primaryKey(),
    migrationKey: varchar("migration_key", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    totalItems: integer("total_items").default(0),
    processedItems: integer("processed_items").default(0),
    failedItems: integer("failed_items").default(0),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const agsMigrationJobItems = pgTable(
  "ags_migration_job_items",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => agsMigrationJobs.id),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    targetNeo4jNodeId: text("target_neo4j_node_id"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    jobIdx: index("idx_ags_migration_job_items_job").on(t.jobId),
    sourceIdx: index("idx_ags_migration_job_items_source").on(t.sourceType, t.sourceId),
  }),
);

export const agsMigrationProjectionResults = pgTable(
  "ags_migration_projection_results",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => agsMigrationJobs.id),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceCount: integer("source_count").notNull(),
    projectedCount: integer("projected_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    snapshotId: text("snapshot_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsMigrationAuditEvents = pgTable(
  "ags_migration_audit_events",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => agsMigrationJobs.id),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    sourceType: varchar("source_type", { length: 100 }),
    sourceId: text("source_id"),
    message: text("message"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Projection sync (ongoing)
// ============================================================================

export const agsGraphProjectionSyncJobs = pgTable(
  "ags_graph_projection_sync_jobs",
  {
    id: serial("id").primaryKey(),
    projectionKey: varchar("projection_key", { length: 100 }).notNull(),
    triggerEvent: varchar("trigger_event", { length: 100 }).notNull(),
    triggerPayload: json("trigger_payload").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    retryCount: integer("retry_count").default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_ags_graph_projection_sync_jobs_status").on(t.status),
    projectionIdx: index("idx_ags_graph_projection_sync_jobs_projection").on(t.projectionKey),
  }),
);

export const agsGraphProjectionSyncResults = pgTable(
  "ags_graph_projection_sync_results",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => agsGraphProjectionSyncJobs.id),
    nodesCreated: integer("nodes_created").default(0),
    nodesUpdated: integer("nodes_updated").default(0),
    nodesDeleted: integer("nodes_deleted").default(0),
    edgesCreated: integer("edges_created").default(0),
    edgesUpdated: integer("edges_updated").default(0),
    edgesDeleted: integer("edges_deleted").default(0),
    durationMs: integer("duration_ms").notNull(),
    snapshotId: text("snapshot_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphProjectionSyncErrors = pgTable(
  "ags_graph_projection_sync_errors",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => agsGraphProjectionSyncJobs.id),
    errorClass: varchar("error_class", { length: 100 }).notNull(),
    errorMessage: text("error_message").notNull(),
    errorPayload: json("error_payload").$type<Record<string, unknown>>(),
    retryable: boolean("retryable").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphProjectionDriftEvents = pgTable(
  "ags_graph_projection_drift_events",
  {
    id: serial("id").primaryKey(),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    projectionKey: varchar("projection_key", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    driftClass: varchar("drift_class", { length: 100 }).notNull(),
    sourceVersionId: text("source_version_id"),
    neo4jVersionId: text("neo4j_version_id"),
    remediation: varchar("remediation", { length: 100 }),
    remediatedAt: timestamp("remediated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphProjectionSnapshots = pgTable(
  "ags_graph_projection_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotKey: varchar("snapshot_key", { length: 100 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull(),
    takenAt: timestamp("taken_at").defaultNow().notNull(),
    nodeCount: integer("node_count").notNull(),
    edgeCount: integer("edge_count").notNull(),
    storageUri: text("storage_uri"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphProjectionRebuilds = pgTable(
  "ags_graph_projection_rebuilds",
  {
    id: serial("id").primaryKey(),
    trigger: varchar("trigger", { length: 100 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    summary: json("summary").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
