/**
 * Agent Studio Native Graph Workspace — Graph Skill Packs + Cypher templates.
 *
 * Phase 12.5 tables. ASDB-resident.
 *
 * ADRs:
 *   - agent-studio-graph-skill-packs.md
 *   - agent-studio-cypher-query-template-system.md
 */

import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// Graph Skill Packs
// ============================================================================

export const agsGraphSkillPacks = pgTable(
  "ags_graph_skill_packs",
  {
    id: serial("id").primaryKey(),
    skillKey: varchar("skill_key", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    domain: varchar("domain", { length: 100 }),
    supportedNodeTypeKeys: json("supported_node_type_keys").$type<string[]>(),
    supportedEdgeTypeKeys: json("supported_edge_type_keys").$type<string[]>(),
    riskLevel: varchar("risk_level", { length: 50 }).notNull().default("low"),
    approvalRequired: boolean("approval_required").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const agsGraphSkillPackVersions = pgTable(
  "ags_graph_skill_pack_versions",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull().references(() => agsGraphSkillPacks.id),
    version: varchar("version", { length: 50 }).notNull(),
    manifest: json("manifest").$type<Record<string, unknown>>().notNull(),
    changelog: text("changelog"),
    sourceNoteVersionId: integer("source_note_version_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueVersion: uniqueIndex("idx_ags_graph_skill_pack_versions_unique").on(t.packId, t.version),
  }),
);

export const agsGraphSkillQueryTemplates = pgTable(
  "ags_graph_skill_query_templates",
  {
    id: serial("id").primaryKey(),
    packVersionId: integer("pack_version_id").notNull().references(() => agsGraphSkillPackVersions.id),
    templateId: integer("template_id").notNull(),
    ordering: integer("ordering").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphSkillEvaluationCases = pgTable(
  "ags_graph_skill_evaluation_cases",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull().references(() => agsGraphSkillPacks.id),
    caseKey: varchar("case_key", { length: 100 }).notNull(),
    question: text("question").notNull(),
    expectedAnswer: json("expected_answer").$type<Record<string, unknown>>(),
    expectedPaths: json("expected_paths").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueCase: uniqueIndex("idx_ags_graph_skill_evaluation_cases_unique").on(t.packId, t.caseKey),
  }),
);

export const agsGraphSkillSourceReferences = pgTable(
  "ags_graph_skill_source_references",
  {
    id: serial("id").primaryKey(),
    packVersionId: integer("pack_version_id").notNull().references(() => agsGraphSkillPackVersions.id),
    sourceNoteId: integer("source_note_id").notNull(),
    sourceNoteVersionId: integer("source_note_version_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    promptInclusionAllowed: boolean("prompt_inclusion_allowed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphSkillRuntimeUsages = pgTable(
  "ags_graph_skill_runtime_usages",
  {
    id: serial("id").primaryKey(),
    packVersionId: integer("pack_version_id").notNull().references(() => agsGraphSkillPackVersions.id),
    runtimeRunId: integer("runtime_run_id").notNull(),
    queryTemplateRunIds: json("query_template_run_ids").$type<number[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Cypher query templates (registry)
// ============================================================================

export const agsQueryTemplates = pgTable(
  "ags_query_templates",
  {
    id: serial("id").primaryKey(),
    templateKey: varchar("template_key", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    graphBackend: varchar("graph_backend", { length: 50 }).notNull(),
    queryLanguage: varchar("query_language", { length: 50 }).notNull(),
    cypherBody: text("cypher_body").notNull(),
    parameterSchema: json("parameter_schema").$type<Record<string, unknown>>().notNull(),
    permissionFilterRequired: boolean("permission_filter_required").notNull().default(true),
    maxDepth: integer("max_depth").notNull().default(3),
    maxResults: integer("max_results").notNull().default(1000),
    timeoutMs: integer("timeout_ms").notNull().default(5000),
    readOnly: boolean("read_only").notNull().default(true),
    riskLevel: varchar("risk_level", { length: 50 }).notNull().default("low"),
    allowedRoles: json("allowed_roles").$type<string[]>(),
    sourceSkillPackId: integer("source_skill_pack_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: index("idx_ags_query_templates_key").on(t.templateKey),
  }),
);

export const agsQueryTemplateVersions = pgTable(
  "ags_query_template_versions",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull().references(() => agsQueryTemplates.id),
    version: varchar("version", { length: 50 }).notNull(),
    cypherBody: text("cypher_body").notNull(),
    parameterSchema: json("parameter_schema").$type<Record<string, unknown>>().notNull(),
    changelog: text("changelog"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueVersion: uniqueIndex("idx_ags_query_template_versions_unique").on(t.templateId, t.version),
  }),
);

export const agsQueryTemplateRuns = pgTable(
  "ags_query_template_runs",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull().references(() => agsQueryTemplates.id),
    templateVersionId: integer("template_version_id").references(() => agsQueryTemplateVersions.id),
    retrievalRunId: integer("retrieval_run_id"),
    parameters: json("parameters").$type<Record<string, unknown>>().notNull(),
    userId: integer("user_id"),
    durationMs: integer("duration_ms"),
    resultCount: integer("result_count"),
    status: varchar("status", { length: 50 }).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
