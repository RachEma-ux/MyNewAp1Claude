/**
 * Agent Studio Native Graph Workspace — Graph Quality + Self-Correction Loop.
 *
 * Phase 22 / 23 tables. ASDB-resident.
 *
 * ADRs:
 *   - agent-studio-native-graph-workspace-user-feedback.md
 *   - agent-studio-runtime-graph-retention-policy.md
 */

import {
  index,
  integer,
  json,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

// ============================================================================
// Graph quality metrics + findings
// ============================================================================

export const agsGraphQualityMetrics = pgTable(
  "ags_graph_quality_metrics",
  {
    id: serial("id").primaryKey(),
    metricKey: varchar("metric_key", { length: 100 }).notNull(),
    metricValue: numeric("metric_value", { precision: 12, scale: 4 }).notNull(),
    scope: varchar("scope", { length: 100 }),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: index("idx_ags_graph_quality_metrics_key").on(t.metricKey),
  }),
);

export const agsGraphQualityScans = pgTable(
  "ags_graph_quality_scans",
  {
    id: serial("id").primaryKey(),
    scanKind: varchar("scan_kind", { length: 100 }).notNull(),
    scope: varchar("scope", { length: 100 }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    findingsCount: integer("findings_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphQualityFindings = pgTable(
  "ags_graph_quality_findings",
  {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id").notNull().references(() => agsGraphQualityScans.id),
    findingClass: varchar("finding_class", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 50 }).notNull(),
    sourceTypeKey: varchar("source_type_key", { length: 100 }),
    sourceId: text("source_id"),
    details: json("details").$type<Record<string, unknown>>(),
    proposalId: integer("proposal_id"),
    // Per-finding lifecycle:
    //   open       — initial state after the scanner emits the finding.
    //   triaged    — operator (or auto-agent) converted it to a proposal.
    //   applied    — mutation worker successfully applied the linked
    //                proposal.
    //   dismissed  — operator marked it not-applicable without
    //                creating a proposal.
    status: varchar("status", { length: 50 }).notNull().default("open"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    scanIdx: index("idx_ags_graph_quality_findings_scan").on(t.scanId),
    classIdx: index("idx_ags_graph_quality_findings_class").on(t.findingClass),
  }),
);

export const agsGraphQualityAgentRuns = pgTable(
  "ags_graph_quality_agent_runs",
  {
    id: serial("id").primaryKey(),
    agentKey: varchar("agent_key", { length: 100 }).notNull().default("graph_quality_agent"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    proposalsCreated: integer("proposals_created").default(0),
    status: varchar("status", { length: 50 }).notNull().default("running"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Semantic enrichment proposals
// ============================================================================

export const agsSemanticEnrichmentRuns = pgTable(
  "ags_semantic_enrichment_runs",
  {
    id: serial("id").primaryKey(),
    agentKey: varchar("agent_key", { length: 100 }).notNull().default("semantic_enrichment_agent"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    proposalsCreated: integer("proposals_created").default(0),
    status: varchar("status", { length: 50 }).notNull().default("running"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsSemanticEnrichmentProposals = pgTable(
  "ags_semantic_enrichment_proposals",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").references(() => agsSemanticEnrichmentRuns.id),
    proposalKind: varchar("proposal_kind", { length: 100 }).notNull(),
    targetTypeKey: varchar("target_type_key", { length: 100 }),
    targetId: integer("target_id"),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    sourceEvidence: json("source_evidence").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsSemanticEnrichmentDecisions = pgTable(
  "ags_semantic_enrichment_decisions",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsSemanticEnrichmentProposals.id),
    decision: varchar("decision", { length: 50 }).notNull(),
    decidedByUserId: integer("decided_by_user_id"),
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Graph correction proposals
// ============================================================================

export const agsGraphCorrectionProposals = pgTable(
  "ags_graph_correction_proposals",
  {
    id: serial("id").primaryKey(),
    proposalKind: varchar("proposal_kind", { length: 100 }).notNull(),
    targetTypeKey: varchar("target_type_key", { length: 100 }),
    targetId: integer("target_id"),
    proposedChange: json("proposed_change").$type<Record<string, unknown>>().notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    rationale: text("rationale"),
    proposedByUserId: integer("proposed_by_user_id"),
    proposedByAgentId: integer("proposed_by_agent_id"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphCorrectionDecisions = pgTable(
  "ags_graph_correction_decisions",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsGraphCorrectionProposals.id),
    decision: varchar("decision", { length: 50 }).notNull(),
    decidedByUserId: integer("decided_by_user_id"),
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

export const agsGraphCorrectionAuditEvents = pgTable(
  "ags_graph_correction_audit_events",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsGraphCorrectionProposals.id),
    eventKind: varchar("event_kind", { length: 100 }).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Workspace ops + feedback
// ============================================================================

export const agsWorkspaceBackgroundJobs = pgTable(
  "ags_workspace_background_jobs",
  {
    id: serial("id").primaryKey(),
    jobKind: varchar("job_kind", { length: 100 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

/**
 * Per-status metadata for background jobs. Closes slice 28 of the
 * no-deferral continuation catalogue (2026-05-19). Replaces the
 * inline `TERMINAL_BACKGROUND_JOB_STATUSES` set with a row-per-status
 * lookup that the service reseeds at boot.
 *
 * The terminal / retryable / severity fields are referenced by the
 * sweeper + operator UI rollup; carrying them in the table lets
 * operators retune behavior (e.g. mark a custom status as
 * retryable=false) without code changes.
 */
export const agsBackgroundJobStatusMetadata = pgTable(
  "ags_background_job_status_metadata",
  {
    status: varchar("status", { length: 50 }).primaryKey(),
    terminal: boolean("terminal").notNull(),
    retryable: boolean("retryable").notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const agsWorkspaceUserNotifications = pgTable(
  "ags_workspace_user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    notificationKind: varchar("notification_kind", { length: 100 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsWorkspaceErrorEvents = pgTable(
  "ags_workspace_error_events",
  {
    id: serial("id").primaryKey(),
    sourceKind: varchar("source_kind", { length: 100 }).notNull(),
    sourceId: text("source_id"),
    userId: integer("user_id"),
    errorClass: varchar("error_class", { length: 100 }).notNull(),
    errorMessage: text("error_message").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Golden questions / evaluation
// ============================================================================

export const agsGoldenQuestionSuites = pgTable(
  "ags_golden_question_suites",
  {
    id: serial("id").primaryKey(),
    suiteKey: varchar("suite_key", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGoldenQuestions = pgTable(
  "ags_golden_questions",
  {
    id: serial("id").primaryKey(),
    suiteId: integer("suite_id").notNull().references(() => agsGoldenQuestionSuites.id),
    questionKey: varchar("question_key", { length: 100 }).notNull(),
    question: text("question").notNull(),
    expectedAnswerPattern: text("expected_answer_pattern"),
    expectedPaths: json("expected_paths").$type<Record<string, unknown>>(),
    minimumCitationCount: integer("minimum_citation_count").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGoldenQuestionRuns = pgTable(
  "ags_golden_question_runs",
  {
    id: serial("id").primaryKey(),
    suiteId: integer("suite_id").notNull().references(() => agsGoldenQuestionSuites.id),
    runtimeRunId: integer("runtime_run_id"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    passedCount: integer("passed_count").default(0),
    failedCount: integer("failed_count").default(0),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGoldenQuestionResults = pgTable(
  "ags_golden_question_results",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => agsGoldenQuestionRuns.id),
    questionId: integer("question_id").notNull().references(() => agsGoldenQuestions.id),
    actualAnswer: text("actual_answer"),
    citationCount: integer("citation_count"),
    matchedExpectedPattern: boolean("matched_expected_pattern"),
    passed: boolean("passed").notNull(),
    failureReason: text("failure_reason"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
