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

// ── Table 6: Templates ─────────────────────────────────────────────────────

export const kgraTemplates = pgTable("kgra_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 20 }),
  description: text("description"),
  purpose: text("purpose"),
  isDefault: varchar("is_default", { length: 5 }).default("false").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  designPrinciples: json("design_principles").$type<string[]>(),
  overlays: json("overlays").$type<string[]>(),
  visualizationRules: json("visualization_rules").$type<string[]>(),
  qualityGuards: json("quality_guards").$type<string[]>(),
  portabilityProfiles: json("portability_profiles").$type<string[]>(),
  maturityLevels: json("maturity_levels").$type<Record<string, unknown>>(),
  exampleQueries: json("example_queries").$type<string[]>(),
  createdBy: varchar("created_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KgraTemplate = typeof kgraTemplates.$inferSelect;
export type InsertKgraTemplate = typeof kgraTemplates.$inferInsert;

// ── Table 7: Template Nodes ─────────────────────────────────────────────────

export const kgraTemplateNodes = pgTable(
  "kgra_template_nodes",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull(),
    uniqueId: varchar("unique_id", { length: 255 }),
    name: text("name").notNull(),
    shortName: varchar("short_name", { length: 500 }),
    family: varchar("family", { length: 50 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),
    description: text("description"),
    properties: json("properties").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    templateIdx: index("idx_kgra_tn_template").on(table.templateId),
  })
);

export type KgraTemplateNode = typeof kgraTemplateNodes.$inferSelect;
export type InsertKgraTemplateNode = typeof kgraTemplateNodes.$inferInsert;

// ── Table 8: Template Edges ─────────────────────────────────────────────────

export const kgraTemplateEdges = pgTable(
  "kgra_template_edges",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    sourceNodeId: integer("source_node_id").notNull(),
    targetNodeId: integer("target_node_id").notNull(),
    relationshipType: varchar("relationship_type", { length: 50 }).notNull(),
    relationshipCategory: varchar("relationship_category", { length: 30 }),
    weight: integer("weight").default(1).notNull(),
    linkStrength: varchar("link_strength", { length: 10 }).default("hard").notNull(),
    description: text("description"),
    properties: json("properties").$type<Record<string, unknown>>().default({}),
    rules: json("rules").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    templateIdx: index("idx_kgra_te_template").on(table.templateId),
  })
);

export type KgraTemplateEdge = typeof kgraTemplateEdges.$inferSelect;
export type InsertKgraTemplateEdge = typeof kgraTemplateEdges.$inferInsert;

// ── Table 9: Applied Templates ──────────────────────────────────────────────

export const kgraAppliedTemplates = pgTable("kgra_applied_templates", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  appliedBy: varchar("applied_by", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
});

export type KgraAppliedTemplate = typeof kgraAppliedTemplates.$inferSelect;

// ── Table 10: Modes ─────────────────────────────────────────────────────────

export const kgraModes = pgTable(
  "kgra_modes",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id"),
    modeId: varchar("mode_id", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    persona: varchar("persona", { length: 255 }),
    primaryQuestion: text("primary_question"),
    includes: json("includes").$type<Record<string, unknown>>().notNull(),
    emphasisRules: json("emphasis_rules").$type<Record<string, unknown>[]>(),
    defaultViewLayout: varchar("default_view_layout", { length: 30 }),
    exampleUseCase: text("example_use_case"),
    isDefault: varchar("is_default", { length: 5 }).default("false").notNull(),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    templateIdx: index("idx_kgra_modes_template").on(table.templateId),
    modeIdIdx: index("idx_kgra_modes_mode_id").on(table.modeId),
  })
);

export type KgraMode = typeof kgraModes.$inferSelect;

// ── Table 11: Mode Compositions ─────────────────────────────────────────────

export const kgraModeCompositions = pgTable("kgra_mode_compositions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  modeIds: json("mode_ids").$type<string[]>().notNull(),
  mergeStrategy: varchar("merge_strategy", { length: 30 }).default("union").notNull(),
  conflictResolution: varchar("conflict_resolution", { length: 50 }),
  zoomLevel: varchar("zoom_level", { length: 30 }),
  createdBy: varchar("created_by", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgraModeComposition = typeof kgraModeCompositions.$inferSelect;
