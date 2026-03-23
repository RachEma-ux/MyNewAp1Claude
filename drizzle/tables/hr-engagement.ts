/**
 * HR Well Being & Engagement Tables
 *
 * Surveys, survey campaigns, responses, engagement programs,
 * wellbeing resources, recognition programs, and recognition events.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  json, pgTable, index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";

// ============================================================================
// Survey Campaigns — Pulse/engagement survey rounds
// ============================================================================

export const hrSurveyCampaigns = pgTable("hr_survey_campaigns", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  surveyType: varchar("survey_type", { length: 50 }).default("pulse").notNull(), // pulse | engagement | exit | onboarding | custom
  questions: json("questions").$type<Array<{ id: string; text: string; type: string }>>(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isAnonymous: boolean("is_anonymous").default(true).notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | closed | cancelled
  totalInvited: integer("total_invited").default(0),
  totalResponses: integer("total_responses").default(0),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_survey_campaign_status_idx").on(table.status),
  typeIdx: index("hr_survey_campaign_type_idx").on(table.surveyType),
}));

export type HrSurveyCampaign = typeof hrSurveyCampaigns.$inferSelect;
export type InsertHrSurveyCampaign = typeof hrSurveyCampaigns.$inferInsert;

// ============================================================================
// Survey Responses — Individual worker submissions
// ============================================================================

export const hrSurveyResponses = pgTable("hr_survey_responses", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => hrSurveyCampaigns.id),
  workerId: integer("worker_id").references(() => hrWorkerProfiles.id), // null if anonymous
  answers: json("answers").$type<Record<string, unknown>>(),
  overallRating: integer("overall_rating"), // 1-5 if applicable
  comments: text("comments"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  campaignIdx: index("hr_survey_resp_campaign_idx").on(table.campaignId),
  workerIdx: index("hr_survey_resp_worker_idx").on(table.workerId),
}));

export type HrSurveyResponse = typeof hrSurveyResponses.$inferSelect;
export type InsertHrSurveyResponse = typeof hrSurveyResponses.$inferInsert;

// ============================================================================
// Engagement Programs — Ongoing engagement initiatives
// ============================================================================

export const hrEngagementPrograms = pgTable("hr_engagement_programs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // team_building | mentorship | community | diversity | culture | social
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: varchar("status", { length: 30 }).default("planned").notNull(), // planned | active | completed | cancelled
  participantCount: integer("participant_count").default(0),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("hr_engagement_prog_status_idx").on(table.status),
}));

export type HrEngagementProgram = typeof hrEngagementPrograms.$inferSelect;
export type InsertHrEngagementProgram = typeof hrEngagementPrograms.$inferInsert;

// ============================================================================
// Wellbeing Resources — Available wellbeing support
// ============================================================================

export const hrWellbeingResources = pgTable("hr_wellbeing_resources", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // mental_health | physical | financial | social | eap | counseling
  resourceType: varchar("resource_type", { length: 50 }), // internal | external | document | link | program
  url: text("url"),
  contactInfo: text("contact_info"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("hr_wellbeing_cat_idx").on(table.category),
}));

export type HrWellbeingResource = typeof hrWellbeingResources.$inferSelect;
export type InsertHrWellbeingResource = typeof hrWellbeingResources.$inferInsert;

// ============================================================================
// Recognition Programs — Named recognition schemes
// ============================================================================

export const hrRecognitionPrograms = pgTable("hr_recognition_programs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // peer | manager | company | milestone | innovation | values
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HrRecognitionProgram = typeof hrRecognitionPrograms.$inferSelect;
export type InsertHrRecognitionProgram = typeof hrRecognitionPrograms.$inferInsert;

// ============================================================================
// Recognition Events — Individual recognition instances
// ============================================================================

export const hrRecognitionEvents = pgTable("hr_recognition_events", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => hrRecognitionPrograms.id),
  recipientWorkerId: integer("recipient_worker_id").notNull().references(() => hrWorkerProfiles.id),
  nominatedByWorkerId: integer("nominated_by_worker_id").references(() => hrWorkerProfiles.id),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  awardDate: date("award_date"),
  value: varchar("value", { length: 100 }), // points, monetary value, or description
  status: varchar("status", { length: 30 }).default("nominated").notNull(), // nominated | approved | awarded | declined
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index("hr_recognition_recipient_idx").on(table.recipientWorkerId),
  programIdx: index("hr_recognition_program_idx").on(table.programId),
  statusIdx: index("hr_recognition_status_idx").on(table.status),
}));

export type HrRecognitionEvent = typeof hrRecognitionEvents.$inferSelect;
export type InsertHrRecognitionEvent = typeof hrRecognitionEvents.$inferInsert;
