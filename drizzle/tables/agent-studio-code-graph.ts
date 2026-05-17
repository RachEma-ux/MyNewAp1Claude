/**
 * Agent Studio Native Graph Workspace — Code Intelligence Graph tables.
 *
 * T-G.2.3 ASDB persistence layer for the code-graph subsystem.
 * Postgres is the source of truth per CLAUDE.md "Postgres = source
 * of truth; Neo4j CE = projected backend"; the T-G.2.4 projection
 * reads from these tables and writes the derived facts to Neo4j
 * via GraphRepository.
 *
 * Three tables:
 *   - ags_code_graph_ingestions — one row per parser-run.
 *     Operator-visible audit trail; the read-side (T-G.2.5 lens
 *     runner) keys queries by `ingestion_id`.
 *   - ags_code_graph_nodes — parsed nodes per ingestion. Composite
 *     unique on (ingestion_id, node_id) for upsert idempotency.
 *   - ags_code_graph_edges — parsed edges per ingestion. Composite
 *     unique on (ingestion_id, edge_id).
 *
 * Idempotent re-ingest: when a re-parse produces the same
 * `(ingestion_id, node_id)` / `(ingestion_id, edge_id)` rows, the
 * upsert path (ON CONFLICT DO UPDATE) overwrites with the latest
 * properties + endLine. Same shape as the spike's run-sample-ingest
 * idempotency expectation.
 *
 * Reference: docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md §T-G.2
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Ingestion runs
// ============================================================================

export const agsCodeGraphIngestions = pgTable(
  "ags_code_graph_ingestions",
  {
    id: serial("id").primaryKey(),
    /**
     * Stable string id chosen by the orchestrator. Typically of the
     * form `${repositoryId}::${ISO-timestamp}`. Re-ingest of the
     * same logical run reuses the id so the upsert is idempotent.
     */
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    repositoryId: varchar("repository_id", { length: 255 }).notNull(),
    /** "pending" → "writing" → "complete" | "failed". */
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    nodesUpserted: integer("nodes_upserted").default(0).notNull(),
    edgesUpserted: integer("edges_upserted").default(0).notNull(),
    edgesRejected: integer("edges_rejected").default(0).notNull(),
    parserErrorCount: integer("parser_error_count").default(0).notNull(),
    /** Free-form structured payload — operator-facing telemetry
     *  (per-reason rejection counts, parser-error file list). */
    metadata: json("metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    ingestionIdIdx: uniqueIndex("idx_ags_code_graph_ingestions_id").on(
      t.ingestionId,
    ),
    repositoryIdx: index("idx_ags_code_graph_ingestions_repo").on(
      t.repositoryId,
    ),
    statusIdx: index("idx_ags_code_graph_ingestions_status").on(t.status),
  }),
);

// ============================================================================
// Nodes
// ============================================================================

export const agsCodeGraphNodes = pgTable(
  "ags_code_graph_nodes",
  {
    id: serial("id").primaryKey(),
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    /** Stable id from the parser (`file:${filePath}`, `class:${filePath}::${name}`, etc.). */
    nodeId: varchar("node_id", { length: 512 }).notNull(),
    /** Closed-taxonomy node type from `CODE_GRAPH_NODE_TYPES`. */
    typeKey: varchar("type_key", { length: 50 }).notNull(),
    name: text("name").notNull(),
    filePath: text("file_path").notNull(),
    startLine: integer("start_line"),
    endLine: integer("end_line"),
    properties: json("properties").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Composite uniqueness is the idempotency anchor — upsert on
    // (ingestion_id, node_id) overwrites in-place on re-ingest.
    ingestionNodeUnique: uniqueIndex("uq_ags_code_graph_nodes_ingestion_node").on(
      t.ingestionId,
      t.nodeId,
    ),
    typeKeyIdx: index("idx_ags_code_graph_nodes_type").on(t.typeKey),
    filePathIdx: index("idx_ags_code_graph_nodes_file").on(t.filePath),
  }),
);

// ============================================================================
// Edges
// ============================================================================

export const agsCodeGraphEdges = pgTable(
  "ags_code_graph_edges",
  {
    id: serial("id").primaryKey(),
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    /** Stable id from the parser (`${fileId}::declares::${classId}`, etc.). */
    edgeId: varchar("edge_id", { length: 1024 }).notNull(),
    sourceNodeId: varchar("source_node_id", { length: 512 }).notNull(),
    /** Closed-taxonomy edge type from `CODE_GRAPH_EDGE_TYPES`. */
    edgeTypeKey: varchar("edge_type_key", { length: 50 }).notNull(),
    targetNodeId: varchar("target_node_id", { length: 512 }).notNull(),
    properties: json("properties").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    ingestionEdgeUnique: uniqueIndex("uq_ags_code_graph_edges_ingestion_edge").on(
      t.ingestionId,
      t.edgeId,
    ),
    typeKeyIdx: index("idx_ags_code_graph_edges_type").on(t.edgeTypeKey),
    sourceIdx: index("idx_ags_code_graph_edges_source").on(t.sourceNodeId),
    targetIdx: index("idx_ags_code_graph_edges_target").on(t.targetNodeId),
  }),
);
