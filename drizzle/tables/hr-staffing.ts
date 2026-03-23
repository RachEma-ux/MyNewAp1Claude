/**
 * HR Staffing Tables — Workspace Assignments, Skills, Certifications
 *
 * Bridge between HR workforce and workspace system.
 * WorkspaceAssignment = how a worker participates in a workspace.
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
import { hrWorkerProfiles } from "./hr-core";
import { workspaces } from "./users";

// ============================================================================
// HR Workspace Assignments — Worker <-> Workspace bindings
// ============================================================================

export const hrWorkspaceAssignments = pgTable("hr_workspace_assignments", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  roleCode: varchar("role_code", { length: 50 }).default("member").notNull(), // member | lead | reviewer | observer
  allocationPct: integer("allocation_pct").default(100).notNull(),
  assignmentType: varchar("assignment_type", { length: 30 }).default("primary").notNull(), // primary | secondary | temporary
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isPrimary: boolean("is_primary").default(false).notNull(),
  approvalStatus: varchar("approval_status", { length: 30 }).default("approved").notNull(), // pending | approved | rejected
  visibilityLevel: varchar("visibility_level", { length: 30 }).default("public_internal"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("hr_assign_workspace_idx").on(table.workspaceId),
  workerIdx: index("hr_assign_worker_idx").on(table.workerId),
  activeIdx: index("hr_assign_active_idx").on(table.workspaceId, table.workerId, table.roleCode),
}));

export type HrWorkspaceAssignment = typeof hrWorkspaceAssignments.$inferSelect;
export type InsertHrWorkspaceAssignment = typeof hrWorkspaceAssignments.$inferInsert;

// ============================================================================
// HR Worker Skills — Skills attached to workers
// ============================================================================

export const hrWorkerSkills = pgTable("hr_worker_skills", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  skillName: varchar("skill_name", { length: 200 }).notNull(),
  proficiencyLevel: varchar("proficiency_level", { length: 30 }).default("intermediate"), // beginner | intermediate | advanced | expert
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_skill_worker_idx").on(table.workerId),
  nameIdx: index("hr_skill_name_idx").on(table.skillName),
}));

export type HrWorkerSkill = typeof hrWorkerSkills.$inferSelect;
export type InsertHrWorkerSkill = typeof hrWorkerSkills.$inferInsert;

// ============================================================================
// HR Worker Certifications — Certifications attached to workers
// ============================================================================

export const hrWorkerCertifications = pgTable("hr_worker_certifications", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  certificationName: varchar("certification_name", { length: 200 }).notNull(),
  issuingBody: varchar("issuing_body", { length: 200 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | expired | revoked
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_cert_worker_idx").on(table.workerId),
}));

export type HrWorkerCertification = typeof hrWorkerCertifications.$inferSelect;
export type InsertHrWorkerCertification = typeof hrWorkerCertifications.$inferInsert;

// ============================================================================
// HR Documents — Document metadata (no blob storage)
// ============================================================================

export const hrDocuments = pgTable("hr_documents", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => hrWorkerProfiles.id),
  documentType: varchar("document_type", { length: 50 }).notNull(), // contract | id | permit | certificate | letter | other
  title: varchar("title", { length: 300 }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: integer("uploaded_by"),
  visibilityClass: varchar("visibility_class", { length: 30 }).default("hr_restricted"), // public_internal | team_visible | hr_restricted | admin_restricted
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("hr_doc_worker_idx").on(table.workerId),
  typeIdx: index("hr_doc_type_idx").on(table.documentType),
}));

export type HrDocument = typeof hrDocuments.$inferSelect;
export type InsertHrDocument = typeof hrDocuments.$inferInsert;
