/**
 * HR Talent Management Tables
 *
 * Talent reviews and succession planning.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  json, pgTable, index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";
import { hrPositions } from "./hr-organization";

// ============================================================================
// Talent Reviews — Periodic talent assessment records
// ============================================================================

export const hrTalentReviews = pgTable("hr_talent_reviews", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  reviewerId: integer("reviewer_id").references(() => hrWorkerProfiles.id),
  reviewDate: date("review_date").notNull(),
  performanceRating: varchar("performance_rating", { length: 30 }), // exceptional | strong | meets_expectations | needs_improvement | unsatisfactory
  potentialRating: varchar("potential_rating", { length: 30 }), // high | medium | low
  nineBoxPosition: varchar("nine_box_position", { length: 30 }), // star | high_performer | consistent | growth | key_player | solid | enigma | dilemma | underperformer
  readinessForPromotion: varchar("readiness_for_promotion", { length: 30 }), // ready_now | ready_1yr | ready_2yr | not_ready
  retentionRisk: varchar("retention_risk", { length: 30 }), // low | medium | high | critical
  strengths: text("strengths"),
  developmentAreas: text("development_areas"),
  notes: text("notes"),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | submitted | calibrated | finalized
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_talent_review_worker_idx").on(table.workerId),
  statusIdx: index("hr_talent_review_status_idx").on(table.status),
  dateIdx: index("hr_talent_review_date_idx").on(table.reviewDate),
}));

export type HrTalentReview = typeof hrTalentReviews.$inferSelect;
export type InsertHrTalentReview = typeof hrTalentReviews.$inferInsert;

// ============================================================================
// Succession Plans — Position-level succession strategies
// ============================================================================

export const hrSuccessionPlans = pgTable("hr_succession_plans", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").references(() => hrPositions.id),
  positionTitle: varchar("position_title", { length: 300 }).notNull(),
  criticality: varchar("criticality", { length: 30 }).default("medium").notNull(), // low | medium | high | critical
  currentIncumbentId: integer("current_incumbent_id").references(() => hrWorkerProfiles.id),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | draft | archived | completed
  notes: text("notes"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextReviewDate: date("next_review_date"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  positionIdx: index("hr_succession_position_idx").on(table.positionId),
  statusIdx: index("hr_succession_status_idx").on(table.status),
  criticalityIdx: index("hr_succession_criticality_idx").on(table.criticality),
}));

export type HrSuccessionPlan = typeof hrSuccessionPlans.$inferSelect;
export type InsertHrSuccessionPlan = typeof hrSuccessionPlans.$inferInsert;

// ============================================================================
// Succession Candidates — Workers nominated for succession
// ============================================================================

export const hrSuccessionCandidates = pgTable("hr_succession_candidates", {
  id: serial("id").primaryKey(),
  successionPlanId: integer("succession_plan_id").notNull().references(() => hrSuccessionPlans.id),
  candidateWorkerId: integer("candidate_worker_id").notNull().references(() => hrWorkerProfiles.id),
  readiness: varchar("readiness", { length: 30 }).default("ready_2yr").notNull(), // ready_now | ready_1yr | ready_2yr | long_term
  developmentNeeds: text("development_needs"),
  priority: integer("priority").default(0), // lower = higher priority
  status: varchar("status", { length: 30 }).default("nominated").notNull(), // nominated | approved | developing | ready | withdrawn
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  planIdx: index("hr_succession_cand_plan_idx").on(table.successionPlanId),
  candidateIdx: index("hr_succession_cand_worker_idx").on(table.candidateWorkerId),
  statusIdx: index("hr_succession_cand_status_idx").on(table.status),
}));

export type HrSuccessionCandidate = typeof hrSuccessionCandidates.$inferSelect;
export type InsertHrSuccessionCandidate = typeof hrSuccessionCandidates.$inferInsert;
