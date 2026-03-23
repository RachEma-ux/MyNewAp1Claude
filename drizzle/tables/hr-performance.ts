/**
 * HR Performance Tables — Cycles, Goals, Reviews
 *
 * Performance management basics: review cycles, employee goals,
 * and performance reviews with employee self-input + manager review.
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

// ============================================================================
// HR Performance Cycles — Review periods
// ============================================================================

export const hrPerformanceCycles = pgTable("hr_performance_cycles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  cycleType: varchar("cycle_type", { length: 30 }).default("annual").notNull(), // annual | semi_annual | quarterly | probation
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  goalSettingDeadline: date("goal_setting_deadline"),
  selfReviewDeadline: date("self_review_deadline"),
  managerReviewDeadline: date("manager_review_deadline"),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | goal_setting | self_review | manager_review | calibration | completed | cancelled
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_perf_cycle_status_idx").on(table.status),
  dateIdx: index("hr_perf_cycle_date_idx").on(table.startDate, table.endDate),
}));

export type HrPerformanceCycle = typeof hrPerformanceCycles.$inferSelect;
export type InsertHrPerformanceCycle = typeof hrPerformanceCycles.$inferInsert;

// ============================================================================
// HR Goals — Employee objectives within a cycle
// ============================================================================

export const hrGoals = pgTable("hr_goals", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => hrPerformanceCycles.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // performance | development | strategic | operational
  weight: integer("weight").default(0), // percentage weight toward overall rating
  targetMetric: varchar("target_metric", { length: 200 }),
  currentProgress: integer("current_progress").default(0), // 0-100 percentage
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | completed | cancelled | deferred
  managerApproved: boolean("manager_approved").default(false),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  employeeNotes: text("employee_notes"),
  managerNotes: text("manager_notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  cycleIdx: index("hr_goal_cycle_idx").on(table.cycleId),
  workerIdx: index("hr_goal_worker_idx").on(table.workerId),
  statusIdx: index("hr_goal_status_idx").on(table.status),
}));

export type HrGoal = typeof hrGoals.$inferSelect;
export type InsertHrGoal = typeof hrGoals.$inferInsert;

// ============================================================================
// HR Performance Reviews — Employee + Manager review records
// ============================================================================

export const hrPerformanceReviews = pgTable("hr_performance_reviews", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id").notNull().references(() => hrPerformanceCycles.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  reviewerId: integer("reviewer_id").references(() => hrWorkerProfiles.id), // typically the manager
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | self_review | manager_review | completed | cancelled
  // Employee self-review
  selfRating: integer("self_rating"), // 1-5
  selfComments: text("self_comments"),
  selfSubmittedAt: timestamp("self_submitted_at"),
  // Manager review
  managerRating: integer("manager_rating"), // 1-5
  managerComments: text("manager_comments"),
  managerSubmittedAt: timestamp("manager_submitted_at"),
  // Final
  overallRating: integer("overall_rating"), // 1-5
  overallComments: text("overall_comments"),
  developmentPlan: text("development_plan"),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  cycleIdx: index("hr_review_cycle_idx").on(table.cycleId),
  workerIdx: index("hr_review_worker_idx").on(table.workerId),
  reviewerIdx: index("hr_review_reviewer_idx").on(table.reviewerId),
  statusIdx: index("hr_review_status_idx").on(table.status),
}));

export type HrPerformanceReview = typeof hrPerformanceReviews.$inferSelect;
export type InsertHrPerformanceReview = typeof hrPerformanceReviews.$inferInsert;
