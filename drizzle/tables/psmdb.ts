/**
 * PSMDB Tables — Problem Solving Methods Database
 *
 * Dedicated PostgreSQL database, separate from the main app DB.
 * All tables prefixed with `psm_` to avoid collision.
 */

import {
  serial,
  varchar,
  pgTable,
  text,
  integer,
  timestamp,
  json,
  boolean,
  numeric,
  index,
} from "drizzle-orm/pg-core";

// ══════════════════════════════════════════════════════════════════════════════
// Group 1 — Catalog / Taxonomy
// ══════════════════════════════════════════════════════════════════════════════

export const psmCategories = pgTable(
  "psm_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("idx_psm_categories_slug").on(table.slug),
  }),
);

export const psmMethods = pgTable(
  "psm_methods",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id"),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    summary: text("summary"),
    complexity: varchar("complexity", { length: 20 }).default("medium"),
    timeframe: varchar("timeframe", { length: 20 }).default("medium"),
    participantsMin: integer("participants_min").default(1),
    participantsMax: integer("participants_max").default(10),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    version: integer("version").default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("idx_psm_methods_slug").on(table.slug),
    categoryIdx: index("idx_psm_methods_category").on(table.categoryId),
    statusIdx: index("idx_psm_methods_status").on(table.status),
  }),
);

export const psmMethodAliases = pgTable(
  "psm_method_aliases",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    alias: varchar("alias", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_method_aliases_method").on(table.methodId),
  }),
);

export const psmMethodRelations = pgTable(
  "psm_method_relations",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    relatedMethodId: integer("related_method_id").notNull(),
    relationType: varchar("relation_type", { length: 30 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_method_relations_method").on(table.methodId),
  }),
);

export const psmMethodTags = pgTable(
  "psm_method_tags",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_method_tags_method").on(table.methodId),
    tagIdx: index("idx_psm_method_tags_tag").on(table.tag),
  }),
);

// ══════════════════════════════════════════════════════════════════════════════
// Group 2 — Content
// ══════════════════════════════════════════════════════════════════════════════

export const psmMethodDefinitions = pgTable(
  "psm_method_definitions",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    version: integer("version").default(1),
    definition: text("definition"),
    bestFor: text("best_for"),
    tools: text("tools"),
    example: text("example"),
    sourceReference: text("source_reference"),
    contentStatus: varchar("content_status", { length: 20 }).default("draft"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_method_defs_method").on(table.methodId),
    statusIdx: index("idx_psm_method_defs_status").on(table.contentStatus),
  }),
);

export const psmMethodWorkflows = pgTable(
  "psm_method_workflows",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    version: integer("version").default(1),
    title: varchar("title", { length: 255 }),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_method_workflows_method").on(table.methodId),
  }),
);

export const psmMethodWorkflowSteps = pgTable(
  "psm_method_workflow_steps",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id").notNull(),
    stepNumber: integer("step_number").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").default(30),
    deliverable: text("deliverable"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowIdx: index("idx_psm_wf_steps_workflow").on(table.workflowId),
  }),
);

// ══════════════════════════════════════════════════════════════════════════════
// Group 3 — Selector / Recommendation
// ══════════════════════════════════════════════════════════════════════════════

export const psmProblemTypes = pgTable(
  "psm_problem_types",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("idx_psm_problem_types_slug").on(table.slug),
  }),
);

export const psmMethodFitRules = pgTable(
  "psm_method_fit_rules",
  {
    id: serial("id").primaryKey(),
    methodId: integer("method_id").notNull(),
    problemTypeId: integer("problem_type_id"),
    dimension: varchar("dimension", { length: 50 }).notNull(),
    weight: numeric("weight", { precision: 5, scale: 2 }).default("1.00"),
    minScore: numeric("min_score", { precision: 5, scale: 2 }),
    maxScore: numeric("max_score", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    methodIdx: index("idx_psm_fit_rules_method").on(table.methodId),
  }),
);

