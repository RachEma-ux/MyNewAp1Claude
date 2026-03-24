/**
 * HR Role Definition Tables — Canonical, versioned, effective-dated role definitions
 *
 * Implements the HR Role Definition Framework as structured persistence.
 * Role definitions are distinct from positions, workers, and permissions.
 *
 * Tables:
 * - hrRoleDefinitions: Stable identity for each role definition
 * - hrRoleDefinitionVersions: Effective-dated, versioned content records
 * - hrRoleDefinitionSections: Structured nested sections per version
 * - hrRoleDefinitionReviews: Review/approval workflow records
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
import { hrOrgUnits, hrJobFamilies, hrJobLevels, hrPositions } from "./hr-organization";

// ============================================================================
// HR Role Definitions — Stable identity record
// ============================================================================

export const hrRoleDefinitions = pgTable("hr_role_definitions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 100 }).default("default").notNull(),
  roleCode: varchar("role_code", { length: 80 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  orgUnitId: integer("org_unit_id").references(() => hrOrgUnits.id),
  jobFamilyId: integer("job_family_id").references(() => hrJobFamilies.id),
  jobLevelId: integer("job_level_id").references(() => hrJobLevels.id),
  /** Current effective version ID — resolved at publish time */
  currentVersionId: integer("current_version_id"),
  /** Overall lifecycle status of the role definition entity */
  status: varchar("status", { length: 30 }).default("active").notNull(), // active | retired | archived
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleCodeIdx: index("hr_roledef_code_idx").on(table.roleCode),
  tenantIdx: index("hr_roledef_tenant_idx").on(table.tenantId),
  orgUnitIdx: index("hr_roledef_org_idx").on(table.orgUnitId),
  familyIdx: index("hr_roledef_family_idx").on(table.jobFamilyId),
  statusIdx: index("hr_roledef_status_idx").on(table.status),
  roleCodeUniq: unique("hr_roledef_code_uniq").on(table.tenantId, table.roleCode),
}));

export type HrRoleDefinition = typeof hrRoleDefinitions.$inferSelect;
export type InsertHrRoleDefinition = typeof hrRoleDefinitions.$inferInsert;

// ============================================================================
// HR Role Definition Versions — Effective-dated versioned content
// ============================================================================

