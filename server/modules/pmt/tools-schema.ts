/**
 * PMT Tools Schema — Full PM toolset tables
 *
 * Risks, issues, decisions, action items, meetings, deliverables,
 * status updates, work logs, budget items.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, json, pgTable, index,
} from "drizzle-orm/pg-core";
import { projects } from "./schema";
import { users } from "../../../drizzle/tables/users";

// ── Risks (future threats, separate from Issues) ────────────────────────────

export const pmtRisks = pgTable("pmt_risks", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("general"), // technical, schedule, budget, resource, external
  probability: varchar("probability", { length: 20 }).default("medium"), // very_low, low, medium, high, very_high
  impact: varchar("impact", { length: 20 }).default("medium"),
  riskScore: integer("riskScore"), // probability × impact (1-25)
  status: varchar("status", { length: 30 }).default("open").notNull(), // open, mitigating, accepted, closed, occurred
  mitigationPlan: text("mitigationPlan"),
  contingencyPlan: text("contingencyPlan"),
  ownerId: integer("ownerId").references(() => users.id),
  dueDate: timestamp("dueDate"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_risks_project").on(table.projectId),
  statusIdx: index("idx_pmt_risks_status").on(table.status),
}));

export type Risk = typeof pmtRisks.$inferSelect;
export type InsertRisk = typeof pmtRisks.$inferInsert;

// ── Issues (current problems) ───────────────────────────────────────────────

export const pmtIssues = pgTable("pmt_issues", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 20 }).default("medium").notNull(), // low, medium, high, critical
  status: varchar("status", { length: 30 }).default("open").notNull(), // open, investigating, in_progress, resolved, closed
  resolution: text("resolution"),
  assigneeId: integer("assigneeId").references(() => users.id),
  reportedBy: integer("reportedBy").references(() => users.id),
  dueDate: timestamp("dueDate"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_issues_project").on(table.projectId),
  statusIdx: index("idx_pmt_issues_status").on(table.status),
}));

export type Issue = typeof pmtIssues.$inferSelect;
export type InsertIssue = typeof pmtIssues.$inferInsert;

// ── Decisions (who decided what, when, why) ─────────────────────────────────

export const pmtDecisions = pgTable("pmt_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  context: text("context"), // what was the situation
  decision: text("decision").notNull(), // what was decided
  rationale: text("rationale"), // why
  alternatives: json("alternatives").$type<string[]>(), // what was considered
  impact: varchar("impact", { length: 20 }).default("medium"),
  status: varchar("status", { length: 20 }).default("proposed").notNull(), // proposed, approved, superseded, reversed
  decidedBy: integer("decidedBy").references(() => users.id),
  decidedAt: timestamp("decidedAt"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_decisions_project").on(table.projectId),
}));

export type Decision = typeof pmtDecisions.$inferSelect;
export type InsertDecision = typeof pmtDecisions.$inferInsert;

// ── Action Items (meeting outputs, follow-ups) ─────────────────────────────

export const pmtActionItems = pgTable("pmt_action_items", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 50 }).default("manual"), // meeting, review, gate, escalation, manual
  sourceId: integer("sourceId"), // meeting id or other reference
  assigneeId: integer("assigneeId").references(() => users.id),
  status: varchar("status", { length: 20 }).default("open").notNull(), // open, in_progress, done, cancelled
  priority: varchar("priority", { length: 20 }).default("medium"),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_action_items_project").on(table.projectId),
  statusIdx: index("idx_pmt_action_items_status").on(table.status),
}));

export type ActionItem = typeof pmtActionItems.$inferSelect;
export type InsertActionItem = typeof pmtActionItems.$inferInsert;

// ── Meetings ────────────────────────────────────────────────────────────────

export const pmtMeetings = pgTable("pmt_meetings", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  title: varchar("title", { length: 500 }).notNull(),
  meetingType: varchar("meetingType", { length: 30 }).default("general"), // standup, planning, review, retrospective, steering, gate_review, general
  agenda: text("agenda"),
  minutes: text("minutes"),
  attendees: json("attendees").$type<number[]>(),
  status: varchar("status", { length: 20 }).default("scheduled").notNull(), // scheduled, in_progress, completed, cancelled
  scheduledAt: timestamp("scheduledAt"),
  duration: integer("duration"), // minutes
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_meetings_project").on(table.projectId),
}));

export type Meeting = typeof pmtMeetings.$inferSelect;
export type InsertMeeting = typeof pmtMeetings.$inferInsert;

// ── Deliverables ────────────────────────────────────────────────────────────

export const pmtDeliverables = pgTable("pmt_deliverables", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  deliverableType: varchar("deliverableType", { length: 30 }).default("document"), // document, software, report, approval, milestone
  acceptanceCriteria: text("acceptanceCriteria"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, in_progress, submitted, accepted, rejected, rework
  assigneeId: integer("assigneeId").references(() => users.id),
  reviewerId: integer("reviewerId").references(() => users.id),
  dueDate: timestamp("dueDate"),
  submittedAt: timestamp("submittedAt"),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_deliverables_project").on(table.projectId),
  statusIdx: index("idx_pmt_deliverables_status").on(table.status),
}));

export type Deliverable = typeof pmtDeliverables.$inferSelect;
export type InsertDeliverable = typeof pmtDeliverables.$inferInsert;

// ── Status Updates (periodic reports) ───────────────────────────────────────

export const pmtStatusUpdates = pgTable("pmt_status_updates", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  period: varchar("period", { length: 50 }).notNull(), // "Week 12", "2026-W12", "March 2026"
  overallHealth: varchar("overallHealth", { length: 20 }).default("green"), // green, yellow, red
  scheduleHealth: varchar("scheduleHealth", { length: 20 }).default("green"),
  budgetHealth: varchar("budgetHealth", { length: 20 }).default("green"),
  scopeHealth: varchar("scopeHealth", { length: 20 }).default("green"),
  summary: text("summary"),
  accomplishments: text("accomplishments"),
  planned: text("planned"),
  blockers: text("blockers"),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_status_updates_project").on(table.projectId),
}));

export type StatusUpdate = typeof pmtStatusUpdates.$inferSelect;
export type InsertStatusUpdate = typeof pmtStatusUpdates.$inferInsert;

// ── Work Logs (time tracking) ───────────────────────────────────────────────

export const pmtWorkLogs = pgTable("pmt_work_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  taskId: integer("taskId"),
  userId: integer("userId").references(() => users.id),
  hours: integer("hours").notNull(), // stored as minutes for precision
  description: text("description"),
  logDate: timestamp("logDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_work_logs_project").on(table.projectId),
  userIdx: index("idx_pmt_work_logs_user").on(table.userId),
}));

export type WorkLog = typeof pmtWorkLogs.$inferSelect;
export type InsertWorkLog = typeof pmtWorkLogs.$inferInsert;

// ── Budget Items ────────────────────────────────────────────────────────────

export const pmtBudgetItems = pgTable("pmt_budget_items", {
  id: serial("id").primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).default("general"), // labor, materials, tools, travel, contingency, general
  planned: integer("planned").default(0).notNull(), // cents
  actual: integer("actual").default(0).notNull(), // cents
  forecast: integer("forecast").default(0), // cents
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("idx_pmt_budget_items_project").on(table.projectId),
}));

export type BudgetItem = typeof pmtBudgetItems.$inferSelect;
export type InsertBudgetItem = typeof pmtBudgetItems.$inferInsert;
