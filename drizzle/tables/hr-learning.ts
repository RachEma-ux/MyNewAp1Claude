/**
 * HR Learning & Development Tables — Training Catalog, Assignments, History, Certifications
 *
 * Learning operations: training catalog, mandatory rules, assignments,
 * completion tracking, certification management with expiry.
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
import { hrOrgUnits } from "./hr-organization";

// ============================================================================
// HR Training Catalog — Available courses and programs
// ============================================================================

export const hrTrainingCatalog = pgTable("hr_training_catalog", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // technical | compliance | leadership | safety | soft_skills | onboarding
  provider: varchar("provider", { length: 200 }), // internal | external provider name
  durationHours: integer("duration_hours"),
  format: varchar("format", { length: 50 }).default("online"), // online | classroom | blended | self_paced | webinar
  isMandatory: boolean("is_mandatory").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  prerequisites: json("prerequisites").$type<string[]>(),
  tags: json("tags").$type<string[]>(),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("hr_training_cat_idx").on(table.category),
  mandatoryIdx: index("hr_training_mandatory_idx").on(table.isMandatory),
}));

export type HrTrainingCatalogEntry = typeof hrTrainingCatalog.$inferSelect;
export type InsertHrTrainingCatalogEntry = typeof hrTrainingCatalog.$inferInsert;

// ============================================================================
// HR Mandatory Training Rules — Which roles/units require which training
// ============================================================================

export const hrMandatoryTrainingRules = pgTable("hr_mandatory_training_rules", {
  id: serial("id").primaryKey(),
  trainingId: integer("training_id").notNull().references(() => hrTrainingCatalog.id),
  targetType: varchar("target_type", { length: 30 }).notNull(), // all | org_unit | worker_type | position
  targetValue: varchar("target_value", { length: 100 }), // org unit id, worker type, etc.
  dueDays: integer("due_days").default(30).notNull(), // days from hire/assignment to complete
  recurringMonths: integer("recurring_months"), // null = one-time, else recurrence interval
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  trainingIdx: index("hr_mandatory_training_idx").on(table.trainingId),
  targetIdx: index("hr_mandatory_target_idx").on(table.targetType),
}));

export type HrMandatoryTrainingRule = typeof hrMandatoryTrainingRules.$inferSelect;
export type InsertHrMandatoryTrainingRule = typeof hrMandatoryTrainingRules.$inferInsert;

// ============================================================================
// HR Learning Assignments — Training assigned to workers
// ============================================================================

export const hrLearningAssignments = pgTable("hr_learning_assignments", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  trainingId: integer("training_id").notNull().references(() => hrTrainingCatalog.id),
  assignedBy: integer("assigned_by").references(() => hrWorkerProfiles.id),
  dueDate: date("due_date"),
  status: varchar("status", { length: 30 }).default("assigned").notNull(), // assigned | in_progress | completed | overdue | waived
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  score: integer("score"), // percentage 0-100 if applicable
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_learning_assign_worker_idx").on(table.workerId),
  trainingIdx: index("hr_learning_assign_training_idx").on(table.trainingId),
  statusIdx: index("hr_learning_assign_status_idx").on(table.status),
  dueDateIdx: index("hr_learning_assign_due_idx").on(table.dueDate),
}));

export type HrLearningAssignment = typeof hrLearningAssignments.$inferSelect;
export type InsertHrLearningAssignment = typeof hrLearningAssignments.$inferInsert;

// ============================================================================
// HR Learning History — Completed training records (immutable)
// ============================================================================

export const hrLearningHistory = pgTable("hr_learning_history", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  trainingId: integer("training_id").references(() => hrTrainingCatalog.id),
  trainingTitle: varchar("training_title", { length: 300 }).notNull(), // denormalized for historical record
  completedAt: timestamp("completed_at").notNull(),
  score: integer("score"),
  certificateRef: varchar("certificate_ref", { length: 500 }),
  validUntil: date("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_learning_hist_worker_idx").on(table.workerId),
  trainingIdx: index("hr_learning_hist_training_idx").on(table.trainingId),
  validIdx: index("hr_learning_hist_valid_idx").on(table.validUntil),
}));

export type HrLearningHistoryEntry = typeof hrLearningHistory.$inferSelect;
export type InsertHrLearningHistoryEntry = typeof hrLearningHistory.$inferInsert;

// ============================================================================
// HR Certifications — Certification catalog
// ============================================================================

export const hrCertifications = pgTable("hr_certifications", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  issuingBody: varchar("issuing_body", { length: 200 }),
  validityMonths: integer("validity_months"), // null = no expiry
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HrCertification = typeof hrCertifications.$inferSelect;
export type InsertHrCertification = typeof hrCertifications.$inferInsert;

// ============================================================================
// HR Employee Certifications — Worker-certification assignments with expiry
// ============================================================================

export const hrEmployeeCertifications = pgTable("hr_employee_certifications", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  certificationId: integer("certification_id").notNull().references(() => hrCertifications.id),
  obtainedDate: date("obtained_date"),
  expiryDate: date("expiry_date"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | expired | pending_renewal | revoked
  certificateRef: varchar("certificate_ref", { length: 500 }),
  renewalDate: date("renewal_date"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_emp_cert_worker_idx").on(table.workerId),
  certIdx: index("hr_emp_cert_cert_idx").on(table.certificationId),
  statusIdx: index("hr_emp_cert_status_idx").on(table.status),
  expiryIdx: index("hr_emp_cert_expiry_idx").on(table.expiryDate),
}));

export type HrEmployeeCertification = typeof hrEmployeeCertifications.$inferSelect;
export type InsertHrEmployeeCertification = typeof hrEmployeeCertifications.$inferInsert;