export const psmSelectorProfiles = pgTable(
  "psm_selector_profiles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    dimensions: json("dimensions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// Group 4 — Execution / Case Tracking
// ══════════════════════════════════════════════════════════════════════════════

export const psmCases = pgTable(
  "psm_cases",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    problemTypeId: integer("problem_type_id"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    ownerUserId: integer("owner_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    statusIdx: index("idx_psm_cases_status").on(table.status),
    ownerIdx: index("idx_psm_cases_owner").on(table.ownerUserId),
  }),
);

export const psmCaseInputs = pgTable(
  "psm_case_inputs",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    dimension: varchar("dimension", { length: 50 }).notNull(),
    score: numeric("score", { precision: 5, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_inputs_case").on(table.caseId),
  }),
);

export const psmCaseRecommendations = pgTable(
  "psm_case_recommendations",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    methodId: integer("method_id").notNull(),
    score: numeric("score", { precision: 7, scale: 2 }),
    rank: integer("rank"),
    explanation: text("explanation"),
    aiContributed: boolean("ai_contributed").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_recs_case").on(table.caseId),
  }),
);

export const psmCaseSelectedMethods = pgTable(
  "psm_case_selected_methods",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    methodId: integer("method_id").notNull(),
    reason: text("reason"),
    selectedAt: timestamp("selected_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_sel_methods_case").on(table.caseId),
  }),
);

export const psmCaseRuns = pgTable(
  "psm_case_runs",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    methodId: integer("method_id").notNull(),
    workflowId: integer("workflow_id"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    currentStep: integer("current_step").default(1),
    summary: text("summary"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_runs_case").on(table.caseId),
    statusIdx: index("idx_psm_case_runs_status").on(table.status),
  }),
);

export const psmCaseStepRuns = pgTable(
  "psm_case_step_runs",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    stepNumber: integer("step_number").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    notes: text("notes"),
    output: json("output"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runIdx: index("idx_psm_case_step_runs_run").on(table.runId),
  }),
);

export const psmCaseNotes = pgTable(
  "psm_case_notes",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    runId: integer("run_id"),
    authorUserId: integer("author_user_id"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_notes_case").on(table.caseId),
  }),
);

export const psmCaseDecisionLog = pgTable(
  "psm_case_decision_log",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    decision: text("decision"),
    rationale: text("rationale"),
    alternatives: json("alternatives"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("idx_psm_case_decision_log_case").on(table.caseId),
  }),
);

// ══════════════════════════════════════════════════════════════════════════════
// Group 5 — Content Admin / Lifecycle
// ══════════════════════════════════════════════════════════════════════════════

export const psmContentPacks = pgTable(
  "psm_content_packs",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    version: integer("version").default(1),
    description: text("description"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    itemCount: integer("item_count").default(0),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
    rolledBackAt: timestamp("rolled_back_at"),
  },
  (table) => ({
    statusIdx: index("idx_psm_content_packs_status").on(table.status),
  }),
);

export const psmContentPackItems = pgTable(
  "psm_content_pack_items",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull(),
    methodId: integer("method_id"),
    action: varchar("action", { length: 20 }).notNull().default("add"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    packIdx: index("idx_psm_content_pack_items_pack").on(table.packId),
  }),
);

export const psmImportRuns = pgTable(
  "psm_import_runs",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    issueCount: integer("issue_count").default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    packIdx: index("idx_psm_import_runs_pack").on(table.packId),
  }),
);

export const psmImportIssues = pgTable(
  "psm_import_issues",
  {
    id: serial("id").primaryKey(),
    importRunId: integer("import_run_id").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("info"),
    field: varchar("field", { length: 100 }),
    message: text("message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    importIdx: index("idx_psm_import_issues_import").on(table.importRunId),
  }),
);

export const psmPublishLog = pgTable(
  "psm_publish_log",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    actorUserId: integer("actor_user_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    packIdx: index("idx_psm_publish_log_pack").on(table.packId),
  }),
);

// ══════════════════════════════════════════════════════════════════════════════
// Group 6 — Audit / Operations
// ══════════════════════════════════════════════════════════════════════════════

export const psmAuditEvents = pgTable(
  "psm_audit_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: integer("entity_id"),
    actorUserId: integer("actor_user_id"),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index("idx_psm_audit_events_type").on(table.eventType),
    entityIdx: index("idx_psm_audit_events_entity").on(table.entityType, table.entityId),
  }),
);

export const psmHealthSnapshots = pgTable(
  "psm_health_snapshots",
  {
    id: serial("id").primaryKey(),
    methodCount: integer("method_count").default(0),
    caseCount: integer("case_count").default(0),
    activeRunCount: integer("active_run_count").default(0),
    lastImportAt: timestamp("last_import_at"),
    snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
