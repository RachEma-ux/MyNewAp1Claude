/**
 * RagDB Tables — Dedicated RAG Knowledge Graph Database
 *
 * 3-table model for entities, relationships, and build runs.
 * All tables prefixed with `kgra_` to avoid collision if co-located.
 * Entities reference documents in the main DB by sourceDocId (not a FK — cross-DB).
 */

import {
  serial,
  varchar,
  pgTable,
  text,
  integer,
  timestamp,
  json,
  index,
} from "drizzle-orm/pg-core";

// ── Table 1: Entities ──────────────────────────────────────────────────────

export const kgraEntities = pgTable(
  "kgra_entities",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    shortName: varchar("short_name", { length: 500 }),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    mentions: integer("mentions").default(1).notNull(),
    directory: varchar("directory", { length: 500 }),
    sourceDocId: integer("source_doc_id"),
    buildId: varchar("build_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index("idx_kgra_entities_name").on(table.name),
    typeIdx: index("idx_kgra_entities_type").on(table.entityType),
    buildIdx: index("idx_kgra_entities_build").on(table.buildId),
  })
);

export type KgraEntity = typeof kgraEntities.$inferSelect;
export type InsertKgraEntity = typeof kgraEntities.$inferInsert;

// ── Table 2: Relationships ─────────────────────────────────────────────────

export const kgraRelationships = pgTable(
  "kgra_relationships",
  {
    id: serial("id").primaryKey(),
    sourceEntityId: integer("source_entity_id").notNull(),
    targetEntityId: integer("target_entity_id").notNull(),
    relationshipType: varchar("relationship_type", { length: 50 }).notNull(),
    weight: integer("weight").default(1).notNull(),
    buildId: varchar("build_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_kgra_rels_source").on(table.sourceEntityId),
    targetIdx: index("idx_kgra_rels_target").on(table.targetEntityId),
    typeIdx: index("idx_kgra_rels_type").on(table.relationshipType),
    buildIdx: index("idx_kgra_rels_build").on(table.buildId),
  })
);

export type KgraRelationship = typeof kgraRelationships.$inferSelect;
export type InsertKgraRelationship = typeof kgraRelationships.$inferInsert;

// ── Table 3: Build Runs ────────────────────────────────────────────────────

export const kgraBuildRuns = pgTable("kgra_build_runs", {
  id: serial("id").primaryKey(),
  buildId: varchar("build_id", { length: 100 }).notNull().unique(),
  entityCount: integer("entity_count").default(0).notNull(),
  relationshipCount: integer("relationship_count").default(0).notNull(),
  chunkCount: integer("chunk_count").default(0).notNull(),
  typeCounts: json("type_counts").$type<Record<string, number>>(),
  status: varchar("status", { length: 50 }).default("completed").notNull(),
  builtAt: timestamp("built_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgraBuildRun = typeof kgraBuildRuns.$inferSelect;
export type InsertKgraBuildRun = typeof kgraBuildRuns.$inferInsert;

// ── Table 4: Manual Nodes (user-designed) ──────────────────────────────────

export const kgraManualNodes = pgTable(
  "kgra_manual_nodes",
  {
    id: serial("id").primaryKey(),
    uniqueId: varchar("unique_id", { length: 255 }).unique(),
    name: text("name").notNull(),
    shortName: varchar("short_name", { length: 500 }),
    family: varchar("family", { length: 50 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),
    description: text("description"),
    properties: json("properties").$type<Record<string, unknown>>().default({}),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    appliedTemplateId: integer("applied_template_id"),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueIdx: index("idx_kgra_mn_unique_id").on(table.uniqueId),
    familyIdx: index("idx_kgra_mn_family").on(table.family),
    kindIdx: index("idx_kgra_mn_kind").on(table.kind),
    statusIdx: index("idx_kgra_mn_status").on(table.status),
  })
);

export type KgraManualNode = typeof kgraManualNodes.$inferSelect;
export type InsertKgraManualNode = typeof kgraManualNodes.$inferInsert;

// ── Table 5: Manual Edges (user-designed) ──────────────────────────────────

export const kgraManualEdges = pgTable(
  "kgra_manual_edges",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    sourceNodeId: integer("source_node_id").notNull(),
    targetNodeId: integer("target_node_id").notNull(),
    sourceIsAuto: varchar("source_is_auto", { length: 5 }).default("false").notNull(),
    targetIsAuto: varchar("target_is_auto", { length: 5 }).default("false").notNull(),
    relationshipType: varchar("relationship_type", { length: 50 }).notNull(),
    relationshipCategory: varchar("relationship_category", { length: 30 }),
    weight: integer("weight").default(1).notNull(),
    confidence: varchar("confidence", { length: 10 }),
    provenance: varchar("provenance", { length: 255 }),
    linkStrength: varchar("link_strength", { length: 10 }).default("hard").notNull(),
    description: text("description"),
    properties: json("properties").$type<Record<string, unknown>>().default({}),
    rules: json("rules").$type<Record<string, string>>(),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    appliedTemplateId: integer("applied_template_id"),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_kgra_me_source").on(table.sourceNodeId),
    targetIdx: index("idx_kgra_me_target").on(table.targetNodeId),
    statusIdx: index("idx_kgra_me_status").on(table.status),
    categoryIdx: index("idx_kgra_me_category").on(table.relationshipCategory),
  })
);

export type KgraManualEdge = typeof kgraManualEdges.$inferSelect;
export type InsertKgraManualEdge = typeof kgraManualEdges.$inferInsert;
