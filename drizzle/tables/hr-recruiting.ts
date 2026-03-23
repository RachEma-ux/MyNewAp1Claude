/**
 * HR Recruiting Tables — Recruitment Requests, Candidates, Interviews, Offers
 *
 * Talent acquisition pipeline for the HR module.
 * RecruitmentRequest → Candidates → Interviews → Offers
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
import { hrPositions, hrOrgUnits } from "./hr-organization";
import { hrWorkerProfiles } from "./hr-core";

// ============================================================================
// HR Recruitment Requests — Approved hiring requests
// ============================================================================

export const hrRecruitmentRequests = pgTable("hr_recruitment_requests", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  positionId: integer("position_id").references(() => hrPositions.id),
  orgUnitId: integer("org_unit_id").references(() => hrOrgUnits.id),
  hiringManagerId: integer("hiring_manager_id").references(() => hrWorkerProfiles.id),
  priority: varchar("priority", { length: 20 }).default("normal").notNull(), // low | normal | high | urgent
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | open | sourcing | interviewing | offer_pending | filled | cancelled
  headcount: integer("headcount").default(1).notNull(),
  jobDescription: text("job_description"),
  requiredSkills: json("required_skills").$type<string[]>(),
  employmentType: varchar("employment_type", { length: 30 }).default("full_time"), // full_time | part_time | contract | intern
  targetStartDate: date("target_start_date"),
  closedAt: timestamp("closed_at"),
  closedReason: varchar("closed_reason", { length: 100 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_recruit_req_status_idx").on(table.status),
  managerIdx: index("hr_recruit_req_manager_idx").on(table.hiringManagerId),
  positionIdx: index("hr_recruit_req_position_idx").on(table.positionId),
}));

export type HrRecruitmentRequest = typeof hrRecruitmentRequests.$inferSelect;
export type InsertHrRecruitmentRequest = typeof hrRecruitmentRequests.$inferInsert;

// ============================================================================
// HR Candidates — Applicants for recruitment requests
// ============================================================================

export const hrCandidates = pgTable("hr_candidates", {
  id: serial("id").primaryKey(),
  recruitmentRequestId: integer("recruitment_request_id").notNull().references(() => hrRecruitmentRequests.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  resumeStorageKey: varchar("resume_storage_key", { length: 500 }),
  source: varchar("source", { length: 100 }), // referral | job_board | agency | internal | direct
  pipelineStage: varchar("pipeline_stage", { length: 30 }).default("applied").notNull(), // applied | screening | interview | assessment | offer | hired | rejected | withdrawn
  rating: integer("rating"), // 1-5
  notes: text("notes"),
  rejectionReason: varchar("rejection_reason", { length: 200 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  reqIdx: index("hr_candidate_req_idx").on(table.recruitmentRequestId),
  stageIdx: index("hr_candidate_stage_idx").on(table.pipelineStage),
  emailIdx: index("hr_candidate_email_idx").on(table.email),
}));

export type HrCandidate = typeof hrCandidates.$inferSelect;
export type InsertHrCandidate = typeof hrCandidates.$inferInsert;

// ============================================================================
// HR Interviews — Scheduled interviews for candidates
// ============================================================================

export const hrInterviews = pgTable("hr_interviews", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => hrCandidates.id),
  recruitmentRequestId: integer("recruitment_request_id").notNull().references(() => hrRecruitmentRequests.id),
  interviewerId: integer("interviewer_id").references(() => hrWorkerProfiles.id),
  type: varchar("type", { length: 30 }).default("standard").notNull(), // phone_screen | technical | behavioral | panel | final | standard
  scheduledAt: timestamp("scheduled_at"),
  durationMinutes: integer("duration_minutes").default(60),
  location: varchar("location", { length: 300 }),
  status: varchar("status", { length: 30 }).default("scheduled").notNull(), // scheduled | completed | cancelled | no_show
  outcome: varchar("outcome", { length: 30 }), // pass | fail | strong_pass | needs_review
  feedback: text("feedback"),
  rating: integer("rating"), // 1-5
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  candidateIdx: index("hr_interview_candidate_idx").on(table.candidateId),
  reqIdx: index("hr_interview_req_idx").on(table.recruitmentRequestId),
  statusIdx: index("hr_interview_status_idx").on(table.status),
}));

export type HrInterview = typeof hrInterviews.$inferSelect;
export type InsertHrInterview = typeof hrInterviews.$inferInsert;

// ============================================================================
// HR Offers — Job offers to candidates
// ============================================================================

export const hrOffers = pgTable("hr_offers", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => hrCandidates.id),
  recruitmentRequestId: integer("recruitment_request_id").notNull().references(() => hrRecruitmentRequests.id),
  positionId: integer("position_id").references(() => hrPositions.id),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | pending_approval | extended | accepted | declined | withdrawn | expired
  offerDate: date("offer_date"),
  expiryDate: date("expiry_date"),
  proposedStartDate: date("proposed_start_date"),
  employmentType: varchar("employment_type", { length: 30 }),
  notes: text("notes"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  declineReason: varchar("decline_reason", { length: 300 }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  candidateIdx: index("hr_offer_candidate_idx").on(table.candidateId),
  reqIdx: index("hr_offer_req_idx").on(table.recruitmentRequestId),
  statusIdx: index("hr_offer_status_idx").on(table.status),
}));

export type HrOffer = typeof hrOffers.$inferSelect;
export type InsertHrOffer = typeof hrOffers.$inferInsert;
