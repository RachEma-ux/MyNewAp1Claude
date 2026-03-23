/**
 * HR Core Tables — People, Worker Profiles, Employment Records
 *
 * Foundation identity and workforce tables for the HR module.
 * Person = human identity, Worker = platform workforce identity,
 * Employment = legal/employment relationship over time.
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
  unique,
} from "drizzle-orm/pg-core";

// ============================================================================
// HR People — Human identity records
// ============================================================================

export const hrPeople = pgTable("hr_people", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  externalRef: varchar("external_ref", { length: 255 }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  preferredName: varchar("preferred_name", { length: 100 }),
  primaryEmail: varchar("primary_email", { length: 255 }).notNull(),
  primaryPhone: varchar("primary_phone", { length: 50 }),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("hr_people_email_idx").on(table.primaryEmail),
  tenantIdx: index("hr_people_tenant_idx").on(table.tenantId),
  statusIdx: index("hr_people_status_idx").on(table.status),
  emailUniq: unique("hr_people_email_uniq").on(table.tenantId, table.primaryEmail),
}));

export type HrPerson = typeof hrPeople.$inferSelect;
export type InsertHrPerson = typeof hrPeople.$inferInsert;

// ============================================================================
// HR Worker Profiles — Platform-facing workforce identity
// ============================================================================

export const hrWorkerProfiles = pgTable("hr_worker_profiles", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => hrPeople.id),
  employeeNumber: varchar("employee_number", { length: 50 }),
  workerType: varchar("worker_type", { length: 30 }).default("employee").notNull(), // employee | contractor | intern | consultant
  managerWorkerId: integer("manager_worker_id"), // self-ref (circular avoidance — FK enforced at DB level)
  homeOrgUnitId: integer("home_org_unit_id"), // FK to hrOrgUnits.id (deferred)
  primaryPositionId: integer("primary_position_id"), // FK to hrPositions.id (deferred)
  employmentCategory: varchar("employment_category", { length: 50 }).default("full_time"), // full_time | part_time | temporary
  homeWorkspaceVisibility: varchar("home_workspace_visibility", { length: 30 }).default("public_internal"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | inactive | on_leave | terminated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  personIdx: index("hr_worker_person_idx").on(table.personId),
  employeeNumberIdx: index("hr_worker_emp_number_idx").on(table.employeeNumber),
  managerIdx: index("hr_worker_manager_idx").on(table.managerWorkerId),
  statusIdx: index("hr_worker_status_idx").on(table.status),
  empNumberUniq: unique("hr_worker_emp_number_uniq").on(table.employeeNumber),
}));

export type HrWorkerProfile = typeof hrWorkerProfiles.$inferSelect;
export type InsertHrWorkerProfile = typeof hrWorkerProfiles.$inferInsert;

// ============================================================================
// HR Employment Records — Effective-dated employment relationships
// ============================================================================

export const hrEmploymentRecords = pgTable("hr_employment_records", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  employmentStatus: varchar("employment_status", { length: 30 }).default("active").notNull(), // active | probation | notice | terminated | suspended
  contractType: varchar("contract_type", { length: 50 }).default("permanent"), // permanent | fixed_term | casual
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  probationEndDate: date("probation_end_date"),
  legalEntity: varchar("legal_entity", { length: 200 }),
  workLocation: varchar("work_location", { length: 200 }),
  costCenter: varchar("cost_center", { length: 100 }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_employment_worker_idx").on(table.workerId),
  statusIdx: index("hr_employment_status_idx").on(table.employmentStatus),
}));

export type HrEmploymentRecord = typeof hrEmploymentRecords.$inferSelect;
export type InsertHrEmploymentRecord = typeof hrEmploymentRecords.$inferInsert;

// ============================================================================
// HR Audit Log — HR-specific mutation audit trail
// ============================================================================

export const hrAuditLog = pgTable("hr_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id"),
  workspaceId: integer("workspace_id"),
  targetWorkerId: integer("target_worker_id"),
  action: varchar("action", { length: 100 }).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  actionIdx: index("hr_audit_action_idx").on(table.action),
  workerIdx: index("hr_audit_worker_idx").on(table.targetWorkerId),
}));

export type HrAuditEntry = typeof hrAuditLog.$inferSelect;
export type InsertHrAuditEntry = typeof hrAuditLog.$inferInsert;

// ============================================================================
// HR Role Assignments — Persistent user-to-HR-role mapping
// ============================================================================

export const hrRoleAssignments = pgTable("hr_role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  workerId: integer("worker_id"), // link to HR worker profile if exists
  hrRole: varchar("hr_role", { length: 30 }).notNull(), // employee | manager | hrbp | admin | workspace_admin
  scope: varchar("scope", { length: 30 }).default("global"), // global | org_unit | workspace
  scopeId: integer("scope_id"), // orgUnitId or workspaceId depending on scope
  isActive: boolean("is_active").default(true).notNull(),
  assignedBy: integer("assigned_by"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("hr_role_user_idx").on(table.userId),
  workerIdx: index("hr_role_worker_idx").on(table.workerId),
  roleIdx: index("hr_role_role_idx").on(table.hrRole),
  activeUserUniq: unique("hr_role_active_user_uniq").on(table.userId, table.hrRole, table.scope, table.scopeId),
}));

export type HrRoleAssignment = typeof hrRoleAssignments.$inferSelect;
export type InsertHrRoleAssignment = typeof hrRoleAssignments.$inferInsert;
