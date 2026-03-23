/**
 * HR Time & Attendance Tables — Time Entries, Leave, Overtime, Shifts
 *
 * Workforce operations: time tracking, leave management, overtime requests,
 * shift planning and assignments.
 */

import {
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  pgTable,
  index,
} from "drizzle-orm/pg-core";
import { hrWorkerProfiles } from "./hr-core";
import { hrOrgUnits } from "./hr-organization";

// ============================================================================
// HR Time Entries — Daily time tracking
// ============================================================================

export const hrTimeEntries = pgTable("hr_time_entries", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  entryDate: date("entry_date").notNull(),
  startTime: varchar("start_time", { length: 10 }), // HH:MM format
  endTime: varchar("end_time", { length: 10 }),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  breakMinutes: integer("break_minutes").default(0),
  entryType: varchar("entry_type", { length: 30 }).default("regular").notNull(), // regular | overtime | holiday | sick | remote
  description: text("description"),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | submitted | approved | rejected
  approvedBy: integer("approved_by").references(() => hrWorkerProfiles.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_time_worker_idx").on(table.workerId),
  dateIdx: index("hr_time_date_idx").on(table.entryDate),
  statusIdx: index("hr_time_status_idx").on(table.status),
  workerDateIdx: index("hr_time_worker_date_idx").on(table.workerId, table.entryDate),
}));

export type HrTimeEntry = typeof hrTimeEntries.$inferSelect;
export type InsertHrTimeEntry = typeof hrTimeEntries.$inferInsert;

// ============================================================================
// HR Leave Types — Configurable leave categories
// ============================================================================

export const hrLeaveTypes = pgTable("hr_leave_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  defaultDaysPerYear: integer("default_days_per_year"),
  requiresApproval: boolean("requires_approval").default(true).notNull(),
  isPaid: boolean("is_paid").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HrLeaveType = typeof hrLeaveTypes.$inferSelect;
export type InsertHrLeaveType = typeof hrLeaveTypes.$inferInsert;

// ============================================================================
// HR Leave Requests — Employee leave applications
// ============================================================================

export const hrLeaveRequests = pgTable("hr_leave_requests", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  leaveTypeId: integer("leave_type_id").notNull().references(() => hrLeaveTypes.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  totalDays: numeric("total_days", { precision: 5, scale: 1 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | approved | rejected | cancelled | in_progress | completed
  approvedBy: integer("approved_by").references(() => hrWorkerProfiles.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_leave_req_worker_idx").on(table.workerId),
  statusIdx: index("hr_leave_req_status_idx").on(table.status),
  dateIdx: index("hr_leave_req_date_idx").on(table.startDate, table.endDate),
  typeIdx: index("hr_leave_req_type_idx").on(table.leaveTypeId),
}));

export type HrLeaveRequest = typeof hrLeaveRequests.$inferSelect;
export type InsertHrLeaveRequest = typeof hrLeaveRequests.$inferInsert;

// ============================================================================
// HR Leave Balances — Per-worker, per-type annual balances
// ============================================================================

export const hrLeaveBalances = pgTable("hr_leave_balances", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  leaveTypeId: integer("leave_type_id").notNull().references(() => hrLeaveTypes.id),
  year: integer("year").notNull(),
  entitlement: numeric("entitlement", { precision: 5, scale: 1 }).default("0").notNull(),
  used: numeric("used", { precision: 5, scale: 1 }).default("0").notNull(),
  pending: numeric("pending", { precision: 5, scale: 1 }).default("0").notNull(),
  carriedOver: numeric("carried_over", { precision: 5, scale: 1 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerYearIdx: index("hr_leave_bal_worker_year_idx").on(table.workerId, table.year),
  typeIdx: index("hr_leave_bal_type_idx").on(table.leaveTypeId),
}));

export type HrLeaveBalance = typeof hrLeaveBalances.$inferSelect;
export type InsertHrLeaveBalance = typeof hrLeaveBalances.$inferInsert;

// ============================================================================
// HR Overtime Requests — Employee overtime applications
// ============================================================================

export const hrOvertimeRequests = pgTable("hr_overtime_requests", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  requestDate: date("request_date").notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:MM
  endTime: varchar("end_time", { length: 10 }).notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | approved | rejected | cancelled
  approvedBy: integer("approved_by").references(() => hrWorkerProfiles.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_overtime_worker_idx").on(table.workerId),
  statusIdx: index("hr_overtime_status_idx").on(table.status),
  dateIdx: index("hr_overtime_date_idx").on(table.requestDate),
}));

export type HrOvertimeRequest = typeof hrOvertimeRequests.$inferSelect;
export type InsertHrOvertimeRequest = typeof hrOvertimeRequests.$inferInsert;

// ============================================================================
// HR Shift Plans — Defined shift patterns
// ============================================================================

export const hrShiftPlans = pgTable("hr_shift_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  orgUnitId: integer("org_unit_id").references(() => hrOrgUnits.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  shiftStartTime: varchar("shift_start_time", { length: 10 }).notNull(), // HH:MM
  shiftEndTime: varchar("shift_end_time", { length: 10 }).notNull(),
  breakMinutes: integer("break_minutes").default(0),
  maxCapacity: integer("max_capacity"),
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft | active | completed | cancelled
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgUnitIdx: index("hr_shift_plan_org_idx").on(table.orgUnitId),
  statusIdx: index("hr_shift_plan_status_idx").on(table.status),
  dateIdx: index("hr_shift_plan_date_idx").on(table.startDate),
}));

export type HrShiftPlan = typeof hrShiftPlans.$inferSelect;
export type InsertHrShiftPlan = typeof hrShiftPlans.$inferInsert;

// ============================================================================
// HR Shift Assignments — Workers assigned to shifts
// ============================================================================

export const hrShiftAssignments = pgTable("hr_shift_assignments", {
  id: serial("id").primaryKey(),
  shiftPlanId: integer("shift_plan_id").notNull().references(() => hrShiftPlans.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  assignedDate: date("assigned_date").notNull(),
  status: varchar("status", { length: 30 }).default("assigned").notNull(), // assigned | confirmed | completed | absent | swapped
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  shiftIdx: index("hr_shift_assign_shift_idx").on(table.shiftPlanId),
  workerIdx: index("hr_shift_assign_worker_idx").on(table.workerId),
  dateIdx: index("hr_shift_assign_date_idx").on(table.assignedDate),
}));

export type HrShiftAssignment = typeof hrShiftAssignments.$inferSelect;
export type InsertHrShiftAssignment = typeof hrShiftAssignments.$inferInsert;
