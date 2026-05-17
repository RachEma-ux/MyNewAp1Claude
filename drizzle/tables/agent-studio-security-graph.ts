/**
 * Agent Studio Native Graph Workspace — Security/DevSecOps Graph tables.
 *
 * T-G.3.3 ASDB persistence layer for the security-graph subsystem.
 * Same shape as the T-G.2 code-graph tables:
 *   - ags_security_graph_ingestions — one row per CVE-feed run /
 *     scanner run; operator-visible audit trail.
 *   - ags_security_graph_nodes — composite-unique on
 *     (ingestion_id, node_id) for idempotent re-ingest.
 *   - ags_security_graph_edges — composite-unique on
 *     (ingestion_id, edge_id).
 *
 * Postgres is the source of truth (CLAUDE.md). The T-G.3.4
 * projection reads from these tables and writes derived facts to
 * Neo4j via GraphRepository.
 *
 * Reference:
 *   docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md §T-G.3
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

export const agsSecurityGraphIngestions = pgTable(
  "ags_security_graph_ingestions",
  {
    id: serial("id").primaryKey(),
    /**
     * Stable string id chosen by the caller. Typically
     * `nvd::${ISO-timestamp}` or `${scanner-id}::${run-id}`.
     */
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    /** Identifies the feed: "nvd" / "ghsa" / scanner-id / etc. */
    sourceKey: varchar("source_key", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    nodesUpserted: integer("nodes_upserted").default(0).notNull(),
    edgesUpserted: integer("edges_upserted").default(0).notNull(),
    edgesRejected: integer("edges_rejected").default(0).notNull(),
    /** Per-reason rejection counts + parser/feed-error file list. */
    metadata: json("metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    ingestionIdIdx: uniqueIndex("idx_ags_security_graph_ingestions_id").on(
      t.ingestionId,
    ),
    sourceIdx: index("idx_ags_security_graph_ingestions_source").on(t.sourceKey),
    statusIdx: index("idx_ags_security_graph_ingestions_status").on(t.status),
  }),
);

// ============================================================================
// Nodes
// ============================================================================

export const agsSecurityGraphNodes = pgTable(
  "ags_security_graph_nodes",
  {
    id: serial("id").primaryKey(),
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    /** Stable id from the caller (`cve:CVE-2026-0001`, `package:npm:foo:1.2.3`, etc.). */
    nodeId: varchar("node_id", { length: 512 }).notNull(),
    /** Closed-taxonomy node type from `SECURITY_GRAPH_NODE_TYPES`. */
    typeKey: varchar("type_key", { length: 50 }).notNull(),
    name: text("name").notNull(),
    properties: json("properties").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    ingestionNodeUnique: uniqueIndex(
      "uq_ags_security_graph_nodes_ingestion_node",
    ).on(t.ingestionId, t.nodeId),
    typeKeyIdx: index("idx_ags_security_graph_nodes_type").on(t.typeKey),
  }),
);

// ============================================================================
// Edges
// ============================================================================

export const agsSecurityGraphEdges = pgTable(
  "ags_security_graph_edges",
  {
    id: serial("id").primaryKey(),
    ingestionId: varchar("ingestion_id", { length: 255 }).notNull(),
    edgeId: varchar("edge_id", { length: 1024 }).notNull(),
    sourceNodeId: varchar("source_node_id", { length: 512 }).notNull(),
    /** Closed-taxonomy edge type from `SECURITY_GRAPH_EDGE_TYPES`. */
    edgeTypeKey: varchar("edge_type_key", { length: 50 }).notNull(),
    targetNodeId: varchar("target_node_id", { length: 512 }).notNull(),
    properties: json("properties").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    ingestionEdgeUnique: uniqueIndex(
      "uq_ags_security_graph_edges_ingestion_edge",
    ).on(t.ingestionId, t.edgeId),
    typeKeyIdx: index("idx_ags_security_graph_edges_type").on(t.edgeTypeKey),
    sourceIdx: index("idx_ags_security_graph_edges_source").on(t.sourceNodeId),
    targetIdx: index("idx_ags_security_graph_edges_target").on(t.targetNodeId),
  }),
);
