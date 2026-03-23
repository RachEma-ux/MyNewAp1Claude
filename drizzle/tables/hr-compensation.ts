/**
 * HR Compensation & Benefits Tables
 *
 * Salary bands, compensation records, salary review cycles,
 * bonus/incentive records, benefit plans, and employee enrollments.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  numeric, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";
import { hrPositions } from "./hr-organization";

// ============================================================================
// Salary Bands — Pay structure definitions
// ============================================================================

export const hrSalaryBands = pgTable("hr_salary_bands", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  minAmount: numeric("min_amount", { precision: 12, scale: 2 }).notNull(),
  midAmount: numeric("mid_amount", { precision: 12, scale: 2 }),
  maxAmount: numeric("max_amount", { precision: 12, scale: 2 }).notNull(),
  jobLevel: varchar("job_level", { length: 50 }),
  jobFamily: varchar("job_family", { length: 100 }),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  levelIdx: index("hr_salary_band_level_idx").on(table.jobLevel),
  familyIdx: index("hr_salary_band_family_idx").on(table.jobFamily),
}));

export type HrSalaryBand = typeof hrSalaryBands.$inferSelect;
export type InsertHrSalaryBand = typeof hrSalaryBands.$inferInsert;

// ============================================================================
// Compensation Records — Individual worker compensation (sensitive)
// ============================================================================

export const hrCompensationRecords = pgTable("hr_compensation_records", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  salaryBandId: integer("salary_band_id").references(() => hrSalaryBands.id),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  payFrequency: varchar("pay_frequency", { length: 30 }).default("monthly").notNull(), // monthly | biweekly | weekly | annual
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  changeReason: varchar("change_reason", { length: 100 }), // hire | promotion | annual_review | market_adjustment | transfer
  notes: text("notes"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | superseded | pending
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_comp_worker_idx").on(table.workerId),
  statusIdx: index("hr_comp_status_idx").on(table.status),
  dateIdx: index("hr_comp_date_idx").on(table.effectiveFrom),
}));

export type HrCompensationRecord = typeof hrCompensationRecords.$inferSelect;
export type InsertHrCompensationRecord = typeof hrCompensationRecords.$inferInsert;

// ============================================================================
// Salary Review Cycles — Periodic compensation review rounds
// ============================================================================

export const hrSalaryReviewCycles = pgTable("hr_salary_review_cycles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  budgetPercent: numeric("budget_percent", { precision: 5, scale: 2 }),
  effectiveDate: date("effective_date"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | open | in_review | approved | completed | cancelled
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_sal_review_status_idx").on(table.status),
}));

export type HrSalaryReviewCycle = typeof hrSalaryReviewCycles.$inferSelect;
export type InsertHrSalaryReviewCycle = typeof hrSalaryReviewCycles.$inferInsert;

// ============================================================================
// Bonus / Incentive Records — Variable compensation (sensitive)
// ============================================================================

export const hrBonusRecords = pgTable("hr_bonus_records", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  bonusType: varchar("bonus_type", { length: 50 }).notNull(), // annual | performance | signing | retention | spot | referral
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  period: varchar("period", { length: 30 }),
  reason: text("reason"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | approved | paid | cancelled
  approvedBy: integer("approved_by").references(() => hrWorkerProfiles.id),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_bonus_worker_idx").on(table.workerId),
  statusIdx: index("hr_bonus_status_idx").on(table.status),
  typeIdx: index("hr_bonus_type_idx").on(table.bonusType),
}));

export type HrBonusRecord = typeof hrBonusRecords.$inferSelect;
export type InsertHrBonusRecord = typeof hrBonusRecords.$inferInsert;

// ============================================================================
// Benefit Plans — Available benefit packages
// ============================================================================

export const hrBenefitPlans = pgTable("hr_benefit_plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // health | dental | vision | life | retirement | wellness | other
  provider: varchar("provider", { length: 200 }),
  employerContribution: numeric("employer_contribution", { precision: 12, scale: 2 }),
  employeeContribution: numeric("employee_contribution", { precision: 12, scale: 2 }),
  enrollmentWindowStart: date("enrollment_window_start"),
  enrollmentWindowEnd: date("enrollment_window_end"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("hr_benefit_plan_cat_idx").on(table.category),
}));

export type HrBenefitPlan = typeof hrBenefitPlans.$inferSelect;
export type InsertHrBenefitPlan = typeof hrBenefitPlans.$inferInsert;

// ============================================================================
// Employee Benefit Enrollments — Worker subscriptions to benefit plans
// ============================================================================

export const hrBenefitEnrollments = pgTable("hr_benefit_enrollments", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  benefitPlanId: integer("benefit_plan_id").notNull().references(() => hrBenefitPlans.id),
  enrollmentDate: date("enrollment_date").notNull(),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | pending | cancelled | expired
  coverageLevel: varchar("coverage_level", { length: 50 }), // individual | family | spouse | dependents
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_benefit_enroll_worker_idx").on(table.workerId),
  planIdx: index("hr_benefit_enroll_plan_idx").on(table.benefitPlanId),
  statusIdx: index("hr_benefit_enroll_status_idx").on(table.status),
}));

export type HrBenefitEnrollment = typeof hrBenefitEnrollments.$inferSelect;
export type InsertHrBenefitEnrollment = typeof hrBenefitEnrollments.$inferInsert;
