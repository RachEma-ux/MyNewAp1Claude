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
