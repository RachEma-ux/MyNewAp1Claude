/**
 * PMDB Tables — PM Central Module Database
 *
 * Dedicated PostgreSQL database for the PM Central RTLM. Owns all
 * canonical project-management records: projects, plans, milestones,
 * tasks, risks, issues, decisions, handoffs, activity log.
 *
 * Connected via server/pm-central/connection.ts using
 * DATABASE_URL_PMDB (or derived from DATABASE_URL).
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

// ══════════════════════════════════════════════════════════════════════════════
// pm_projects
// ══════════════════════════════════════════════════════════════════════════════

export const pmProjects = pgTable(
  "pm_projects",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    sourceModule: varchar("source_module", { length: 50 }),
    sourceRefId: integer("source_ref_id"),
    sourceHandoffId: integer("source_handoff_id"),
    name: varchar("name", { length: 500 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    ownerUserId: integer("owner_user_id"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("pm_projects_workspace_idx").on(table.workspaceId),
    statusIdx: index("pm_projects_status_idx").on(table.status),
    sourceIdx: index("pm_projects_source_idx").on(
      table.sourceModule,
      table.sourceRefId,
    ),
    ownerIdx: index("pm_projects_owner_idx").on(table.ownerUserId),
  }),
);

export type PmProject = typeof pmProjects.$inferSelect;
export type InsertPmProject = typeof pmProjects.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_plans
// ══════════════════════════════════════════════════════════════════════════════

export const pmPlans = pgTable(
  "pm_plans",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    planStatus: varchar("plan_status", { length: 20 })
      .notNull()
      .default("draft"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_plans_project_idx").on(table.pmProjectId),
    statusIdx: index("pm_plans_status_idx").on(table.planStatus),
  }),
);

export type PmPlan = typeof pmPlans.$inferSelect;
export type InsertPmPlan = typeof pmPlans.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_milestones
// ══════════════════════════════════════════════════════════════════════════════

export const pmMilestones = pgTable(
  "pm_milestones",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    dueDate: timestamp("due_date"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_milestones_project_idx").on(table.pmProjectId),
    statusIdx: index("pm_milestones_status_idx").on(table.status),
    dueIdx: index("pm_milestones_due_idx").on(table.dueDate),
  }),
);

export type PmMilestone = typeof pmMilestones.$inferSelect;
export type InsertPmMilestone = typeof pmMilestones.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_tasks
// ══════════════════════════════════════════════════════════════════════════════

export const pmTasks = pgTable(
  "pm_tasks",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    milestoneId: integer("milestone_id"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    assigneeUserId: integer("assignee_user_id"),
    status: varchar("status", { length: 20 }).notNull().default("todo"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    dueDate: timestamp("due_date"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_tasks_project_idx").on(table.pmProjectId),
    milestoneIdx: index("pm_tasks_milestone_idx").on(table.milestoneId),
    assigneeIdx: index("pm_tasks_assignee_idx").on(table.assigneeUserId),
    statusIdx: index("pm_tasks_status_idx").on(table.status),
  }),
);

export type PmTask = typeof pmTasks.$inferSelect;
export type InsertPmTask = typeof pmTasks.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_risks
// ══════════════════════════════════════════════════════════════════════════════

export const pmRisks = pgTable(
  "pm_risks",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 10 }).notNull().default("medium"),
    probability: varchar("probability", { length: 10 })
      .notNull()
      .default("medium"),
    mitigation: text("mitigation"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_risks_project_idx").on(table.pmProjectId),
    statusIdx: index("pm_risks_status_idx").on(table.status),
    severityIdx: index("pm_risks_severity_idx").on(table.severity),
  }),
);

export type PmRisk = typeof pmRisks.$inferSelect;
export type InsertPmRisk = typeof pmRisks.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_issues
// ══════════════════════════════════════════════════════════════════════════════

export const pmIssues = pgTable(
  "pm_issues",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 10 }).notNull().default("medium"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    ownerUserId: integer("owner_user_id"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_issues_project_idx").on(table.pmProjectId),
    statusIdx: index("pm_issues_status_idx").on(table.status),
    ownerIdx: index("pm_issues_owner_idx").on(table.ownerUserId),
  }),
);

export type PmIssue = typeof pmIssues.$inferSelect;
export type InsertPmIssue = typeof pmIssues.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_decisions
// ══════════════════════════════════════════════════════════════════════════════

export const pmDecisions = pgTable(
  "pm_decisions",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    decision: text("decision").notNull(),
    rationale: text("rationale"),
    decidedBy: integer("decided_by").notNull(),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_decisions_project_idx").on(table.pmProjectId),
    decidedAtIdx: index("pm_decisions_decided_idx").on(table.decidedAt),
  }),
);

export type PmDecision = typeof pmDecisions.$inferSelect;
export type InsertPmDecision = typeof pmDecisions.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_handoffs
// ══════════════════════════════════════════════════════════════════════════════

export const pmHandoffs = pgTable(
  "pm_handoffs",
  {
    id: serial("id").primaryKey(),
    handoffId: varchar("handoff_id", { length: 100 }),
    sourceModule: varchar("source_module", { length: 50 }).notNull(),
    sourceRefId: integer("source_ref_id"),
    targetPmProjectId: integer("target_pm_project_id"),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    payloadJson: json("payload_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("pm_handoffs_source_idx").on(
      table.sourceModule,
      table.sourceRefId,
    ),
    statusIdx: index("pm_handoffs_status_idx").on(table.status),
    targetIdx: index("pm_handoffs_target_idx").on(table.targetPmProjectId),
  }),
);

export type PmHandoff = typeof pmHandoffs.$inferSelect;
export type InsertPmHandoff = typeof pmHandoffs.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// pm_activity_log
// ══════════════════════════════════════════════════════════════════════════════

export const pmActivityLog = pgTable(
  "pm_activity_log",
  {
    id: serial("id").primaryKey(),
    pmProjectId: integer("pm_project_id"),
    actorUserId: integer("actor_user_id"),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    message: varchar("message", { length: 1000 }),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("pm_activity_project_idx").on(table.pmProjectId),
    eventIdx: index("pm_activity_event_idx").on(table.eventType),
    createdIdx: index("pm_activity_created_idx").on(table.createdAt),
  }),
);

export type PmActivity = typeof pmActivityLog.$inferSelect;
export type InsertPmActivity = typeof pmActivityLog.$inferInsert;
