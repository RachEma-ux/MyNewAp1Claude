/**
 * Agent Studio Native Graph Workspace — GraphRAG retrieval tables.
 *
 * Phase 12 tables. ASDB-resident.
 * Registers as a new RetrievalPlanItem source type in existing RAC planner.
 *
 * ADRs:
 *   - agent-studio-graphrag-retrieval-router.md
 *   - agent-studio-text2cypher-query-guardrails.md
 */

import {
  boolean,
  index,
  integer,
  json,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const agsRetrievalRuns = pgTable(
  "ags_retrieval_runs",
  {
    id: serial("id").primaryKey(),
    retrievalMode: varchar("retrieval_mode", { length: 100 }).notNull(),
    initiatingRuntimeRunId: integer("initiating_runtime_run_id"),
    initiatingUserId: integer("initiating_user_id"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 50 }).notNull().default("running"),
  },
  (t) => ({
    modeIdx: index("idx_ags_retrieval_runs_mode").on(t.retrievalMode),
    statusIdx: index("idx_ags_retrieval_runs_status").on(t.status),
  }),
);

export const agsRetrievalQueries = pgTable(
  "ags_retrieval_queries",
  {
    id: serial("id").primaryKey(),
    retrievalRunId: integer("retrieval_run_id").notNull().references(() => agsRetrievalRuns.id),
    queryText: text("query_text").notNull(),
    queryIntent: varchar("query_intent", { length: 100 }),
    retrievalStrategies: json("retrieval_strategies").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsRetrievalResults = pgTable(
  "ags_retrieval_results",
  {
    id: serial("id").primaryKey(),
    retrievalRunId: integer("retrieval_run_id").notNull().references(() => agsRetrievalRuns.id),
    sourceKind: varchar("source_kind", { length: 50 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    rankScore: numeric("rank_score", { precision: 5, scale: 4 }),
    permissionStatus: varchar("permission_status", { length: 50 }).notNull().default("visible"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsRetrievalContextBlocks = pgTable(
  "ags_retrieval_context_blocks",
  {
    id: serial("id").primaryKey(),
    retrievalRunId: integer("retrieval_run_id").notNull().references(() => agsRetrievalRuns.id),
    blockKind: varchar("block_kind", { length: 50 }).notNull(),
    blockPayload: json("block_payload").$type<Record<string, unknown>>().notNull(),
    citationCount: integer("citation_count").notNull().default(0),
    safetyFiltered: boolean("safety_filtered").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsRetrievalCitations = pgTable(
  "ags_retrieval_citations",
  {
    id: serial("id").primaryKey(),
    contextBlockId: integer("context_block_id").notNull().references(() => agsRetrievalContextBlocks.id),
    sourceKind: varchar("source_kind", { length: 50 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    sourceLocator: text("source_locator"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsRetrievalSafetyEvents = pgTable(
  "ags_retrieval_safety_events",
  {
    id: serial("id").primaryKey(),
    retrievalRunId: integer("retrieval_run_id").notNull().references(() => agsRetrievalRuns.id),
    eventKind: varchar("event_kind", { length: 100 }).notNull(),
    reason: text("reason"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsText2cypherRuns = pgTable(
  "ags_text2cypher_runs",
  {
    id: serial("id").primaryKey(),
    retrievalRunId: integer("retrieval_run_id").references(() => agsRetrievalRuns.id),
    userQuery: text("user_query").notNull(),
    generatedCypher: text("generated_cypher").notNull(),
    validationResult: varchar("validation_result", { length: 50 }).notNull(),
    rejectionReason: text("rejection_reason"),
    executed: boolean("executed").notNull().default(false),
    resultCount: integer("result_count"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphAlgorithmRuns = pgTable(
  "ags_graph_algorithm_runs",
  {
    id: serial("id").primaryKey(),
    algorithmKey: varchar("algorithm_key", { length: 100 }).notNull(),
    parameters: json("parameters").$type<Record<string, unknown>>().notNull(),
    retrievalRunId: integer("retrieval_run_id").references(() => agsRetrievalRuns.id),
    userId: integer("user_id"),
    durationMs: integer("duration_ms"),
    resultCount: integer("result_count"),
    status: varchar("status", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
