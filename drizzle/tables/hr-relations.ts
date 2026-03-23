/**
 * HR Employee Relations Tables
 *
 * Policies, acknowledgements, grievances/complaints,
 * disciplinary actions, and workplace investigations.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  json, pgTable, index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";

// ============================================================================
// HR Policies — Published internal policies
// ============================================================================

export const hrPolicies = pgTable("hr_policies", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // conduct | safety | leave | compliance | data_privacy | anti_harassment | dress_code | remote_work
  content: text("content"),
  version: integer("version").default(1).notNull(),
  effectiveFrom: date("effective_from"),
  requiresAcknowledgement: boolean("requires_acknowledgement").default(false).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | published | archived | superseded
  publishedAt: timestamp("published_at"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_policy_status_idx").on(table.status),
  categoryIdx: index("hr_policy_category_idx").on(table.category),
}));

export type HrPolicy = typeof hrPolicies.$inferSelect;
export type InsertHrPolicy = typeof hrPolicies.$inferInsert;

// ============================================================================
// Policy Acknowledgements — Employee sign-off records
// ============================================================================

export const hrPolicyAcknowledgements = pgTable("hr_policy_acknowledgements", {
  id: serial("id").primaryKey(),
  policyId: integer("policy_id").notNull().references(() => hrPolicies.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | acknowledged | declined | expired
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  policyIdx: index("hr_policy_ack_policy_idx").on(table.policyId),
  workerIdx: index("hr_policy_ack_worker_idx").on(table.workerId),
  statusIdx: index("hr_policy_ack_status_idx").on(table.status),
}));

export type HrPolicyAcknowledgement = typeof hrPolicyAcknowledgements.$inferSelect;
export type InsertHrPolicyAcknowledgement = typeof hrPolicyAcknowledgements.$inferInsert;

// ============================================================================
// Grievances / Complaints — Employee-raised issues (sensitive)
// ============================================================================

export const hrGrievances = pgTable("hr_grievances", {
  id: serial("id").primaryKey(),
  filedByWorkerId: integer("filed_by_worker_id").notNull().references(() => hrWorkerProfiles.id),
  againstWorkerId: integer("against_worker_id").references(() => hrWorkerProfiles.id),
  category: varchar("category", { length: 100 }).notNull(), // harassment | discrimination | bullying | unfair_treatment | safety | policy_violation | other
  subject: varchar("subject", { length: 300 }).notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 30 }).default("medium").notNull(), // low | medium | high | critical
  isConfidential: boolean("is_confidential").default(true).notNull(),
  assignedToId: integer("assigned_to_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("filed").notNull(), // filed | under_review | investigating | resolved | dismissed | escalated | withdrawn
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  filedByIdx: index("hr_grievance_filed_by_idx").on(table.filedByWorkerId),
  statusIdx: index("hr_grievance_status_idx").on(table.status),
  severityIdx: index("hr_grievance_severity_idx").on(table.severity),
  assignedIdx: index("hr_grievance_assigned_idx").on(table.assignedToId),
}));

export type HrGrievance = typeof hrGrievances.$inferSelect;
export type InsertHrGrievance = typeof hrGrievances.$inferInsert;

// ============================================================================
// Disciplinary Actions — Formal corrective actions (sensitive)
// ============================================================================

export const hrDisciplinaryActions = pgTable("hr_disciplinary_actions", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  type: varchar("type", { length: 50 }).notNull(), // verbal_warning | written_warning | final_warning | suspension | termination | pip
  reason: text("reason").notNull(),
  description: text("description"),
  issuedByWorkerId: integer("issued_by_worker_id").references(() => hrWorkerProfiles.id),
  issuedAt: date("issued_at"),
  expiresAt: date("expires_at"),
  relatedGrievanceId: integer("related_grievance_id").references(() => hrGrievances.id),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | appealed | expired | overturned | completed
  appealNotes: text("appeal_notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_disciplinary_worker_idx").on(table.workerId),
  statusIdx: index("hr_disciplinary_status_idx").on(table.status),
  typeIdx: index("hr_disciplinary_type_idx").on(table.type),
}));

export type HrDisciplinaryAction = typeof hrDisciplinaryActions.$inferSelect;
export type InsertHrDisciplinaryAction = typeof hrDisciplinaryActions.$inferInsert;

// ============================================================================
// Workplace Investigations — Formal investigation cases (sensitive)
// ============================================================================

export const hrInvestigations = pgTable("hr_investigations", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // grievance_followup | misconduct | fraud | safety | policy_breach | other
  relatedGrievanceId: integer("related_grievance_id").references(() => hrGrievances.id),
  investigatorId: integer("investigator_id").references(() => hrWorkerProfiles.id),
  subjectWorkerId: integer("subject_worker_id").references(() => hrWorkerProfiles.id),
  isConfidential: boolean("is_confidential").default(true).notNull(),
  startedAt: date("started_at"),
  completedAt: date("completed_at"),
  findings: text("findings"),
  recommendation: text("recommendation"),
  status: varchar("status", { length: 30 }).default("opened").notNull(), // opened | in_progress | pending_review | closed_substantiated | closed_unsubstantiated | closed_inconclusive | cancelled
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_investigation_status_idx").on(table.status),
  investigatorIdx: index("hr_investigation_investigator_idx").on(table.investigatorId),
  subjectIdx: index("hr_investigation_subject_idx").on(table.subjectWorkerId),
}));

export type HrInvestigation = typeof hrInvestigations.$inferSelect;
export type InsertHrInvestigation = typeof hrInvestigations.$inferInsert;