export const hrRoleDefinitionVersions = pgTable("hr_role_definition_versions", {
  id: serial("id").primaryKey(),
  roleDefinitionId: integer("role_definition_id").notNull().references(() => hrRoleDefinitions.id),
  versionNumber: integer("version_number").notNull(),
  /** Lifecycle status of this version */
  status: varchar("status", { length: 30 }).default("draft").notNull(),
  // draft | in_review | changes_requested | approved | published | effective | superseded | retired
  changeType: varchar("change_type", { length: 30 }).default("material"),
  // minor_wording | material | structural | visibility_change | retirement
  changeReason: text("change_reason"),

  // === Core content fields ===
  title: varchar("title", { length: 300 }).notNull(),
  purposeSummary: text("purpose_summary"),
  reportsToDescription: varchar("reports_to_description", { length: 300 }),
  reportsToRoleDefinitionId: integer("reports_to_role_definition_id"),
  directReportsScope: text("direct_reports_scope"),
  locationScope: varchar("location_scope", { length: 300 }),
  employmentType: varchar("employment_type", { length: 50 }),

  // === Structured content stored as JSON arrays ===
  accountabilities: json("accountabilities").$type<string[]>(),
  decisionRightsIndependent: json("decision_rights_independent").$type<string[]>(),
  decisionRightsRecommend: json("decision_rights_recommend").$type<string[]>(),
  decisionRightsEscalate: json("decision_rights_escalate").$type<string[]>(),
  boundariesInScope: json("boundaries_in_scope").$type<string[]>(),
  boundariesOutOfScope: json("boundaries_out_of_scope").$type<string[]>(),
  escalationTriggers: json("escalation_triggers").$type<string[]>(),
  collaborationInterfaces: json("collaboration_interfaces").$type<string[]>(),
  requiredTechnicalSkills: json("required_technical_skills").$type<string[]>(),
  requiredBehavioralSkills: json("required_behavioral_skills").$type<string[]>(),
  requiredEducation: json("required_education").$type<string[]>(),
  requiredExperience: json("required_experience").$type<string[]>(),
  preferredQualifications: json("preferred_qualifications").$type<string[]>(),
  successMetrics: json("success_metrics").$type<string[]>(),

  // === Sensitivity and visibility ===
  visibilityClass: varchar("visibility_class", { length: 30 }).default("public_internal").notNull(),
  // public_internal | team_visible | manager_visible | hr_restricted | admin_restricted | confidential_case
  sensitivityNotes: text("sensitivity_notes"),
  complianceNotes: text("compliance_notes"),
  sodConstraints: text("sod_constraints"),

  // === HR planning fields (restricted) ===
  compensationNotes: text("compensation_notes"),
  successionNotes: text("succession_notes"),
  restructuringNotes: text("restructuring_notes"),

  // === Effective dating ===
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),

  // === Governance metadata ===
  ownerId: integer("owner_id"),
  reviewedById: integer("reviewed_by_id"),
  approvedById: integer("approved_by_id"),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
  publishedById: integer("published_by_id"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextReviewAt: date("next_review_at"),
  supersededById: integer("superseded_by_id"),

  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleDefIdx: index("hr_roledefver_roledef_idx").on(table.roleDefinitionId),
  statusIdx: index("hr_roledefver_status_idx").on(table.status),
  effectiveIdx: index("hr_roledefver_effective_idx").on(table.effectiveFrom, table.effectiveTo),
  versionUniq: unique("hr_roledefver_version_uniq").on(table.roleDefinitionId, table.versionNumber),
}));

export type HrRoleDefinitionVersion = typeof hrRoleDefinitionVersions.$inferSelect;
export type InsertHrRoleDefinitionVersion = typeof hrRoleDefinitionVersions.$inferInsert;

// ============================================================================
// HR Role Definition Reviews — Review and approval records
// ============================================================================

export const hrRoleDefinitionReviews = pgTable("hr_role_definition_reviews", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id").notNull().references(() => hrRoleDefinitionVersions.id),
  reviewerId: integer("reviewer_id").notNull(),
  outcome: varchar("outcome", { length: 30 }).notNull(), // approved | changes_requested | rejected
  comments: text("comments"),
  reviewedAt: timestamp("reviewed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  versionIdx: index("hr_roledefrev_version_idx").on(table.versionId),
  reviewerIdx: index("hr_roledefrev_reviewer_idx").on(table.reviewerId),
}));

export type HrRoleDefinitionReview = typeof hrRoleDefinitionReviews.$inferSelect;
export type InsertHrRoleDefinitionReview = typeof hrRoleDefinitionReviews.$inferInsert;

// ============================================================================
// HR Position → Role Definition Link — Position references approved role def
// ============================================================================

export const hrPositionRoleLinks = pgTable("hr_position_role_links", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").notNull().references(() => hrPositions.id),
  roleDefinitionId: integer("role_definition_id").notNull().references(() => hrRoleDefinitions.id),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  linkedBy: integer("linked_by"),
  unlinkedAt: timestamp("unlinked_at"),
  unlinkedBy: integer("unlinked_by"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  positionIdx: index("hr_posrole_position_idx").on(table.positionId),
  roleDefIdx: index("hr_posrole_roledef_idx").on(table.roleDefinitionId),
  activeIdx: index("hr_posrole_active_idx").on(table.positionId, table.isActive),
}));

export type HrPositionRoleLink = typeof hrPositionRoleLinks.$inferSelect;
export type InsertHrPositionRoleLink = typeof hrPositionRoleLinks.$inferInsert;
