/**
 * HR Lifecycle Tables — Onboarding, Offboarding, Knowledge Transfer, Exit Interviews
 *
 * Workflow-driven lifecycle cases with auto-generated task sets.
 * OnboardingCase → tasks (doc collection, provisioning, orientation)
 * OffboardingCase → tasks (knowledge transfer, exit interview, access removal)
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  json,
  pgTable,
  index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";
import { hrPositions, hrOrgUnits } from "./hr-organization";
import { hrCandidates, hrOffers } from "./hr-recruiting";

// ============================================================================
// HR Onboarding Cases — Structured onboarding workflows
// ============================================================================

export const hrOnboardingCases = pgTable("hr_onboarding_cases", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").references(() => hrWorkerProfiles.id),
  candidateId: integer("candidate_id").references(() => hrCandidates.id),
  offerId: integer("offer_id").references(() => hrOffers.id),
  positionId: integer("position_id").references(() => hrPositions.id),
  orgUnitId: integer("org_unit_id").references(() => hrOrgUnits.id),
  managerWorkerId: integer("manager_worker_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | in_progress | completed | cancelled
  plannedStartDate: date("planned_start_date"),
  actualStartDate: date("actual_start_date"),
  completedAt: timestamp("completed_at"),
  totalTasks: integer("total_tasks").default(0).notNull(),
  completedTasks: integer("completed_tasks").default(0).notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_onboard_worker_idx").on(table.workerId),
  statusIdx: index("hr_onboard_status_idx").on(table.status),
  candidateIdx: index("hr_onboard_candidate_idx").on(table.candidateId),
}));

export type HrOnboardingCase = typeof hrOnboardingCases.$inferSelect;
export type InsertHrOnboardingCase = typeof hrOnboardingCases.$inferInsert;

// ============================================================================
// HR Onboarding Tasks — Individual tasks within an onboarding case
// ============================================================================

export const hrOnboardingTasks = pgTable("hr_onboarding_tasks", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => hrOnboardingCases.id),
  category: varchar("category", { length: 50 }).notNull(), // document_collection | equipment_setup | access_provisioning | orientation | training | introduction | compliance
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => hrWorkerProfiles.id),
  assigneeRole: varchar("assignee_role", { length: 50 }), // hr | manager | it | employee | buddy
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | in_progress | completed | skipped | blocked
  priority: varchar("priority", { length: 20 }).default("normal"), // low | normal | high | critical
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  caseIdx: index("hr_onboard_task_case_idx").on(table.caseId),
  statusIdx: index("hr_onboard_task_status_idx").on(table.status),
  categoryIdx: index("hr_onboard_task_cat_idx").on(table.category),
  assigneeIdx: index("hr_onboard_task_assignee_idx").on(table.assigneeId),
}));

export type HrOnboardingTask = typeof hrOnboardingTasks.$inferSelect;
export type InsertHrOnboardingTask = typeof hrOnboardingTasks.$inferInsert;

// ============================================================================
// HR Offboarding Cases — Structured offboarding workflows
// ============================================================================

export const hrOffboardingCases = pgTable("hr_offboarding_cases", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  reason: varchar("reason", { length: 50 }).notNull(), // resignation | termination | retirement | contract_end | mutual_agreement
  status: varchar("status", { length: 30 }).default("initiated").notNull(), // initiated | in_progress | completed | cancelled
  lastWorkingDate: date("last_working_date"),
  noticeDate: date("notice_date"),
  completedAt: timestamp("completed_at"),
  totalTasks: integer("total_tasks").default(0).notNull(),
  completedTasks: integer("completed_tasks").default(0).notNull(),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_offboard_worker_idx").on(table.workerId),
  statusIdx: index("hr_offboard_status_idx").on(table.status),
}));

export type HrOffboardingCase = typeof hrOffboardingCases.$inferSelect;
export type InsertHrOffboardingCase = typeof hrOffboardingCases.$inferInsert;

// ============================================================================
// HR Offboarding Tasks — Individual tasks within an offboarding case
// ============================================================================

export const hrOffboardingTasks = pgTable("hr_offboarding_tasks", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => hrOffboardingCases.id),
  category: varchar("category", { length: 50 }).notNull(), // knowledge_transfer | exit_interview | access_removal | equipment_return | final_pay | documentation | notification
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => hrWorkerProfiles.id),
  assigneeRole: varchar("assignee_role", { length: 50 }), // hr | manager | it | employee | finance
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | in_progress | completed | skipped | blocked
  priority: varchar("priority", { length: 20 }).default("normal"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by"),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  caseIdx: index("hr_offboard_task_case_idx").on(table.caseId),
  statusIdx: index("hr_offboard_task_status_idx").on(table.status),
  categoryIdx: index("hr_offboard_task_cat_idx").on(table.category),
}));

export type HrOffboardingTask = typeof hrOffboardingTasks.$inferSelect;
export type InsertHrOffboardingTask = typeof hrOffboardingTasks.$inferInsert;

// ============================================================================
// HR Knowledge Transfer Items — Items to transfer during offboarding
// ============================================================================

export const hrKnowledgeTransferItems = pgTable("hr_knowledge_transfer_items", {
  id: serial("id").primaryKey(),
  offboardingCaseId: integer("offboarding_case_id").notNull().references(() => hrOffboardingCases.id),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  recipientWorkerId: integer("recipient_worker_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | in_progress | completed
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  caseIdx: index("hr_kt_case_idx").on(table.offboardingCaseId),
  recipientIdx: index("hr_kt_recipient_idx").on(table.recipientWorkerId),
}));

export type HrKnowledgeTransferItem = typeof hrKnowledgeTransferItems.$inferSelect;
export type InsertHrKnowledgeTransferItem = typeof hrKnowledgeTransferItems.$inferInsert;

// ============================================================================
// HR Exit Interviews — Exit interview records
// ============================================================================

export const hrExitInterviews = pgTable("hr_exit_interviews", {
  id: serial("id").primaryKey(),
  offboardingCaseId: integer("offboarding_case_id").notNull().references(() => hrOffboardingCases.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  interviewerId: integer("interviewer_id").references(() => hrWorkerProfiles.id),
  scheduledAt: timestamp("scheduled_at"),
  conductedAt: timestamp("conducted_at"),
  status: varchar("status", { length: 30 }).default("scheduled").notNull(), // scheduled | completed | cancelled | declined
  feedback: text("feedback"),
  overallSatisfaction: integer("overall_satisfaction"), // 1-5
  wouldRecommend: boolean("would_recommend"),
  primaryReason: varchar("primary_reason", { length: 200 }),
  confidential: boolean("confidential").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  caseIdx: index("hr_exit_int_case_idx").on(table.offboardingCaseId),
  workerIdx: index("hr_exit_int_worker_idx").on(table.workerId),
}));

export type HrExitInterview = typeof hrExitInterviews.$inferSelect;
export type InsertHrExitInterview = typeof hrExitInterviews.$inferInsert;

// ============================================================================
// HR Lifecycle Events — Audit-friendly state history
// ============================================================================

export const hrLifecycleEvents = pgTable("hr_lifecycle_events", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // recruitment_request | candidate | offer | onboarding_case | offboarding_case
  entityId: integer("entity_id").notNull(),
  event: varchar("event", { length: 100 }).notNull(), // status_change | created | updated | task_completed | etc.
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }),
  actorId: integer("actor_id"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("hr_lc_event_entity_idx").on(table.entityType, table.entityId),
  eventIdx: index("hr_lc_event_type_idx").on(table.event),
}));

export type HrLifecycleEvent = typeof hrLifecycleEvents.$inferSelect;
export type InsertHrLifecycleEvent = typeof hrLifecycleEvents.$inferInsert;
