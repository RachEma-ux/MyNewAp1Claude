import {
  integer,
  serial,
  varchar,
  pgTable,
  text,
  timestamp,
  json,
  index,
  boolean,
} from "drizzle-orm/pg-core";

// ============================================================================
// GraphRAG Control-Plane Tables
// ============================================================================

/**
 * graphrag_sources — registered module source adapters
 * Each row = one module dataset that can be indexed by GraphRAG.
 */
export const graphragSources = pgTable(
  "graphrag_sources",
  {
    id: serial("id").primaryKey(),
    moduleSlug: varchar("module_slug", { length: 100 }).notNull(),
    datasetKey: varchar("dataset_key", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    adapterType: varchar("adapter_type", { length: 100 }).notNull(),
    config: json("config").$type<Record<string, unknown>>(),
    enabled: boolean("enabled").default(true).notNull(),
    lastSyncCursor: text("last_sync_cursor"),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    moduleIdx: index("idx_graphrag_sources_module").on(table.moduleSlug),
    uniqueSource: index("idx_graphrag_sources_unique").on(
      table.moduleSlug,
      table.datasetKey
    ),
  })
);

export type GraphragSource = typeof graphragSources.$inferSelect;
export type InsertGraphragSource = typeof graphragSources.$inferInsert;

/**
 * graphrag_sync_runs — snapshot export runs from module adapters
 */
export const graphragSyncRuns = pgTable(
  "graphrag_sync_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => graphragSources.id),
    moduleSlug: varchar("module_slug", { length: 100 }).notNull(),
    datasetKey: varchar("dataset_key", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    documentCount: integer("document_count").default(0),
    snapshotPath: text("snapshot_path"),
    syncCursor: text("sync_cursor"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_graphrag_sync_runs_source").on(table.sourceId),
    moduleIdx: index("idx_graphrag_sync_runs_module").on(table.moduleSlug),
  })
);

export type GraphragSyncRun = typeof graphragSyncRuns.$inferSelect;
export type InsertGraphragSyncRun = typeof graphragSyncRuns.$inferInsert;

/**
 * graphrag_index_runs — GraphRAG indexing jobs
 */
export const graphragIndexRuns = pgTable(
  "graphrag_index_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => graphragSources.id),
    syncRunId: integer("sync_run_id").references(() => graphragSyncRuns.id),
    moduleSlug: varchar("module_slug", { length: 100 }).notNull(),
    datasetKey: varchar("dataset_key", { length: 100 }).notNull(),
    runKey: varchar("run_key", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    workspacePath: text("workspace_path"),
    artifactPath: text("artifact_path"),
    entityCount: integer("entity_count").default(0),
    relationshipCount: integer("relationship_count").default(0),
    communityCount: integer("community_count").default(0),
    tokenUsage: integer("token_usage").default(0),
    estimatedCost: varchar("estimated_cost", { length: 50 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_graphrag_index_runs_source").on(table.sourceId),
    moduleIdx: index("idx_graphrag_index_runs_module").on(table.moduleSlug),
    runKeyIdx: index("idx_graphrag_index_runs_key").on(table.runKey),
  })
);

export type GraphragIndexRun = typeof graphragIndexRuns.$inferSelect;
export type InsertGraphragIndexRun = typeof graphragIndexRuns.$inferInsert;

/**
 * graphrag_query_runs — query execution log
 */
export const graphragQueryRuns = pgTable(
  "graphrag_query_runs",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => graphragSources.id),
    indexRunId: integer("index_run_id").references(() => graphragIndexRuns.id),
    moduleSlug: varchar("module_slug", { length: 100 }).notNull(),
    datasetKey: varchar("dataset_key", { length: 100 }).notNull(),
    method: varchar("method", { length: 20 }).notNull(),
    question: text("question").notNull(),
    answer: text("answer"),
    context: json("context").$type<Record<string, unknown>>(),
    tokenUsage: integer("token_usage").default(0),
    latencyMs: integer("latency_ms"),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_graphrag_query_runs_source").on(table.sourceId),
    moduleIdx: index("idx_graphrag_query_runs_module").on(table.moduleSlug),
  })
);

export type GraphragQueryRun = typeof graphragQueryRuns.$inferSelect;
export type InsertGraphragQueryRun = typeof graphragQueryRuns.$inferInsert;

/**
 * graphrag_artifact_registry — output artifacts from index runs
 */
export const graphragArtifactRegistry = pgTable(
  "graphrag_artifact_registry",
  {
    id: serial("id").primaryKey(),
    indexRunId: integer("index_run_id")
      .notNull()
      .references(() => graphragIndexRuns.id),
    moduleSlug: varchar("module_slug", { length: 100 }).notNull(),
    datasetKey: varchar("dataset_key", { length: 100 }).notNull(),
    artifactType: varchar("artifact_type", { length: 50 }).notNull(),
    artifactPath: text("artifact_path").notNull(),
    recordCount: integer("record_count").default(0),
    sizeBytes: integer("size_bytes").default(0),
    version: varchar("version", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    indexRunIdx: index("idx_graphrag_artifacts_run").on(table.indexRunId),
    moduleIdx: index("idx_graphrag_artifacts_module").on(table.moduleSlug),
  })
);

export type GraphragArtifact = typeof graphragArtifactRegistry.$inferSelect;
export type InsertGraphragArtifact = typeof graphragArtifactRegistry.$inferInsert;
