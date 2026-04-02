/**
 * PRMDB Tables — Problem Resolution Methods Database
 *
 * 20-table model for case management, methods, actions, evidence,
 * verification, learning, assessment, and integration control.
 * All tables prefixed with `prm_` to avoid collision if co-located.
 *
 * PRMDB is a dedicated PostgreSQL database, separate from the main app DB.
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
// Group 1 — Core Case Management
// ══════════════════════════════════════════════════════════════════════════════

export const prmCases = pgTable(
  "prm_cases",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 30 }),
    priority: varchar("priority", { length: 30 }),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    sourceType: varchar("source_type", { length: 50 }),
    ownerUserId: integer("owner_user_id"),
    reporterUserId: integer("reporter_user_id"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    impactStatement: text("impact_statement"),
    scope: text("scope"),
    closureReason: text("closure_reason"),
    reopenReason: text("reopen_reason"),
    extProjectId: integer("ext_project_id"),
    extPmWorkId: integer("ext_pm_work_id"),
    extWorkspaceId: integer("ext_workspace_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    reopenedAt: timestamp("reopened_at"),
  },
  (table) => ({
    statusIdx: index("prm_cases_status_idx").on(table.status),
    severityIdx: index("prm_cases_severity_idx").on(table.severity),
    ownerIdx: index("prm_cases_owner_idx").on(table.ownerUserId),
  })
);

export type PrmCase = typeof prmCases.$inferSelect;
export type InsertPrmCase = typeof prmCases.$inferInsert;

export const prmCaseEvents = pgTable(
  "prm_case_events",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    fromStatus: varchar("from_status", { length: 30 }),
    toStatus: varchar("to_status", { length: 30 }),
    actorUserId: integer("actor_user_id"),
    reason: text("reason"),
    metadata: json("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_case_events_case_idx").on(table.caseId),
  })
);

export type PrmCaseEvent = typeof prmCaseEvents.$inferSelect;
export type InsertPrmCaseEvent = typeof prmCaseEvents.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Group 2 — Methods and Analysis
// ══════════════════════════════════════════════════════════════════════════════

export const prmMethodTemplates = pgTable(
  "prm_method_templates",
  {
    id: serial("id").primaryKey(),
    methodType: varchar("method_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }),
    description: text("description"),
    templateData: json("template_data").$type<Record<string, any>>(),
    category: varchar("category", { length: 50 }),
    isSystem: boolean("is_system").default(true),
    published: boolean("published").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    methodTypeIdx: index("prm_method_templates_type_idx").on(table.methodType),
  })
);

export type PrmMethodTemplate = typeof prmMethodTemplates.$inferSelect;
export type InsertPrmMethodTemplate = typeof prmMethodTemplates.$inferInsert;

export const prmMethodRuns = pgTable(
  "prm_method_runs",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    templateId: integer("template_id"),
    methodType: varchar("method_type", { length: 50 }).notNull(),
    workspaceData: json("workspace_data").$type<Record<string, any>>(),
    narrativeSummary: text("narrative_summary"),
    status: varchar("status", { length: 30 }).default("in_progress"),
    startedBy: integer("started_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    caseIdx: index("prm_method_runs_case_idx").on(table.caseId),
    typeIdx: index("prm_method_runs_type_idx").on(table.methodType),
  })
);

export type PrmMethodRun = typeof prmMethodRuns.$inferSelect;
export type InsertPrmMethodRun = typeof prmMethodRuns.$inferInsert;

export const prmDecisions = pgTable(
  "prm_decisions",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    chosenPath: text("chosen_path"),
    rationale: text("rationale").notNull(),
    alternatives: json("alternatives").$type<any[]>(),
    constraints: json("constraints").$type<any[]>(),
    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_decisions_case_idx").on(table.caseId),
  })
);

export type PrmDecision = typeof prmDecisions.$inferSelect;
export type InsertPrmDecision = typeof prmDecisions.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Group 3 — Execution and Closure
// ══════════════════════════════════════════════════════════════════════════════

export const prmActions = pgTable(
  "prm_actions",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    actionType: varchar("action_type", { length: 30 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    ownerUserId: integer("owner_user_id"),
    dueDate: timestamp("due_date"),
    status: varchar("status", { length: 30 }).default("pending"),
    dependencyNote: text("dependency_note"),
    effectivenessResult: text("effectiveness_result"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_actions_case_idx").on(table.caseId),
    statusIdx: index("prm_actions_status_idx").on(table.status),
  })
);

export type PrmAction = typeof prmActions.$inferSelect;
export type InsertPrmAction = typeof prmActions.$inferInsert;

export const prmEvidence = pgTable(
  "prm_evidence",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    evidenceType: varchar("evidence_type", { length: 30 }),
    title: varchar("title", { length: 255 }),
    fileUrl: text("file_url"),
    externalUrl: text("external_url"),
    notes: text("notes"),
    isValidated: boolean("is_validated").default(false),
    validatedBy: integer("validated_by"),
    validatedAt: timestamp("validated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_evidence_case_idx").on(table.caseId),
  })
);

export type PrmEvidence = typeof prmEvidence.$inferSelect;
export type InsertPrmEvidence = typeof prmEvidence.$inferInsert;

export const prmVerifications = pgTable(
  "prm_verifications",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    testCondition: text("test_condition").notNull(),
    expectedResult: text("expected_result").notNull(),
    actualResult: text("actual_result"),
    passed: boolean("passed"),
    approverUserId: integer("approver_user_id"),
    signedOffAt: timestamp("signed_off_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_verifications_case_idx").on(table.caseId),
  })
);

export type PrmVerification = typeof prmVerifications.$inferSelect;
export type InsertPrmVerification = typeof prmVerifications.$inferInsert;

export const prmPreventionPlans = pgTable(
  "prm_prevention_plans",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    controlChange: text("control_change"),
    sopUpdate: text("sop_update"),
    trainingNeed: text("training_need"),
    monitoringRule: text("monitoring_rule"),
    status: varchar("status", { length: 30 }).default("draft"),
    ownerUserId: integer("owner_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_prevention_plans_case_idx").on(table.caseId),
  })
);

export type PrmPreventionPlan = typeof prmPreventionPlans.$inferSelect;
export type InsertPrmPreventionPlan = typeof prmPreventionPlans.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Group 4 — Learning and Reuse
// ══════════════════════════════════════════════════════════════════════════════

export const prmLessons = pgTable(
  "prm_lessons",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id"),
    title: varchar("title", { length: 255 }).notNull(),
    whatHappened: text("what_happened"),
    whyItMattered: text("why_it_mattered"),
    whatChanged: text("what_changed"),
    reuseNotes: text("reuse_notes"),
    published: boolean("published").default(false),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_lessons_case_idx").on(table.caseId),
  })
);

export type PrmLesson = typeof prmLessons.$inferSelect;
export type InsertPrmLesson = typeof prmLessons.$inferInsert;

export const prmPlaybooks = pgTable(
  "prm_playbooks",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    domain: varchar("domain", { length: 50 }),
    methodType: varchar("method_type", { length: 50 }),
    templateData: json("template_data").$type<Record<string, any>>(),
    sourceLessonId: integer("source_lesson_id"),
    published: boolean("published").default(false),
    publishedAt: timestamp("published_at"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    domainIdx: index("prm_playbooks_domain_idx").on(table.domain),
  })
);

export type PrmPlaybook = typeof prmPlaybooks.$inferSelect;
export type InsertPrmPlaybook = typeof prmPlaybooks.$inferInsert;

export const prmCatalogItems = pgTable(
  "prm_catalog_items",
  {
    id: serial("id").primaryKey(),
    itemType: varchar("item_type", { length: 30 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    contentData: json("content_data").$type<Record<string, any>>(),
    sourceId: integer("source_id"),
    sourceType: varchar("source_type", { length: 30 }),
    publicationState: varchar("publication_state", { length: 30 }).default("draft"),
    reviewedBy: integer("reviewed_by"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("prm_catalog_items_type_idx").on(table.itemType),
    stateIdx: index("prm_catalog_items_state_idx").on(table.publicationState),
  })
);

export type PrmCatalogItem = typeof prmCatalogItems.$inferSelect;
export type InsertPrmCatalogItem = typeof prmCatalogItems.$inferInsert;

export const prmTrainingAssets = pgTable(
  "prm_training_assets",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    moduleNumber: integer("module_number"),
    contentData: json("content_data").$type<Record<string, any>>(),
    assetType: varchar("asset_type", { length: 30 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

export type PrmTrainingAsset = typeof prmTrainingAssets.$inferSelect;
export type InsertPrmTrainingAsset = typeof prmTrainingAssets.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Group 5 — Assessment and Analytics
// ══════════════════════════════════════════════════════════════════════════════

export const prmMaturityRuns = pgTable(
  "prm_maturity_runs",
  {
    id: serial("id").primaryKey(),
    runDate: timestamp("run_date").defaultNow().notNull(),
    assessorUserId: integer("assessor_user_id"),
    dimensionScores: json("dimension_scores").$type<Record<string, number>>(),
    totalScore: integer("total_score"),
    maturityLevel: integer("maturity_level"),
    gapNotes: text("gap_notes"),
    nextActions: text("next_actions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

export type PrmMaturityRun = typeof prmMaturityRuns.$inferSelect;
export type InsertPrmMaturityRun = typeof prmMaturityRuns.$inferInsert;

export const prmKpiSnapshots = pgTable(
  "prm_kpi_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    openCases: integer("open_cases"),
    overdueActions: integer("overdue_actions"),
    meanTimeToResolution: numeric("mean_time_to_resolution"),
    recurrenceRate: numeric("recurrence_rate"),
    verificationRate: numeric("verification_rate"),
    methodUsage: json("method_usage").$type<Record<string, number>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

export type PrmKpiSnapshot = typeof prmKpiSnapshots.$inferSelect;
export type InsertPrmKpiSnapshot = typeof prmKpiSnapshots.$inferInsert;

export const prmReportingJobs = pgTable(
  "prm_reporting_jobs",
  {
    id: serial("id").primaryKey(),
    jobType: varchar("job_type", { length: 50 }),
    parameters: json("parameters").$type<Record<string, any>>(),
    resultData: json("result_data").$type<Record<string, any>>(),
    status: varchar("status", { length: 30 }).default("pending"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("prm_reporting_jobs_status_idx").on(table.status),
  })
);

export type PrmReportingJob = typeof prmReportingJobs.$inferSelect;
export type InsertPrmReportingJob = typeof prmReportingJobs.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Group 6 — Integration Control
// ══════════════════════════════════════════════════════════════════════════════

export const prmExternalRefs = pgTable(
  "prm_external_refs",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id").notNull(),
    targetModule: varchar("target_module", { length: 30 }).notNull(),
    targetId: integer("target_id").notNull(),
    refType: varchar("ref_type", { length: 30 }),
    label: varchar("label", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_external_refs_case_idx").on(table.caseId),
    targetIdx: index("prm_external_refs_target_idx").on(table.targetModule, table.targetId),
  })
);

export type PrmExternalRef = typeof prmExternalRefs.$inferSelect;
export type InsertPrmExternalRef = typeof prmExternalRefs.$inferInsert;

export const prmSyncEvents = pgTable(
  "prm_sync_events",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id"),
    direction: varchar("direction", { length: 10 }),
    targetModule: varchar("target_module", { length: 30 }),
    eventType: varchar("event_type", { length: 50 }),
    payload: json("payload").$type<Record<string, any>>(),
    status: varchar("status", { length: 30 }).default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("prm_sync_events_case_idx").on(table.caseId),
  })
);

export type PrmSyncEvent = typeof prmSyncEvents.$inferSelect;
export type InsertPrmSyncEvent = typeof prmSyncEvents.$inferInsert;

export const prmPublicationStates = pgTable(
  "prm_publication_states",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 30 }),
    entityId: integer("entity_id"),
    state: varchar("state", { length: 30 }),
    reviewerUserId: integer("reviewer_user_id"),
    reviewNotes: text("review_notes"),
    stateChangedAt: timestamp("state_changed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index("prm_pub_states_entity_idx").on(table.entityType, table.entityId),
  })
);

export type PrmPublicationState = typeof prmPublicationStates.$inferSelect;
export type InsertPrmPublicationState = typeof prmPublicationStates.$inferInsert;
