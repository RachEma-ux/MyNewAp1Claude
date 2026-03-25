/**
 * Workforce Assignment Bridge — Resource Requests & Assignments
 *
 * Cross-domain governed bridge between PM Central (demand), HR (workforce),
 * and future OM (organizational structure).
 *
 * resource_requests = PS-owned demand signal
 * resource_assignments = governed cross-domain staffing record
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

// ============================================================================
// Resource Requests — PM Central demand signal
// ============================================================================

export const resourceRequests = pgTable("resource_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  wbsId: integer("wbs_id"),

  requestedRole: varchar("requested_role", { length: 100 }).notNull(),
  requiredSkill: varchar("required_skill", { length: 200 }),
  requiredLevel: varchar("required_level", { length: 30 }), // beginner | intermediate | advanced | expert

  allocationPercent: integer("allocation_percent").default(100).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),

  locationMode: varchar("location_mode", { length: 30 }).default("any"), // onsite | remote | hybrid | any
  budgetLimit: integer("budget_limit"),

  status: varchar("status", { length: 30 }).default("draft").notNull(),
  // Valid statuses: draft | requested | under_hr_review | candidate_proposed | pending_approval | approved | rejected | cancelled

  requesterId: integer("requester_id").notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("rr_project_idx").on(table.projectId),
  statusIdx: index("rr_status_idx").on(table.status),
  requesterIdx: index("rr_requester_idx").on(table.requesterId),
}));

export type ResourceRequest = typeof resourceRequests.$inferSelect;
export type InsertResourceRequest = typeof resourceRequests.$inferInsert;

// ============================================================================
// Resource Assignments — Governed cross-domain staffing record
// ============================================================================

export const resourceAssignments = pgTable("resource_assignments", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),

  employeeId: integer("employee_id").notNull(), // FK to hrWorkerProfiles.id
  positionId: integer("position_id"),

  projectId: integer("project_id").notNull(),
  wbsId: integer("wbs_id"),

  projectRole: varchar("project_role", { length: 100 }).notNull(),
  functionId: integer("function_id"),

  allocationPercent: integer("allocation_percent").default(100).notNull(),

  startDate: date("start_date").notNull(),
  endDate: date("end_date"),

  status: varchar("status", { length: 30 }).default("pending").notNull(),
  // Valid statuses: pending | active | released | completed | cancelled

  approvedBy: integer("approved_by"),
  approvalStatus: varchar("approval_status", { length: 30 }).default("pending").notNull(),
  // Valid: pending | approved | rejected

  costRateSource: varchar("cost_rate_source", { length: 50 }),
  utilizationState: varchar("utilization_state", { length: 30 }).default("untracked"),
  // untracked | active | idle | over_allocated

  authorityChain: json("authority_chain").$type<Record<string, unknown>>(),
  metadata: json("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  requestIdx: index("ra_request_idx").on(table.requestId),
  employeeIdx: index("ra_employee_idx").on(table.employeeId),
  projectIdx: index("ra_project_idx").on(table.projectId),
  statusIdx: index("ra_status_idx").on(table.status),
}));

export type ResourceAssignment = typeof resourceAssignments.$inferSelect;
export type InsertResourceAssignment = typeof resourceAssignments.$inferInsert;
